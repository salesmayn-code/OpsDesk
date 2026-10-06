import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { PrismaService } from '../src/infra/prisma/prisma.service';
import { uuidv7 } from '../src/common/id';
import { hashPassword } from '../src/common/crypto/password';

function accessCookie(setCookie: string[] | string | undefined): string {
  const header = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
  const match = header.find((entry) => entry.startsWith('opsdesk_access='));
  if (!match) throw new Error('Missing access cookie');
  return match.split(';')[0]!;
}

describe('Onboarding & offboarding (Phase 2 · Sprint 2.3)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let managerCookie: string;
  let adminCookie: string;
  let agentCookie: string;
  let employeeCookie: string;

  const server = () => app.getHttpServer();

  async function login(email: string): Promise<string> {
    const res = await request(server())
      .post('/api/v1/auth/login')
      .send({ email, password: 'ChangeMe!12345' })
      .expect(200);
    return accessCookie(res.headers['set-cookie']);
  }

  async function completeTask(taskId: string, version: number, cookie = managerCookie) {
    const inProgress = await request(server())
      .post(`/api/v1/workflow-tasks/${taskId}/transitions`)
      .set('Cookie', cookie)
      .send({ version, to: 'IN_PROGRESS' })
      .expect(200);
    const task = (inProgress.body.data.tasks as { id: string; version: number }[]).find(
      (entry) => entry.id === taskId,
    )!;
    return request(server())
      .post(`/api/v1/workflow-tasks/${taskId}/transitions`)
      .set('Cookie', cookie)
      .send({ version: task.version, to: 'COMPLETED' })
      .expect(200);
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = configureApp(moduleRef.createNestApplication({ bufferLogs: true }));
    await app.init();
    prisma = app.get(PrismaService);

    managerCookie = await login('manager@opsdesk.local');
    adminCookie = await login('admin@opsdesk.local');
    agentCookie = await login('agent@opsdesk.local');
    employeeCookie = await login('employee@opsdesk.local');
  });

  afterAll(async () => {
    await app.close();
  });

  it('instantiates onboarding requests from the department template', async () => {
    const employee = await prisma.user.findUniqueOrThrow({
      where: { email: 'employee@opsdesk.local' },
    });
    const created = await request(server())
      .post('/api/v1/onboarding')
      .set('Cookie', managerCookie)
      .send({ subjectUserId: employee.id, effectiveDate: '2026-11-01' })
      .expect(201);

    expect(created.body.data.key).toMatch(/^ONB-\d{6}$/);
    expect(created.body.data.tasks).toHaveLength(4);
    expect(created.body.data.progress.requiredDone).toBe(0);

    const audit = await prisma.auditLog.count({
      where: { entityId: created.body.data.id, action: 'workflow.created' },
    });
    const outbox = await prisma.outboxEvent.count({
      where: { aggregateId: created.body.data.id, type: 'workflow.created' },
    });
    expect(audit).toBe(1);
    expect(outbox).toBe(1);
  });

  it('completes the request when every required task is done', async () => {
    const employee = await prisma.user.findUniqueOrThrow({
      where: { email: 'employee@opsdesk.local' },
    });
    const created = await request(server())
      .post('/api/v1/onboarding')
      .set('Cookie', managerCookie)
      .send({ subjectUserId: employee.id, effectiveDate: '2026-11-15' })
      .expect(201);
    let detail = created.body.data as {
      id: string;
      tasks: { id: string; version: number; required: boolean }[];
    };

    for (const task of detail.tasks.filter((entry) => entry.required)) {
      const updated = await completeTask(task.id, task.version);
      detail = updated.body.data;
    }

    expect(detail).toMatchObject({ status: 'COMPLETED' });
    const completed = await prisma.workflowRequest.findUniqueOrThrow({ where: { id: detail.id } });
    expect(completed.completedAt).not.toBeNull();
    // Onboarding never disables the account.
    const subject = await prisma.user.findUniqueOrThrow({ where: { id: completed.subjectUserId } });
    expect(subject.status).toBe('ACTIVE');
    const outbox = await prisma.outboxEvent.count({
      where: { aggregateId: detail.id, type: 'workflow.completed' },
    });
    expect(outbox).toBe(1);
  });

  it('enforces the skip reason and lets managers skip required tasks', async () => {
    const employee = await prisma.user.findUniqueOrThrow({
      where: { email: 'employee@opsdesk.local' },
    });
    const created = await request(server())
      .post('/api/v1/onboarding')
      .set('Cookie', managerCookie)
      .send({ subjectUserId: employee.id, effectiveDate: '2026-12-01' })
      .expect(201);
    const task = (created.body.data.tasks as { id: string; version: number }[])[0]!;

    const noReason = await request(server())
      .post(`/api/v1/workflow-tasks/${task.id}/transitions`)
      .set('Cookie', managerCookie)
      .send({ version: task.version, to: 'SKIPPED' })
      .expect(422);
    expect(noReason.body.code).toBe('TASK_SKIP_REASON_REQUIRED');

    const skipped = await request(server())
      .post(`/api/v1/workflow-tasks/${task.id}/transitions`)
      .set('Cookie', managerCookie)
      .send({ version: task.version, to: 'SKIPPED', reason: 'Hardware already provisioned' })
      .expect(200);
    const skippedTask = (skipped.body.data.tasks as { id: string; status: string }[]).find(
      (entry) => entry.id === task.id,
    )!;
    expect(skippedTask.status).toBe('SKIPPED');

    let detail = skipped.body.data as {
      status: string;
      tasks: { id: string; version: number; status: string; required: boolean }[];
    };
    for (const entry of detail.tasks.filter(
      (candidate) => candidate.required && candidate.status !== 'SKIPPED',
    )) {
      detail = (await completeTask(entry.id, entry.version)).body.data as typeof detail;
    }
    expect(detail.status).toBe('COMPLETED');
  });

  it('offboarding recovers assets and disables the account on completion', async () => {
    // Dedicated subject so the seeded employee account stays usable for other suites.
    const subject = await prisma.user.create({
      data: {
        id: uuidv7(),
        email: `leaver-${Date.now()}@opsdesk.local`,
        firstName: 'Leaver',
        lastName: 'E2E',
        status: 'ACTIVE',
        passwordHash: await hashPassword('ChangeMe!12345'),
      },
    });

    // Provision an asset and assign it to the subject.
    const types = await prisma.assetType.findFirstOrThrow({ where: { tagPrefix: 'LAP' } });
    const assetResponse = await request(server())
      .post('/api/v1/assets')
      .set('Cookie', adminCookie)
      .send({ typeId: types.id, name: 'Offboarding laptop' })
      .expect(201);
    const asset = assetResponse.body.data as { id: string; tag: string; version: number };
    const received = await request(server())
      .post(`/api/v1/assets/${asset.id}/transitions`)
      .set('Cookie', agentCookie)
      .send({ version: asset.version, to: 'IN_STOCK' })
      .expect(200);
    await request(server())
      .post(`/api/v1/assets/${asset.id}/assign`)
      .set('Cookie', agentCookie)
      .send({ version: received.body.data.version, userId: subject.id })
      .expect(200);

    const created = await request(server())
      .post('/api/v1/offboarding')
      .set('Cookie', managerCookie)
      .send({ subjectUserId: subject.id, effectiveDate: '2026-11-30' })
      .expect(201);
    const detail = created.body.data as {
      id: string;
      key: string;
      tasks: { id: string; title: string; version: number; status: string; assetId: string | null }[];
    };
    expect(detail.key).toMatch(/^OFF-\d{6}$/);
    const recovery = detail.tasks.find((task) => task.assetId === asset.id)!;
    expect(recovery.title).toContain(asset.tag);

    // Completing the recovery task returns the asset to stock.
    let current = detail;
    for (const task of current.tasks.filter((entry) => entry.assetId === null)) {
      current = (await completeTask(task.id, task.version)).body.data;
    }
    const afterRecovery = await completeTask(recovery.id, recovery.version);
    expect((afterRecovery.body.data as { status: string }).status).toBe('COMPLETED');

    const returned = await prisma.asset.findUniqueOrThrow({ where: { id: asset.id } });
    expect(returned.status).toBe('IN_STOCK');
    expect(returned.currentAssigneeId).toBeNull();
    const activeAssignments = await prisma.assetAssignment.count({
      where: { assetId: asset.id, returnedAt: null },
    });
    expect(activeAssignments).toBe(0);

    // The leaver account is disabled and can no longer authenticate.
    const disabled = await prisma.user.findUniqueOrThrow({ where: { id: subject.id } });
    expect(disabled.status).toBe('DISABLED');
    const blockedLogin = await request(server())
      .post('/api/v1/auth/login')
      .send({ email: disabled.email, password: 'ChangeMe!12345' })
      .expect(403);
    expect(blockedLogin.body.code).toBe('ACCOUNT_NOT_ACTIVE');
  });

  it('lists templates and enforces RBAC boundaries', async () => {
    const templates = await request(server())
      .get('/api/v1/workflow-templates?kind=ONBOARDING')
      .set('Cookie', agentCookie)
      .expect(200);
    expect(
      (templates.body.data as { name: string }[]).some(
        (template) => template.name === 'Default onboarding',
      ),
    ).toBe(true);

    await request(server()).get('/api/v1/onboarding').set('Cookie', employeeCookie).expect(403);
    await request(server())
      .post('/api/v1/offboarding')
      .set('Cookie', employeeCookie)
      .send({ subjectUserId: uuidv7(), effectiveDate: '2026-12-31' })
      .expect(403);
  });
});
