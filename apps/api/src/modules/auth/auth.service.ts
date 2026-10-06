import { Injectable } from '@nestjs/common';
import type { Me } from '@opsdesk/contracts';
import { DomainError, errors } from '../../common/errors';
import { hashPassword, randomToken, sha256, verifyPassword } from '../../common/crypto/password';
import { uuidv7 } from '../../common/id';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { MailService } from '../mail/mail.service';
import { TokenService } from './token.service';

const RESET_TOKEN_TTL_MS = 30 * 60 * 1000;
const MAX_FAILED_LOGINS = 10;
const LOCKOUT_MS = 15 * 60 * 1000;
const GENERIC_LOGIN_ERROR = () =>
  new DomainError('AUTH_INVALID_CREDENTIALS', 401, 'Email or password is incorrect.');

export interface LoginResult {
  accessToken: string;
  refreshToken: string;
  me: Me;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokenService,
    private readonly audit: AuditService,
    private readonly mail: MailService,
  ) {}

  async login(
    email: string,
    password: string,
    ip: string | undefined,
    userAgent: string | undefined,
  ): Promise<LoginResult> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user?.passwordHash) {
      throw GENERIC_LOGIN_ERROR();
    }
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new DomainError(
        'ACCOUNT_LOCKED',
        403,
        'Too many attempts. Try again in 15 minutes.',
      );
    }
    const passwordValid = await verifyPassword(user.passwordHash, password);
    if (!passwordValid) {
      const failedCount = user.failedLoginCount + 1;
      await this.prisma.$transaction(async (tx) => {
        await tx.user.update({
          where: { id: user.id },
          data: {
            failedLoginCount: failedCount,
            lockedUntil:
              failedCount >= MAX_FAILED_LOGINS ? new Date(Date.now() + LOCKOUT_MS) : null,
          },
        });
        await this.audit.record(tx, {
          action: 'auth.login_failed',
          entityType: 'user',
          entityId: user.id,
          metadata: { email },
        });
      });
      throw GENERIC_LOGIN_ERROR();
    }
    if (user.status !== 'ACTIVE') {
      throw new DomainError('ACCOUNT_NOT_ACTIVE', 403, 'Your account is not active. Contact IT.');
    }

    const result = await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() },
      });
      const session = await this.tokens.createSession(tx, user.id, userAgent, ip);
      await this.audit.record(tx, {
        action: 'auth.login_succeeded',
        entityType: 'user',
        entityId: user.id,
      });
      return session;
    });

    return {
      accessToken: this.tokens.signAccessToken(user.id, result.sessionId),
      refreshToken: result.refreshToken,
      me: await this.getMe(user.id),
    };
  }

  async refresh(
    rawRefreshToken: string | undefined,
    ip: string | undefined,
    userAgent: string | undefined,
  ): Promise<LoginResult> {
    if (!rawRefreshToken) {
      throw new DomainError('AUTH_REQUIRED', 401, 'Your session is no longer valid.');
    }
    const session = await this.prisma.session.findUnique({
      where: { refreshTokenHash: sha256(rawRefreshToken) },
    });
    if (!session) {
      throw new DomainError('AUTH_REQUIRED', 401, 'Your session is no longer valid.');
    }
    if (session.revokedAt || session.replacedById) {
      // Reuse of a rotated token: revoke the whole family (TRD §12).
      await this.prisma.$transaction(async (tx) => {
        await tx.session.updateMany({
          where: { familyId: session.familyId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
        await this.audit.record(tx, {
          action: 'auth.session_reuse_detected',
          entityType: 'session',
          entityId: session.id,
          metadata: { familyId: session.familyId },
        });
      });
      throw new DomainError('AUTH_REQUIRED', 401, 'Your session is no longer valid.');
    }
    if (session.expiresAt <= new Date()) {
      throw new DomainError('AUTH_REQUIRED', 401, 'Your session has expired. Sign in again.');
    }

    const user = await this.prisma.user.findUnique({ where: { id: session.userId } });
    if (!user || user.status !== 'ACTIVE') {
      throw new DomainError('ACCOUNT_NOT_ACTIVE', 403, 'Your account is not active. Contact IT.');
    }

    const rotated = await this.prisma.$transaction(async (tx) => {
      const next = await this.tokens.createSession(tx, user.id, userAgent, ip, session.familyId);
      await tx.session.update({
        where: { id: session.id },
        data: { revokedAt: new Date(), replacedById: next.sessionId, lastUsedAt: new Date() },
      });
      return next;
    });

    return {
      accessToken: this.tokens.signAccessToken(user.id, rotated.sessionId),
      refreshToken: rotated.refreshToken,
      me: await this.getMe(user.id),
    };
  }

  async logout(rawRefreshToken: string | undefined): Promise<void> {
    if (!rawRefreshToken) return;
    const session = await this.prisma.session.findUnique({
      where: { refreshTokenHash: sha256(rawRefreshToken) },
    });
    if (!session || session.revokedAt) return;
    await this.prisma.$transaction(async (tx) => {
      await tx.session.update({ where: { id: session.id }, data: { revokedAt: new Date() } });
      await this.audit.record(tx, {
        action: 'auth.logout',
        entityType: 'user',
        entityId: session.userId,
      });
    });
  }

  async forgotPassword(email: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) return; // identical response whether or not the email exists (AUTH-3)

    const token = randomToken(48);
    await this.prisma.$transaction(async (tx) => {
      await tx.authToken.create({
        data: {
          id: uuidv7(),
          userId: user.id,
          type: 'PASSWORD_RESET',
          tokenHash: sha256(token),
          expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
        },
      });
      await this.audit.record(tx, {
        action: 'auth.password_reset_requested',
        entityType: 'user',
        entityId: user.id,
      });
    });
    const baseUrl = process.env.APP_URL ?? 'http://localhost:3000';
    await this.mail.sendPasswordReset(user.email, `${baseUrl}/reset-password?token=${token}`);
  }

  async resetPassword(token: string, newPassword: string): Promise<void> {
    const record = await this.prisma.authToken.findUnique({
      where: { tokenHash: sha256(token) },
    });
    if (!record || record.type !== 'PASSWORD_RESET' || record.usedAt || record.expiresAt <= new Date()) {
      throw new DomainError('AUTH_REQUIRED', 401, 'This reset link is invalid or has expired.');
    }
    const passwordHash = await hashPassword(newPassword);
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: record.userId },
        data: { passwordHash, failedLoginCount: 0, lockedUntil: null },
      });
      await tx.authToken.update({ where: { id: record.id }, data: { usedAt: new Date() } });
      await tx.session.updateMany({
        where: { userId: record.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await this.audit.record(tx, {
        action: 'auth.password_reset_completed',
        entityType: 'user',
        entityId: record.userId,
      });
    });
  }

  async acceptInvitation(token: string, password: string): Promise<void> {
    const record = await this.prisma.authToken.findUnique({
      where: { tokenHash: sha256(token) },
    });
    if (!record || record.type !== 'INVITATION' || record.usedAt || record.expiresAt <= new Date()) {
      throw new DomainError('AUTH_REQUIRED', 401, 'This invitation is invalid or has expired.');
    }
    const passwordHash = await hashPassword(password);
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: record.userId },
        data: { passwordHash, status: 'ACTIVE', emailVerifiedAt: new Date() },
      });
      await tx.authToken.update({ where: { id: record.id }, data: { usedAt: new Date() } });
      await this.audit.record(tx, {
        action: 'user.activated',
        entityType: 'user',
        entityId: record.userId,
      });
    });
  }

  async getMe(userId: string): Promise<Me> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { department: true, roles: { include: { role: true } }, teams: true },
    });
    if (!user) throw errors.notFound('USER_NOT_FOUND', 'User not found.');

    const rolePermissions = await this.prisma.rolePermission.findMany({
      where: { roleId: { in: user.roles.map((entry) => entry.roleId) } },
      select: { permission: { select: { key: true } } },
    });

    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      phone: user.phone,
      jobTitle: user.jobTitle,
      status: user.status,
      timezone: user.timezone,
      departmentId: user.departmentId,
      departmentName: user.department?.name ?? null,
      roles: user.roles.map((entry) => ({
        id: entry.role.id,
        key: entry.role.key,
        name: entry.role.name,
      })),
      permissions: [...new Set(rolePermissions.map((rp) => rp.permission.key))] as Me['permissions'],
      teamIds: user.teams.map((team) => team.teamId),
    };
  }

  async listSessions(userId: string, currentSessionId: string | undefined) {
    const sessions = await this.prisma.session.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
    return sessions.map((session) => ({
      id: session.id,
      userAgent: session.userAgent,
      ip: session.ip,
      createdAt: session.createdAt.toISOString(),
      lastUsedAt: session.lastUsedAt?.toISOString() ?? null,
      current: session.id === currentSessionId,
    }));
  }

  async revokeSession(userId: string, sessionId: string): Promise<void> {
    const session = await this.prisma.session.findFirst({ where: { id: sessionId, userId } });
    if (!session) throw errors.notFound('NOT_FOUND', 'Session not found.');
    await this.prisma.session.update({
      where: { id: session.id },
      data: { revokedAt: new Date() },
    });
  }
}
