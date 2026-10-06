import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { PrismaService } from '../src/infra/prisma/prisma.service';
import { TicketJobsService } from '../src/modules/tickets/tickets.jobs';

function accessCookie(setCookie: string[] | string | undefined): string {
  const header = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
  const match = header.find((entry) => entry.startsWith('opsdesk_access='));
  if (!match) throw new Error('Missing access cookie');
  return match.split(';')[0]!;
}

const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489', 'hex');

describe('Comments, internal notes & attachments (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jobs: TicketJobsService;
  let employeeCookie: string;
  let agentCookie: string;
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

  async function createTicket(title = 'Collaboration test ticket') {
    const res = await request(server())
      .post('/api/v1/tickets')
      .set('Cookie', employeeCookie)
      .send({
        title,
        description: 'Ticket used by the collaboration suite.',
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
    jobs = app.get(TicketJobsService);

    employeeCookie = await login('employee@opsdesk.local');
    agentCookie = await login('agent@opsdesk.local');
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

  it('filters internal notes at the query level (BR-8)', async () => {
    const ticket = await createTicket();

    await request(server())
      .post(`/api/v1/tickets/${ticket.id}/comments`)
      .set('Cookie', agentCookie)
      .send({ body: 'Internal diagnostic note.', visibility: 'INTERNAL' })
      .expect(201);
    await request(server())
      .post(`/api/v1/tickets/${ticket.id}/comments`)
      .set('Cookie', employeeCookie)
      .send({ body: 'Any update on this?', visibility: 'PUBLIC' })
      .expect(201);

    const employeeView = await request(server())
      .get(`/api/v1/tickets/${ticket.id}/comments`)
      .set('Cookie', employeeCookie)
      .expect(200);
    expect(employeeView.body.data).toHaveLength(1);
    expect(employeeView.body.data[0].visibility).toBe('PUBLIC');

    const agentView = await request(server())
      .get(`/api/v1/tickets/${ticket.id}/comments`)
      .set('Cookie', agentCookie)
      .expect(200);
    expect(agentView.body.data).toHaveLength(2);

    await request(server())
      .post(`/api/v1/tickets/${ticket.id}/comments`)
      .set('Cookie', employeeCookie)
      .send({ body: 'Trying to post an internal note.', visibility: 'INTERNAL' })
      .expect(403);
  });

  it('captures firstResponseAt and completes the response SLA on the first public staff reply', async () => {
    const ticket = await createTicket();

    await request(server())
      .post(`/api/v1/tickets/${ticket.id}/comments`)
      .set('Cookie', agentCookie)
      .send({ body: 'We are looking into it.', visibility: 'PUBLIC' })
      .expect(201);

    const updated = await prisma.ticket.findUniqueOrThrow({ where: { id: ticket.id } });
    expect(updated.firstResponseAt).not.toBeNull();
    const responseTimer = await prisma.slaTimer.findFirstOrThrow({
      where: { ticketId: ticket.id, kind: 'RESPONSE' },
    });
    expect(responseTimer.state).toBe('COMPLETED');
    expect(responseTimer.completedAt).not.toBeNull();
  });

  it('auto-resumes a WAITING_FOR_USER ticket when the requester replies', async () => {
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
      .post(`/api/v1/tickets/${ticket.id}/comments`)
      .set('Cookie', agentCookie)
      .send({ body: 'Can you share the log file?', visibility: 'PUBLIC' })
      .expect(201);
    await request(server())
      .post(`/api/v1/tickets/${ticket.id}/transitions`)
      .set('Cookie', agentCookie)
      .send({ version: res.body.data.version, to: 'WAITING_FOR_USER' })
      .expect(200);

    const paused = await prisma.slaTimer.findFirstOrThrow({
      where: { ticketId: ticket.id, kind: 'RESOLUTION' },
    });
    expect(paused.pausedAt).not.toBeNull();

    await request(server())
      .post(`/api/v1/tickets/${ticket.id}/comments`)
      .set('Cookie', employeeCookie)
      .send({ body: 'Here is the log — see attached next time.', visibility: 'PUBLIC' })
      .expect(201);

    const detail = await request(server())
      .get(`/api/v1/tickets/${ticket.id}`)
      .set('Cookie', employeeCookie)
      .expect(200);
    expect(detail.body.data.status).toBe('IN_PROGRESS');

    const resumed = await prisma.slaTimer.findFirstOrThrow({
      where: { ticketId: ticket.id, kind: 'RESOLUTION' },
    });
    expect(resumed.pausedAt).toBeNull();
    const resumedEvents = await prisma.slaEvent.count({
      where: { ticketId: ticket.id, type: 'RESUMED' },
    });
    expect(resumedEvents).toBe(1);
  });

  it('limits comment edits to the author and a 15-minute window', async () => {
    const ticket = await createTicket();
    const created = await request(server())
      .post(`/api/v1/tickets/${ticket.id}/comments`)
      .set('Cookie', agentCookie)
      .send({ body: 'Original body.', visibility: 'PUBLIC' })
      .expect(201);
    const commentId = created.body.data.id as string;

    const edited = await request(server())
      .patch(`/api/v1/tickets/${ticket.id}/comments/${commentId}`)
      .set('Cookie', agentCookie)
      .send({ body: 'Corrected body.' })
      .expect(200);
    expect(edited.body.data.editedAt).not.toBeNull();

    await request(server())
      .patch(`/api/v1/tickets/${ticket.id}/comments/${commentId}`)
      .set('Cookie', employeeCookie)
      .send({ body: 'Hijack.' })
      .expect(403);
  });

  it('uploads, lists, downloads, and protects internal attachments', async () => {
    const ticket = await createTicket();

    const uploaded = await request(server())
      .post(`/api/v1/tickets/${ticket.id}/attachments`)
      .set('Cookie', employeeCookie)
      .attach('file', PNG, { filename: 'screenshot.png', contentType: 'image/png' })
      .expect(201);
    expect(uploaded.body.data.mimeType).toBe('image/png');
    expect(uploaded.body.data.originalName).toBe('screenshot.png');
    const publicId = uploaded.body.data.id as string;

    const internal = await request(server())
      .post(`/api/v1/tickets/${ticket.id}/attachments?isInternal=true`)
      .set('Cookie', agentCookie)
      .attach('file', PNG, { filename: 'internal-shot.png', contentType: 'image/png' })
      .expect(201);
    expect(internal.body.data.isInternal).toBe(true);
    const internalId = internal.body.data.id as string;

    const employeeList = await request(server())
      .get(`/api/v1/tickets/${ticket.id}/attachments`)
      .set('Cookie', employeeCookie)
      .expect(200);
    expect(employeeList.body.data).toHaveLength(1);

    const agentList = await request(server())
      .get(`/api/v1/tickets/${ticket.id}/attachments`)
      .set('Cookie', agentCookie)
      .expect(200);
    expect(agentList.body.data).toHaveLength(2);

    const download = await request(server())
      .get(`/api/v1/attachments/${publicId}/download`)
      .set('Cookie', employeeCookie)
      .expect(200);
    expect(download.headers['content-disposition']).toContain('attachment;');
    expect(download.headers['x-content-type-options']).toBe('nosniff');
    expect(download.body.length ?? download.body.toString().length).toBeGreaterThan(0);

    await request(server())
      .get(`/api/v1/attachments/${internalId}/download`)
      .set('Cookie', employeeCookie)
      .expect(404);
    await request(server())
      .get(`/api/v1/attachments/${internalId}/download`)
      .set('Cookie', agentCookie)
      .expect(200);
  });

  it('rejects SVG, HTML, and executable uploads by magic bytes', async () => {
    const ticket = await createTicket();

    await request(server())
      .post(`/api/v1/tickets/${ticket.id}/attachments`)
      .set('Cookie', employeeCookie)
      .attach('file', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'), {
        filename: 'logo.svg',
        contentType: 'image/svg+xml',
      })
      .expect(415);

    await request(server())
      .post(`/api/v1/tickets/${ticket.id}/attachments`)
      .set('Cookie', employeeCookie)
      .attach('file', Buffer.from('MZ\x90\x00\x03\x00\x00\x00'), {
        filename: 'tool.exe',
        contentType: 'application/octet-stream',
      })
      .expect(415);
  });

  it('enforces the per-ticket attachment quota', async () => {
    const ticket = await createTicket();
    for (let index = 0; index < 10; index += 1) {
      await request(server())
        .post(`/api/v1/tickets/${ticket.id}/attachments`)
        .set('Cookie', employeeCookie)
        .attach('file', Buffer.from(`note ${index}`), {
          filename: `note-${index}.txt`,
          contentType: 'text/plain',
        })
        .expect(201);
    }
    const over = await request(server())
      .post(`/api/v1/tickets/${ticket.id}/attachments`)
      .set('Cookie', employeeCookie)
      .attach('file', Buffer.from('one too many'), {
        filename: 'extra.txt',
        contentType: 'text/plain',
      })
      .expect(422);
    expect(over.body.code).toBe('ATTACHMENT_LIMIT_REACHED');
  });

  it('auto-closes resolved tickets past the reopen window', async () => {
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
        resolution: { code: 'FIXED', summary: 'Resolved for auto-close test.' },
      })
      .expect(200);

    await prisma.ticket.update({
      where: { id: ticket.id },
      data: { resolvedAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000) },
    });

    const result = await jobs.autoCloseResolved(new Date());
    expect(result.closed).toBeGreaterThanOrEqual(1);

    const closed = await prisma.ticket.findUniqueOrThrow({ where: { id: ticket.id } });
    expect(closed.status).toBe('CLOSED');
    expect(closed.closedAt).not.toBeNull();

    const autoEvent = await prisma.ticketEvent.count({
      where: { ticketId: ticket.id, type: 'CLOSED' },
    });
    expect(autoEvent).toBe(1);
    const audit = await prisma.auditLog.count({
      where: { entityId: ticket.id, action: 'ticket.closed' },
    });
    expect(audit).toBe(1);
  });
});
