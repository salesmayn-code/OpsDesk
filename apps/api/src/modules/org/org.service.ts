import { Injectable } from '@nestjs/common';
import type {
  CreateDepartmentInput,
  CreateTeamInput,
  SetTeamMembersInput,
  UpdateDepartmentInput,
  UpdateTeamInput,
} from '@opsdesk/contracts';
import { errors } from '../../common/errors';
import { uuidv7 } from '../../common/id';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class OrgService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ───────── Departments ─────────

  async listDepartments() {
    const departments = await this.prisma.department.findMany({
      include: { _count: { select: { members: true } } },
      orderBy: { name: 'asc' },
    });
    return {
      data: departments.map((department) => ({
        id: department.id,
        name: department.name,
        code: department.code,
        headId: department.headId,
        archivedAt: department.archivedAt?.toISOString() ?? null,
        memberCount: department._count.members,
      })),
    };
  }

  async createDepartment(input: CreateDepartmentInput) {
    const id = uuidv7();
    await this.prisma.$transaction(async (tx) => {
      await tx.department.create({
        data: { id, name: input.name, code: input.code, headId: input.headId ?? null },
      });
      await this.audit.record(tx, {
        action: 'department.created',
        entityType: 'department',
        entityId: id,
        after: { name: input.name, code: input.code },
      });
    });
    return { data: (await this.listDepartments()).data.find((d) => d.id === id) };
  }

  async updateDepartment(id: string, input: UpdateDepartmentInput) {
    const department = await this.prisma.department.findUnique({ where: { id } });
    if (!department) throw errors.notFound('DEPARTMENT_NOT_FOUND', 'Department not found.');

    await this.prisma.$transaction(async (tx) => {
      await tx.department.update({
        where: { id },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.code !== undefined ? { code: input.code } : {}),
          ...(input.headId !== undefined ? { headId: input.headId } : {}),
          ...(input.archived !== undefined
            ? { archivedAt: input.archived ? new Date() : null }
            : {}),
        },
      });
      await this.audit.record(tx, {
        action: 'department.updated',
        entityType: 'department',
        entityId: id,
        before: { name: department.name, code: department.code, headId: department.headId },
        after: input as Record<string, unknown>,
      });
    });
    return { data: (await this.listDepartments()).data.find((d) => d.id === id) };
  }

  async deleteDepartment(id: string) {
    const department = await this.prisma.department.findUnique({
      where: { id },
      include: { _count: { select: { members: true } } },
    });
    if (!department) throw errors.notFound('DEPARTMENT_NOT_FOUND', 'Department not found.');
    if (department._count.members > 0) {
      throw errors.conflict(
        'DEPARTMENT_HAS_MEMBERS',
        'This department has members. Archive it instead of deleting.',
      );
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.department.delete({ where: { id } });
      await this.audit.record(tx, {
        action: 'department.deleted',
        entityType: 'department',
        entityId: id,
        before: { name: department.name, code: department.code },
      });
    });
  }

  // ───────── Teams ─────────

  async listTeams() {
    const teams = await this.prisma.team.findMany({
      include: { _count: { select: { members: true } } },
      orderBy: { name: 'asc' },
    });
    return {
      data: teams.map((team) => ({
        id: team.id,
        name: team.name,
        description: team.description,
        email: team.email,
        leadId: team.leadId,
        managerId: team.managerId,
        archivedAt: team.archivedAt?.toISOString() ?? null,
        memberCount: team._count.members,
      })),
    };
  }

  async getTeam(id: string) {
    const team = await this.prisma.team.findUnique({
      where: { id },
      include: { members: { include: { user: true } } },
    });
    if (!team) throw errors.notFound('TEAM_NOT_FOUND', 'Team not found.');
    return {
      data: {
        id: team.id,
        name: team.name,
        description: team.description,
        email: team.email,
        leadId: team.leadId,
        managerId: team.managerId,
        archivedAt: team.archivedAt?.toISOString() ?? null,
        memberCount: team.members.length,
        members: team.members.map((member) => ({
          id: member.user.id,
          firstName: member.user.firstName,
          lastName: member.user.lastName,
        })),
      },
    };
  }

  async createTeam(input: CreateTeamInput) {
    const id = uuidv7();
    await this.prisma.$transaction(async (tx) => {
      await tx.team.create({
        data: {
          id,
          name: input.name,
          description: input.description ?? null,
          email: input.email ?? null,
          leadId: input.leadId ?? null,
          managerId: input.managerId ?? null,
        },
      });
      await this.audit.record(tx, {
        action: 'team.created',
        entityType: 'team',
        entityId: id,
        after: { name: input.name },
      });
    });
    return this.getTeam(id);
  }

  async updateTeam(id: string, input: UpdateTeamInput) {
    const team = await this.prisma.team.findUnique({ where: { id } });
    if (!team) throw errors.notFound('TEAM_NOT_FOUND', 'Team not found.');

    await this.prisma.$transaction(async (tx) => {
      await tx.team.update({
        where: { id },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.description !== undefined ? { description: input.description } : {}),
          ...(input.email !== undefined ? { email: input.email } : {}),
          ...(input.leadId !== undefined ? { leadId: input.leadId } : {}),
          ...(input.managerId !== undefined ? { managerId: input.managerId } : {}),
          ...(input.archived !== undefined
            ? { archivedAt: input.archived ? new Date() : null }
            : {}),
        },
      });
      await this.audit.record(tx, {
        action: 'team.updated',
        entityType: 'team',
        entityId: id,
        before: { name: team.name, description: team.description, leadId: team.leadId },
        after: input as Record<string, unknown>,
      });
    });
    return this.getTeam(id);
  }

  async deleteTeam(id: string) {
    const team = await this.prisma.team.findUnique({
      where: { id },
      include: { _count: { select: { tickets: true } } },
    });
    if (!team) throw errors.notFound('TEAM_NOT_FOUND', 'Team not found.');
    if (team._count.tickets > 0) {
      throw errors.conflict('TEAM_HAS_TICKETS', 'This team has tickets. Archive it instead.');
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.team.delete({ where: { id } });
      await this.audit.record(tx, {
        action: 'team.deleted',
        entityType: 'team',
        entityId: id,
        before: { name: team.name },
      });
    });
  }

  async setTeamMembers(id: string, input: SetTeamMembersInput) {
    const team = await this.prisma.team.findUnique({
      where: { id },
      include: { members: true },
    });
    if (!team) throw errors.notFound('TEAM_NOT_FOUND', 'Team not found.');

    const userCount = await this.prisma.user.count({ where: { id: { in: input.userIds } } });
    if (userCount !== input.userIds.length) {
      throw errors.businessRule('VALIDATION_FAILED', 'One or more users are invalid.');
    }

    const before = team.members.map((member) => member.userId);
    await this.prisma.$transaction(async (tx) => {
      await tx.teamMember.deleteMany({ where: { teamId: id, userId: { notIn: input.userIds } } });
      await tx.teamMember.createMany({
        data: input.userIds.map((userId) => ({ teamId: id, userId })),
        skipDuplicates: true,
      });
      if (input.leadId !== undefined) {
        await tx.team.update({ where: { id }, data: { leadId: input.leadId } });
      }
      await this.audit.record(tx, {
        action: 'team.members_changed',
        entityType: 'team',
        entityId: id,
        before: { members: before },
        after: { members: input.userIds },
      });
    });
    return this.getTeam(id);
  }
}
