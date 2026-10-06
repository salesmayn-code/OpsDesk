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

describe('Asset management (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let adminCookie: string;
  let agentCookie: string;
  let employeeCookie: string;
  let employeeId: string;
  let agentId: string;
  let laptopTypeId: string;
  let categoryId: string;

  const server = () => app.getHttpServer();

  async function login(email: string): Promise<string> {
    const res = await request(server())
      .post('/api/v1/auth/login')
      .send({ email, password: 'ChangeMe!12345' })
      .expect(200);
    return accessCookie(res.headers['set-cookie']);
  }

  async function createAsset(name: string, overrides: Record<string, unknown> = {}) {
    const res = await request(server())
      .post('/api/v1/assets')
      .set('Cookie', adminCookie)
      .send({ typeId: laptopTypeId, name, ...overrides })
      .expect(201);
    return res.body.data as { id: string; tag: string; version: number; status: string };
  }

  async function receive(asset: { id: string; version: number }) {
    const res = await request(server())
      .post(`/api/v1/assets/${asset.id}/transitions`)
      .set('Cookie', agentCookie)
      .send({ version: asset.version, to: 'IN_STOCK' })
      .expect(200);
    return { id: asset.id, tag: res.body.data.tag as string, version: res.body.data.version as number, status: res.body.data.status as string };
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = configureApp(moduleRef.createNestApplication({ bufferLogs: true }));
    await app.init();
    prisma = app.get(PrismaService);

    adminCookie = await login('admin@opsdesk.local');
    agentCookie = await login('agent@opsdesk.local');
    employeeCookie = await login('employee@opsdesk.local');

    const employee = await prisma.user.findUniqueOrThrow({
      where: { email: 'employee@opsdesk.local' },
    });
    const agent = await prisma.user.findUniqueOrThrow({ where: { email: 'agent@opsdesk.local' } });
    employeeId = employee.id;
    agentId = agent.id;

    const laptop = await prisma.assetType.findFirstOrThrow({ where: { tagPrefix: 'LAP' } });
    laptopTypeId = laptop.id;
    const category = await prisma.category.findFirstOrThrow({
      where: { name: 'Hardware', parentId: null },
    });
    categoryId = category.id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('generates sequential tags per asset type', async () => {
    const before = await prisma.assetTagCounter.findUnique({ where: { typeId: laptopTypeId } });
    const first = await createAsset('Tag sequence laptop A');
    const second = await createAsset('Tag sequence laptop B');

    expect(first.tag).toMatch(/^LAP-\d{5}$/);
    const firstNumber = Number(first.tag.split('-')[1]);
    const secondNumber = Number(second.tag.split('-')[1]);
    expect(secondNumber).toBe(firstNumber + 1);
    if (before) expect(firstNumber).toBe(before.last + 1);
  });

  it('assigns, reassigns, and keeps exactly one active assignment', async () => {
    const asset = await receive(await createAsset('Assignment test laptop'));

    const assigned = await request(server())
      .post(`/api/v1/assets/${asset.id}/assign`)
      .set('Cookie', agentCookie)
      .send({ version: asset.version, userId: employeeId, note: 'New starter kit' })
      .expect(200);
    expect(assigned.body.data.status).toBe('ASSIGNED');
    expect(assigned.body.data.currentAssignee.id).toBe(employeeId);

    const reassigned = await request(server())
      .post(`/api/v1/assets/${asset.id}/assign`)
      .set('Cookie', agentCookie)
      .send({ version: assigned.body.data.version, userId: agentId })
      .expect(200);
    expect(reassigned.body.data.currentAssignee.id).toBe(agentId);

    const activeAssignments = await prisma.assetAssignment.count({
      where: { assetId: asset.id, returnedAt: null },
    });
    expect(activeAssignments).toBe(1);
    const closedAssignments = await prisma.assetAssignment.count({
      where: { assetId: asset.id, returnedAt: { not: null } },
    });
    expect(closedAssignments).toBe(1);

    const events = await prisma.assetEvent.findMany({
      where: { assetId: asset.id },
      orderBy: { createdAt: 'asc' },
    });
    expect(events.map((event) => event.type)).toEqual(
      expect.arrayContaining(['CREATED', 'ASSIGNED', 'REASSIGNED']),
    );

    const detail = await request(server())
      .get(`/api/v1/assets/${asset.tag}`)
      .set('Cookie', agentCookie)
      .expect(200);
    expect(detail.body.data.assignments).toHaveLength(2);
  });

  it('unassigns back to stock and clears the assignee', async () => {
    const asset = await receive(await createAsset('Unassign flow laptop'));
    const assigned = await request(server())
      .post(`/api/v1/assets/${asset.id}/assign`)
      .set('Cookie', agentCookie)
      .send({ version: asset.version, userId: employeeId })
      .expect(200);

    const unassigned = await request(server())
      .post(`/api/v1/assets/${asset.id}/unassign`)
      .set('Cookie', agentCookie)
      .send({ version: assigned.body.data.version, condition: 'GOOD' })
      .expect(200);
    expect(unassigned.body.data.status).toBe('IN_STOCK');
    expect(unassigned.body.data.currentAssignee).toBeNull();

    const active = await prisma.assetAssignment.count({
      where: { assetId: asset.id, returnedAt: null },
    });
    expect(active).toBe(0);
  });

  it('enforces the lifecycle guards (repair note, in-use retire, disposal method)', async () => {
    const asset = await receive(await createAsset('Lifecycle laptop'));

    const noNote = await request(server())
      .post(`/api/v1/assets/${asset.id}/transitions`)
      .set('Cookie', agentCookie)
      .send({ version: asset.version, to: 'IN_REPAIR' })
      .expect(422);
    expect(noNote.body.code).toBe('VALIDATION_FAILED');

    const repair = await request(server())
      .post(`/api/v1/assets/${asset.id}/transitions`)
      .set('Cookie', agentCookie)
      .send({ version: asset.version, to: 'IN_REPAIR', note: 'Screen flickers' })
      .expect(200);
    expect(repair.body.data.status).toBe('IN_REPAIR');

    const back = await request(server())
      .post(`/api/v1/assets/${asset.id}/transitions`)
      .set('Cookie', agentCookie)
      .send({
        version: repair.body.data.version,
        to: 'IN_STOCK',
        note: 'Panel replaced under warranty',
      })
      .expect(200);
    expect(back.body.data.status).toBe('IN_STOCK');

    // In-repair keeps custody; retiring with an active assignment is blocked.
    const assigned = await request(server())
      .post(`/api/v1/assets/${asset.id}/assign`)
      .set('Cookie', agentCookie)
      .send({ version: back.body.data.version, userId: employeeId })
      .expect(200);
    const inRepair = await request(server())
      .post(`/api/v1/assets/${asset.id}/transitions`)
      .set('Cookie', agentCookie)
      .send({
        version: assigned.body.data.version,
        to: 'IN_REPAIR',
        note: 'Keyboard replacement',
      })
      .expect(200);
    expect(inRepair.body.data.currentAssignee.id).toBe(employeeId);

    const inUse = await request(server())
      .post(`/api/v1/assets/${asset.id}/transitions`)
      .set('Cookie', adminCookie)
      .send({ version: inRepair.body.data.version, to: 'RETIRED' })
      .expect(422);
    expect(inUse.body.code).toBe('ASSET_IN_USE');

    const unassigned = await request(server())
      .post(`/api/v1/assets/${asset.id}/unassign`)
      .set('Cookie', agentCookie)
      .send({ version: inRepair.body.data.version })
      .expect(200);
    const retired = await request(server())
      .post(`/api/v1/assets/${asset.id}/transitions`)
      .set('Cookie', adminCookie)
      .send({ version: unassigned.body.data.version, to: 'RETIRED' })
      .expect(200);
    expect(retired.body.data.status).toBe('RETIRED');

    const noMethod = await request(server())
      .post(`/api/v1/assets/${asset.id}/transitions`)
      .set('Cookie', adminCookie)
      .send({ version: retired.body.data.version, to: 'DISPOSED' })
      .expect(422);
    expect(noMethod.body.code).toBe('VALIDATION_FAILED');

    const disposed = await request(server())
      .post(`/api/v1/assets/${asset.id}/transitions`)
      .set('Cookie', adminCookie)
      .send({ version: retired.body.data.version, to: 'DISPOSED', disposalMethod: 'Recycled' })
      .expect(200);
    expect(disposed.body.data.status).toBe('DISPOSED');

    // Terminal.
    const terminal = await request(server())
      .post(`/api/v1/assets/${asset.id}/transitions`)
      .set('Cookie', adminCookie)
      .send({ version: disposed.body.data.version, to: 'IN_STOCK' })
      .expect(422);
    expect(terminal.body.code).toBe('ASSET_INVALID_TRANSITION');
  });

  it('scopes employee visibility to their own assets and serves My Assets', async () => {
    const mine = await receive(await createAsset('Employee scoped laptop'));
    const assigned = await request(server())
      .post(`/api/v1/assets/${mine.id}/assign`)
      .set('Cookie', agentCookie)
      .send({ version: mine.version, userId: employeeId })
      .expect(200);
    expect(assigned.status).toBe(200);

    const others = await createAsset('Someone else laptop');

    const list = await request(server())
      .get('/api/v1/assets?pageSize=100')
      .set('Cookie', employeeCookie)
      .expect(200);
    const ids = (list.body.data as { id: string }[]).map((row) => row.id);
    expect(ids).toContain(mine.id);
    expect(ids).not.toContain(others.id);

    await request(server())
      .get(`/api/v1/assets/${others.id}`)
      .set('Cookie', employeeCookie)
      .expect(404);

    const myAssets = await request(server())
      .get('/api/v1/users/me/assets')
      .set('Cookie', employeeCookie)
      .expect(200);
    expect((myAssets.body.data as { id: string }[]).map((row) => row.id)).toContain(mine.id);

    // Agents with asset:view_all see everything.
    await request(server())
      .get(`/api/v1/assets/${others.id}`)
      .set('Cookie', agentCookie)
      .expect(200);
  });

  it('filters by warranty state', async () => {
    const expired = await createAsset('Expired warranty laptop', {
      warrantyExpiry: '2024-01-01',
    });
    const active = await createAsset('Active warranty laptop', {
      warrantyExpiry: '2030-01-01',
    });

    const expiredList = await request(server())
      .get('/api/v1/assets?warranty=expired&pageSize=100')
      .set('Cookie', agentCookie)
      .expect(200);
    const expiredIds = (expiredList.body.data as { id: string }[]).map((row) => row.id);
    expect(expiredIds).toContain(expired.id);
    expect(expiredIds).not.toContain(active.id);

    const detail = await request(server())
      .get(`/api/v1/assets/${expired.id}`)
      .set('Cookie', agentCookie)
      .expect(200);
    expect(detail.body.data.warrantyState).toBe('expired');
  });

  it('lists tickets linked to an asset, permission-filtered', async () => {
    const asset = await receive(await createAsset('Ticket link laptop'));
    await request(server())
      .post(`/api/v1/assets/${asset.id}/assign`)
      .set('Cookie', agentCookie)
      .send({ version: asset.version, userId: employeeId })
      .expect(200);

    const ticket = await request(server())
      .post('/api/v1/tickets')
      .set('Cookie', employeeCookie)
      .send({
        title: 'Laptop linked to asset register',
        description: 'Created to test asset/ticket linking.',
        type: 'INCIDENT',
        categoryId,
        assetId: asset.id,
      })
      .expect(201);

    const related = await request(server())
      .get(`/api/v1/assets/${asset.id}/tickets`)
      .set('Cookie', agentCookie)
      .expect(200);
    expect((related.body.data as { id: string }[]).map((row) => row.id)).toContain(
      ticket.body.data.id,
    );

    const history = await request(server())
      .get(`/api/v1/assets/${asset.id}/history`)
      .set('Cookie', agentCookie)
      .expect(200);
    expect(
      (history.body.data as { type: string }[]).map((event) => event.type),
    ).toEqual(expect.arrayContaining(['CREATED', 'ASSIGNED']));
  });
});
