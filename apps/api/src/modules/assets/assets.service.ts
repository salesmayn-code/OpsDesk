import { Injectable } from '@nestjs/common';
import type { AssetEventType, Prisma } from '@prisma/client';
import type {
  AssetQuery,
  AssetStatus,
  AssignAssetInput,
  CreateAssetInput,
  UnassignAssetInput,
  UpdateAssetInput,
  AssetTransitionInput,
} from '@opsdesk/contracts';
import { DomainError, errors } from '../../common/errors';
import { uuidv7 } from '../../common/id';
import { pageMeta, parseSort, skip } from '../../common/pagination';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { TicketsRepository } from '../tickets/tickets.repository';
import type { AuthUser } from '../../common/auth-user';
import { canAssetTransition } from './domain/asset-state-machine';
import {
  ASSET_SORT_FIELDS,
  AssetsRepository,
  warrantyState,
  type AssetDetailRow,
  type AssetSummaryRow,
} from './assets.repository';

const TRANSITION_EVENT: Partial<Record<AssetStatus, AssetEventType>> = {
  IN_STOCK: 'RECEIVED',
  IN_REPAIR: 'SENT_TO_REPAIR',
  LOST: 'MARKED_LOST',
  RETIRED: 'RETIRED',
  DISPOSED: 'DISPOSED',
};

