import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type {
  AssignTicketInput,
  CreateTicketInput,
  TicketDetail,
  TicketEventType,
  TicketQuery,
  TicketSummary,
  TransitionTicketInput,
  UpdateTicketInput,
} from '@opsdesk/contracts';
import { DomainError, errors } from '../../common/errors';
import { uuidv7 } from '../../common/id';
import { pageMeta, parseSort, skip } from '../../common/pagination';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { AuthUser } from '../../common/auth-user';
import {
  canTransition,
  allowedTransitions,
  type TransitionContext,
} from './domain/ticket-state-machine';
import { canViewTicket, isAdminOverride } from './tickets.policy';
import { SlaService } from '../sla/sla.service';
import {
  TICKET_SORT_FIELDS,
  TicketsRepository,
  type TicketDetailRow,
  type TicketSummaryRow,
} from './tickets.repository';

const REOPEN_WINDOW_DEFAULT_DAYS = 7;

function iso(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}

function userRef(user: { id: string; firstName: string; lastName: string; email: string }) {
  return { id: user.id, firstName: user.firstName, lastName: user.lastName, email: user.email };
}

@Injectable()
export class TicketsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly repository: TicketsRepository,
    private readonly audit: AuditService,
    private readonly sla: SlaService,
  ) {}

  // ───────── Queries ─────────

  async list(query: TicketQuery, actor: AuthUser) {
    const scope = this.repository.buildScope(actor);
    const where = this.repository.buildWhere(query, scope, actor);
    const orderBy = (parseSort(query.sort, TICKET_SORT_FIELDS) ?? [
      { updatedAt: 'desc' },
    ]) as Prisma.TicketOrderByWithRelationInput[];
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

  async getDetail(idOrKey: string, actor: AuthUser): Promise<TicketDetail> {
    const ticket = await this.loadVisible(idOrKey, actor);
    const windowDays = await this.reopenWindowDays();
    const ctx = this.transitionContext(ticket, actor, windowDays);

    const can = {
      triage: actor.permissions.includes('ticket:triage'),
      assign: actor.permissions.includes('ticket:assign'),
      reassign: actor.permissions.includes('ticket:reassign'),
      resolve: actor.permissions.includes('ticket:resolve'),
      close: actor.permissions.includes('ticket:close') || ctx.isRequester,
      cancel:
        actor.permissions.includes('ticket:cancel') ||
        (ctx.isRequester && ticket.status === 'NEW'),
      reopen:
        actor.permissions.includes('ticket:reopen') ||
        (ctx.isRequester && this.withinReopenWindow(ticket.resolvedAt, windowDays)),
      update: actor.permissions.includes('ticket:update') || isAdminOverride(actor),
      comment_internal: actor.permissions.includes('ticket:view_internal'),
    };

    return {
      id: ticket.id,
      key: ticket.key,
      title: ticket.title,
      description: ticket.description,
      type: ticket.type,
      status: ticket.status,
      priority: ticket.priority,
      requestedPriority: ticket.requestedPriority,
      categoryId: ticket.categoryId,
      subcategoryId: ticket.subcategoryId,
      requester: userRef(ticket.requester),
      assignee: ticket.assignee ? userRef(ticket.assignee) : null,
      team: ticket.team ? { id: ticket.team.id, name: ticket.team.name } : null,
      asset: ticket.asset
        ? { id: ticket.asset.id, tag: ticket.asset.tag, name: ticket.asset.name, status: ticket.asset.status }
        : null,
      incident: ticket.incidentLink
        ? {
            id: ticket.incidentLink.incident.id,
            key: ticket.incidentLink.incident.key,
            title: ticket.incidentLink.incident.title,
            status: ticket.incidentLink.incident.status,
            severity: ticket.incidentLink.incident.severity,
          }
        : null,
      assetId: ticket.assetId,
      createdById: ticket.createdById,
      departmentId: ticket.departmentId,
      slaPolicyId: ticket.slaPolicyId,
      resolutionCodeId: ticket.resolutionCodeId,
      resolutionSummary: ticket.resolutionSummary,
      reopenCount: ticket.reopenCount,
      firstResponseAt: iso(ticket.firstResponseAt),
      dueAt: iso(ticket.dueAt),
      resolvedAt: iso(ticket.resolvedAt),
      closedAt: iso(ticket.closedAt),
      cancelledAt: iso(ticket.cancelledAt),
      slaState: ticket.slaState,
      version: ticket.version,
      createdAt: ticket.createdAt.toISOString(),
      updatedAt: ticket.updatedAt.toISOString(),
      can,
      allowedTransitions: allowedTransitions(ticket.status, ctx),
      slaTimers: ticket.slaTimers.map((timer) => ({
        id: timer.id,
        ticketId: timer.ticketId,
        kind: timer.kind,
        state: timer.state,
        targetMinutes: timer.targetMinutes,
        startedAt: timer.startedAt.toISOString(),
        dueAt: timer.dueAt.toISOString(),
        warnAt: timer.warnAt.toISOString(),
        escalateAt: timer.escalateAt.toISOString(),
        pausedAt: iso(timer.pausedAt),
        pausedMinutes: timer.pausedMinutes,
        warnedAt: iso(timer.warnedAt),
        escalatedAt: iso(timer.escalatedAt),
        breachedAt: iso(timer.breachedAt),
        completedAt: iso(timer.completedAt),
        cancelledAt: iso(timer.cancelledAt),
        isCurrent: timer.isCurrent,
      })),
    };
  }

  async getAllowedTransitions(idOrKey: string, actor: AuthUser) {
    const detail = await this.getDetail(idOrKey, actor);
    return { data: detail.allowedTransitions ?? [] };
  }

  async history(idOrKey: string, actor: AuthUser) {
    const ticket = await this.loadVisible(idOrKey, actor);
    const includeInternal = actor.permissions.includes('ticket:view_internal');
    const events = await this.prisma.ticketEvent.findMany({
      where: { ticketId: ticket.id, ...(includeInternal ? {} : { isInternal: false }) },
      orderBy: { createdAt: 'asc' },
      take: 500,
    });
    const actorIds = [...new Set(events.map((event) => event.actorId).filter((id): id is string => id !== null))];
    const actors = await this.prisma.user.findMany({
      where: { id: { in: actorIds } },
      select: { id: true, firstName: true, lastName: true, email: true },
    });
    const actorById = new Map(actors.map((user) => [user.id, user]));
    return {
      data: events.map((event) => ({
        id: event.id,
        ticketId: event.ticketId,
        actor: event.actorId ? (actorById.get(event.actorId) ?? null) : null,
        type: event.type,
        fromValue: event.fromValue,
        toValue: event.toValue,
        metadata: event.metadata,
        isInternal: event.isInternal,
        createdAt: event.createdAt.toISOString(),
      })),
    };
  }

  // ───────── Commands ─────────

  async create(input: CreateTicketInput, actor: AuthUser): Promise<TicketDetail> {
    const onBehalf = input.requesterId !== undefined && input.requesterId !== actor.id;
    if (onBehalf && !actor.permissions.includes('ticket:view_team')) {
      throw errors.forbidden('Only support staff can create tickets on behalf of others.');
    }
    const requesterId = input.requesterId ?? actor.id;
    const requester = await this.prisma.user.findUnique({
      where: { id: requesterId },
      select: { id: true, departmentId: true },
    });
    if (!requester) throw errors.notFound('USER_NOT_FOUND', 'Requester not found.');

    let teamId = input.teamId ?? null;
    if (input.categoryId) {
      const category = await this.prisma.category.findUnique({ where: { id: input.categoryId } });
      if (!category) throw errors.notFound('CATEGORY_NOT_FOUND', 'Category not found.');
      teamId ??= category.defaultTeamId;
    }
    if (input.subcategoryId) {
      const sub = await this.prisma.category.findUnique({ where: { id: input.subcategoryId } });
      if (!sub) throw errors.notFound('CATEGORY_NOT_FOUND', 'Subcategory not found.');
    }
    if (input.assetId) {
      await this.assertAssetLink(input.assetId, requesterId, actor);
    }
    if (input.assigneeId) {
      if (!teamId) {
        throw errors.businessRule('VALIDATION_FAILED', 'Assigning an agent requires a team.');
      }
      await this.assertTeamMember(teamId, input.assigneeId);
    }

    const ticketId = uuidv7();
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      const key = await this.nextTicketKey(tx);
      await tx.ticket.create({
        data: {
          id: ticketId,
          key,
          title: input.title,
          description: input.description,
          type: input.type,
          status: input.assigneeId ? 'ASSIGNED' : 'NEW',
          priority: 'MEDIUM',
          requestedPriority: input.requestedPriority ?? null,
          categoryId: input.categoryId ?? null,
          subcategoryId: input.subcategoryId ?? null,
          requesterId,
          createdById: actor.id,
          assigneeId: input.assigneeId ?? null,
          teamId,
          departmentId: requester.departmentId,
          assetId: input.assetId ?? null,
        },
      });
      await this.appendEvent(tx, ticketId, actor.id, 'CREATED', {
        type: input.type,
      });
      if (input.assetId) {
        await this.appendEvent(tx, ticketId, actor.id, 'ASSET_LINKED', {
          assetId: input.assetId,
        });
      }
      if (input.assigneeId) {
        await this.appendEvent(tx, ticketId, actor.id, 'ASSIGNED', {
          assigneeId: input.assigneeId,
          teamId,
        });
      }
      await this.audit.record(tx, {
        action: 'ticket.created',
        entityType: 'ticket',
        entityId: ticketId,
        entityKey: key,
        after: {
          title: input.title,
          type: input.type,
          teamId,
          assigneeId: input.assigneeId ?? null,
          requesterId,
        },
      });
      await this.emitOutbox(tx, 'ticket.created', ticketId, {
        ticketId,
        key,
        requesterId,
        assigneeId: input.assigneeId ?? null,
        teamId,
      });
      await this.sla.startForTicket(tx, {
        id: ticketId,
        key,
        priority: 'MEDIUM',
        type: input.type,
        categoryId: input.categoryId ?? null,
        createdAt: now,
        slaPolicyId: null,
      });
    });

    return this.getDetail(ticketId, actor);
  }

  async update(idOrKey: string, input: UpdateTicketInput, actor: AuthUser): Promise<TicketDetail> {
    const ticket = await this.loadVisible(idOrKey, actor);
    const terminal = ticket.status === 'CLOSED' || ticket.status === 'CANCELLED';
    if (terminal && !isAdminOverride(actor)) {
      throw errors.businessRule('TICKET_READ_ONLY', 'Closed tickets are read-only.');
    }
    if (ticket.version !== input.version) throw this.stale();

    const data: Prisma.TicketUncheckedUpdateInput = { version: { increment: 1 } };
    const changes: Record<string, unknown> = {};
    if (input.title !== undefined && input.title !== ticket.title) {
      data.title = input.title;
      changes.title = input.title;
    }
    if (input.description !== undefined && input.description !== ticket.description) {
      data.description = input.description;
      changes.description = true;
    }
    if (input.type !== undefined && input.type !== ticket.type) {
      data.type = input.type;
      changes.type = input.type;
    }
    if (input.priority !== undefined && input.priority !== ticket.priority) {
      data.priority = input.priority;
      changes.priority = input.priority;
    }
    if (input.categoryId !== undefined) {
      if (input.categoryId) {
        const category = await this.prisma.category.findUnique({ where: { id: input.categoryId } });
        if (!category) throw errors.notFound('CATEGORY_NOT_FOUND', 'Category not found.');
      }
      data.categoryId = input.categoryId;
      changes.categoryId = input.categoryId;
    }
    if (input.subcategoryId !== undefined) data.subcategoryId = input.subcategoryId;
    if (input.assetId !== undefined) {
      if (input.assetId) await this.assertAssetLink(input.assetId, ticket.requesterId, actor);
      data.assetId = input.assetId;
      changes.assetId = input.assetId;
    }

    const priorityChanged = 'priority' in changes;
    const policyRelevantChange =
      priorityChanged || 'type' in changes || 'categoryId' in changes;
    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.ticket.updateMany({
        where: { id: ticket.id, version: input.version },
        data,
      });
      if (updated.count === 0) throw this.stale();
      await this.appendEvent(tx, ticket.id, actor.id, 'UPDATED', changes);
      if (priorityChanged) {
        await this.appendEvent(tx, ticket.id, actor.id, 'PRIORITY_CHANGED', {
          from: ticket.priority,
          to: input.priority,
        });
      }
      const auditAction = terminal
        ? 'ticket.admin_override'
        : priorityChanged
          ? 'ticket.priority_changed'
          : null;
      if (auditAction) {
        await this.audit.record(tx, {
          action: auditAction,
          entityType: 'ticket',
          entityId: ticket.id,
          entityKey: ticket.key,
          before: {
            priority: ticket.priority,
            categoryId: ticket.categoryId,
            assetId: ticket.assetId,
          },
          after: changes,
        });
      }
      if (policyRelevantChange) {
        const fresh = await tx.ticket.findUniqueOrThrow({ where: { id: ticket.id } });
        await this.sla.recalculateForTicket(tx, fresh);
      }
    });

    return this.getDetail(ticket.id, actor);
  }

  async transition(
    idOrKey: string,
    input: TransitionTicketInput,
    actor: AuthUser,
  ): Promise<TicketDetail> {
    const ticket = await this.loadVisible(idOrKey, actor);
    if (ticket.version !== input.version) throw this.stale();

    const windowDays = await this.reopenWindowDays();
    const ctx = this.transitionContext(ticket, actor, windowDays);
    const decision = canTransition(ticket.status, input.to, ctx);
    if (!decision.ok) {
      if (decision.code === 'FORBIDDEN') throw errors.forbidden();
      throw errors.businessRule(
        decision.code,
        decision.code === 'REOPEN_WINDOW_EXPIRED'
          ? 'The reopen window has passed. Contact IT to reopen this ticket.'
          : `Ticket cannot move from ${ticket.status} to ${input.to}.`,
      );
    }
    const { rule } = decision;

    if (rule.requiresReason && !input.reason?.trim()) {
      throw errors.businessRule('VALIDATION_FAILED', 'A reason is required for this action.');
    }
    if (rule.requiresCategory && !ticket.categoryId) {
      throw errors.businessRule(
        'TICKET_INVALID_TRANSITION',
        'Set a category before triaging this ticket.',
      );
    }
    if (rule.requiresResolution && !input.resolution) {
      throw errors.businessRule(
        'RESOLUTION_REQUIRED',
        'A resolution code and summary are required to resolve.',
      );
    }
    if (rule.requiresPublicComment) {
      const publicComments = await this.repository.countPublicComments(ticket.id);
      if (publicComments === 0) {
        throw errors.businessRule(
          'TICKET_INVALID_TRANSITION',
          'Add a public comment before waiting for the user.',
        );
      }
    }

    let resolutionCodeId: string | null = null;
    if (input.resolution) {
      const code = await this.prisma.resolutionCode.findFirst({
        where: { code: input.resolution.code, isActive: true },
      });
      if (!code) {
        throw errors.businessRule('VALIDATION_FAILED', 'Unknown resolution code.');
      }
      resolutionCodeId = code.id;
    }

    const now = new Date();
    const data: Prisma.TicketUncheckedUpdateInput = {
      status: input.to,
      version: { increment: 1 },
    };
    if (input.to === 'RESOLVED') {
      data.resolvedAt = now;
      data.resolutionCodeId = resolutionCodeId;
      data.resolutionSummary = input.resolution?.summary ?? null;
    } else if (input.to === 'CLOSED') {
      data.closedAt = now;
    } else if (input.to === 'CANCELLED') {
      data.cancelledAt = now;
    } else if (input.to === 'REOPENED') {
      data.resolvedAt = null;
      data.closedAt = null;
      data.reopenCount = { increment: 1 };
    }

    const eventType =
      input.to === 'RESOLVED'
        ? 'RESOLVED'
        : input.to === 'REOPENED'
          ? 'REOPENED'
          : input.to === 'CLOSED'
            ? 'CLOSED'
            : input.to === 'CANCELLED'
              ? 'CANCELLED'
              : 'STATUS_CHANGED';
    const auditAction =
      input.to === 'RESOLVED'
        ? 'ticket.resolved'
        : input.to === 'REOPENED'
          ? 'ticket.reopened'
          : input.to === 'CLOSED'
            ? 'ticket.closed'
            : input.to === 'CANCELLED'
              ? 'ticket.cancelled'
              : 'ticket.status_changed';

    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.ticket.updateMany({
        where: { id: ticket.id, version: input.version },
        data,
      });
      if (updated.count === 0) throw this.stale();

      await this.appendEvent(tx, ticket.id, actor.id, eventType, {
        from: ticket.status,
        to: input.to,
        ...(input.reason ? { reason: input.reason } : {}),
        ...(input.resolution ? { resolution: input.resolution } : {}),
      });
      await this.audit.record(tx, {
        action: auditAction,
        entityType: 'ticket',
        entityId: ticket.id,
        entityKey: ticket.key,
        before: { status: ticket.status },
        after: { status: input.to },
        metadata: input.reason ? { reason: input.reason } : undefined,
      });
      await this.emitOutbox(tx, 'ticket.status_changed', ticket.id, {
        ticketId: ticket.id,
        key: ticket.key,
        from: ticket.status,
        to: input.to,
        assigneeId: ticket.assigneeId,
        requesterId: ticket.requesterId,
        teamId: ticket.teamId,
      });
      await this.sla.applyEffects(tx, ticket, rule.effects);
    });

    return this.getDetail(ticket.id, actor);
  }

  async assign(idOrKey: string, input: AssignTicketInput, actor: AuthUser): Promise<TicketDetail> {
    const ticket = await this.loadVisible(idOrKey, actor);
    if (ticket.status === 'CLOSED' || ticket.status === 'CANCELLED') {
      throw errors.businessRule('TICKET_READ_ONLY', 'Closed tickets are read-only.');
    }
    if (ticket.version !== input.version) throw this.stale();

    const teamId = input.teamId !== undefined ? input.teamId : ticket.teamId;
    const assigneeId = input.assigneeId !== undefined ? input.assigneeId : ticket.assigneeId;
    if (assigneeId) {
      if (!teamId) {
        throw errors.businessRule('VALIDATION_FAILED', 'Assigning an agent requires a team.');
      }
      await this.assertTeamMember(teamId, assigneeId);
    }

    let status = ticket.status;
    if (assigneeId || teamId) {
      if (status === 'NEW' || status === 'TRIAGED') status = 'ASSIGNED';
    } else if (status === 'ASSIGNED') {
      status = 'TRIAGED';
    }

    const eventType =
      assigneeId === null
        ? 'UNASSIGNED'
        : ticket.assigneeId === null
          ? 'ASSIGNED'
          : assigneeId !== ticket.assigneeId
            ? 'REASSIGNED'
            : 'ASSIGNED';

    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.ticket.updateMany({
        where: { id: ticket.id, version: input.version },
        data: { teamId, assigneeId, status, version: { increment: 1 } },
      });
      if (updated.count === 0) throw this.stale();

      await this.appendEvent(tx, ticket.id, actor.id, eventType, {
        teamId,
        assigneeId,
        note: input.note ?? null,
      });
      await this.audit.record(tx, {
        action: eventType === 'REASSIGNED' ? 'ticket.reassigned' : 'ticket.assigned',
        entityType: 'ticket',
        entityId: ticket.id,
        entityKey: ticket.key,
        before: { teamId: ticket.teamId, assigneeId: ticket.assigneeId, status: ticket.status },
        after: { teamId, assigneeId, status },
      });
      await this.emitOutbox(tx, 'ticket.assigned', ticket.id, {
        ticketId: ticket.id,
        key: ticket.key,
        teamId,
        assigneeId,
        requesterId: ticket.requesterId,
      });
    });

    return this.getDetail(ticket.id, actor);
  }

  // ───────── Helpers ─────────

  /** Public so Comments/Attachments modules reuse the same visibility policy. */
  async loadVisible(idOrKey: string, actor: AuthUser): Promise<TicketDetailRow> {
    const ticket = await this.repository.findDetail(idOrKey);
    if (!ticket || !canViewTicket(actor, this.visibilityOf(ticket))) {
      throw errors.notFound('TICKET_NOT_FOUND', 'Ticket not found or you do not have access.');
    }
    return ticket;
  }

  private visibilityOf(ticket: TicketDetailRow) {
    return {
      requesterId: ticket.requesterId,
      assigneeId: ticket.assigneeId,
      teamId: ticket.teamId,
      teamManagerId: ticket.team?.managerId ?? null,
      watcherIds: ticket.watchers.map((watcher) => watcher.userId),
    };
  }

  private transitionContext(
    ticket: TicketDetailRow,
    actor: AuthUser,
    reopenWindowDays: number,
  ): TransitionContext {
    return {
      actorId: actor.id,
      permissions: actor.permissions,
      isRequester: ticket.requesterId === actor.id,
      isAssignee: ticket.assigneeId === actor.id,
      now: new Date(),
      resolvedAt: ticket.resolvedAt,
      reopenWindowDays,
    };
  }

  private withinReopenWindow(resolvedAt: Date | null, days: number): boolean {
    if (!resolvedAt) return false;
    return Date.now() <= resolvedAt.getTime() + days * 24 * 60 * 60 * 1000;
  }

  private async reopenWindowDays(): Promise<number> {
    const setting = await this.prisma.setting.findUnique({ where: { key: 'reopen_window_days' } });
    const value = setting?.value;
    return typeof value === 'number' ? value : REOPEN_WINDOW_DEFAULT_DAYS;
  }

  private async nextTicketKey(tx: Prisma.TransactionClient): Promise<string> {
    const rows = await tx.$queryRaw<Array<{ nextval: bigint }>>`SELECT nextval('ticket_key_seq') AS nextval`;
    return `TKT-${String(rows[0]!.nextval).padStart(6, '0')}`;
  }

  private async assertTeamMember(teamId: string, userId: string): Promise<void> {
    const membership = await this.prisma.teamMember.findUnique({
      where: { teamId_userId: { teamId, userId } },
    });
    if (!membership) {
      throw errors.businessRule(
        'ASSIGNEE_NOT_IN_TEAM',
        'The selected agent is not a member of the team.',
      );
    }
  }

  private async assertAssetLink(assetId: string, requesterId: string, actor: AuthUser): Promise<void> {
    const asset = await this.prisma.asset.findUnique({
      where: { id: assetId },
      select: { id: true, currentAssigneeId: true, status: true },
    });
    if (!asset) throw errors.notFound('ASSET_NOT_FOUND', 'Asset not found.');
    if (!actor.permissions.includes('asset:view_all') && asset.currentAssigneeId !== requesterId) {
      throw errors.forbidden('You can only link assets that are assigned to you.');
    }
    if (['RETIRED', 'DISPOSED', 'LOST'].includes(asset.status)) {
      throw errors.businessRule('VALIDATION_FAILED', 'This asset cannot be linked to tickets.');
    }
  }

  private stale(): DomainError {
    return new DomainError(
      'CONFLICT_STALE_VERSION',
      409,
      'This ticket was updated by someone else. Reload to see the latest version.',
      [{ field: 'version', issue: 'stale' }],
    );
  }

  private appendEvent(
    tx: Prisma.TransactionClient,
    ticketId: string,
    actorId: string,
    type: TicketEventType,
    metadata?: Record<string, unknown>,
  ) {
    return tx.ticketEvent.create({
      data: {
        id: uuidv7(),
        ticketId,
        actorId,
        type,
        metadata: (metadata ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    });
  }

  private emitOutbox(
    tx: Prisma.TransactionClient,
    type: string,
    aggregateId: string,
    payload: Record<string, unknown>,
  ) {
    return tx.outboxEvent.create({
      data: {
        id: uuidv7(),
        type,
        aggregateType: 'ticket',
        aggregateId,
        payload: payload as Prisma.InputJsonValue,
      },
    });
  }

  private toSummary(ticket: TicketSummaryRow): TicketSummary {
    return {
      id: ticket.id,
      key: ticket.key,
      title: ticket.title,
      type: ticket.type,
      status: ticket.status,
      priority: ticket.priority,
      requestedPriority: ticket.requestedPriority,
      categoryId: ticket.categoryId,
      subcategoryId: ticket.subcategoryId,
      requester: userRef(ticket.requester),
      assignee: ticket.assignee ? userRef(ticket.assignee) : null,
      team: ticket.team ? { id: ticket.team.id, name: ticket.team.name } : null,
      assetId: ticket.assetId,
      slaState: ticket.slaState,
      firstResponseAt: iso(ticket.firstResponseAt),
      dueAt: iso(ticket.dueAt),
      resolvedAt: iso(ticket.resolvedAt),
      closedAt: iso(ticket.closedAt),
      cancelledAt: iso(ticket.cancelledAt),
      version: ticket.version,
      createdAt: ticket.createdAt.toISOString(),
      updatedAt: ticket.updatedAt.toISOString(),
    };
  }
}
