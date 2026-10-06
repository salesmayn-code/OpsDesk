import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { PrismaService } from '../src/infra/prisma/prisma.service';

function accessCookie(setCookie: string[] | string | undefined): string {
  const header = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
  const match = header.find((entry) => entry.startsWith('opsdesk_access='));
  if (!match) throw new Error('Missing access cookie');
  return match.split(';')[0]!;
}

describe('Knowledge base (Phase 2 · Sprint 2.4)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let employeeCookie: string;
  let agentCookie: string;
  let managerCookie: string;

  const server = () => app.getHttpServer();

  async function login(email: string): Promise<string> {
    const res = await request(server())
      .post('/api/v1/auth/login')
      .send({ email, password: 'ChangeMe!12345' })
      .expect(200);
    return accessCookie(res.headers['set-cookie']);
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = configureApp(moduleRef.createNestApplication({ bufferLogs: true }));
    await app.init();
    prisma = app.get(PrismaService);

    employeeCookie = await login('employee@opsdesk.local');
    agentCookie = await login('agent@opsdesk.local');
    managerCookie = await login('manager@opsdesk.local');
  });

  afterAll(async () => {
    await app.close();
  });

  it('exposes only published articles to employees and all statuses to staff', async () => {
    const employeeList = await request(server())
      .get('/api/v1/kb/articles?pageSize=100')
      .set('Cookie', employeeCookie)
      .expect(200);
    const employeeStatuses = new Set(
      (employeeList.body.data as { status: string }[]).map((article) => article.status),
    );
    expect(employeeStatuses.size).toBe(1);
    expect(employeeStatuses.has('PUBLISHED')).toBe(true);
    expect((employeeList.body.data as unknown[]).length).toBeGreaterThanOrEqual(5);

    const draft = await request(server())
      .post('/api/v1/kb/articles')
      .set('Cookie', agentCookie)
      .send({ title: 'Draft article for status filtering', content: 'Work in progress.' })
      .expect(201);
    expect(draft.body.data.status).toBe('DRAFT');

    const staffList = await request(server())
      .get('/api/v1/kb/articles?status=DRAFT&pageSize=100')
      .set('Cookie', agentCookie)
      .expect(200);
    expect(
      (staffList.body.data as { id: string }[]).some((article) => article.id === draft.body.data.id),
    ).toBe(true);

    await request(server())
      .get(`/api/v1/kb/articles/${draft.body.data.id}`)
      .set('Cookie', employeeCookie)
      .expect(404);
  });

  it('runs the DRAFT → REVIEW → PUBLISHED → ARCHIVED lifecycle with permissions', async () => {
    const created = await request(server())
      .post('/api/v1/kb/articles')
      .set('Cookie', agentCookie)
      .send({
        title: 'How to request a new monitor',
        summary: 'Peripheral requests explained.',
        content: '## Steps\n1. Raise a HARDWARE_REQUEST ticket.',
      })
      .expect(201);
    const article = created.body.data as { id: string; slug: string; version: number };

    const review = await request(server())
      .post(`/api/v1/kb/articles/${article.id}/transitions`)
      .set('Cookie', agentCookie)
      .send({ version: article.version, to: 'REVIEW' })
      .expect(200);
    expect(review.body.data.status).toBe('REVIEW');

    // Agents cannot publish.
    await request(server())
      .post(`/api/v1/kb/articles/${article.id}/transitions`)
      .set('Cookie', agentCookie)
      .send({ version: review.body.data.version, to: 'PUBLISHED' })
      .expect(403);

    const published = await request(server())
      .post(`/api/v1/kb/articles/${article.id}/transitions`)
      .set('Cookie', managerCookie)
      .send({ version: review.body.data.version, to: 'PUBLISHED' })
      .expect(200);
    expect(published.body.data.status).toBe('PUBLISHED');
    expect(published.body.data.publishedAt).not.toBeNull();

    const audit = await prisma.auditLog.count({
      where: { entityId: article.id, action: 'kb.published' },
    });
    expect(audit).toBe(1);

    const archived = await request(server())
      .post(`/api/v1/kb/articles/${article.id}/transitions`)
      .set('Cookie', managerCookie)
      .send({ version: published.body.data.version, to: 'ARCHIVED' })
      .expect(200);
    expect(archived.body.data.status).toBe('ARCHIVED');

    // Employees can no longer read the archived article.
    await request(server())
      .get(`/api/v1/kb/articles/${article.slug}`)
      .set('Cookie', employeeCookie)
      .expect(404);
  });

  it('suggests published articles by keyword and category', async () => {
    const byKeyword = await request(server())
      .get('/api/v1/kb/suggest?q=vpn')
      .set('Cookie', employeeCookie)
      .expect(200);
    expect(
      (byKeyword.body.data as { title: string }[]).some((article) =>
        article.title.toLowerCase().includes('vpn'),
      ),
    ).toBe(true);

    const vpnCategory = await prisma.category.findFirst({ where: { name: 'VPN' } });
    const byCategory = await request(server())
      .get(`/api/v1/kb/suggest?categoryId=${vpnCategory!.id}`)
      .set('Cookie', employeeCookie)
      .expect(200);
    expect((byCategory.body.data as unknown[]).length).toBeGreaterThan(0);
  });

  it('links published articles to tickets and rejects drafts', async () => {
    const categories = await request(server())
      .get('/api/v1/categories')
      .set('Cookie', employeeCookie)
      .expect(200);
    const hardware = (categories.body.data as { id: string; name: string }[]).find(
      (category) => category.name === 'Hardware',
    )!;
    const ticket = await request(server())
      .post('/api/v1/tickets')
      .set('Cookie', employeeCookie)
      .send({
        title: 'Printer problem for KB linking',
        description: 'Ticket used by the knowledge base suite.',
        type: 'INCIDENT',
        categoryId: hardware.id,
      })
      .expect(201);
    const ticketId = ticket.body.data.id as string;

    const article = await prisma.knowledgeArticle.findFirstOrThrow({
      where: { status: 'PUBLISHED' },
    });
    const linked = await request(server())
      .post(`/api/v1/tickets/${ticketId}/articles`)
      .set('Cookie', agentCookie)
      .send({ articleId: article.id })
      .expect(201);
    expect(linked.body.data.slug).toBe(article.slug);

    // Duplicate links are idempotent.
    await request(server())
      .post(`/api/v1/tickets/${ticketId}/articles`)
      .set('Cookie', agentCookie)
      .send({ articleId: article.id })
      .expect(201);

    const listed = await request(server())
      .get(`/api/v1/tickets/${ticketId}/articles`)
      .set('Cookie', employeeCookie)
      .expect(200);
    expect((listed.body.data as { id: string }[]).filter((row) => row.id === article.id)).toHaveLength(1);

    const event = await prisma.ticketEvent.count({
      where: { ticketId, type: 'ARTICLE_LINKED' },
    });
    expect(event).toBeGreaterThanOrEqual(1);

    // Drafts cannot be linked.
    const draft = await request(server())
      .post('/api/v1/kb/articles')
      .set('Cookie', agentCookie)
      .send({ title: 'Draft that must not be linkable', content: 'Draft body.' })
      .expect(201);
    const rejected = await request(server())
      .post(`/api/v1/tickets/${ticketId}/articles`)
      .set('Cookie', agentCookie)
      .send({ articleId: draft.body.data.id })
      .expect(422);
    expect(rejected.body.code).toBe('ARTICLE_NOT_PUBLISHED');
  });

  it('enforces RBAC boundaries', async () => {
    await request(server())
      .post('/api/v1/kb/articles')
      .set('Cookie', employeeCookie)
      .send({ title: 'Employees cannot author articles', content: 'Nope.' })
      .expect(403);
  });
});
