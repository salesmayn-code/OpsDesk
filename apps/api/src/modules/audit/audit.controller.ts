import { Controller, Get, Query } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';

/** Read-only, append-only audit search (AUD-4). Cursor by id works because ids are UUIDv7. */
@Controller('audit-logs')
export class AuditController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @RequirePermissions('audit:view')
  async list(
    @Query('actorId') actorId?: string,
    @Query('action') action?: string,
    @Query('entityType') entityType?: string,
    @Query('entityId') entityId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    const take = Math.min(100, Math.max(1, Number(limit) || 50));
    const where: Prisma.AuditLogWhereInput = {
      ...(actorId ? { actorId } : {}),
      ...(action ? { action: { contains: action } } : {}),
      ...(entityType ? { entityType } : {}),
      ...(entityId ? { entityId } : {}),
      ...(from || to
        ? {
            createdAt: {
              ...(from ? { gte: new Date(from) } : {}),
              ...(to ? { lte: new Date(to) } : {}),
            },
          }
        : {}),
      ...(cursor ? { id: { lt: cursor } } : {}),
    };

    const rows = await this.prisma.auditLog.findMany({
      where,
      orderBy: { id: 'desc' },
      take: take + 1,
    });
    const hasMore = rows.length > take;
    const page = hasMore ? rows.slice(0, take) : rows;

    return {
      data: page.map((row) => ({
        id: row.id,
        actorId: row.actorId,
        actorEmail: row.actorEmail,
        action: row.action,
        entityType: row.entityType,
        entityId: row.entityId,
        entityKey: row.entityKey,
        before: row.before,
        after: row.after,
        metadata: row.metadata,
        requestId: row.requestId,
        ip: row.ip,
        userAgent: row.userAgent,
        createdAt: row.createdAt.toISOString(),
      })),
      meta: { nextCursor: hasMore ? (page.at(-1)?.id ?? null) : null },
    };
  }
}
