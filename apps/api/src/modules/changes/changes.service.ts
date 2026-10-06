import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  ChangeQuery,
  ChangeStatus,
  ChangeTransitionInput,
  CreateChangeInput,
  PutChangeApprovalRulesInput,
  RecordApprovalInput,
  UpdateChangeInput,
} from '@opsdesk/contracts';
import { DomainError, errors } from '../../common/errors';
import { uuidv7 } from '../../common/id';
import { pageMeta, parseSort, skip } from '../../common/pagination';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { AuthUser } from '../../common/auth-user';
import { canChangeTransition, allowedChangeTransitions } from './domain/change-state-machine';

const TERMINAL: ChangeStatus[] = ['REJECTED', 'CLOSED', 'CANCELLED'];
const SORT_FIELDS = ['createdAt', 'updatedAt', 'scheduledStart', 'risk', 'status'] as const;

export function changeLookup(idOrKey: string): Prisma.ChangeRequestWhereUniqueInput {
  return /^CHG-\d+$/.test(idOrKey.toUpperCase()) ? { key: idOrKey.toUpperCase() } : { id: idOrKey };
}

@Injectable()
export class ChangesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ───────── Queries ─────────

  async list(query: ChangeQuery, _actor: AuthUser) {
    const where: Prisma.ChangeRequestWhereInput = {};
    if (query.q) {
      where.OR = [
        { title: { contains: query.q, mode: 'insensitive' } },
        { key: { equals: query.q.toUpperCase() } },
      ];
    }
    if (query.status) where.status = { in: query.status.split(',') as ChangeStatus[] };
    if (query.type) where.type = { in: query.type.split(',') as never };
    if (query.risk) where.risk = { in: query.risk.split(',') as never };
    if (query.ownerId) where.ownerId = query.ownerId;
    if (query.requesterId) where.requesterId = query.requesterId;
    if (query.serviceId) where.services = { some: { serviceId: query.serviceId } };

    const orderBy = (parseSort(query.sort, SORT_FIELDS) ?? [
      { createdAt: 'desc' },
    ]) as Prisma.ChangeRequestOrderByWithRelationInput[];
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.changeRequest.count({ where }),
      this.prisma.changeRequest.findMany({
        where,
        orderBy,
        skip: skip(query.page, query.pageSize),
        take: query.pageSize,
        include: {
          services: { include: { service: { select: { id: true, name: true } } } },
          incident: { select: { id: true, key: true } },
        },
      }),
    ]);
    return { data: rows.map((row) => this.toSummary(row)), meta: pageMeta(query.page, query.pageSize, total) };
  }

  async getDetail(idOrKey: string, actor: AuthUser) {
    const change = await this.load(idOrKey);
    const ctx = await this.contextFor(change, actor);
    const approved = await this.approvedCount(change);
    return {
      data: {
        ...this.toSummary(change),
        scheduledStart: change.scheduledStart?.toISOString() ?? null,
        scheduledEnd: change.scheduledEnd?.toISOString() ?? null,
        actualStart: change.actualStart?.toISOString() ?? null,
        actualEnd: change.actualEnd?.toISOString() ?? null,
        implementationPlan: change.implementationPlan,
        validationPlan: change.validationPlan,
        rollbackPlan: change.rollbackPlan,
        impactAnalysis: change.impactAnalysis,
        outcomeNotes: change.outcomeNotes,
        approvalRound: change.approvalRound,
        requiredApprovals: change.requiredApprovals,
        requiresAdminApproval: change.requiresAdminApproval,
        approvedCount: approved.count,
        adminApproved: approved.adminApproved,
        approvals: change.approvals
          .filter((approval) => approval.round === change.approvalRound)
          .map((approval) => ({
            id: approval.id,
            approverId: approval.approverId,
            decision: approval.decision,
            comment: approval.comment,
            createdAt: approval.createdAt.toISOString(),
          })),
        can: {
          update: actor.permissions.includes('change:update') && change.status === 'DRAFT',
          approve:
            actor.permissions.includes('change:approve') &&
            ['SUBMITTED', 'UNDER_REVIEW'].includes(change.status) &&
            change.requesterId !== actor.id,
          implement: actor.permissions.includes('change:implement'),
        },
        allowedTransitions: allowedChangeTransitions(change.status, ctx),
      },
    };
  }

  async history(idOrKey: string, _actor: AuthUser) {
    const change = await this.load(idOrKey);
    const events = await this.prisma.changeEvent.findMany({
      where: { changeId: change.id },
      orderBy: { createdAt: 'asc' },
      take: 500,
    });
    return {
      data: events.map((event) => ({
        id: event.id,
        type: event.type,
        actorId: event.actorId,
        fromValue: event.fromValue,
        toValue: event.toValue,
        metadata: event.metadata,
        createdAt: event.createdAt.toISOString(),
      })),
    };
  }

  async calendar(from: string, to: string) {
    const changes = await this.prisma.changeRequest.findMany({
      where: {
        status: { notIn: TERMINAL },
        scheduledStart: { gte: new Date(from) },
        scheduledEnd: { lte: new Date(to) },
      },
      include: { services: { include: { service: { select: { name: true } } } } },
      orderBy: { scheduledStart: 'asc' },
    });
    return {
      data: changes.map((change) => ({
        id: change.id,
        key: change.key,
        title: change.title,
        risk: change.risk,
        status: change.status,
        scheduledStart: change.scheduledStart?.toISOString() ?? null,
        scheduledEnd: change.scheduledEnd?.toISOString() ?? null,
        services: change.services.map((link) => link.service.name),
      })),
    };
  }

  // ───────── Commands ─────────

  async create(input: CreateChangeInput, actor: AuthUser) {
    const id = uuidv7();
    await this.prisma.$transaction(async (tx) => {
      await this.assertRefs(tx, input.serviceIds ?? [], input.incidentId);
      const key = await this.nextKey(tx);
      await tx.changeRequest.create({
        data: {
          id,
          key,
          title: input.title,
          description: input.description,
          type: input.type,
          risk: input.risk,
          requesterId: actor.id,
          ownerId: input.ownerId ?? actor.id,
          teamId: input.teamId ?? null,
          incidentId: input.incidentId ?? null,
          scheduledStart: input.scheduledStart ? new Date(input.scheduledStart) : null,
          scheduledEnd: input.scheduledEnd ? new Date(input.scheduledEnd) : null,
          implementationPlan: input.implementationPlan ?? null,
          validationPlan: input.validationPlan ?? null,
          rollbackPlan: input.rollbackPlan ?? null,
          impactAnalysis: input.impactAnalysis ?? null,
        },
      });
      if (input.serviceIds?.length) {
        await tx.changeService.createMany({
          data: input.serviceIds.map((serviceId) => ({ changeId: id, serviceId })),
          skipDuplicates: true,
        });
      }
      await this.appendEvent(tx, id, actor.id, 'CREATED', { toValue: 'DRAFT' });
      await this.audit.record(tx, {
        action: 'change.created',
        entityType: 'change_request',
        entityId: id,
        entityKey: key,
        after: { title: input.title, type: input.type, risk: input.risk },
      });
    });
    return this.getDetail(id, actor);
  }

  async update(idOrKey: string, input: UpdateChangeInput, actor: AuthUser) {
    const change = await this.load(idOrKey);
    if (change.status !== 'DRAFT') {
      throw errors.businessRule('CHANGE_INVALID_TRANSITION', 'Only draft changes can be edited.');
    }
    if (change.version !== input.version) throw this.stale();
    if (input.serviceIds) await this.assertRefs(this.prisma, input.serviceIds, undefined);

    const data: Prisma.ChangeRequestUncheckedUpdateInput = { version: { increment: 1 } };
    const changes: Record<string, unknown> = {};
    for (const field of ['title', 'description', 'risk', 'ownerId', 'teamId', 'incidentId', 'implementationPlan', 'validationPlan', 'rollbackPlan', 'impactAnalysis', 'outcomeNotes'] as const) {
      if (input[field] !== undefined) {
        (data as Record<string, unknown>)[field] = input[field];
        changes[field] = input[field];
      }
    }
    if (input.scheduledStart !== undefined) {
      data.scheduledStart = input.scheduledStart ? new Date(input.scheduledStart) : null;
      changes.scheduledStart = input.scheduledStart;
    }
    if (input.scheduledEnd !== undefined) {
      data.scheduledEnd = input.scheduledEnd ? new Date(input.scheduledEnd) : null;
      changes.scheduledEnd = input.scheduledEnd;
    }

    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.changeRequest.updateMany({
        where: { id: change.id, version: input.version },
        data,
      });
      if (updated.count === 0) throw this.stale();
      if (input.serviceIds) {
        await tx.changeService.deleteMany({ where: { changeId: change.id } });
        await tx.changeService.createMany({
          data: input.serviceIds.map((serviceId) => ({ changeId: change.id, serviceId })),
          skipDuplicates: true,
        });
      }
      await this.appendEvent(tx, change.id, actor.id, 'UPDATED', { metadata: changes });
      await this.audit.record(tx, {
        action: 'change.updated',
        entityType: 'change_request',
        entityId: change.id,
        entityKey: change.key,
        after: changes,
      });
    });
    return this.getDetail(change.id, actor);
  }

  async submit(idOrKey: string, actor: AuthUser) {
    const change = await this.load(idOrKey);
    const ctx = await this.contextFor(change, actor);
    const decision = canChangeTransition('DRAFT', 'SUBMITTED', ctx);
    if (!decision.ok) throw this.denial(decision.code);

    const rule = await this.prisma.changeApprovalRule.findUnique({
      where: { type_risk: { type: change.type, risk: change.risk } },
    });
    const required = rule?.requiredApprovals ?? (change.type === 'STANDARD' ? 0 : 1);
    const requiresAdmin = rule?.requiresAdmin ?? false;
    const autoApproved = required === 0;
    const now = new Date();

    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.changeRequest.updateMany({
        where: { id: change.id, version: change.version },
        data: {
          status: autoApproved ? 'APPROVED' : 'SUBMITTED',
          requiredApprovals: required,
          requiresAdminApproval: requiresAdmin,
          version: { increment: 1 },
        },
      });
      if (updated.count === 0) throw this.stale();
      await this.appendEvent(tx, change.id, actor.id, 'SUBMITTED', { toValue: 'SUBMITTED' });
      if (autoApproved) {
        await this.appendEvent(tx, change.id, actor.id, 'STATUS_CHANGED', {
          fromValue: 'SUBMITTED',
          toValue: 'APPROVED',
          metadata: { auto: true },
        });
      }
      await this.audit.record(tx, {
        action: 'change.submitted',
        entityType: 'change_request',
        entityId: change.id,
        entityKey: change.key,
        after: { requiredApprovals: required, autoApproved },
      });
      await this.emit(tx, 'change.submitted', change.id, {
        changeId: change.id,
        key: change.key,
        type: change.type,
        risk: change.risk,
        requiredApprovals: required,
        submittedAt: now,
      });
    });
    return this.getDetail(change.id, actor);
  }

  async transition(idOrKey: string, input: ChangeTransitionInput, actor: AuthUser) {
    const change = await this.load(idOrKey);
    if (change.version !== input.version) throw this.stale();
    const ctx = await this.contextFor(change, actor);
    const decision = canChangeTransition(change.status, input.to, ctx);
    if (!decision.ok) throw this.denial(decision.code);
    if (decision.rule.requiresNote && !input.note?.trim()) {
      throw errors.businessRule('VALIDATION_FAILED', 'A note is required for this transition.');
    }
    if (input.to === 'SCHEDULED') {
      if (!change.scheduledStart || !change.scheduledEnd) {
        throw errors.businessRule('VALIDATION_FAILED', 'Set the change window before scheduling.');
      }
      await this.assertNoScheduleConflict(this.prisma, change.id, change.scheduledStart, change.scheduledEnd);
    }

    const now = new Date();
    const data: Prisma.ChangeRequestUncheckedUpdateInput = {
      status: input.to,
      version: { increment: 1 },
    };
    if (input.to === 'IMPLEMENTING') data.actualStart = now;
    if (input.to === 'COMPLETED') {
      data.actualEnd = now;
      if (input.note) data.outcomeNotes = input.note;
    }
    if (input.to === 'FAILED' && input.note) data.outcomeNotes = input.note;

    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.changeRequest.updateMany({
        where: { id: change.id, version: input.version },
        data,
      });
      if (updated.count === 0) throw this.stale();
      await this.appendEvent(tx, change.id, actor.id, 'STATUS_CHANGED', {
        fromValue: change.status,
        toValue: input.to,
        metadata: input.note ? { note: input.note } : undefined,
      });
      await this.audit.record(tx, {
        action: 'change.status_changed',
        entityType: 'change_request',
        entityId: change.id,
        entityKey: change.key,
        before: { status: change.status },
        after: { status: input.to },
      });
      await this.emit(tx, 'change.status_changed', change.id, {
        changeId: change.id,
        key: change.key,
        from: change.status,
        to: input.to,
      });
    });
    return this.getDetail(change.id, actor);
  }

  async recordApproval(idOrKey: string, input: RecordApprovalInput, actor: AuthUser) {
    const change = await this.load(idOrKey);
    if (change.requesterId === actor.id) {
      throw errors.businessRule('SELF_APPROVAL_FORBIDDEN', 'You cannot approve your own change.');
    }
    if (!['SUBMITTED', 'UNDER_REVIEW'].includes(change.status)) {
      throw errors.businessRule(
        'CHANGE_ALREADY_DECIDED',
        'This change is not open for approval decisions.',
      );
    }
    const rule = await this.prisma.changeApprovalRule.findUnique({
      where: { type_risk: { type: change.type, risk: change.risk } },
    });
    const eligible =
      (rule && actor.roleKeys.includes(rule.approverRoleKey)) ||
      (change.requiresAdminApproval && actor.roleKeys.includes('ADMIN'));
    if (!eligible) throw errors.forbidden('You are not an approver for this change.');

    const now = new Date();
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.changeApproval.create({
          data: {
            id: uuidv7(),
            changeId: change.id,
            approverId: actor.id,
            round: change.approvalRound,
            decision: input.decision,
            comment: input.comment ?? null,
          },
        });
        await this.appendEvent(tx, change.id, actor.id, 'APPROVAL_RECORDED', {
          metadata: { decision: input.decision, round: change.approvalRound },
        });

        let nextStatus: ChangeStatus | null = null;
        if (change.status === 'SUBMITTED') {
          nextStatus = 'UNDER_REVIEW';
          await this.appendEvent(tx, change.id, actor.id, 'STATUS_CHANGED', {
            fromValue: 'SUBMITTED',
            toValue: 'UNDER_REVIEW',
          });
        }
        if (input.decision === 'REJECTED') nextStatus = 'REJECTED';
        if (input.decision === 'REQUEST_CHANGES') nextStatus = 'DRAFT';
        if (input.decision === 'APPROVED') {
          const approvals = await tx.changeApproval.findMany({
            where: { changeId: change.id, round: change.approvalRound, decision: 'APPROVED' },
          });
          const adminApproved = await this.hasAdminApproval(tx, approvals.map((a) => a.approverId));
          if (
            approvals.length >= change.requiredApprovals &&
            (!change.requiresAdminApproval || adminApproved)
          ) {
            nextStatus = 'APPROVED';
          }
        }

        if (nextStatus) {
          await tx.changeRequest.update({
            where: { id: change.id },
            data: {
              status: nextStatus,
              ...(nextStatus === 'DRAFT' ? { approvalRound: { increment: 1 } } : {}),
              version: { increment: 1 },
            },
          });
          if (nextStatus !== 'UNDER_REVIEW') {
            await this.appendEvent(tx, change.id, actor.id, 'STATUS_CHANGED', {
              fromValue: change.status,
              toValue: nextStatus,
            });
          }
        } else {
          await tx.changeRequest.update({
            where: { id: change.id },
            data: { version: { increment: 1 } },
          });
        }

        await this.audit.record(tx, {
          action: 'change.approval_recorded',
          entityType: 'change_request',
          entityId: change.id,
          entityKey: change.key,
          after: { decision: input.decision, round: change.approvalRound },
        });
        if (nextStatus === 'APPROVED' || nextStatus === 'REJECTED') {
          await this.emit(tx, 'change.decided', change.id, {
            changeId: change.id,
            key: change.key,
            status: nextStatus,
            decidedAt: now,
          });
        }
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw errors.conflict('CONFLICT', 'You already recorded a decision for this round.');
      }
      throw error;
    }
    return this.getDetail(change.id, actor);
  }

  // ───────── Approval rules ─────────

  async getRules() {
    const rules = await this.prisma.changeApprovalRule.findMany({
      orderBy: [{ type: 'asc' }, { risk: 'asc' }],
    });
    return { data: rules };
  }

  async putRules(input: PutChangeApprovalRulesInput, actor: AuthUser) {
    await this.prisma.$transaction(async (tx) => {
      await tx.changeApprovalRule.deleteMany({});
      await tx.changeApprovalRule.createMany({
        data: input.rules.map((rule) => ({
          id: uuidv7(),
          type: rule.type,
          risk: rule.risk,
          requiredApprovals: rule.requiredApprovals,
          approverRoleKey: rule.approverRoleKey,
          requiresAdmin: rule.requiresAdmin,
        })),
      });
      await this.audit.record(tx, {
        action: 'change.rules_updated',
        entityType: 'change_approval_rule',
        after: { rules: input.rules },
        actorId: actor.id,
      });
    });
    return this.getRules();
  }

  // ───────── Helpers ─────────

  private async load(idOrKey: string) {
    const change = await this.prisma.changeRequest.findUnique({
      where: changeLookup(idOrKey),
      include: {
        services: { include: { service: { select: { id: true, name: true } } } },
        incident: { select: { id: true, key: true } },
        approvals: true,
      },
    });
    if (!change) throw errors.notFound('CHANGE_NOT_FOUND', 'Change request not found.');
    return change;
  }

  private async contextFor(
    change: Awaited<ReturnType<ChangesService['load']>>,
    actor: AuthUser,
  ) {
    const approved = await this.approvedCount(change);
    return {
      permissions: actor.permissions,
      isRequester: change.requesterId === actor.id,
      isOwner: change.ownerId === actor.id,
      isStandard: change.type === 'STANDARD',
      plansFilled: Boolean(
        change.implementationPlan?.trim() &&
          change.validationPlan?.trim() &&
          change.rollbackPlan?.trim(),
      ),
      scheduleInFuture: change.scheduledStart ? change.scheduledStart > new Date() : false,
      isEmergency: change.type === 'EMERGENCY',
      requiredApprovalsMet:
        approved.count >= change.requiredApprovals &&
        (!change.requiresAdminApproval || approved.adminApproved),
      hasRejected: change.approvals.some(
        (approval) => approval.round === change.approvalRound && approval.decision === 'REJECTED',
      ),
      now: new Date(),
      scheduledStart: change.scheduledStart,
    };
  }

  private async approvedCount(change: { id: string; approvalRound: number; approvals: { round: number; decision: string; approverId: string }[] }) {
    const approvedIds = change.approvals
      .filter((approval) => approval.round === change.approvalRound && approval.decision === 'APPROVED')
      .map((approval) => approval.approverId);
    return {
      count: approvedIds.length,
      adminApproved: await this.hasAdminApproval(this.prisma, approvedIds),
    };
  }

  private async hasAdminApproval(
    db: Prisma.TransactionClient | PrismaService,
    userIds: string[],
  ): Promise<boolean> {
    if (userIds.length === 0) return false;
    const admins = await db.userRole.count({
      where: { userId: { in: userIds }, role: { key: 'ADMIN' } },
    });
    return admins > 0;
  }

  private async assertNoScheduleConflict(
    db: Prisma.TransactionClient | PrismaService,
    changeId: string,
    start: Date,
    end: Date,
  ): Promise<void> {
    const links = await db.changeService.findMany({ where: { changeId } });
    if (links.length === 0) return;
    const conflict = await db.changeRequest.findFirst({
      where: {
        id: { not: changeId },
        status: { notIn: TERMINAL },
        scheduledStart: { lt: end },
        scheduledEnd: { gt: start },
        services: { some: { serviceId: { in: links.map((link) => link.serviceId) } } },
      },
      select: { key: true },
    });
    if (conflict) {
      throw errors.conflict(
        'SCHEDULE_CONFLICT',
        `This window overlaps change ${conflict.key} on the same service.`,
      );
    }
  }

  private async assertRefs(
    db: Prisma.TransactionClient | PrismaService,
    serviceIds: string[],
    incidentId: string | undefined,
  ): Promise<void> {
    if (serviceIds.length > 0) {
      const count = await db.service.count({ where: { id: { in: serviceIds } } });
      if (count !== serviceIds.length) throw errors.notFound('NOT_FOUND', 'Service not found.');
    }
    if (incidentId) {
      const incident = await db.incident.findUnique({ where: { id: incidentId } });
      if (!incident) throw errors.notFound('INCIDENT_NOT_FOUND', 'Incident not found.');
    }
  }

  private denial(code: string): DomainError {
    switch (code) {
      case 'FORBIDDEN':
        return errors.forbidden();
      case 'PLANS_REQUIRED':
        return errors.businessRule(
          'PLANS_REQUIRED',
          'Implementation, validation, and rollback plans are required before submitting.',
        );
      case 'CHANGE_NOT_APPROVED':
        return errors.businessRule(
          'CHANGE_NOT_APPROVED',
          'The change has not received the required approvals.',
        );
      case 'WINDOW_NOT_OPEN':
        return errors.businessRule(
          'WINDOW_NOT_OPEN',
          'Implementation can start at most 15 minutes before the scheduled window.',
        );
      case 'VALIDATION_FAILED':
        return errors.businessRule('VALIDATION_FAILED', 'The change schedule must be in the future.');
      default:
        return errors.businessRule('CHANGE_INVALID_TRANSITION', 'This transition is not allowed.');
    }
  }

  private stale(): DomainError {
    return new DomainError(
      'CONFLICT_STALE_VERSION',
      409,
      'This change was updated by someone else. Reload to see the latest version.',
      [{ field: 'version', issue: 'stale' }],
    );
  }

  private async nextKey(tx: Prisma.TransactionClient): Promise<string> {
    const rows = await tx.$queryRaw<Array<{ nextval: bigint }>>`SELECT nextval('change_key_seq') AS nextval`;
    return `CHG-${String(rows[0]!.nextval).padStart(6, '0')}`;
  }

  private toSummary(change: {
    id: string;
    key: string;
    title: string;
    description: string;
    type: string;
    risk: string;
    status: string;
    requesterId: string;
    ownerId: string | null;
    teamId: string | null;
    approvalRound: number;
    requiredApprovals: number;
    version: number;
    createdAt: Date;
    updatedAt: Date;
    services: { service: { id: string; name: string } }[];
    incident: { id: string; key: string } | null;
  }) {
    return {
      id: change.id,
      key: change.key,
      title: change.title,
      description: change.description,
      type: change.type,
      risk: change.risk,
      status: change.status,
      requesterId: change.requesterId,
      ownerId: change.ownerId,
      teamId: change.teamId,
      approvalRound: change.approvalRound,
      requiredApprovals: change.requiredApprovals,
      version: change.version,
      services: change.services.map((link) => ({ id: link.service.id, name: link.service.name })),
      incident: change.incident ? { id: change.incident.id, key: change.incident.key } : null,
      createdAt: change.createdAt.toISOString(),
      updatedAt: change.updatedAt.toISOString(),
    };
  }

  private appendEvent(
    tx: Prisma.TransactionClient,
    changeId: string,
    actorId: string | null,
    type: string,
    extras: { fromValue?: string | null; toValue?: string | null; metadata?: Record<string, unknown> } = {},
  ) {
    return tx.changeEvent.create({
      data: {
        id: uuidv7(),
        changeId,
        actorId,
        type,
        fromValue: extras.fromValue ?? null,
        toValue: extras.toValue ?? null,
        metadata: (extras.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    });
  }

  private emit(
    tx: Prisma.TransactionClient,
    type: string,
    aggregateId: string,
    payload: Record<string, unknown>,
  ) {
    return tx.outboxEvent.create({
      data: {
        id: uuidv7(),
        type,
        aggregateType: 'change_request',
        aggregateId,
        payload: payload as Prisma.InputJsonValue,
      },
    });
  }
}
