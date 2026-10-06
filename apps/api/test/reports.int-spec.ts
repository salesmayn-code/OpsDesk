import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { PrismaService } from '../src/infra/prisma/prisma.service';
import { ReportsService } from '../src/modules/reports/reports.service';

function accessCookie(setCookie: string[] | string | undefined): string {
  const header = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
  const match = header.find((entry) => entry.startsWith('opsdesk_access='));
  if (!match) throw new Error('Missing access cookie');
  return match.split(';')[0]!;
}

describe('Reporting & analytics (Phase 2 · Sprint 2.5)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let reports: ReportsService;
  let employeeCookie: string;
  let agentCookie: string;
  let managerCookie: string;
  let agentId: string;
  let categoryId: string;

  const server = () => app.getHttpServer();
  const today = new Date();

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
    reports = app.get(ReportsService);

    employeeCookie = await login('employee@opsdesk.local');
    agentCookie = await login('agent@opsdesk.local');
    managerCookie = await login('manager@opsdesk.local');
    const agent = await prisma.user.findUniqueOrThrow({ where: { email: 'agent@opsdesk.local' } });
    agentId = agent.id;
    const category = await prisma.category.findFirstOrThrow({
      where: { name: 'Hardware', parentId: null },
    });
    categoryId = category.id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('rolls up the day idempotently and serves the volume report', async () => {
    const ticketResponse = await request(server())
      .post('/api/v1/tickets')
      .set('Cookie', employeeCookie)
      .send({
        title: 'Reporting volume ticket',
        description: 'Created for the reporting suite.',
        type: 'INCIDENT',
        categoryId,
      })
      .expect(201);
    const ticket = ticketResponse.body.data as { id: string; version: number };

    let res = await request(server())
      .post(`/api/v1/tickets/${ticket.id}/assignment`)
      .set('Cookie', agentCookie)
      .send({ version: ticket.version, assigneeId: agentId })
      .expect(200);
    res = await request(server())
      .post(`/api/v1/tickets/${ticket.id}/transitions`)
      .set('Cookie', agentCookie)
      .send({ version: res.body.data.version, to: 'IN_PROGRESS' })
      .expect(200);
    await request(server())
      .post(`/api/v1/tickets/${ticket.id}/transitions`)
      .set('Cookie', agentCookie)
      .send({
        version: res.body.data.version,
        to: 'RESOLVED',
        resolution: { code: 'FIXED', summary: 'Resolved for reporting.' },
      })
      .expect(200);

    const first = await reports.rollupDay(today);
    expect(first.rows).toBeGreaterThan(0);
    const second = await reports.rollupDay(today);
    expect(second.rows).toBe(first.rows);

    const dayStart = new Date(
      Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()),
    );
    const stored = await prisma.dailyTicketStats.aggregate({
      where: { day: dayStart },
      _sum: { created: true, resolved: true },
    });
    expect(stored._sum.created ?? 0).toBeGreaterThanOrEqual(1);
    expect(stored._sum.resolved ?? 0).toBeGreaterThanOrEqual(1);

    const from = new Date(Date.now() - 7 * 86_400_000).toISOString();
    const to = new Date(Date.now() + 86_400_000).toISOString();
    const volume = await request(server())
      .get(`/api/v1/reports/volume?from=${from}&to=${to}`)
      .set('Cookie', managerCookie)
      .expect(200);
    const rows = volume.body.data as { day: string; created: number; resolved: number }[];
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.reduce((sum, row) => sum + row.created, 0)).toBeGreaterThanOrEqual(1);
    expect(rows.reduce((sum, row) => sum + row.resolved, 0)).toBeGreaterThanOrEqual(1);
  });

  it('serves SLA compliance, breach, category, and response-time reports', async () => {
    const from = new Date(Date.now() - 7 * 86_400_000).toISOString();
    const to = new Date(Date.now() + 86_400_000).toISOString();

    const compliance = await request(server())
      .get(`/api/v1/reports/sla-compliance?from=${from}&to=${to}`)
      .set('Cookie', managerCookie)
      .expect(200);
    const complianceRows = compliance.body.data as {
      team: string;
      total: number;
      compliancePercent: number | null;
    }[];
    expect(complianceRows.length).toBeGreaterThan(0);
    expect(complianceRows[0]!.total).toBeGreaterThanOrEqual(1);

    const breaches = await request(server())
      .get(`/api/v1/reports/breaches?from=${from}&to=${to}`)
      .set('Cookie', managerCookie)
      .expect(200);
    expect(Array.isArray(breaches.body.data)).toBe(true);

    const categories = await request(server())
      .get(`/api/v1/reports/categories?from=${from}&to=${to}`)
      .set('Cookie', managerCookie)
      .expect(200);
    expect(
      (categories.body.data as { category: string; count: number }[]).some(
        (row) => row.category === 'Hardware' && row.count >= 1,
      ),
    ).toBe(true);

    const responseTimes = await request(server())
      .get(`/api/v1/reports/response-times?from=${from}&to=${to}`)
      .set('Cookie', managerCookie)
      .expect(200);
    expect((responseTimes.body.data as unknown[]).length).toBeGreaterThan(0);
  });

  it('exports CSV with the proper headers', async () => {
    const from = new Date(Date.now() - 7 * 86_400_000).toISOString();
    const to = new Date(Date.now() + 86_400_000).toISOString();
    const csv = await request(server())
      .get(`/api/v1/reports/volume?from=${from}&to=${to}&format=csv`)
      .set('Cookie', managerCookie)
      .expect(200);
    expect(csv.headers['content-type']).toContain('text/csv');
    expect(csv.headers['content-disposition']).toContain('attachment');
    expect(csv.text.split('\n')[0]).toBe('day,created,resolved');
  });

  it('enforces RBAC and rejects unknown report keys', async () => {
    await request(server()).get('/api/v1/reports/volume').set('Cookie', employeeCookie).expect(403);
    await request(server())
      .get('/api/v1/reports/does-not-exist')
      .set('Cookie', managerCookie)
      .expect(404);
  });
});
