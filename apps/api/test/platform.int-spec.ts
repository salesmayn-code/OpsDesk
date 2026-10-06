import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { PrismaService } from '../src/infra/prisma/prisma.service';
import { OutboxDispatcher } from '../src/infra/outbox/outbox.dispatcher';

function accessCookie(setCookie: string[] | string | undefined): string {
  const header = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
  const match = header.find((entry) => entry.startsWith('opsdesk_access='));
  if (!match) throw new Error('Missing access cookie');
  return match.split(';')[0]!;
}

describe('Notifications, search, dashboards & audit (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let dispatcher: OutboxDispatcher;
  let employeeCookie: string;
  let agentCookie: string;
  let managerCookie: string;
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

  async function drainOutbox() {
    // The outbox has older pending rows from other suites; drain in a loop.
    for (let i = 0; i < 20; i += 1) {
      const result = await dispatcher.dispatchBatch();
      if (result.processed === 0) break;
    }
  }

  async function createTicket(title: string) {
    const res = await request(server())
      .post('/api/v1/tickets')
      .set('Cookie', employeeCookie)
      .send({
        title,
        description: 'Ticket used by the notifications/search suite.',
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
    dispatcher = app.get(OutboxDispatcher);

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

  it('fans out assignment and status notifications via the outbox dispatcher', async () => {
    const ticket = await createTicket('Notification fan-out check');

    const assigned = await request(server())
      .post(`/api/v1/tickets/${ticket.id}/assignment`)
      .set('Cookie', agentCookie)
      .send({ version: ticket.version, assigneeId: agentId })
      .expect(200);
    await request(server())
      .post(`/api/v1/tickets/${ticket.id}/transitions`)
      .set('Cookie', agentCookie)
      .send({ version: assigned.body.data.version, to: 'IN_PROGRESS' })
      .expect(200);
    await request(server())
      .post(`/api/v1/tickets/${ticket.id}/comments`)
      .set('Cookie', agentCookie)
      .send({ body: 'Working on it now.', visibility: 'PUBLIC' })
      .expect(201);

    await drainOutbox();

    const agentNotifications = await request(server())
      .get('/api/v1/notifications?limit=50')
      .set('Cookie', agentCookie)
      .expect(200);
    const agentTypes = (agentNotifications.body.data as { type: string }[]).map((n) => n.type);
    expect(agentTypes).toContain('TICKET_ASSIGNED');

    const employeeNotifications = await request(server())
      .get('/api/v1/notifications?limit=50')
      .set('Cookie', employeeCookie)
      .expect(200);
    const employeeTypes = (employeeNotifications.body.data as { type: string }[]).map(
      (n) => n.type,
    );
    expect(employeeTypes).toContain('TICKET_COMMENT_ADDED');

    const count = await request(server())
      .get('/api/v1/notifications/unread-count')
      .set('Cookie', employeeCookie)
      .expect(200);
    expect(count.body.data.count).toBeGreaterThan(0);

    const first = employeeNotifications.body.data[0] as { id: string };
    await request(server())
      .post(`/api/v1/notifications/${first.id}/read`)
      .set('Cookie', employeeCookie)
      .expect(200);
    await request(server())
      .post('/api/v1/notifications/read-all')
      .set('Cookie', employeeCookie)
      .expect(200);
    const afterRead = await request(server())
      .get('/api/v1/notifications/unread-count')
      .set('Cookie', employeeCookie)
      .expect(200);
    expect(afterRead.body.data.count).toBe(0);
  });

  it('is idempotent: re-dispatching produces no duplicate notifications', async () => {
    const ticket = await createTicket('Notification dedupe check');
    await request(server())
      .post(`/api/v1/tickets/${ticket.id}/assignment`)
      .set('Cookie', agentCookie)
      .send({ version: ticket.version, assigneeId: agentId })
      .expect(200);
    await drainOutbox();

    const before = await prisma.notification.count({
      where: { recipientId: agentId, entityId: ticket.id },
    });
    // Force the outbox rows back to unprocessed and dispatch again.
    await prisma.outboxEvent.updateMany({
      where: { aggregateId: ticket.id },
      data: { processedAt: null },
    });
    await drainOutbox();
    const after = await prisma.notification.count({
      where: { recipientId: agentId, entityId: ticket.id },
    });
    expect(after).toBe(before);
  });

  it('searches tickets with actor scoping and returns assets/users when permitted', async () => {
    const ticket = await createTicket('Quantum printer calibration fault');

    const employeeSearch = await request(server())
      .get('/api/v1/search?q=quantum+printer')
      .set('Cookie', employeeCookie)
      .expect(200);
    const employeeTickets = employeeSearch.body.data.tickets as { id: string }[];
    expect(employeeTickets.map((row) => row.id)).toContain(ticket.id);
    // Employees cannot see the user directory.
    expect(employeeSearch.body.data.users).toHaveLength(0);

    const agentSearch = await request(server())
      .get('/api/v1/search?q=agent')
      .set('Cookie', agentCookie)
      .expect(200);
    expect((agentSearch.body.data.users as unknown[]).length).toBeGreaterThan(0);
  });

  it('reports role-specific dashboards', async () => {
    const employee = await request(server())
      .get('/api/v1/dashboard/employee')
      .set('Cookie', employeeCookie)
      .expect(200);
    expect(employee.body.data.stats).toHaveProperty('myOpen');
    expect(employee.body.data).toHaveProperty('myAssets');

    await request(server())
      .get('/api/v1/dashboard/agent')
      .set('Cookie', employeeCookie)
      .expect(403);

    const agent = await request(server())
      .get('/api/v1/dashboard/agent')
      .set('Cookie', agentCookie)
      .expect(200);
    expect(agent.body.data.stats).toHaveProperty('assignedToMe');
    expect(Array.isArray(agent.body.data.needsAttention)).toBe(true);

    const manager = await request(server())
      .get('/api/v1/dashboard/manager')
      .set('Cookie', managerCookie)
      .expect(200);
    expect(manager.body.data.stats).toHaveProperty('open');
    expect(manager.body.data).toHaveProperty('byPriority');
    expect(manager.body.data).toHaveProperty('byTeam');
  });

  it('serves audit logs to authorized roles with filters and cursor pagination', async () => {
    await request(server())
      .get('/api/v1/audit-logs')
      .set('Cookie', employeeCookie)
      .expect(403);

    const list = await request(server())
      .get('/api/v1/audit-logs?limit=5&action=ticket')
      .set('Cookie', managerCookie)
      .expect(200);
    const rows = list.body.data as { id: string; action: string }[];
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((row) => row.action.includes('ticket'))).toBe(true);

    if (list.body.meta.nextCursor) {
      await request(server())
        .get(`/api/v1/audit-logs?limit=5&cursor=${list.body.meta.nextCursor}`)
        .set('Cookie', managerCookie)
        .expect(200);
    }

    const byEntity = await request(server())
      .get('/api/v1/audit-logs?entityType=ticket&limit=50')
      .set('Cookie', managerCookie)
      .expect(200);
    expect(byEntity.body.data.length).toBeGreaterThan(0);
  });
});
