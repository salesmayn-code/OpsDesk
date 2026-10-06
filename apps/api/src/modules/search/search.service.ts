import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';
import type { AuthUser } from '../../common/auth-user';

const SEARCH_TYPES = ['ticket', 'asset', 'user'] as const;

@Injectable()
export class SearchService {
  constructor(private readonly prisma: PrismaService) {}

  async search(q: string, types: string[] | undefined, actor: AuthUser) {
    const term = q.trim();
    if (term.length < 2) {
      return { data: { tickets: [], assets: [], users: [] } };
    }
    const wanted = new Set(
      types?.length ? types.filter((t) => SEARCH_TYPES.includes(t as never)) : [...SEARCH_TYPES],
    );

    const [tickets, assets, users] = await Promise.all([
      wanted.has('ticket') && actor.permissions.includes('ticket:view')
        ? this.searchTickets(term, actor)
        : Promise.resolve([]),
      wanted.has('asset') && actor.permissions.includes('asset:view')
        ? this.searchAssets(term, actor)
        : Promise.resolve([]),
      wanted.has('user') && actor.permissions.includes('user:view')
        ? this.searchUsers(term)
        : Promise.resolve([]),
    ]);

    return { data: { tickets, assets, users } };
  }

  /** FTS over the same expression as the GIN index, permission-scoped (SRCH-1). */
  private searchTickets(
    term: string,
    actor: AuthUser,
  ): Promise<Array<{ id: string; key: string; title: string; status: string; priority: string }>> {
    const scope = this.ticketScopeSql(actor);
    return this.prisma.$queryRaw`
      SELECT t.id, t.key, t.title, t.status::text AS status, t.priority::text AS priority,
        ts_rank(
          setweight(to_tsvector('english', coalesce(t.title, '')), 'A') ||
          setweight(to_tsvector('english', coalesce(t.description, '')), 'B'),
          websearch_to_tsquery('english', ${term})
        ) AS rank
      FROM tickets t
      WHERE (
        (setweight(to_tsvector('english', coalesce(t.title, '')), 'A') ||
         setweight(to_tsvector('english', coalesce(t.description, '')), 'B'))
        @@ websearch_to_tsquery('english', ${term})
        OR t.title ILIKE ${'%' + term + '%'}
        OR t.key ILIKE ${'%' + term.toUpperCase() + '%'}
      )
      AND ${scope}
      ORDER BY rank DESC NULLS LAST, t.updated_at DESC
      LIMIT 5
    `;
  }

  private searchAssets(term: string, actor: AuthUser) {
    const scope = actor.permissions.includes('asset:view_all')
      ? {}
      : { currentAssigneeId: actor.id };
    return this.prisma.asset.findMany({
      where: {
        AND: [
          scope,
          {
            OR: [
              { name: { contains: term, mode: 'insensitive' } },
              { serialNumber: { contains: term, mode: 'insensitive' } },
              { tag: { equals: term.toUpperCase() } },
            ],
          },
        ],
      },
      select: {
        id: true,
        tag: true,
        name: true,
        status: true,
        type: { select: { name: true } },
      },
      take: 5,
    });
  }

  private searchUsers(term: string) {
    return this.prisma.user.findMany({
      where: {
        OR: [
          { firstName: { contains: term, mode: 'insensitive' } },
          { lastName: { contains: term, mode: 'insensitive' } },
          { email: { contains: term, mode: 'insensitive' } },
        ],
      },
      select: { id: true, firstName: true, lastName: true, email: true, jobTitle: true },
      take: 5,
    });
  }

  private ticketScopeSql(actor: AuthUser): Prisma.Sql {
    if (actor.roleKeys.includes('ADMIN') || actor.permissions.includes('ticket:admin_override')) {
      return Prisma.sql`TRUE`;
    }
    const own = Prisma.sql`(t.requester_id = ${actor.id}::uuid OR t.assignee_id = ${actor.id}::uuid OR EXISTS (SELECT 1 FROM ticket_watchers w WHERE w.ticket_id = t.id AND w.user_id = ${actor.id}::uuid))`;
    if (actor.permissions.includes('ticket:view_all')) {
      return Prisma.sql`(${own} OR EXISTS (SELECT 1 FROM teams tm WHERE tm.id = t.team_id AND tm.manager_id = ${actor.id}::uuid))`;
    }
    if (actor.permissions.includes('ticket:view_team')) {
      const teams =
        actor.teamIds.length > 0
          ? Prisma.sql`t.team_id IN (${Prisma.join(actor.teamIds.map((id) => Prisma.sql`${id}::uuid`))})`
          : Prisma.sql`FALSE`;
      return Prisma.sql`(${own} OR ${teams})`;
    }
    return own;
  }
}
