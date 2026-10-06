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

async function login(app: INestApplication, email: string) {
  const res = await request(app.getHttpServer())
    .post('/api/v1/auth/login')
    .send({ email, password: 'ChangeMe!12345' })
    .expect(200);
  return accessCookie(res.headers['set-cookie']);
}

describe('RBAC boundaries (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = configureApp(moduleRef.createNestApplication({ bufferLogs: true }));
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  it('employee cannot list users or departments, but can read their own profile', async () => {
    const cookie = await login(app, 'employee@opsdesk.local');

    const forbidden = await request(app.getHttpServer())
      .get('/api/v1/users')
      .set('Cookie', cookie)
      .expect(403);
    expect(forbidden.body.code).toBe('FORBIDDEN');

    await request(app.getHttpServer())
      .get('/api/v1/departments')
      .set('Cookie', cookie)
      .expect(403);

    const me = await request(app.getHttpServer())
      .get('/api/v1/users/me')
      .set('Cookie', cookie)
      .expect(200);
    expect(me.body.data.email).toBe('employee@opsdesk.local');
  });

  it('agent has directory access but not user administration', async () => {
    const cookie = await login(app, 'agent@opsdesk.local');

    const users = await request(app.getHttpServer())
      .get('/api/v1/users')
      .set('Cookie', cookie)
      .expect(200);
    expect(users.body.meta.total).toBeGreaterThan(0);

    await request(app.getHttpServer())
      .post('/api/v1/users')
      .set('Cookie', cookie)
      .send({
        email: `agent-created-${Date.now()}@opsdesk.local`,
        firstName: 'No',
        lastName: 'Way',
        roleIds: ['00000000-0000-7000-8000-000000000000'],
      })
      .expect(403);
  });

  it('admin can invite a user and the invited account is INVITED', async () => {
    const cookie = await login(app, 'admin@opsdesk.local');
    const roles = await prisma.role.findMany();
    const employeeRole = roles.find((role) => role.key === 'EMPLOYEE')!;
    const email = `invited-${Date.now()}@opsdesk.local`;

    const res = await request(app.getHttpServer())
      .post('/api/v1/users')
      .set('Cookie', cookie)
      .send({
        email,
        firstName: 'New',
        lastName: 'Hire',
        roleIds: [employeeRole.id],
        teamIds: [],
      })
      .expect(201);

    expect(res.body.data.status).toBe('INVITED');
    await prisma.user.delete({ where: { id: res.body.data.id } });
  });

  it('suspending a user blocks existing sessions immediately', async () => {
    const adminCookie = await login(app, 'admin@opsdesk.local');
    const employeeCookie = await login(app, 'employee@opsdesk.local');

    const employee = await prisma.user.findUniqueOrThrow({
      where: { email: 'employee@opsdesk.local' },
    });

    await request(app.getHttpServer())
      .post(`/api/v1/users/${employee.id}/status`)
      .set('Cookie', adminCookie)
      .send({ status: 'SUSPENDED', reason: 'integration test' })
      .expect(200);

    const blocked = await request(app.getHttpServer())
      .get('/api/v1/users/me')
      .set('Cookie', employeeCookie)
      .expect(403);
    expect(blocked.body.code).toBe('ACCOUNT_NOT_ACTIVE');

    await request(app.getHttpServer())
      .post(`/api/v1/users/${employee.id}/status`)
      .set('Cookie', adminCookie)
      .send({ status: 'ACTIVE' })
      .expect(200);

    await request(app.getHttpServer())
      .get('/api/v1/users/me')
      .set('Cookie', employeeCookie)
      .expect(200);
  });

  it('manager can view users but cannot manage roles', async () => {
    const cookie = await login(app, 'manager@opsdesk.local');
    await request(app.getHttpServer()).get('/api/v1/users').set('Cookie', cookie).expect(200);

    const role = await prisma.role.findFirstOrThrow({ where: { key: 'ADMIN' } });
    await request(app.getHttpServer())
      .put(`/api/v1/roles/${role.id}/permissions`)
      .set('Cookie', cookie)
      .send({ permissionKeys: ['ticket:view'] })
      .expect(403);
  });
});