@Injectable()
export class AssetsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly repository: AssetsRepository,
    private readonly audit: AuditService,
    private readonly ticketsRepository: TicketsRepository,
  ) {}

  // ───────── Queries ─────────

  async list(query: AssetQuery, actor: AuthUser) {
    const scope = this.repository.buildScope(actor);
    const where = this.repository.buildWhere(query, scope);
    const orderBy = (parseSort(query.sort, ASSET_SORT_FIELDS) ?? [
      { createdAt: 'desc' },
    ]) as Prisma.AssetOrderByWithRelationInput[];
    const [total, rows] = await this.repository.list(
      where,
      orderBy,
      skip(query.page, query.pageSize),
      query.pageSize,
    );
    return {
      data: rows.map((row) => this.toSummary(row)),
      meta: pageMeta(query.page, query.pageSize, total),
    };
  }

  async getDetail(idOrTag: string, actor: AuthUser) {
    const asset = await this.loadVisible(idOrTag, actor);
    const can = {
      update: actor.permissions.includes('asset:update'),
      assign: actor.permissions.includes('asset:assign'),
      retire: actor.permissions.includes('asset:retire'),
      dispose: actor.permissions.includes('asset:dispose'),
    };
    const allowedTransitions = (['IN_STOCK', 'IN_REPAIR', 'LOST', 'RETIRED', 'DISPOSED', 'ASSIGNED'] as AssetStatus[])
      .filter((to) => canAssetTransition(asset.status, to, { permissions: actor.permissions }).ok)
      .filter((to) => (to === 'ASSIGNED' ? asset.currentAssigneeId !== null : true));

    return {
      data: {
        ...this.toSummary(asset),
        location: asset.location ? { id: asset.location.id, name: asset.location.name } : null,
        vendor: asset.vendor ? { id: asset.vendor.id, name: asset.vendor.name } : null,
        notes: asset.notes,
        disposalMethod: asset.disposalMethod,
        purchaseCost: asset.purchaseCost?.toString() ?? null,
        assignments: asset.assignments.map((assignment) => ({
          id: assignment.id,
          user: {
            id: assignment.user.id,
            firstName: assignment.user.firstName,
            lastName: assignment.user.lastName,
          },
          assignedAt: assignment.assignedAt.toISOString(),
          returnedAt: assignment.returnedAt?.toISOString() ?? null,
          returnCondition: assignment.returnCondition,
          note: assignment.note,
        })),
        can,
        allowedTransitions,
      },
    };
  }

  async history(idOrTag: string, actor: AuthUser) {
    const asset = await this.loadVisible(idOrTag, actor);
    const events = await this.prisma.assetEvent.findMany({
      where: { assetId: asset.id },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    const actorIds = [
      ...new Set(events.map((event) => event.actorId).filter((id): id is string => id !== null)),
    ];
    const actors = await this.prisma.user.findMany({
      where: { id: { in: actorIds } },
      select: { id: true, firstName: true, lastName: true },
    });
    const byId = new Map(actors.map((user) => [user.id, user]));
    return {
      data: events.map((event) => ({
        id: event.id,
        type: event.type,
        actor: event.actorId ? (byId.get(event.actorId) ?? null) : null,
        fromValue: event.fromValue,
        toValue: event.toValue,
        metadata: event.metadata,
        createdAt: event.createdAt.toISOString(),
      })),
    };
  }

  async tickets(idOrTag: string, actor: AuthUser) {
    const asset = await this.loadVisible(idOrTag, actor);
    const scope = this.ticketsRepository.buildScope(actor);
    const rows = await this.prisma.ticket.findMany({
      where: { assetId: asset.id, ...(scope ? { AND: [scope] } : {}) },
      select: {
        id: true,
        key: true,
        title: true,
        status: true,
        priority: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return {
      data: rows.map((row) => ({
        id: row.id,
        key: row.key,
        title: row.title,
        status: row.status,
        priority: row.priority,
        createdAt: row.createdAt.toISOString(),
      })),
    };
  }

  async myAssets(actor: AuthUser) {
    const assets = await this.prisma.asset.findMany({
      where: { currentAssigneeId: actor.id, status: 'ASSIGNED' },
      include: {
        type: { select: { id: true, name: true, tagPrefix: true } },
        currentAssignee: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
      orderBy: { name: 'asc' },
    });
    return { data: assets.map((asset) => this.toSummary(asset)) };
  }

  // ───────── Commands ─────────

  async create(input: CreateAssetInput, actor: AuthUser) {
    const type = await this.prisma.assetType.findUnique({ where: { id: input.typeId } });
    if (!type || !type.isActive) {
      throw errors.notFound('NOT_FOUND', 'Asset type not found.');
    }
    const id = uuidv7();
    await this.prisma.$transaction(async (tx) => {
      const tag = input.tag?.toUpperCase() ?? (await this.nextTag(tx, type.id, type.tagPrefix));
      await tx.asset.create({
        data: {
          id,
          tag,
          typeId: type.id,
          name: input.name,
          manufacturer: input.manufacturer ?? null,
          model: input.model ?? null,
          serialNumber: input.serialNumber ?? null,
          purchaseDate: input.purchaseDate ? new Date(input.purchaseDate) : null,
          purchaseCost: input.purchaseCost ?? null,
          warrantyExpiry: input.warrantyExpiry ? new Date(input.warrantyExpiry) : null,
          vendorId: input.vendorId ?? null,
          locationId: input.locationId ?? null,
          departmentId: input.departmentId ?? null,
          notes: input.notes ?? null,
        },
      });
      await tx.assetEvent.create({
        data: { id: uuidv7(), assetId: id, actorId: actor.id, type: 'CREATED', toValue: 'PROCURED' },
      });
      await this.audit.record(tx, {
        action: 'asset.created',
        entityType: 'asset',
        entityId: id,
        entityKey: tag,
        after: { name: input.name, typeId: type.id, tag },
      });
    });
    return this.getDetail(id, actor);
  }

  async update(idOrTag: string, input: UpdateAssetInput, actor: AuthUser) {
    const asset = await this.loadVisible(idOrTag, actor);
    if (asset.version !== input.version) throw this.stale();

    const data: Prisma.AssetUncheckedUpdateInput = { version: { increment: 1 } };
    const changes: Record<string, unknown> = {};
    const fields = [
      'name',
      'manufacturer',
      'model',
      'serialNumber',
      'notes',
      'vendorId',
      'locationId',
      'departmentId',
    ] as const;
    for (const field of fields) {
      if (input[field] !== undefined) {
        (data as Record<string, unknown>)[field] = input[field];
        changes[field] = input[field];
      }
    }
    if (input.purchaseDate !== undefined) {
      data.purchaseDate = input.purchaseDate ? new Date(input.purchaseDate) : null;
      changes.purchaseDate = input.purchaseDate;
    }
    if (input.purchaseCost !== undefined) {
      data.purchaseCost = input.purchaseCost;
      changes.purchaseCost = input.purchaseCost;
    }
    if (input.warrantyExpiry !== undefined) {
      data.warrantyExpiry = input.warrantyExpiry ? new Date(input.warrantyExpiry) : null;
      changes.warrantyExpiry = input.warrantyExpiry;
    }

    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.asset.updateMany({
        where: { id: asset.id, version: input.version },
        data,
      });
      if (updated.count === 0) throw this.stale();
      await tx.assetEvent.create({
        data: {
          id: uuidv7(),
          assetId: asset.id,
          actorId: actor.id,
          type: 'UPDATED',
          metadata: changes as Prisma.InputJsonValue,
        },
      });
      await this.audit.record(tx, {
        action: 'asset.updated',
        entityType: 'asset',
        entityId: asset.id,
        entityKey: asset.tag,
        before: { name: asset.name, serialNumber: asset.serialNumber },
        after: changes,
      });
    });
    return this.getDetail(asset.id, actor);
  }

  async assign(idOrTag: string, input: AssignAssetInput, actor: AuthUser) {
    const asset = await this.loadVisible(idOrTag, actor);
    if (!['IN_STOCK', 'ASSIGNED', 'IN_REPAIR'].includes(asset.status)) {
      throw errors.businessRule(
        'ASSET_NOT_ASSIGNABLE',
        'Only received assets (in stock, assigned, or in repair) can be assigned.',
      );
    }
    if (asset.version !== input.version) throw this.stale();

    const user = await this.prisma.user.findUnique({ where: { id: input.userId } });
    if (!user || user.status !== 'ACTIVE') {
      throw errors.businessRule('VALIDATION_FAILED', 'Assets can only be assigned to active users.');
    }

    const wasAssigned = asset.currentAssigneeId !== null;
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.assetAssignment.updateMany({
        where: { assetId: asset.id, returnedAt: null },
        data: { returnedAt: now, returnedById: actor.id, returnCondition: 'REASSIGNED' },
      });
      await tx.assetAssignment.create({
        data: {
          id: uuidv7(),
          assetId: asset.id,
          userId: input.userId,
          assignedById: actor.id,
          note: input.note ?? null,
        },
      });
      const updated = await tx.asset.updateMany({
        where: { id: asset.id, version: input.version },
        data: { status: 'ASSIGNED', currentAssigneeId: input.userId, version: { increment: 1 } },
      });
      if (updated.count === 0) throw this.stale();
      await tx.assetEvent.create({
        data: {
          id: uuidv7(),
          assetId: asset.id,
          actorId: actor.id,
          type: wasAssigned ? 'REASSIGNED' : 'ASSIGNED',
          fromValue: asset.currentAssigneeId,
          toValue: input.userId,
          metadata: { userId: input.userId, note: input.note ?? null },
        },
      });
      await this.audit.record(tx, {
        action: wasAssigned ? 'asset.reassigned' : 'asset.assigned',
        entityType: 'asset',
        entityId: asset.id,
        entityKey: asset.tag,
        before: { currentAssigneeId: asset.currentAssigneeId, status: asset.status },
        after: { currentAssigneeId: input.userId, status: 'ASSIGNED' },
      });
      await tx.outboxEvent.create({
        data: {
          id: uuidv7(),
          type: 'asset.assigned',
          aggregateType: 'asset',
          aggregateId: asset.id,
          payload: {
            assetId: asset.id,
            tag: asset.tag,
            userId: input.userId,
            previousUserId: asset.currentAssigneeId,
          },
        },
      });
    });
    return this.getDetail(asset.id, actor);
  }

  async unassign(idOrTag: string, input: UnassignAssetInput, actor: AuthUser) {
    const asset = await this.loadVisible(idOrTag, actor);
    if (!asset.currentAssigneeId) {
      throw errors.businessRule('VALIDATION_FAILED', 'This asset is not currently assigned.');
    }
    if (asset.version !== input.version) throw this.stale();

    const previousUserId = asset.currentAssigneeId;
    const now = new Date();
    const nextStatus: AssetStatus = asset.status === 'IN_REPAIR' ? 'IN_REPAIR' : 'IN_STOCK';

    await this.prisma.$transaction(async (tx) => {
      await tx.assetAssignment.updateMany({
        where: { assetId: asset.id, returnedAt: null },
        data: {
          returnedAt: now,
          returnedById: actor.id,
          returnCondition: input.condition ?? null,
          note: input.note ?? null,
        },
      });
      const updated = await tx.asset.updateMany({
        where: { id: asset.id, version: input.version },
        data: { currentAssigneeId: null, status: nextStatus, version: { increment: 1 } },
      });
      if (updated.count === 0) throw this.stale();
      await tx.assetEvent.create({
        data: {
          id: uuidv7(),
          assetId: asset.id,
          actorId: actor.id,
          type: 'UNASSIGNED',
          fromValue: previousUserId,
          metadata: { note: input.note ?? null, condition: input.condition ?? null },
        },
      });
      await this.audit.record(tx, {
        action: 'asset.unassigned',
        entityType: 'asset',
        entityId: asset.id,
        entityKey: asset.tag,
        before: { currentAssigneeId: previousUserId, status: asset.status },
        after: { currentAssigneeId: null, status: nextStatus },
      });
    });
    return this.getDetail(asset.id, actor);
  }

  async transition(idOrTag: string, input: AssetTransitionInput, actor: AuthUser) {
    const asset = await this.loadVisible(idOrTag, actor);
    if (asset.version !== input.version) throw this.stale();

    const decision = canAssetTransition(asset.status, input.to, {
      permissions: actor.permissions,
    });
    if (!decision.ok) {
      if (decision.code === 'FORBIDDEN') throw errors.forbidden();
      throw errors.businessRule(
        'ASSET_INVALID_TRANSITION',
        `Asset cannot move from ${asset.status} to ${input.to}.`,
      );
    }
    const { rule } = decision;
    if (rule.requiresNote && !input.note?.trim()) {
      throw errors.businessRule('VALIDATION_FAILED', 'A note is required for this transition.');
    }
    if (rule.requiresDisposalMethod && !input.disposalMethod?.trim()) {
      throw errors.businessRule('VALIDATION_FAILED', 'A disposal method is required.');
    }
    if (input.to === 'RETIRED' && asset.currentAssigneeId) {
      throw errors.businessRule(
        'ASSET_IN_USE',
        'Return the asset before retiring it.',
      );
    }
    if (input.to === 'ASSIGNED' && !asset.currentAssigneeId) {
      throw errors.businessRule(
        'VALIDATION_FAILED',
        'Use assign to attach a user before marking this asset assigned.',
      );
    }

    const now = new Date();
    const eventType = this.eventFor(asset.status, input.to);
    await this.prisma.$transaction(async (tx) => {
      if (rule.closeAssignment && asset.currentAssigneeId) {
        await tx.assetAssignment.updateMany({
          where: { assetId: asset.id, returnedAt: null },
          data: { returnedAt: now, returnedById: actor.id, note: input.note ?? null },
        });
      }
      const updated = await tx.asset.updateMany({
        where: { id: asset.id, version: input.version },
        data: {
          status: input.to,
          ...(rule.closeAssignment ? { currentAssigneeId: null } : {}),
          ...(input.to === 'DISPOSED'
            ? { disposalMethod: input.disposalMethod ?? asset.disposalMethod }
            : {}),
          version: { increment: 1 },
        },
      });
      if (updated.count === 0) throw this.stale();
      await tx.assetEvent.create({
        data: {
          id: uuidv7(),
          assetId: asset.id,
          actorId: actor.id,
          type: eventType,
          fromValue: asset.status,
          toValue: input.to,
          metadata: { note: input.note ?? null },
        },
      });
      await this.audit.record(tx, {
        action: 'asset.status_changed',
        entityType: 'asset',
        entityId: asset.id,
        entityKey: asset.tag,
        before: { status: asset.status },
        after: { status: input.to },
        metadata: input.note ? { note: input.note } : undefined,
      });
      await tx.outboxEvent.create({
        data: {
          id: uuidv7(),
          type: 'asset.status_changed',
          aggregateType: 'asset',
          aggregateId: asset.id,
          payload: { assetId: asset.id, tag: asset.tag, from: asset.status, to: input.to },
        },
      });
    });
    return this.getDetail(asset.id, actor);
  }

  // ───────── Helpers ─────────

  async loadVisible(idOrTag: string, actor: AuthUser): Promise<AssetDetailRow> {
    const asset = await this.repository.findDetail(idOrTag);
    const scope = this.repository.buildScope(actor);
    const visible =
      asset &&
      (!scope || asset.currentAssigneeId === actor.id) &&
      actor.permissions.includes('asset:view');
    if (!asset || !visible) {
      throw errors.notFound('ASSET_NOT_FOUND', 'Asset not found or you do not have access.');
    }
    return asset;
  }

  private eventFor(from: AssetStatus, to: AssetStatus): AssetEventType {
    if (from === 'IN_REPAIR' && to === 'IN_STOCK') return 'RETURNED_FROM_REPAIR';
    if (from === 'LOST' && to === 'IN_STOCK') return 'FOUND';
    return TRANSITION_EVENT[to] ?? 'UPDATED';
  }

  private toSummary(asset: AssetSummaryRow | AssetDetailRow) {
    return {
      id: asset.id,
      tag: asset.tag,
      name: asset.name,
      type: { id: asset.type.id, name: asset.type.name, tagPrefix: asset.type.tagPrefix },
      status: asset.status,
      manufacturer: asset.manufacturer,
      model: asset.model,
      serialNumber: asset.serialNumber,
      purchaseDate: asset.purchaseDate?.toISOString().slice(0, 10) ?? null,
      purchaseCost: asset.purchaseCost?.toString() ?? null,
      warrantyExpiry: asset.warrantyExpiry?.toISOString().slice(0, 10) ?? null,
      warrantyState: warrantyState(asset.warrantyExpiry),
      locationId: asset.locationId,
      departmentId: asset.departmentId,
      currentAssignee: asset.currentAssignee
        ? {
            id: asset.currentAssignee.id,
            firstName: asset.currentAssignee.firstName,
            lastName: asset.currentAssignee.lastName,
            email: asset.currentAssignee.email,
          }
        : null,
      version: asset.version,
      createdAt: asset.createdAt.toISOString(),
      updatedAt: asset.updatedAt.toISOString(),
    };
  }

  private stale(): DomainError {
    return new DomainError(
      'CONFLICT_STALE_VERSION',
      409,
      'This asset was updated by someone else. Reload to see the latest version.',
      [{ field: 'version', issue: 'stale' }],
    );
  }

  /** Per-type tag counter with row lock (Backend Schema §5). */
  private async nextTag(
    tx: Prisma.TransactionClient,
    typeId: string,
    prefix: string,
  ): Promise<string> {
    await tx.$executeRaw`INSERT INTO asset_tag_counters (type_id, last) VALUES (${typeId}::uuid, 0) ON CONFLICT (type_id) DO NOTHING`;
    const rows = await tx.$queryRaw<Array<{ last: number }>>`SELECT last FROM asset_tag_counters WHERE type_id = ${typeId}::uuid FOR UPDATE`;
    const next = Number(rows[0]!.last) + 1;
    await tx.$executeRaw`UPDATE asset_tag_counters SET last = ${next} WHERE type_id = ${typeId}::uuid`;
    return `${prefix}-${String(next).padStart(5, '0')}`;
  }
}
