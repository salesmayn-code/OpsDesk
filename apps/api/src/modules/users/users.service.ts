import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type {
  InviteUserInput,
  UpdateProfileInput,
  UpdateUserInput,
  UserQuery,
  UserStatus,
  UserSummary,
} from '@opsdesk/contracts';
import { errors } from '../../common/errors';
import { randomToken, sha256 } from '../../common/crypto/password';
import { uuidv7 } from '../../common/id';
import { pageMeta, parseSort, skip } from '../../common/pagination';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { MailService } from '../mail/mail.service';
import { PermissionService } from '../access/permission.service';
import { UsersRepository } from './users.repository';
import type { AuthUser } from '../../common/auth-user';

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const SORT_FIELDS = ['createdAt', 'firstName', 'lastName', 'email', 'status', 'lastLoginAt'] as const;

interface UserWithRelations {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  jobTitle: string | null;
  status: UserStatus;
  timezone: string;
  departmentId: string | null;
  lastLoginAt: Date | null;
  createdAt: Date;
  department?: { name: string } | null;
  roles: { role: { id: string; key: string; name: string } }[];
  teams: { teamId: string }[];
}

function toSummary(user: UserWithRelations): UserSummary {
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
    teamIds: user.teams.map((team) => team.teamId),
    lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
    createdAt: user.createdAt.toISOString(),
  };
}

@Injectable()
export class UsersService {
  constructor(
    private readonly repository: UsersRepository,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly mail: MailService,
    private readonly permissionService: PermissionService,
  ) {}

  async list(query: UserQuery) {
    const where = this.repository.buildWhere(query);
    // Postgres DESC puts NULLs first; sort never-logged-in users last.
    const orderBy = (parseSort(query.sort, SORT_FIELDS) ?? [{ createdAt: 'desc' as const }]).map(
      (entry) =>
        'lastLoginAt' in entry
          ? { lastLoginAt: { sort: entry.lastLoginAt, nulls: 'last' as const } }
          : entry,
    );
    const [total, users] = await this.repository.list(
      where,
      orderBy,
      skip(query.page, query.pageSize),
      query.pageSize,
    );
    return {
      data: users.map((user) => toSummary(user as UserWithRelations)),
      meta: pageMeta(query.page, query.pageSize, total),
    };
  }

  async getById(id: string): Promise<UserSummary> {
    const user = await this.repository.findById(id);
    if (!user) throw errors.notFound('USER_NOT_FOUND', 'User not found.');
    return toSummary(user as UserWithRelations);
  }

  async invite(input: InviteUserInput, actor: AuthUser): Promise<UserSummary> {
    const roles = await this.prisma.role.findMany({ where: { id: { in: input.roleIds } } });
    if (roles.length !== input.roleIds.length) {
      throw errors.businessRule('VALIDATION_FAILED', 'One or more roles are invalid.');
    }

    const userId = uuidv7();
    const token = randomToken(48);
    await this.prisma.$transaction(async (tx) => {
      await tx.user.create({
        data: {
          id: userId,
          email: input.email,
          firstName: input.firstName,
          lastName: input.lastName,
          phone: input.phone ?? null,
          jobTitle: input.jobTitle ?? null,
          departmentId: input.departmentId ?? null,
          managerId: input.managerId ?? null,
          status: 'INVITED',
        },
      });
      await tx.userRole.createMany({
        data: input.roleIds.map((roleId) => ({ userId, roleId })),
        skipDuplicates: true,
      });
      if (input.teamIds.length > 0) {
        await tx.teamMember.createMany({
          data: input.teamIds.map((teamId) => ({ teamId, userId })),
          skipDuplicates: true,
        });
      }
      await tx.authToken.create({
        data: {
          id: uuidv7(),
          userId,
          type: 'INVITATION',
          tokenHash: sha256(token),
          expiresAt: new Date(Date.now() + INVITE_TTL_MS),
        },
      });
      await this.audit.record(tx, {
        action: 'user.invited',
        entityType: 'user',
        entityId: userId,
        after: { email: input.email, roleIds: input.roleIds, teamIds: input.teamIds },
      });
    });

    const baseUrl = process.env.APP_URL ?? 'http://localhost:3000';
    await this.mail.sendInvitation(
      input.email,
      `${baseUrl}/accept-invite?token=${token}`,
      `${actor.firstName} ${actor.lastName}`,
    );
    return this.getById(userId);
  }

  async update(id: string, input: UpdateUserInput): Promise<UserSummary> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw errors.notFound('USER_NOT_FOUND', 'User not found.');

    const data: Prisma.UserUncheckedUpdateInput = {};
    if (input.firstName !== undefined) data.firstName = input.firstName;
    if (input.lastName !== undefined) data.lastName = input.lastName;
    if (input.phone !== undefined) data.phone = input.phone;
    if (input.jobTitle !== undefined) data.jobTitle = input.jobTitle;
    if (input.departmentId !== undefined) data.departmentId = input.departmentId;
    if (input.managerId !== undefined) data.managerId = input.managerId;
    if (input.timezone !== undefined) data.timezone = input.timezone;

    const before: Record<string, unknown> = {};
    const after: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data)) {
      const currentValue = (user as Record<string, unknown>)[key];
      if (currentValue !== value) {
        before[key] = currentValue;
        after[key] = value;
      }
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id }, data });
      await this.audit.record(tx, {
        action: 'user.updated',
        entityType: 'user',
        entityId: id,
        before,
        after,
      });
    });
    this.permissionService.invalidate(id);
    return this.getById(id);
  }

  async updateProfile(id: string, input: UpdateProfileInput): Promise<UserSummary> {
    return this.update(id, input);
  }

  async changeStatus(
    id: string,
    status: 'ACTIVE' | 'SUSPENDED' | 'DISABLED',
    reason: string | undefined,
  ): Promise<UserSummary> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw errors.notFound('USER_NOT_FOUND', 'User not found.');

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id }, data: { status } });
      if (status !== 'ACTIVE') {
        await tx.session.updateMany({
          where: { userId: id, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }
      await this.audit.record(tx, {
        action: 'user.status_changed',
        entityType: 'user',
        entityId: id,
        before: { status: user.status },
        after: { status },
        metadata: reason ? { reason } : undefined,
      });
    });
    this.permissionService.invalidate(id);
    return this.getById(id);
  }

  async updateRoles(id: string, roleIds: string[]): Promise<UserSummary> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: { roles: { include: { role: true } } },
    });
    if (!user) throw errors.notFound('USER_NOT_FOUND', 'User not found.');

    const roles = await this.prisma.role.findMany({ where: { id: { in: roleIds } } });
    if (roles.length !== roleIds.length) {
      throw errors.businessRule('VALIDATION_FAILED', 'One or more roles are invalid.');
    }

    const before = user.roles.map((entry) => entry.role.key);
    await this.prisma.$transaction(async (tx) => {
      await tx.userRole.deleteMany({ where: { userId: id } });
      await tx.userRole.createMany({
        data: roleIds.map((roleId) => ({ userId: id, roleId })),
        skipDuplicates: true,
      });
      await this.audit.record(tx, {
        action: 'user.roles_changed',
        entityType: 'user',
        entityId: id,
        before: { roles: before },
        after: { roles: roles.map((role) => role.key) },
      });
    });
    this.permissionService.invalidate(id);
    return this.getById(id);
  }
}
