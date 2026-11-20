import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { OutboxDispatcher } from '../src/infra/outbox/outbox.dispatcher';
import { PrismaService } from '../src/infra/prisma/prisma.service';

function accessCookie(setCookie: string[] | string | undefined): string {
  const header = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
  const match = header.find((entry) => entry.startsWith('opsdesk_access='));
  if (!match) throw new Error('Missing access cookie');
  return match.split(';')[0]!;
}

describe('Ticket watchers (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let dispatcher: OutboxDispatcher;
  let employeeCookie: string;
  let agentCookie: string;
  let colleagueCookie: string;
  let colleagueId: string;
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
    for (let i = 0; i < 20; i += 1) {
      if ((await dispatcher.dispatchBatch()).processed === 0) break;
    }
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = configureApp(moduleRef.createNestApplication({ bufferLogs: true }));
    await app.init();
    prisma = app.get(PrismaService);
    dispatcher = app.get(OutboxDispatcher);

    employeeCookie = await login('employee@opsdesk.local');
    agentCookie = await login('agent@opsdesk.local');

    // A second employee: by default they must not see the first employee's ticket.
    const email = `watcher.${Date.now().toString(36)}@opsdesk.local`;
    const registered = await request(server())
      .post('/api/v1/auth/register')
      .send({ firstName: 'Wanda', lastName: 'Watcher', email, password: 'ChangeMe!12345' })
      .expect(201);
    colleagueCookie = accessCookie(registered.headers['set-cookie']);
    colleagueId = (await prisma.user.findUniqueOrThrow({ where: { email } })).id;

    categoryId = (
      await prisma.category.findFirstOrThrow({ where: { name: 'Hardware', parentId: null } })
    ).id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('lets staff add a watcher, which grants visibility and update notifications', async () => {
    const ticket = (
      await request(server())
        .post('/api/v1/tickets')
        .set('Cookie', employeeCookie)
        .send({ title: 'Watchers suite ticket', description: 'Watch me.', type: 'INCIDENT', categoryId })
        .expect(201)
    ).body.data as { id: string; key: string };

    await request(server()).get(`/api/v1/tickets/${ticket.id}`).set('Cookie', colleagueCookie).expect(404);

    // Employees may only watch themselves.
    await request(server())
      .post(`/api/v1/tickets/${ticket.id}/watchers`)
      .set('Cookie', employeeCookie)
      .send({ userId: colleagueId })
      .expect(403);

    const added = await request(server())
      .post(`/api/v1/tickets/${ticket.id}/watchers`)
      .set('Cookie', agentCookie)
      .send({ userId: colleagueId })
      .expect(201);
    expect(added.body.data.map((u: { id: string }) => u.id)).toEqual([colleagueId]);

    // Adding twice is a no-op, not an error or a duplicate.
    await request(server())
      .post(`/api/v1/tickets/${ticket.id}/watchers`)
      .set('Cookie', agentCookie)
      .send({ userId: colleagueId })
      .expect(201);
    expect(await prisma.ticketWatcher.count({ where: { ticketId: ticket.id } })).toBe(1);

    await request(server()).get(`/api/v1/tickets/${ticket.id}`).set('Cookie', colleagueCookie).expect(200);
    expect(
      await prisma.ticketEvent.count({ where: { ticketId: ticket.id, type: 'WATCHER_ADDED' } }),
    ).toBe(1);
    expect(
      await prisma.auditLog.count({ where: { entityId: ticket.id, action: 'ticket.watcher_added' } }),
    ).toBe(1);

    await request(server())
      .post(`/api/v1/tickets/${ticket.id}/comments`)
      .set('Cookie', agentCookie)
      .send({ body: 'Looking into it now.', visibility: 'PUBLIC' })
      .expect(201);
    await drainOutbox();
    expect(
      await prisma.notification.count({
        where: { recipientId: colleagueId, entityId: ticket.id, type: 'TICKET_COMMENT_ADDED' },
      }),
    ).toBe(1);

    // Watchers can unwatch themselves, which removes the visibility again.
    await request(server())
      .delete(`/api/v1/tickets/${ticket.id}/watchers/${colleagueId}`)
      .set('Cookie', colleagueCookie)
      .expect(200);
    await request(server()).get(`/api/v1/tickets/${ticket.id}`).set('Cookie', colleagueCookie).expect(404);
  });
});
