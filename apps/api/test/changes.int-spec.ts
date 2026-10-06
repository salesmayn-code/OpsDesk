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

describe('Change management (Phase 2 · Sprint 2.2)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let agentCookie: string;
  let managerCookie: string;
  let manager2Cookie: string;
  let adminCookie: string;
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

  function isoIn(minutes: number): string {
    return new Date(Date.now() + minutes * 60_000).toISOString();
  }

  async function createChange(
    cookie: string,
    overrides: Record<string, unknown> = {},
  ): Promise<{ id: string; key: string; version: number; status: string }> {
    const res = await request(server())
      .post('/api/v1/changes')
      .set('Cookie', cookie)
      .send({
        title: `Change ${Date.now().toString(36)}`,
        description: 'Change used by the Phase 2 integration suite.',
        type: 'NORMAL',
        risk: 'LOW',
        serviceIds: [serviceId],
        scheduledStart: isoIn(120),
        scheduledEnd: isoIn(180),
        implementationPlan: 'Apply the update during the window.',
        validationPlan: 'Check service health and smoke tests.',
        rollbackPlan: 'Restore the previous version.',
        ...overrides,
      })
      .expect(201);
    return res.body.data;
  }

  async function driveToApproved(cookie: string, id: string, _version: number) {
    const submitted = await request(server())
      .post(`/api/v1/changes/${id}/submit`)
      .set('Cookie', cookie)
      .expect(200);
    expect(submitted.body.data.status).toBe('SUBMITTED');
    return submitted.body.data as { version: number };
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = configureApp(moduleRef.createNestApplication({ bufferLogs: true }));
    await app.init();
    prisma = app.get(PrismaService);

    agentCookie = await login('agent@opsdesk.local');
    managerCookie = await login('manager@opsdesk.local');
    manager2Cookie = await login('manager2@opsdesk.local');
    adminCookie = await login('admin@opsdesk.local');
    employeeCookie = await login('employee@opsdesk.local');

    // Dedicated service per run so schedule-conflict checks are isolated from prior runs.
    const service = await prisma.service.create({
      data: { id: uuidv7(), name: `E2E Changes ${Date.now().toString(36)}` },
    });
    serviceId = service.id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('creates a draft with a key and blocks submission without plans', async () => {
    const change = await createChange(managerCookie);
    expect(change.key).toMatch(/^CHG-\d{6}$/);
    expect(change.status).toBe('DRAFT');

    const noPlans = await createChange(managerCookie, {
      implementationPlan: undefined,
      validationPlan: undefined,
      rollbackPlan: undefined,
    });
    const blocked = await request(server())
      .post(`/api/v1/changes/${noPlans.id}/submit`)
      .set('Cookie', managerCookie)
      .expect(422);
    expect(blocked.body.code).toBe('PLANS_REQUIRED');

    const past = await createChange(managerCookie, {
      scheduledStart: isoIn(-120),
      scheduledEnd: isoIn(-60),
    });
    const scheduleBlocked = await request(server())
      .post(`/api/v1/changes/${past.id}/submit`)
      .set('Cookie', managerCookie)
      .expect(422);
    expect(scheduleBlocked.body.code).toBe('VALIDATION_FAILED');
  });

  it('runs multi-level approvals, blocks self-approval and duplicates', async () => {
    const change = await createChange(agentCookie, { risk: 'HIGH' });
    const submitted = await driveToApproved(agentCookie, change.id, change.version);
    expect(submitted.version).toBeGreaterThan(change.version);

    const detail = await request(server())
      .get(`/api/v1/changes/${change.id}`)
      .set('Cookie', managerCookie)
      .expect(200);
    expect(detail.body.data.requiredApprovals).toBe(2);

    // Agents cannot approve.
    await request(server())
      .post(`/api/v1/changes/${change.id}/approvals`)
      .set('Cookie', agentCookie)
      .send({ decision: 'APPROVED' })
      .expect(403);

    const first = await request(server())
      .post(`/api/v1/changes/${change.id}/approvals`)
      .set('Cookie', managerCookie)
      .send({ decision: 'APPROVED', comment: 'Looks good' })
      .expect(201);
    expect(first.body.data.status).toBe('UNDER_REVIEW');
    expect(first.body.data.approvedCount).toBe(1);

    // Same approver cannot decide twice in the same round.
    const duplicate = await request(server())
      .post(`/api/v1/changes/${change.id}/approvals`)
      .set('Cookie', managerCookie)
      .send({ decision: 'APPROVED' })
      .expect(409);
    expect(duplicate.body.code).toBe('CONFLICT');

    const second = await request(server())
      .post(`/api/v1/changes/${change.id}/approvals`)
      .set('Cookie', manager2Cookie)
      .send({ decision: 'APPROVED' })
      .expect(201);
    expect(second.body.data.status).toBe('APPROVED');

    const outbox = await prisma.outboxEvent.count({
      where: { aggregateId: change.id, type: 'change.decided' },
    });
    expect(outbox).toBeGreaterThanOrEqual(1);

    // Self-approval guard: the requester (a manager) cannot approve their own change.
    const own = await createChange(managerCookie, { risk: 'LOW' });
    await request(server())
      .post(`/api/v1/changes/${own.id}/submit`)
      .set('Cookie', managerCookie)
      .expect(200);
    const selfApproval = await request(server())
      .post(`/api/v1/changes/${own.id}/approvals`)
      .set('Cookie', managerCookie)
      .send({ decision: 'APPROVED' })
      .expect(422);
    expect(selfApproval.body.code).toBe('SELF_APPROVAL_FORBIDDEN');
  });

  it('sends a change back for changes and starts a new approval round', async () => {
    const change = await createChange(agentCookie, { risk: 'MEDIUM' });
    await driveToApproved(agentCookie, change.id, change.version);

    const sentBack = await request(server())
      .post(`/api/v1/changes/${change.id}/approvals`)
      .set('Cookie', managerCookie)
      .send({ decision: 'REQUEST_CHANGES', comment: 'Tighten the rollback plan.' })
      .expect(201);
    expect(sentBack.body.data.status).toBe('DRAFT');
    expect(sentBack.body.data.approvalRound).toBe(2);

    const resubmitted = await request(server())
      .post(`/api/v1/changes/${change.id}/submit`)
      .set('Cookie', agentCookie)
      .expect(200);
    expect(resubmitted.body.data.status).toBe('SUBMITTED');

    const approveAgain = await request(server())
      .post(`/api/v1/changes/${change.id}/approvals`)
      .set('Cookie', managerCookie)
      .send({ decision: 'APPROVED' })
      .expect(201);
    expect(approveAgain.body.data.status).toBe('APPROVED');
  });

  it('rejects a change and keeps it terminal', async () => {
    const change = await createChange(agentCookie, { risk: 'MEDIUM' });
    await driveToApproved(agentCookie, change.id, change.version);
    const rejected = await request(server())
      .post(`/api/v1/changes/${change.id}/approvals`)
      .set('Cookie', managerCookie)
      .send({ decision: 'REJECTED', comment: 'Too risky right now.' })
      .expect(201);
    expect(rejected.body.data.status).toBe('REJECTED');
    await request(server())
      .post(`/api/v1/changes/${change.id}/transitions`)
      .set('Cookie', managerCookie)
      .send({ version: rejected.body.data.version, to: 'SCHEDULED' })
      .expect(422);
  });

  it('auto-approves STANDARD changes on submission', async () => {
    const change = await createChange(managerCookie, { type: 'STANDARD' });
    const submitted = await request(server())
      .post(`/api/v1/changes/${change.id}/submit`)
      .set('Cookie', managerCookie)
      .expect(200);
    expect(submitted.body.data.status).toBe('APPROVED');
  });

  it('guards the implementation window and runs the execution lifecycle', async () => {
    const change = await createChange(agentCookie, {
      scheduledStart: isoIn(5),
      scheduledEnd: isoIn(65),
    });
    await driveToApproved(agentCookie, change.id, change.version);
    await request(server())
      .post(`/api/v1/changes/${change.id}/approvals`)
      .set('Cookie', managerCookie)
      .send({ decision: 'APPROVED' })
      .expect(201);
    let detail = await request(server())
      .get(`/api/v1/changes/${change.id}`)
      .set('Cookie', agentCookie)
      .expect(200);
    expect(detail.body.data.status).toBe('APPROVED');

    const scheduled = await request(server())
      .post(`/api/v1/changes/${change.id}/transitions`)
      .set('Cookie', agentCookie)
      .send({ version: detail.body.data.version, to: 'SCHEDULED' })
      .expect(200);

    // Another change on the same service with an overlapping window is blocked.
    const conflict = await createChange(agentCookie, {
      scheduledStart: isoIn(10),
      scheduledEnd: isoIn(70),
    });
    await driveToApproved(agentCookie, conflict.id, conflict.version);
    await request(server())
      .post(`/api/v1/changes/${conflict.id}/approvals`)
      .set('Cookie', managerCookie)
      .send({ decision: 'APPROVED' })
      .expect(201);
    const conflictDetail = await request(server())
      .get(`/api/v1/changes/${conflict.id}`)
      .set('Cookie', agentCookie)
      .expect(200);
    const blocked = await request(server())
      .post(`/api/v1/changes/${conflict.id}/transitions`)
      .set('Cookie', agentCookie)
      .send({ version: conflictDetail.body.data.version, to: 'SCHEDULED' })
      .expect(409);
    expect(blocked.body.code).toBe('SCHEDULE_CONFLICT');

    const implementing = await request(server())
      .post(`/api/v1/changes/${change.id}/transitions`)
      .set('Cookie', agentCookie)
      .send({ version: scheduled.body.data.version, to: 'IMPLEMENTING' })
      .expect(200);
    expect(implementing.body.data.actualStart).not.toBeNull();

    const validating = await request(server())
      .post(`/api/v1/changes/${change.id}/transitions`)
      .set('Cookie', agentCookie)
      .send({ version: implementing.body.data.version, to: 'VALIDATING' })
      .expect(200);

    const noNote = await request(server())
      .post(`/api/v1/changes/${change.id}/transitions`)
      .set('Cookie', agentCookie)
      .send({ version: validating.body.data.version, to: 'COMPLETED' })
      .expect(422);
    expect(noNote.body.code).toBe('VALIDATION_FAILED');

    const completed = await request(server())
      .post(`/api/v1/changes/${change.id}/transitions`)
      .set('Cookie', agentCookie)
      .send({
        version: validating.body.data.version,
        to: 'COMPLETED',
        note: 'All smoke tests passed.',
      })
      .expect(200);
    expect(completed.body.data.status).toBe('COMPLETED');

    const closed = await request(server())
      .post(`/api/v1/changes/${change.id}/transitions`)
      .set('Cookie', agentCookie)
      .send({ version: completed.body.data.version, to: 'CLOSED' })
      .expect(200);
    expect(closed.body.data.status).toBe('CLOSED');

    // Window guard on a change scheduled far in the future.
    const future = await createChange(agentCookie, {
      scheduledStart: isoIn(240),
      scheduledEnd: isoIn(300),
    });
    await driveToApproved(agentCookie, future.id, future.version);
    await request(server())
      .post(`/api/v1/changes/${future.id}/approvals`)
      .set('Cookie', managerCookie)
      .send({ decision: 'APPROVED' })
      .expect(201);
    detail = await request(server())
      .get(`/api/v1/changes/${future.id}`)
      .set('Cookie', agentCookie)
      .expect(200);
    const futureScheduled = await request(server())
      .post(`/api/v1/changes/${future.id}/transitions`)
      .set('Cookie', agentCookie)
      .send({ version: detail.body.data.version, to: 'SCHEDULED' })
      .expect(200);
    const tooEarly = await request(server())
      .post(`/api/v1/changes/${future.id}/transitions`)
      .set('Cookie', agentCookie)
      .send({ version: futureScheduled.body.data.version, to: 'IMPLEMENTING' })
      .expect(422);
    expect(tooEarly.body.code).toBe('WINDOW_NOT_OPEN');
  });

  it('serves the calendar, history and approval rules; rules need admin', async () => {
    const calendar = await request(server())
      .get(`/api/v1/changes/calendar?from=${isoIn(-60)}&to=${isoIn(600)}`)
      .set('Cookie', managerCookie)
      .expect(200);
    expect(Array.isArray(calendar.body.data)).toBe(true);
    expect(
      (calendar.body.data as { key: string }[]).some((row) => row.key.startsWith('CHG-')),
    ).toBe(true);

    const rules = await request(server())
      .get('/api/v1/change-approval-rules')
      .set('Cookie', managerCookie)
      .expect(200);
    expect((rules.body.data as unknown[]).length).toBeGreaterThanOrEqual(2);

    await request(server())
      .put('/api/v1/change-approval-rules')
      .set('Cookie', managerCookie)
      .send({ rules: [{ type: 'NORMAL', risk: 'LOW', requiredApprovals: 1, approverRoleKey: 'MANAGER' }] })
      .expect(403);

    // Admin replaces the matrix; restore the canonical defaults afterwards (idempotent suite).
    const canonical: [string, string, number, boolean][] = [
      ['STANDARD', 'LOW', 0, false],
      ['STANDARD', 'MEDIUM', 0, false],
      ['STANDARD', 'HIGH', 0, false],
      ['STANDARD', 'CRITICAL', 0, false],
      ['NORMAL', 'LOW', 1, false],
      ['NORMAL', 'MEDIUM', 1, false],
      ['NORMAL', 'HIGH', 2, false],
      ['NORMAL', 'CRITICAL', 2, true],
      ['EMERGENCY', 'LOW', 1, false],
      ['EMERGENCY', 'MEDIUM', 1, false],
      ['EMERGENCY', 'HIGH', 1, false],
      ['EMERGENCY', 'CRITICAL', 1, false],
    ];
    const updated = await request(server())
      .put('/api/v1/change-approval-rules')
      .set('Cookie', adminCookie)
      .send({
        rules: canonical.map(([type, risk, requiredApprovals, requiresAdmin]) => ({
          type,
          risk,
          requiredApprovals,
          approverRoleKey: 'MANAGER',
          requiresAdmin,
        })),
      })
      .expect(200);
    expect((updated.body.data as unknown[]).length).toBe(12);

    const history = await request(server())
      .get('/api/v1/changes')
      .set('Cookie', managerCookie)
      .expect(200);
    const first = (history.body.data as { id: string }[])[0]!;
    const events = await request(server())
      .get(`/api/v1/changes/${first.id}/history`)
      .set('Cookie', managerCookie)
      .expect(200);
    expect((events.body.data as unknown[]).length).toBeGreaterThan(0);
  });

  it('enforces RBAC boundaries', async () => {
    await request(server()).get('/api/v1/changes').set('Cookie', employeeCookie).expect(403);
    await request(server())
      .post('/api/v1/changes')
      .set('Cookie', employeeCookie)
      .send({ title: 'Nope', description: 'Nope', type: 'NORMAL', risk: 'LOW' })
      .expect(403);
  });
});
