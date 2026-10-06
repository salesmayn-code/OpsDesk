import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { PrismaService } from '../src/infra/prisma/prisma.service';
import { uuidv7 } from '../src/common/id';

function accessCookie(setCookie: string[] | string | undefined): string {
  const header = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
  const match = header.find((entry) => entry.startsWith('opsdesk_access='));
  if (!match) throw new Error('Missing access cookie');
  return match.split(';')[0]!;
}

describe('Ticket engine (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let employeeCookie: string;
  let agentCookie: string;
  let agent2Cookie: string;
  let employeeId: string;
  let agentId: string;
  let hardwareCategoryId: string;
  let resolutionCodeId: string;

  const server = () => app.getHttpServer();

  async function login(email: string): Promise<string> {
    const res = await request(server())
      .post('/api/v1/auth/login')
      .send({ email, password: 'ChangeMe!12345' })
      .expect(200);
    return accessCookie(res.headers['set-cookie']);
  }

  async function createTicket(cookie: string, title: string) {
    const res = await request(server())
      .post('/api/v1/tickets')
      .set('Cookie', cookie)
      .send({
        title,
        description: 'Integration test ticket description.',
        type: 'INCIDENT',
        categoryId: hardwareCategoryId,
      })
      .expect(201);
    return res.body.data as { id: string; key: string; version: number; status: string };
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = configureApp(moduleRef.createNestApplication({ bufferLogs: true }));
    await app.init();
    prisma = app.get(PrismaService);

    employeeCookie = await login('employee@opsdesk.local');
    agentCookie = await login('agent@opsdesk.local');
    agent2Cookie = await login('agent2@opsdesk.local');

    const employee = await prisma.user.findUniqueOrThrow({
      where: { email: 'employee@opsdesk.local' },
    });
    const agent = await prisma.user.findUniqueOrThrow({ where: { email: 'agent@opsdesk.local' } });
    employeeId = employee.id;
    agentId = agent.id;

    const category = await prisma.category.findFirstOrThrow({
      where: { name: 'Hardware', parentId: null },
    });
    hardwareCategoryId = category.id;
    const code = await prisma.resolutionCode.findFirstOrThrow({ where: { code: 'FIXED' } });
    resolutionCodeId = code.id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('creates a ticket with key, auto-routed team, history, audit, and outbox rows', async () => {
    const ticket = await createTicket(employeeCookie, 'Laptop keeps freezing');
    expect(ticket.key).toMatch(/^TKT-\d{6}$/);
    expect(ticket.status).toBe('NEW');

    const detail = await request(server())
      .get(`/api/v1/tickets/${ticket.key}`)
      .set('Cookie', employeeCookie)
      .expect(200);
    expect(detail.body.data.requester.id).toBe(employeeId);
    expect(detail.body.data.team.name).toBe('Desktop Support');
    expect(detail.body.data.allowedTransitions).toContain('CANCELLED');

    const [events, audits, outbox] = await Promise.all([
      prisma.ticketEvent.count({ where: { ticketId: ticket.id, type: 'CREATED' } }),
      prisma.auditLog.count({ where: { entityId: ticket.id, action: 'ticket.created' } }),
      prisma.outboxEvent.count({ where: { aggregateId: ticket.id, type: 'ticket.created' } }),
    ]);
    expect(events).toBe(1);
    expect(audits).toBe(1);
    expect(outbox).toBe(1);
  });

  it('replays the same response for a repeated Idempotency-Key', async () => {
    const key = `idem-${uuidv7()}`;
    const payload = {
      title: `Duplicate submission check ${uuidv7()}`,
      description: 'Same request sent twice.',
      type: 'SERVICE_REQUEST',
      categoryId: hardwareCategoryId,
    };

    const first = await request(server())
      .post('/api/v1/tickets')
      .set('Cookie', employeeCookie)
      .set('Idempotency-Key', key)
      .send(payload)
      .expect(201);
    const second = await request(server())
      .post('/api/v1/tickets')
      .set('Cookie', employeeCookie)
      .set('Idempotency-Key', key)
      .send(payload)
      .expect(201);

    expect(second.body.data.id).toBe(first.body.data.id);
    expect(await prisma.ticket.count({ where: { title: payload.title } })).toBe(1);
  });

  it('scopes visibility: another team agent cannot see the ticket (404)', async () => {
    const ticket = await createTicket(employeeCookie, 'Scope check for other agents');
    // Bilal is only in Help Desk; this ticket routed to Desktop Support.
    const res = await request(server())
      .get(`/api/v1/tickets/${ticket.key}`)
      .set('Cookie', agent2Cookie)
      .expect(404);
    expect(res.body.code).toBe('TICKET_NOT_FOUND');
  });

  it('runs the full lifecycle: assign -> in progress -> waiting -> resolve -> close', async () => {
    const ticket = await createTicket(employeeCookie, 'Printer shows offline status');
    expect(ticket.status).toBe('NEW');

    // Assign to Sara (Desktop Support).
    let res = await request(server())
      .post(`/api/v1/tickets/${ticket.id}/assignment`)
      .set('Cookie', agentCookie)
      .send({ version: ticket.version, assigneeId: agentId })
      .expect(200);
    expect(res.body.data.status).toBe('ASSIGNED');
    expect(res.body.data.assignee.id).toBe(agentId);

    // Emp employee cannot push their own ticket forward.
    await request(server())
      .post(`/api/v1/tickets/${ticket.id}/transitions`)
      .set('Cookie', employeeCookie)
      .send({ version: res.body.data.version, to: 'IN_PROGRESS' })
      .expect(403);

    // Assignee starts work.
    res = await request(server())
      .post(`/api/v1/tickets/${ticket.id}/transitions`)
      .set('Cookie', agentCookie)
      .send({ version: res.body.data.version, to: 'IN_PROGRESS' })
      .expect(200);
    expect(res.body.data.status).toBe('IN_PROGRESS');

    // Waiting for user requires a public comment first.
    const blocked = await request(server())
      .post(`/api/v1/tickets/${ticket.id}/transitions`)
      .set('Cookie', agentCookie)
      .send({ version: res.body.data.version, to: 'WAITING_FOR_USER' })
      .expect(422);
    expect(blocked.body.code).toBe('TICKET_INVALID_TRANSITION');

    await prisma.ticketComment.create({
      data: {
        id: uuidv7(),
        ticketId: ticket.id,
        authorId: agentId,
        visibility: 'PUBLIC',
        body: 'Could you send us the printer event log?',
      },
    });
    res = await request(server())
      .post(`/api/v1/tickets/${ticket.id}/transitions`)
      .set('Cookie', agentCookie)
      .send({ version: res.body.data.version, to: 'WAITING_FOR_USER' })
      .expect(200);
    expect(res.body.data.status).toBe('WAITING_FOR_USER');

    // And back.
    res = await request(server())
      .post(`/api/v1/tickets/${ticket.id}/transitions`)
      .set('Cookie', agentCookie)
      .send({ version: res.body.data.version, to: 'IN_PROGRESS' })
      .expect(200);

    // Resolve requires resolution data.
    const missingResolution = await request(server())
      .post(`/api/v1/tickets/${ticket.id}/transitions`)
      .set('Cookie', agentCookie)
      .send({ version: res.body.data.version, to: 'RESOLVED' })
      .expect(422);
    expect(missingResolution.body.code).toBe('RESOLUTION_REQUIRED');

    res = await request(server())
      .post(`/api/v1/tickets/${ticket.id}/transitions`)
      .set('Cookie', agentCookie)
      .send({
        version: res.body.data.version,
        to: 'RESOLVED',
        resolution: { code: 'FIXED', summary: 'Replaced the network cable.' },
      })
      .expect(200);
    expect(res.body.data.status).toBe('RESOLVED');
    expect(res.body.data.resolvedAt).not.toBeNull();
    expect(res.body.data.resolutionCodeId).toBe(resolutionCodeId);

    // Requester confirms resolution.
    res = await request(server())
      .post(`/api/v1/tickets/${ticket.id}/transitions`)
      .set('Cookie', employeeCookie)
      .send({ version: res.body.data.version, to: 'CLOSED' })
      .expect(200);
    expect(res.body.data.status).toBe('CLOSED');
    expect(res.body.data.closedAt).not.toBeNull();

    // Closed is terminal.
    const terminal = await request(server())
      .post(`/api/v1/tickets/${ticket.id}/transitions`)
      .set('Cookie', employeeCookie)
      .send({ version: res.body.data.version, to: 'REOPENED', reason: 'still broken' })
      .expect(422);
    expect(terminal.body.code).toBe('TICKET_INVALID_TRANSITION');
  });

  it('detects stale versions on concurrent writes (409)', async () => {
    const ticket = await createTicket(employeeCookie, 'Concurrent edit conflict check');
    const assigned = await request(server())
      .post(`/api/v1/tickets/${ticket.id}/assignment`)
      .set('Cookie', agentCookie)
      .send({ version: ticket.version, assigneeId: agentId })
      .expect(200);

    const version = assigned.body.data.version;
    const [first, second] = await Promise.all([
      request(server())
        .post(`/api/v1/tickets/${ticket.id}/transitions`)
        .set('Cookie', agentCookie)
        .send({ version, to: 'IN_PROGRESS' }),
      request(server())
        .post(`/api/v1/tickets/${ticket.id}/transitions`)
        .set('Cookie', agentCookie)
        .send({ version, to: 'IN_PROGRESS' }),
    ]);

    const statuses = [first.status, second.status].sort();
    expect(statuses).toEqual([200, 409]);
    const conflict = first.status === 409 ? first : second;
    expect(conflict.body.code).toBe('CONFLICT_STALE_VERSION');
  });

  it('rejects assigning an agent who is not in the team (422)', async () => {
    const ticket = await createTicket(employeeCookie, 'Assignment membership validation');
    const bilal = await prisma.user.findUniqueOrThrow({
      where: { email: 'agent2@opsdesk.local' },
    });
    const res = await request(server())
      .post(`/api/v1/tickets/${ticket.id}/assignment`)
      .set('Cookie', agentCookie)
      .send({ version: ticket.version, assigneeId: bilal.id })
      .expect(422);
    expect(res.body.code).toBe('ASSIGNEE_NOT_IN_TEAM');
  });

  it('lists tickets with URL filter state and scoping', async () => {
    const ticket = await createTicket(employeeCookie, 'Filterable list check ticket');

    const agentList = await request(server())
      .get('/api/v1/tickets?view=team&status=NEW&pageSize=100')
      .set('Cookie', agentCookie)
      .expect(200);
    const ids = (agentList.body.data as { id: string }[]).map((row) => row.id);
    expect(ids).toContain(ticket.id);

    const employeeList = await request(server())
      .get('/api/v1/tickets?status=NEW&pageSize=100')
      .set('Cookie', employeeCookie)
      .expect(200);
    const employeeIds = (employeeList.body.data as { id: string }[]).map((row) => row.id);
    expect(employeeIds).toContain(ticket.id);

    // Every returned row is visible to the employee (scoped query).
    for (const row of employeeList.body.data as { requester: { id: string } }[]) {
      expect(row.requester.id).toBe(employeeId);
    }
  });

  it('returns the category tree for the ticket form', async () => {
    const res = await request(server())
      .get('/api/v1/categories')
      .set('Cookie', employeeCookie)
      .expect(200);
    const names = (res.body.data as { name: string }[]).map((node) => node.name);
    expect(names).toContain('Hardware');
    expect(names).toContain('Network');
  });
});
