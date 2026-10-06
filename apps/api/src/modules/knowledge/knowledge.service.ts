import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  ArticleQuery,
  ArticleStatus,
  ArticleTransitionInput,
  CreateArticleInput,
  UpdateArticleInput,
} from '@opsdesk/contracts';
import { errors } from '../../common/errors';
import { uuidv7 } from '../../common/id';
import { pageMeta, skip } from '../../common/pagination';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { TicketsService } from '../tickets/tickets.service';
import type { AuthUser } from '../../common/auth-user';
import { canArticleTransition } from './domain/article-lifecycle';

const ARTICLE_SELECT = {
  id: true,
  slug: true,
  title: true,
  summary: true,
  content: true,
  categoryId: true,
  authorId: true,
  reviewerId: true,
  status: true,
  viewCount: true,
  publishedAt: true,
  archivedAt: true,
  version: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.KnowledgeArticleSelect;

type ArticleRow = Prisma.KnowledgeArticleGetPayload<{ select: typeof ARTICLE_SELECT }>;

@Injectable()
export class KnowledgeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly tickets: TicketsService,
  ) {}

  // ───────── Articles ─────────

  async list(query: ArticleQuery, actor: AuthUser) {
    const canManage =
      actor.permissions.includes('kb:create') || actor.permissions.includes('kb:publish');
    const statusFilter = canManage
      ? query.status
        ? ([query.status] as ArticleStatus[])
        : undefined
      : (['PUBLISHED'] as ArticleStatus[]);

    let ids: string[] | null = null;
    if (query.q) {
      ids = await this.searchIds(query.q, statusFilter, query.pageSize, skip(query.page, query.pageSize));
    }

    const where: Prisma.KnowledgeArticleWhereInput = {
      ...(statusFilter ? { status: { in: statusFilter } } : {}),
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      ...(ids ? { id: { in: ids } } : {}),
    };

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.knowledgeArticle.count({ where }),
      this.prisma.knowledgeArticle.findMany({
        where,
        select: ARTICLE_SELECT,
        orderBy: ids ? [{ updatedAt: 'desc' }] : [{ status: 'asc' }, { updatedAt: 'desc' }],
        ...(ids ? {} : { skip: skip(query.page, query.pageSize) }),
        take: query.pageSize,
      }),
    ]);

    const ordered = ids
      ? ids.map((id) => rows.find((row) => row.id === id)).filter((row): row is ArticleRow => Boolean(row))
      : rows;

    return {
      data: ordered.map((row) => this.toSummary(row)),
      meta: pageMeta(query.page, query.pageSize, ids ? ids.length : total),
    };
  }

  async getByIdOrSlug(idOrSlug: string, actor: AuthUser) {
    const article = await this.prisma.knowledgeArticle.findFirst({
      where: /^[0-9a-f-]{36}$/i.test(idOrSlug) ? { id: idOrSlug } : { slug: idOrSlug },
      select: ARTICLE_SELECT,
    });
    if (!article) throw errors.notFound('ARTICLE_NOT_FOUND', 'Article not found.');
    const isStaff = actor.permissions.includes('kb:create');
    if (article.status !== 'PUBLISHED' && !isStaff) {
      throw errors.notFound('ARTICLE_NOT_FOUND', 'Article not found.');
    }
    if (article.status === 'PUBLISHED') {
      void this.prisma.knowledgeArticle
        .update({ where: { id: article.id }, data: { viewCount: { increment: 1 } } })
        .catch(() => undefined);
    }
    return { data: { ...article, viewCount: article.viewCount + (article.status === 'PUBLISHED' ? 1 : 0) } };
  }

  async create(input: CreateArticleInput, actor: AuthUser) {
    const id = uuidv7();
    const slug = await this.uniqueSlug(input.title);
    await this.prisma.$transaction(async (tx) => {
      await tx.knowledgeArticle.create({
        data: {
          id,
          slug,
          title: input.title,
          summary: input.summary ?? null,
          content: input.content,
          categoryId: input.categoryId ?? null,
          authorId: actor.id,
          reviewerId: input.reviewerId ?? null,
        },
      });
      await this.audit.record(tx, {
        action: 'kb.created',
        entityType: 'knowledge_article',
        entityId: id,
        after: { title: input.title, slug },
      });
    });
    return this.getByIdOrSlug(id, actor);
  }

  async update(id: string, input: UpdateArticleInput, actor: AuthUser) {
    const article = await this.prisma.knowledgeArticle.findUnique({ where: { id } });
    if (!article) throw errors.notFound('ARTICLE_NOT_FOUND', 'Article not found.');
    if (article.version !== input.version) throw this.stale();
    const isAuthor = article.authorId === actor.id;
    if (!isAuthor && !actor.permissions.includes('kb:publish')) {
      throw errors.forbidden('Only the author or a publisher can edit this article.');
    }

    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.knowledgeArticle.updateMany({
        where: { id, version: input.version },
        data: {
          ...(input.title !== undefined ? { title: input.title } : {}),
          ...(input.summary !== undefined ? { summary: input.summary } : {}),
          ...(input.content !== undefined ? { content: input.content } : {}),
          ...(input.categoryId !== undefined ? { categoryId: input.categoryId } : {}),
          ...(input.reviewerId !== undefined ? { reviewerId: input.reviewerId } : {}),
          version: { increment: 1 },
        },
      });
      if (updated.count === 0) throw this.stale();
      await this.audit.record(tx, {
        action: 'kb.updated',
        entityType: 'knowledge_article',
        entityId: id,
        after: input as Record<string, unknown>,
      });
    });
    return this.getByIdOrSlug(id, actor);
  }

  async transition(id: string, input: ArticleTransitionInput, actor: AuthUser) {
    const article = await this.prisma.knowledgeArticle.findUnique({ where: { id } });
    if (!article) throw errors.notFound('ARTICLE_NOT_FOUND', 'Article not found.');
    if (article.version !== input.version) throw this.stale();

    const decision = canArticleTransition(article.status, input.to, actor.permissions);
    if (!decision.ok) {
      if (decision.code === 'FORBIDDEN') throw errors.forbidden();
      throw errors.businessRule(
        'ARTICLE_INVALID_TRANSITION',
        `Article cannot move from ${article.status} to ${input.to}.`,
      );
    }

    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.knowledgeArticle.updateMany({
        where: { id, version: input.version },
        data: {
          status: input.to,
          ...(input.to === 'PUBLISHED' ? { publishedAt: now, archivedAt: null } : {}),
          ...(input.to === 'ARCHIVED' ? { archivedAt: now } : {}),
          version: { increment: 1 },
        },
      });
      if (updated.count === 0) throw this.stale();
      await this.audit.record(tx, {
        action: input.to === 'PUBLISHED' ? 'kb.published' : 'kb.status_changed',
        entityType: 'knowledge_article',
        entityId: id,
        before: { status: article.status },
        after: { status: input.to },
      });
    });
    return this.getByIdOrSlug(id, actor);
  }

  /** Contextual suggestions on ticket creation (KB-4). */
  async suggest(q: string | undefined, categoryId: string | undefined) {
    const term = (q ?? '').trim();
    if (term.length >= 3) {
      const rows = await this.prisma.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM knowledge_articles
        WHERE status = 'PUBLISHED'
          AND (${categoryId ?? null}::uuid IS NULL OR category_id = ${categoryId ?? null}::uuid)
          AND (
            (setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
             setweight(to_tsvector('english', coalesce(summary, '')), 'B') ||
             setweight(to_tsvector('english', coalesce(content, '')), 'C'))
            @@ websearch_to_tsquery('english', ${term})
            OR title ILIKE ${'%' + term + '%'}
          )
        LIMIT 5
      `;
      const ids = rows.map((row) => row.id);
      if (ids.length === 0) return { data: [] };
      const articles = await this.prisma.knowledgeArticle.findMany({
        where: { id: { in: ids } },
        select: { id: true, slug: true, title: true, summary: true },
      });
      return { data: ids.map((id) => articles.find((article) => article.id === id)!).filter(Boolean) };
    }

    const articles = await this.prisma.knowledgeArticle.findMany({
      where: {
        status: 'PUBLISHED',
        ...(categoryId ? { categoryId } : {}),
      },
      select: { id: true, slug: true, title: true, summary: true },
      orderBy: { viewCount: 'desc' },
      take: 5,
    });
    return { data: articles };
  }

  // ───────── Ticket linking (KB-4 / TKT-17) ─────────

  async linkToTicket(ticketIdOrKey: string, articleId: string, actor: AuthUser) {
    const ticket = await this.tickets.loadVisible(ticketIdOrKey, actor);
    const article = await this.prisma.knowledgeArticle.findUnique({ where: { id: articleId } });
    if (!article) throw errors.notFound('ARTICLE_NOT_FOUND', 'Article not found.');
    if (article.status !== 'PUBLISHED') {
      throw errors.businessRule('ARTICLE_NOT_PUBLISHED', 'Only published articles can be linked.');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.ticketArticle.createMany({
        data: [{ ticketId: ticket.id, articleId, linkedById: actor.id }],
        skipDuplicates: true,
      });
      await tx.ticketEvent.create({
        data: {
          id: uuidv7(),
          ticketId: ticket.id,
          actorId: actor.id,
          type: 'ARTICLE_LINKED',
          metadata: { articleId, slug: article.slug },
        },
      });
      await this.audit.record(tx, {
        action: 'kb.article_linked',
        entityType: 'ticket',
        entityId: ticket.id,
        entityKey: ticket.key,
        after: { articleId, slug: article.slug },
      });
    });
    return { data: { id: article.id, slug: article.slug, title: article.title } };
  }

  async listForTicket(ticketIdOrKey: string, actor: AuthUser) {
    const ticket = await this.tickets.loadVisible(ticketIdOrKey, actor);
    const links = await this.prisma.ticketArticle.findMany({
      where: { ticketId: ticket.id },
      include: {
        article: { select: { id: true, slug: true, title: true, summary: true, status: true } },
      },
      orderBy: { linkedAt: 'desc' },
    });
    return { data: links.map((link) => link.article) };
  }

  // ───────── Internals ─────────

  private async searchIds(
    q: string,
    statuses: ArticleStatus[] | undefined,
    take: number,
    offset: number,
  ): Promise<string[]> {
    const statusList = statuses ?? (['DRAFT', 'REVIEW', 'PUBLISHED', 'ARCHIVED'] as ArticleStatus[]);
    const rows = await this.prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM knowledge_articles
      WHERE status = ANY(${statusList}::"ArticleStatus"[])
        AND (
          (setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
           setweight(to_tsvector('english', coalesce(summary, '')), 'B') ||
           setweight(to_tsvector('english', coalesce(content, '')), 'C'))
          @@ websearch_to_tsquery('english', ${q})
          OR title ILIKE ${'%' + q + '%'}
        )
      ORDER BY updated_at DESC
      LIMIT ${take} OFFSET ${offset}
    `;
    return rows.map((row) => row.id);
  }

  private toSummary(article: ArticleRow) {
    return {
      id: article.id,
      slug: article.slug,
      title: article.title,
      summary: article.summary,
      categoryId: article.categoryId,
      status: article.status,
      viewCount: article.viewCount,
      publishedAt: article.publishedAt?.toISOString() ?? null,
      updatedAt: article.updatedAt.toISOString(),
      version: article.version,
    };
  }

  private async uniqueSlug(title: string): Promise<string> {
    const base =
      title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 120) || 'article';
    let candidate = base;
    let suffix = 2;
    while (await this.prisma.knowledgeArticle.findUnique({ where: { slug: candidate } })) {
      candidate = `${base}-${suffix++}`;
    }
    return candidate;
  }

  private stale() {
    return errors.conflict(
      'CONFLICT_STALE_VERSION',
      'This article was updated by someone else. Reload to see the latest version.',
    );
  }
}
