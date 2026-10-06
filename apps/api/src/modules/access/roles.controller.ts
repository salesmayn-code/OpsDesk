import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Put,
  UnprocessableEntityException,
} from '@nestjs/common';
import { updateRolePermissionsSchema, type PermissionKey } from '@opsdesk/contracts';
import { createZodDto } from 'nestjs-zod';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { PermissionService } from './permission.service';

class UpdateRolePermissionsDto extends createZodDto(updateRolePermissionsSchema) {}

@Controller()
export class RolesController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly permissionService: PermissionService,
  ) {}

  @Get('roles')
  @RequirePermissions('role:manage')
  async listRoles() {
    const roles = await this.prisma.role.findMany({
      include: { permissions: { include: { permission: { select: { key: true } } } } },
      orderBy: { key: 'asc' },
    });
    return {
      data: roles.map((role) => ({
        id: role.id,
        key: role.key,
        name: role.name,
        description: role.description,
        isSystem: role.isSystem,
        permissions: role.permissions.map((rp) => rp.permission.key),
      })),
    };
  }

  @Get('permissions')
  @RequirePermissions('role:manage')
  async listPermissions() {
    const permissions = await this.prisma.permission.findMany({ orderBy: { key: 'asc' } });
    return { data: permissions };
  }

  @Put('roles/:id/permissions')
  @RequirePermissions('role:manage')
  async updateRolePermissions(
    @Param('id') roleId: string,
    @Body() body: UpdateRolePermissionsDto,
  ) {
    const role = await this.prisma.role.findUnique({
      where: { id: roleId },
      include: { permissions: { include: { permission: { select: { key: true } } } } },
    });
    if (!role) throw new NotFoundException('Role not found.');

    const permissions = await this.prisma.permission.findMany({
      where: { key: { in: body.permissionKeys } },
    });
    if (permissions.length !== body.permissionKeys.length) {
      throw new UnprocessableEntityException('One or more permission keys are invalid.');
    }

    const before = role.permissions.map((rp) => rp.permission.key);
    await this.prisma.$transaction(async (tx) => {
      await tx.rolePermission.deleteMany({ where: { roleId } });
      await tx.rolePermission.createMany({
        data: permissions.map((permission) => ({
          roleId,
          permissionId: permission.id,
        })),
        skipDuplicates: true,
      });
      await this.audit.record(tx, {
        action: 'role.permissions_changed',
        entityType: 'role',
        entityId: roleId,
        before: { permissions: before },
        after: { permissions: body.permissionKeys },
      });
    });

    this.permissionService.invalidateAll();
    return { data: { id: roleId, permissions: body.permissionKeys as PermissionKey[] } };
  }
}
