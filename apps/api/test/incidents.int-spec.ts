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

describe('Incidents (Phase 2 · Sprint 2.1)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let agentCookie: string;
  let managerCookie: string;
  let employeeCookie: string;
  let serviceId: string;

  const server = () => app.getHttpServer();

  async function login(email: string): Promise<string> {
    const res = await request(server())
      .post('/api/v1/auth/login')
      .send({ email, password: 'ChangeMe!12345' })
      .expect(200);
    return accessCookie(res.headers['set-cookie']);
  }

  async function createIncident(severity = 'SEV3', title = 'E2E incident') {
    const res = await request(server())
      .post('/api/v1/incidents')
      .set('Cookie', agentCookie)
      .send({
        title: `${title} ${Date.now().toString(36)}`,
        description: 'Incident used by the Phase 2 integration suite.',
        severity,
        serviceId,
      })
      .expect(201);
    return res.body.data as { id: string; key: string; version: number; status: string };
  }

  function transition(id: string, version: number, body: Record<string, unknown>) {
    return request(server())
      .post(`/api/v1/incidents/${id}/transitions`)
      .set('Cookie', managerCookie)
      .send({ version, ...body });
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = configureApp(moduleRef.createNestApplication({ bufferLogs: true }));
    await app.init();
    prisma = app.get(PrismaService);

    agentCookie = await login('agent@opsdesk.local');
    managerCookie = await login('manager@opsdesk.local');
    employeeCookie = await login('employee@opsdesk.local');

    const service = await prisma.service.findFirstOrThrow({ where: { name: 'VPN' } });
    serviceId = service.id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('declares incidents with a per-year key, timeline, audit, and outbox rows', async () => {
    const incident = await createIncident('SEV3', 'VPN outage');
    expect(incident.key).toMatch(/^INC-\d{4}-\d{3}$/);
    expect(incident.status).toBe('IDENTIFIED');

    const [events, audit, outbox] = await Promise.all([
      prisma.incidentEvent.count({ where: { incidentId: incident.id, type: 'STATUS_CHANGED' } }),
      prisma.auditLog.count({ where: { entityId: incident.id, action: 'incident.declared' } }),
      prisma.outboxEvent.count({ where: { aggregateId: incident.id, type: 'incident.declared' } }),
    ]);
    expect(events).toBe(1);
    expect(audit).toBe(1);
    expect(outbox).toBe(1);

    const services = await request(server())
      .get('/api/v1/services')
      .set('Cookie', agentCookie)
      .expect(200);
    expect((services.body.data as { name: string }[]).map((s) => s.name)).toContain('VPN');
  });

  it('runs the lifecycle with resolution guards and severity control', async () => {
    const incident = await createIncident('SEV3', 'Email degradation');

    // Agents cannot change severity (BR-5).
    await request(server())
      .patch(`/api/v1/incidents/${incident.id}`)
      .set('Cookie', agentCookie)
      .send({ version: incident.version, severity: 'SEV2' })
      .expect(403);

    const investigating = await transition(incident.id, incident.version, {
      to: 'INVESTIGATING',
    }).expect(200);
    const mitigating = await transition(incident.id, investigating.body.data.version, {
      to: 'MITIGATING',
    }).expect(200);
    expect(mitigating.body.data.mitigatedAt).not.toBeNull();
    const monitoring = await transition(incident.id, mitigating.body.data.version, {
      to: 'MONITORING',
    }).expect(200);

    const missing = await transition(incident.id, monitoring.body.data.version, {
      to: 'RESOLVED',
    }).expect(422);
    expect(missing.body.code).toBe('VALIDATION_FAILED');

    const resolved = await transition(incident.id, monitoring.body.data.version, {
      to: 'RESOLVED',
      rootCause: 'Mail relay disk full',
      mitigation: 'Cleared relay spool and extended volume',
      impact: 'Delayed outbound mail for ~40 minutes',
      resolution: 'Relay spool expanded and monitored',
    }).expect(200);
    expect(resolved.body.data.status).toBe('RESOLVED');
    expect(resolved.body.data.resolvedAt).not.toBeNull();

    const closed = await transition(incident.id, resolved.body.data.version, {
      to: 'CLOSED',
    }).expect(200);
    expect(closed.body.data.status).toBe('CLOSED');

    // Terminal.
    await transition(incident.id, closed.body.data.version, { to: 'INVESTIGATING' }).expect(422);

    // Manager can change severity and it lands on the timeline.
    const other = await createIncident('SEV4', 'Printer queue');
    await request(server())
      .patch(`/api/v1/incidents/${other.id}`)
      .set('Cookie', managerCookie)
      .send({ version: other.version, severity: 'SEV3' })
      .expect(200);
    const timeline = await request(server())
      .get(`/api/v1/incidents/${other.id}/timeline`)
      .set('Cookie', managerCookie)
      .expect(200);
    expect(
      (timeline.body.data as { type: string }[]).some((event) => event.type === 'SEVERITY_CHANGED'),
    ).toBe(true);
  });

  it('supports escalation round-trips and the monitoring regression', async () => {
    const incident = await createIncident('SEV2', 'Escalation path');
    const escalated = await transition(incident.id, incident.version, { to: 'ESCALATED' }).expect(200);
    const back = await transition(incident.id, escalated.body.data.version, {
      to: 'INVESTIGATING',
    }).expect(200);
    const mitigating = await transition(incident.id, back.body.data.version, {
      to: 'MITIGATING',
    }).expect(200);
    const monitoring = await transition(incident.id, mitigating.body.data.version, {
      to: 'MONITORING',
    }).expect(200);
    const regression = await transition(incident.id, monitoring.body.data.version, {
      to: 'INVESTIGATING',
    }).expect(200);
    expect(regression.body.data.status).toBe('INVESTIGATING');
  });

  it('requires a published postmortem to close SEV1/SEV2', async () => {
    const incident = await createIncident('SEV1', 'Major outage');
    const investigating = await transition(incident.id, incident.version, { to: 'INVESTIGATING' }).expect(200);
    const mitigating = await transition(incident.id, investigating.body.data.version, { to: 'MITIGATING' }).expect(200);
    const monitoring = await transition(incident.id, mitigating.body.data.version, { to: 'MONITORING' }).expect(200);
    const resolved = await transition(incident.id, monitoring.body.data.version, {
      to: 'RESOLVED',
      rootCause: 'Certificate expiry',
      mitigation: 'Rotated certificates',
      impact: 'IdP login failures for 25 minutes',
    }).expect(200);

    const blocked = await transition(incident.id, resolved.body.data.version, { to: 'CLOSED' }).expect(422);
    expect(blocked.body.code).toBe('POSTMORTEM_REQUIRED');

    // Publishing requires summary + root cause.
    await request(server())
      .put(`/api/v1/incidents/${incident.id}/postmortem`)
      .set('Cookie', managerCookie)
      .send({ summary: 'Certificate expiry caused a login outage.' })
      .expect(200);
    await request(server())
      .post(`/api/v1/incidents/${incident.id}/postmortem/publish`)
      .set('Cookie', managerCookie)
      .expect(422);

    await request(server())
      .put(`/api/v1/incidents/${incident.id}/postmortem`)
      .set('Cookie', managerCookie)
      .send({ version: 1, rootCause: 'Monitoring missed the 30-day expiry window.' })
      .expect(200);
    const published = await request(server())
      .post(`/api/v1/incidents/${incident.id}/postmortem/publish`)
      .set('Cookie', managerCookie)
      .expect(200);
    expect(published.body.data.status).toBe('PUBLISHED');

    const closed = await transition(incident.id, resolved.body.data.version, { to: 'CLOSED' }).expect(200);
    expect(closed.body.data.status).toBe('CLOSED');

    // Action items.
    const action = await request(server())
      .post(`/api/v1/incidents/${incident.id}/postmortem/actions`)
      .set('Cookie', managerCookie)
      .send({ kind: 'PREVENTIVE', description: 'Add certificate expiry alerting' })
      .expect(201);
    const actionId = (action.body.data.actions as { id: string }[])[0]!.id;
    const done = await request(server())
      .patch(`/api/v1/incidents/${incident.id}/postmortem/actions/${actionId}`)
      .set('Cookie', managerCookie)
      .send({ status: 'DONE' })
      .expect(200);
    expect(
      (done.body.data.actions as { status: string; completedAt: string | null }[])[0]!.status,
    ).toBe('DONE');
    expect(
      (done.body.data.actions as { status: string; completedAt: string | null }[])[0]!.completedAt,
    ).not.toBeNull();
  });

  it('links tickets, notifies requesters, and enforces one incident per ticket', async () => {
    const incident = await createIncident('SEV2', 'Ticket bundling');
    const other = await createIncident('SEV3', 'Second incident');

    const categories = await request(server())
      .get('/api/v1/categories')
      .set('Cookie', employeeCookie)
      .expect(200);
    const hardware = (categories.body.data as { id: string; name: string }[]).find(
      (category) => category.name === 'Hardware',
    )!;
    const ticketResponse = await request(server())
      .post('/api/v1/tickets')
      .set('Cookie', employeeCookie)
      .send({
        title: 'Linked ticket for incident bundling',
        description: 'Bundled into a major incident.',
        type: 'INCIDENT',
        categoryId: hardware.id,
      })
      .expect(201);
    const ticket = ticketResponse.body.data as { id: string; key: string };

    const linked = await request(server())
      .post(`/api/v1/incidents/${incident.id}/tickets`)
      .set('Cookie', managerCookie)
      .send({ ticketIds: [ticket.id] })
      .expect(201);
    expect((linked.body.data.tickets as { id: string }[]).map((row) => row.id)).toContain(ticket.id);

    // Ticket detail exposes the incident.
    const ticketDetail = await request(server())
      .get(`/api/v1/tickets/${ticket.id}`)
      .set('Cookie', employeeCookie)
      .expect(200);
    expect(ticketDetail.body.data.incident.key).toBe(incident.key);

    // A ticket can belong to only one incident.
    const conflict = await request(server())
      .post(`/api/v1/incidents/${other.id}/tickets`)
      .set('Cookie', managerCookie)
      .send({ ticketIds: [ticket.id] })
      .expect(409);
    expect(conflict.body.code).toBe('CONFLICT');

    // Bulk notify requesters creates a mandatory in-app notification.
    const notified = await request(server())
      .post(`/api/v1/incidents/${incident.id}/notify-requesters`)
      .set('Cookie', managerCookie)
      .send({ message: 'Engineers are on it; next update in 30 minutes.' })
      .expect(200);
    expect(notified.body.data.notified).toBe(1);

    const notifications = await request(server())
      .get('/api/v1/notifications?limit=10')
      .set('Cookie', employeeCookie)
      .expect(200);
    expect(
      (notifications.body.data as { type: string; title: string }[]).some(
        (notification) =>
          notification.type === 'INCIDENT_UPDATED' && notification.title.includes(incident.key),
      ),
    ).toBe(true);

    // Timeline records the link and communication.
    const timeline = await request(server())
      .get(`/api/v1/incidents/${incident.id}/timeline`)
      .set('Cookie', managerCookie)
      .expect(200);
    const types = (timeline.body.data as { type: string }[]).map((event) => event.type);
    expect(types).toContain('TICKET_LINKED');
    expect(types).toContain('COMMUNICATION');

    const unlinked = await request(server())
      .delete(`/api/v1/incidents/${incident.id}/tickets/${ticket.id}`)
      .set('Cookie', managerCookie)
      .expect(200);
    expect((unlinked.body.data.tickets as unknown[]).length).toBe(0);
  });

  it('records mitigation and root-cause notes on the timeline', async () => {
    const incident = await createIncident('SEV3', 'Timeline notes');
    await request(server())
      .post(`/api/v1/incidents/${incident.id}/timeline`)
      .set('Cookie', managerCookie)
      .send({ type: 'MITIGATION', body: 'Failover to secondary database' })
      .expect(201);

    const detail = await request(server())
      .get(`/api/v1/incidents/${incident.id}`)
      .set('Cookie', managerCookie)
      .expect(200);
    expect(detail.body.data.mitigation).toBe('Failover to secondary database');

    const timeline = await request(server())
      .get(`/api/v1/incidents/${incident.id}/timeline`)
      .set('Cookie', managerCookie)
      .expect(200);
    expect(
      (timeline.body.data as { type: string; body: string }[]).some(
        (event) => event.type === 'MITIGATION' && event.body === 'Failover to secondary database',
      ),
    ).toBe(true);
  });

  it('enforces RBAC boundaries', async () => {
    await request(server()).get('/api/v1/incidents').set('Cookie', employeeCookie).expect(403);
    await request(server())
      .post('/api/v1/incidents')
      .set('Cookie', employeeCookie)
      .send({ title: 'Nope', description: 'Nope', severity: 'SEV4' })
      .expect(403);
  });
});
