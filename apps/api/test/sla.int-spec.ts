import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { PrismaService } from '../src/infra/prisma/prisma.service';
import { SlaService } from '../src/modules/sla/sla.service';
import { uuidv7 } from '../src/common/id';

function accessCookie(setCookie: string[] | string | undefined): string {
  const header = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
  const match = header.find((entry) => entry.startsWith('opsdesk_access='));
  if (!match) throw new Error('Missing access cookie');
  return match.split(';')[0]!;
}

describe('SLA engine (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let slaService: SlaService;
  let employeeCookie: string;
  let agentCookie: string;
  let adminCookie: string;
  let agentId: string;
  let categoryId: string;

  const server = () => app.getHttpServer();

  async function login(email: string): Promise<string> {
    const res = await request(server())
      .post('/api/v1/auth/login')
      .send({ email, password: 'ChangeMe!12345' })
      .expect(200);
    return accessCookie(res.headers['set-cookie']);
  }

  async function createTicket() {
    const res = await request(server())
      .post('/api/v1/tickets')
      .set('Cookie', employeeCookie)
      .send({
        title: 'SLA engine integration ticket',
        description: 'Ticket used by the SLA integration suite.',
        type: 'INCIDENT',
        categoryId,
      })
      .expect(201);
    return res.body.data as { id: string; key: string; version: number };
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = configureApp(moduleRef.createNestApplication({ bufferLogs: true }));
    await app.init();
    prisma = app.get(PrismaService);
    slaService = app.get(SlaService);

    employeeCookie = await login('employee@opsdesk.local');
    agentCookie = await login('agent@opsdesk.local');
    adminCookie = await login('admin@opsdesk.local');

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

  it('starts both timers on creation with a selected policy and precomputed thresholds', async () => {
    const ticket = await createTicket();
    const res = await request(server())
      .get(`/api/v1/tickets/${ticket.id}/sla`)
      .set('Cookie', employeeCookie)
      .expect(200);

    expect(res.body.data.policy.name).toBe('Medium');
    const timers = res.body.data.timers as { kind: string; targetMinutes: number; state: string }[];
    expect(timers).toHaveLength(2);
    const response = timers.find((timer) => timer.kind === 'RESPONSE')!;
    const resolution = timers.find((timer) => timer.kind === 'RESOLUTION')!;
    expect(response.targetMinutes).toBe(240);
    expect(resolution.targetMinutes).toBe(540);
    expect(response.state).toBe('ON_TRACK');

    const startedEvents = await prisma.slaEvent.count({
      where: { ticketId: ticket.id, type: 'STARTED' },
    });
    expect(startedEvents).toBe(2);
    const applied = await prisma.ticketEvent.count({
      where: { ticketId: ticket.id, type: 'SLA_APPLIED' },
    });
    expect(applied).toBe(1);
  });

  it('pauses the resolution timer while waiting for the user and resumes after', async () => {
    const ticket = await createTicket();

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

    await prisma.ticketComment.create({
      data: {
        id: uuidv7(),
        ticketId: ticket.id,
        authorId: agentId,
        visibility: 'PUBLIC',
        body: 'Please share the error log.',
      },
    });
    res = await request(server())
      .post(`/api/v1/tickets/${ticket.id}/transitions`)
      .set('Cookie', agentCookie)
      .send({ version: res.body.data.version, to: 'WAITING_FOR_USER' })
      .expect(200);

    let sla = await request(server())
      .get(`/api/v1/tickets/${ticket.id}/sla`)
      .set('Cookie', agentCookie)
      .expect(200);
    let resolution = (sla.body.data.timers as { kind: string; state: string; pausedAt: string | null }[]).find(
      (timer) => timer.kind === 'RESOLUTION',
    )!;
    expect(resolution.state).toBe('PAUSED');
    expect(resolution.pausedAt).not.toBeNull();

    await request(server())
      .post(`/api/v1/tickets/${ticket.id}/transitions`)
      .set('Cookie', agentCookie)
      .send({ version: res.body.data.version, to: 'IN_PROGRESS' })
      .expect(200);

    sla = await request(server())
      .get(`/api/v1/tickets/${ticket.id}/sla`)
      .set('Cookie', agentCookie)
      .expect(200);
    resolution = (sla.body.data.timers as { kind: string; state: string; pausedAt: string | null }[]).find(
      (timer) => timer.kind === 'RESOLUTION',
    )!;
    expect(resolution.state).toBe('ON_TRACK');
    expect(resolution.pausedAt).toBeNull();

    const resumedEvents = await prisma.slaEvent.count({
      where: { ticketId: ticket.id, type: 'RESUMED' },
    });
    expect(resumedEvents).toBe(1);
  });

  it('completes the resolution timer on resolve and cancels timers on cancel', async () => {
    const ticket = await createTicket();
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
        resolution: { code: 'FIXED', summary: 'Restarted the print spooler.' },
      })
      .expect(200);

    const completed = await prisma.slaTimer.findFirstOrThrow({
      where: { ticketId: ticket.id, kind: 'RESOLUTION' },
    });
    expect(completed.state).toBe('COMPLETED');
    expect(completed.completedAt).not.toBeNull();

    const cancelTicket = await createTicket();
    await request(server())
      .post(`/api/v1/tickets/${cancelTicket.id}/transitions`)
      .set('Cookie', employeeCookie)
      .send({ version: cancelTicket.version, to: 'CANCELLED', reason: 'No longer needed' })
      .expect(200);

    const cancelled = await prisma.slaTimer.findMany({ where: { ticketId: cancelTicket.id } });
    expect(cancelled.every((timer) => timer.state === 'CANCELLED')).toBe(true);
    expect(cancelled.every((timer) => timer.cancelledAt !== null)).toBe(true);
  });

  it('evaluates thresholds once per timer and emits outbox + audit rows on breach', async () => {
    const ticket = await createTicket();
    const past = new Date(Date.now() - 60_000);
    await prisma.slaTimer.updateMany({
      where: { ticketId: ticket.id },
      data: { warnAt: past, escalateAt: past, dueAt: past },
    });

    const first = await slaService.evaluate(new Date());
    expect(first.warned).toBeGreaterThanOrEqual(2);
    expect(first.escalated).toBeGreaterThanOrEqual(2);
    expect(first.breached).toBeGreaterThanOrEqual(2);

    const timers = await prisma.slaTimer.findMany({ where: { ticketId: ticket.id } });
    expect(timers.every((timer) => timer.warnedAt !== null)).toBe(true);
    expect(timers.every((timer) => timer.escalatedAt !== null)).toBe(true);
    expect(timers.every((timer) => timer.breachedAt !== null)).toBe(true);

    const outbox = await prisma.outboxEvent.count({
      where: { aggregateId: ticket.id, type: 'sla.breached' },
    });
    expect(outbox).toBe(2);
    const audits = await prisma.auditLog.count({ where: { entityId: ticket.id, action: 'sla.breached' } });
    expect(audits).toBe(2);

    // Idempotent: a second run flags nothing new for this ticket.
    const flagged = await prisma.slaTimer.findMany({ where: { ticketId: ticket.id } });
    const second = await slaService.evaluate(new Date());
    const stillFlagged = await prisma.slaTimer.findMany({ where: { ticketId: ticket.id } });
    expect(second.breached).toBe(0);
    expect(stillFlagged.map((timer) => timer.breachedAt?.toISOString())).toEqual(
      flagged.map((timer) => timer.breachedAt?.toISOString()),
    );

    const detail = await request(server())
      .get(`/api/v1/tickets/${ticket.id}`)
      .set('Cookie', employeeCookie)
      .expect(200);
    expect(detail.body.data.slaState).toBe('BREACHED');
  });

  it('recalculates timers when priority changes', async () => {
    const ticket = await createTicket();
    const before = await prisma.slaTimer.findFirstOrThrow({
      where: { ticketId: ticket.id, kind: 'RESOLUTION' },
    });

    await request(server())
      .patch(`/api/v1/tickets/${ticket.id}`)
      .set('Cookie', agentCookie)
      .send({ version: ticket.version, priority: 'HIGH' })
      .expect(200);

    const after = await prisma.slaTimer.findFirstOrThrow({
      where: { ticketId: ticket.id, kind: 'RESOLUTION' },
    });
    expect(after.targetMinutes).toBe(240); // High: 4h (24x7)
    expect(after.dueAt.getTime()).toBeLessThan(before.dueAt.getTime());
    const recalculated = await prisma.slaEvent.count({
      where: { ticketId: ticket.id, type: 'RECALCULATED' },
    });
    expect(recalculated).toBeGreaterThanOrEqual(2);
  });

  it('serves preview with computed due times and guards the admin endpoints', async () => {
    const preview = await request(server())
      .post('/api/v1/sla-policies/preview')
      .set('Cookie', adminCookie)
      .send({ priority: 'CRITICAL', type: 'INCIDENT' })
      .expect(200);

    expect(preview.body.data.policy.name).toBe('Critical');
    const responseDue = new Date(preview.body.data.response.dueAt).getTime();
    const expected = Date.now() + 15 * 60_000;
    expect(Math.abs(responseDue - expected)).toBeLessThan(60_000);

    await request(server())
      .get('/api/v1/sla-policies')
      .set('Cookie', employeeCookie)
      .expect(403);
    const list = await request(server())
      .get('/api/v1/sla-policies')
      .set('Cookie', adminCookie)
      .expect(200);
    expect(list.body.data.length).toBeGreaterThanOrEqual(4);
  });
});
