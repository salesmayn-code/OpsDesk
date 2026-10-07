import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { PrismaService } from '../src/infra/prisma/prisma.service';
import { hashPassword, sha256 } from '../src/common/crypto/password';
import { uuidv7 } from '../src/common/id';

function cookieValue(setCookie: string[] | string | undefined, name: string): string {
  const header = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
  const match = header.find((entry) => entry.startsWith(`${name}=`));
  if (!match) throw new Error(`Missing cookie ${name}`);
  return match.split(';')[0]!;
}

describe('Auth lifecycle (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const employeeEmail = 'employee@opsdesk.local';
  const password = 'ChangeMe!12345';

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = configureApp(moduleRef.createNestApplication({ bufferLogs: true }));
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  it('rejects unauthenticated /auth/me with 401 AUTH_REQUIRED', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/auth/me').expect(401);
    expect(res.body.code).toBe('AUTH_REQUIRED');
    expect(res.body.requestId).toBeDefined();
  });

  it('logs in with valid credentials and returns me with permissions', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: employeeEmail, password })
      .expect(200);

    expect(res.body.data.email).toBe(employeeEmail);
    expect(res.body.data.permissions).toContain('ticket:create');
    const access = cookieValue(res.headers['set-cookie'], 'opsdesk_access');
    const refresh = cookieValue(res.headers['set-cookie'], 'opsdesk_refresh');

    const me = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Cookie', access)
      .expect(200);
    expect(me.body.data.email).toBe(employeeEmail);

    await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .set('Cookie', refresh)
      .expect(200);
    // Revoked refresh token can no longer rotate.
    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Cookie', refresh)
      .expect(401);
  });

  it('rejects a wrong password with a generic 401', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: employeeEmail, password: 'WrongPassword!2345' })
      .expect(401);
    expect(res.body.code).toBe('AUTH_INVALID_CREDENTIALS');
    expect(res.body.message).toBe('Email or password is incorrect.');
  });

  it('rotates refresh tokens and revokes the family on reuse', async () => {
    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: employeeEmail, password })
      .expect(200);
    const refresh1 = cookieValue(login.headers['set-cookie'], 'opsdesk_refresh');

    const refreshed = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Cookie', refresh1)
      .expect(200);
    const refresh2 = cookieValue(refreshed.headers['set-cookie'], 'opsdesk_refresh');
    expect(refresh2).not.toBe(refresh1);

    // Reusing the rotated token is detected and revokes the whole family.
    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Cookie', refresh1)
      .expect(401);
    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Cookie', refresh2)
      .expect(401);
  });

  it('accepts an invitation token, activates the user, and allows login', async () => {
    const email = `invite-${Date.now()}@opsdesk.local`;
    const rawToken = `test-invite-${Date.now()}`;
    const user = await prisma.user.create({
      data: {
        id: uuidv7(),
        email,
        firstName: 'Test',
        lastName: 'Invitee',
        status: 'INVITED',
      },
    });
    await prisma.authToken.create({
      data: {
        id: uuidv7(),
        userId: user.id,
        type: 'INVITATION',
        tokenHash: sha256(rawToken),
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });

    await request(app.getHttpServer())
      .post('/api/v1/auth/invitations/accept')
      .send({ token: rawToken, password: 'FreshPassword!2345' })
      .expect(200);

    const activated = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(activated.status).toBe('ACTIVE');

    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password: 'FreshPassword!2345' })
      .expect(200);

    await prisma.user.delete({ where: { id: user.id } });
  });

  it('resets a password with a single-use token and revokes sessions', async () => {
    const email = `reset-${Date.now()}@opsdesk.local`;
    const rawToken = `test-reset-${Date.now()}`;
    const user = await prisma.user.create({
      data: {
        id: uuidv7(),
        email,
        firstName: 'Test',
        lastName: 'Reset',
        status: 'ACTIVE',
        passwordHash: await hashPassword('OldPassword!2345'),
      },
    });
    await prisma.authToken.create({
      data: {
        id: uuidv7(),
        userId: user.id,
        type: 'PASSWORD_RESET',
        tokenHash: sha256(rawToken),
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });

    await request(app.getHttpServer())
      .post('/api/v1/auth/password/reset')
      .send({ token: rawToken, newPassword: 'NewPassword!2345' })
      .expect(200);

    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password: 'NewPassword!2345' })
      .expect(200);

    // Token is single-use.
    await request(app.getHttpServer())
      .post('/api/v1/auth/password/reset')
      .send({ token: rawToken, newPassword: 'AnotherPassword!2345' })
      .expect(401);

    await prisma.user.delete({ where: { id: user.id } });
  });

  it('registers a new employee, starts a session, and grants the EMPLOYEE role', async () => {
    const email = `register-${Date.now()}@opsdesk.local`;
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        firstName: 'Self',
        lastName: 'Registered',
        email,
        password: 'FreshPassword!2345',
      })
      .expect(201);

    expect(res.body.data.email).toBe(email);
    expect(
      (res.body.data.roles as { key: string }[]).map((role) => role.key),
    ).toContain('EMPLOYEE');
    expect(res.body.data.permissions).toContain('ticket:create');

    const access = cookieValue(res.headers['set-cookie'], 'opsdesk_access');
    const me = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Cookie', access)
      .expect(200);
    expect(me.body.data.email).toBe(email);

    await prisma.user.delete({ where: { email } });
  });

  it('rejects registration for an existing email with 409', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        firstName: 'Dup',
        lastName: 'User',
        email: employeeEmail,
        password: 'FreshPassword!2345',
      })
      .expect(409);
    expect(res.body.code).toBe('EMAIL_TAKEN');
  });

  it('rejects a short registration password with 400', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        firstName: 'Weak',
        lastName: 'Pass',
        email: `weak-${Date.now()}@opsdesk.local`,
        password: 'short',
      })
      .expect(400);
  });

  it('forgot-password always returns 202, even for unknown emails', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/password/forgot')
      .send({ email: 'nobody@opsdesk.local' })
      .expect(202);
  });
});
