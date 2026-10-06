import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { AssetQuery, AssetStatus, WarrantyState } from '@opsdesk/contracts';
import { PrismaService } from '../../infra/prisma/prisma.service';
import type { AuthUser } from '../../common/auth-user';

const DAY_MS = 24 * 60 * 60 * 1000;
const EXPIRING_WINDOW_DAYS = 30;

export const ASSET_SORT_FIELDS = ['createdAt', 'updatedAt', 'name', 'tag', 'warrantyExpiry'] as const;

export function assetLookup(idOrTag: string): Prisma.AssetWhereUniqueInput {
  return /^[A-Za-z]{2,6}-\d+$/.test(idOrTag) ? { tag: idOrTag.toUpperCase() } : { id: idOrTag };
}

export function warrantyState(expiry: Date | null, now = new Date()): WarrantyState | null {
  if (!expiry) return null;
  if (expiry.getTime() < now.getTime()) return 'expired';
  if (expiry.getTime() <= now.getTime() + EXPIRING_WINDOW_DAYS * DAY_MS) return 'expiring';
  return 'active';
}

const SUMMARY_INCLUDE = {
  type: { select: { id: true, name: true, tagPrefix: true } },
  currentAssignee: { select: { id: true, firstName: true, lastName: true, email: true } },
} satisfies Prisma.AssetInclude;

export type AssetSummaryRow = Prisma.AssetGetPayload<{ include: typeof SUMMARY_INCLUDE }>;

@Injectable()
export class AssetsRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Employees only ever query their own assets (asset:view). */
  buildScope(user: AuthUser): Prisma.AssetWhereInput | undefined {
    if (user.permissions.includes('asset:view_all') || user.roleKeys.includes('ADMIN')) {
      return undefined;
    }
    return { currentAssigneeId: user.id };
  }

  buildWhere(query: AssetQuery, scope: Prisma.AssetWhereInput | undefined): Prisma.AssetWhereInput {
    const conditions: Prisma.AssetWhereInput[] = [];
    if (scope) conditions.push(scope);
    if (query.q) {
      conditions.push({
        OR: [
          { name: { contains: query.q, mode: 'insensitive' } },
          { serialNumber: { contains: query.q, mode: 'insensitive' } },
          { tag: { equals: query.q.toUpperCase() } },
        ],
      });
    }
    if (query.typeId) conditions.push({ typeId: query.typeId });
    if (query.status?.length) conditions.push({ status: { in: query.status as AssetStatus[] } });
    if (query.departmentId) conditions.push({ departmentId: query.departmentId });
    if (query.assignedUserId) conditions.push({ currentAssigneeId: query.assignedUserId });
    if (query.locationId) conditions.push({ locationId: query.locationId });

    const now = new Date();
    if (query.warranty === 'active') {
      conditions.push({ warrantyExpiry: { gt: new Date(now.getTime() + EXPIRING_WINDOW_DAYS * DAY_MS) } });
    } else if (query.warranty === 'expiring') {
      conditions.push({
        warrantyExpiry: {
          gte: now,
          lte: new Date(now.getTime() + EXPIRING_WINDOW_DAYS * DAY_MS),
        },
      });
    } else if (query.warranty === 'expired') {
      conditions.push({ warrantyExpiry: { lt: now } });
    }

    return conditions.length > 0 ? { AND: conditions } : {};
  }

  list(
    where: Prisma.AssetWhereInput,
    orderBy: Prisma.AssetOrderByWithRelationInput[],
    skip: number,
    take: number,
  ) {
    return this.prisma.$transaction([
      this.prisma.asset.count({ where }),
      this.prisma.asset.findMany({ where, orderBy, skip, take, include: SUMMARY_INCLUDE }),
    ]);
  }

  findDetail(idOrTag: string) {
    return this.prisma.asset.findUnique({
      where: assetLookup(idOrTag),
      include: {
        ...SUMMARY_INCLUDE,
        location: { select: { id: true, name: true } },
        vendor: { select: { id: true, name: true } },
        assignments: {
          orderBy: { assignedAt: 'desc' },
          include: { user: { select: { id: true, firstName: true, lastName: true } } },
        },
      },
    });
  }
}

export type AssetDetailRow = Prisma.AssetGetPayload<{
  include: {
    type: { select: { id: true; name: true; tagPrefix: true } };
    currentAssignee: { select: { id: true; firstName: true; lastName: true; email: true } };
    location: { select: { id: true; name: true } };
    vendor: { select: { id: true; name: true } };
    assignments: {
      include: { user: { select: { id: true; firstName: true; lastName: true } } };
    };
  };
}>;
