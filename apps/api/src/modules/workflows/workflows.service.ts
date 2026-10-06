import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  CreateWorkflowRequestInput,
  CreateWorkflowTemplateInput,
  TaskTransitionInput,
  TemplateTask,
  UpdateWorkflowTaskInput,
  UpdateWorkflowTemplateInput,
  WorkflowKind,
  WorkflowQuery,
} from '@opsdesk/contracts';
import { DomainError, errors } from '../../common/errors';
import { uuidv7 } from '../../common/id';
import { pageMeta, parseSort, skip } from '../../common/pagination';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { AuthUser } from '../../common/auth-user';
import { canTaskTransition } from './domain/task-state-machine';

const TERMINAL_TASKS = ['COMPLETED', 'SKIPPED'];
const SORT_FIELDS = ['createdAt', 'updatedAt', 'effectiveDate'] as const;

export function workflowLookup(idOrKey: string): Prisma.WorkflowRequestWhereUniqueInput {
  return /^(ONB|OFF)-\d+$/.test(idOrKey.toUpperCase())
    ? { key: idOrKey.toUpperCase() }
    : { id: idOrKey };
}

@Injectable()
export class WorkflowsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ───────── Templates ─────────

  async listTemplates(kind?: WorkflowKind) {
    const templates = await this.prisma.workflowTemplate.findMany({
      where: kind ? { kind } : {},
      orderBy: { name: 'asc' },
    });
    return { data: templates };
  }

  async createTemplate(input: CreateWorkflowTemplateInput, actor: AuthUser) {
    const id = uuidv7();
    await this.prisma.$transaction(async (tx) => {
      await tx.workflowTemplate.create({
        data: {
          id,
          kind: input.kind,
          name: input.name,
          departmentId: input.departmentId ?? null,
          tasks: input.tasks as unknown as Prisma.InputJsonValue,
          isActive: input.isActive ?? true,
        },
      });
      await this.audit.record(tx, {
        action: 'workflow.template_created',
        entityType: 'workflow_template',
        entityId: id,
        after: { kind: input.kind, name: input.name, tasks: input.tasks.length },
        actorId: actor.id,
      });
    });
    return { data: (await this.listTemplates()).data.find((template) => template.id === id) };
  }

  async updateTemplate(id: string, input: UpdateWorkflowTemplateInput, actor: AuthUser) {
    const template = await this.prisma.workflowTemplate.findUnique({ where: { id } });
    if (!template) throw errors.notFound('TEMPLATE_NOT_FOUND', 'Workflow template not found.');
    await this.prisma.$transaction(async (tx) => {
      await tx.workflowTemplate.update({
        where: { id },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.departmentId !== undefined ? { departmentId: input.departmentId } : {}),
          ...(input.tasks !== undefined
            ? { tasks: input.tasks as unknown as Prisma.InputJsonValue }
            : {}),
          ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        },
      });
      await this.audit.record(tx, {
        action: 'workflow.template_updated',
        entityType: 'workflow_template',
        entityId: id,
        after: input as Record<string, unknown>,
        actorId: actor.id,
      });
    });
    return { data: (await this.listTemplates()).data.find((entry) => entry.id === id) };
  }

  // ───────── Requests ─────────

  async list(kind: WorkflowKind, query: WorkflowQuery, _actor: AuthUser) {
    const where: Prisma.WorkflowRequestWhereInput = { kind };
    if (query.status) where.status = { in: query.status.split(',') as never };
    if (query.subjectUserId) where.subjectUserId = query.subjectUserId;
    if (query.departmentId) where.departmentId = query.departmentId;

    const orderBy = (parseSort(query.sort, SORT_FIELDS) ?? [
      { createdAt: 'desc' },
    ]) as Prisma.WorkflowRequestOrderByWithRelationInput[];
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.workflowRequest.count({ where }),
      this.prisma.workflowRequest.findMany({
        where,
        orderBy,
        skip: skip(query.page, query.pageSize),
        take: query.pageSize,
        include: { tasks: { select: { status: true, required: true } }, template: { select: { name: true } } },
      }),
    ]);
    const subjectIds = [...new Set(rows.map((row) => row.subjectUserId))];
    const subjects = await this.prisma.user.findMany({
      where: { id: { in: subjectIds } },
      select: { id: true, firstName: true, lastName: true, email: true },
    });
    const byId = new Map(subjects.map((user) => [user.id, user]));
    return {
      data: rows.map((row) => ({
        id: row.id,
        key: row.key,
        kind: row.kind,
        status: row.status,
        subjectUserId: row.subjectUserId,
        subject: byId.get(row.subjectUserId) ?? null,
        effectiveDate: row.effectiveDate.toISOString().slice(0, 10),
        templateName: row.template?.name ?? null,
        progress: this.progress(row.tasks),
        createdAt: row.createdAt.toISOString(),
      })),
      meta: pageMeta(query.page, query.pageSize, total),
    };
  }

  async getRequest(idOrKey: string, actor: AuthUser) {
    const request = await this.prisma.workflowRequest.findUnique({
      where: workflowLookup(idOrKey),
      include: {
        tasks: { orderBy: { sortOrder: 'asc' } },
        template: { select: { id: true, name: true } },
      },
    });
    if (!request) throw errors.notFound('WORKFLOW_NOT_FOUND', 'Workflow request not found.');

    const subject = await this.prisma.user.findUnique({
      where: { id: request.subjectUserId },
      select: { id: true, firstName: true, lastName: true, email: true, status: true },
    });
    return {
      data: {
        id: request.id,
        key: request.key,
        kind: request.kind,
        status: request.status,
        subject,
        managerId: request.managerId,
        departmentId: request.departmentId,
        template: request.template ? { id: request.template.id, name: request.template.name } : null,
        effectiveDate: request.effectiveDate.toISOString().slice(0, 10),
        notes: request.notes,
        disableAccountOnComplete: request.disableAccountOnComplete,
        completedAt: request.completedAt?.toISOString() ?? null,
        createdAt: request.createdAt.toISOString(),
        progress: this.progress(request.tasks),
        can: { manage: actor.permissions.includes('workflow:manage') },
        tasks: request.tasks.map((task) => ({
          id: task.id,
          title: task.title,
          description: task.description,
          ownerUserId: task.ownerUserId,
          ownerTeamId: task.ownerTeamId,
          status: task.status,
          required: task.required,
          assetId: task.assetId,
          dueDate: task.dueDate?.toISOString().slice(0, 10) ?? null,
          completedAt: task.completedAt?.toISOString() ?? null,
          skipReason: task.skipReason,
          notes: task.notes,
          version: task.version,
          canAct:
            actor.permissions.includes('workflow:manage') ||
            task.ownerUserId === actor.id ||
            (task.ownerTeamId !== null && actor.teamIds.includes(task.ownerTeamId)),
        })),
      },
    };
  }

  async createRequest(kind: WorkflowKind, input: CreateWorkflowRequestInput, actor: AuthUser) {
    const subject = await this.prisma.user.findUnique({ where: { id: input.subjectUserId } });
    if (!subject) throw errors.notFound('USER_NOT_FOUND', 'Subject user not found.');

    const departmentId = input.departmentId ?? subject.departmentId;
    const template = input.templateId
      ? await this.prisma.workflowTemplate.findUnique({ where: { id: input.templateId } })
      : await this.prisma.workflowTemplate.findFirst({
          where: {
            kind,
            isActive: true,
            // Department-specific template when the subject has one, otherwise the default.
            ...(departmentId
              ? { OR: [{ departmentId }, { departmentId: null }] }
              : { departmentId: null }),
          },
          orderBy: { departmentId: 'desc' },
        });
    if (!template) {
      throw errors.notFound(
        'TEMPLATE_NOT_FOUND',
        'No active workflow template found for this kind and department.',
      );
    }

    const id = uuidv7();
    const effectiveDate = new Date(`${input.effectiveDate}T00:00:00Z`);
    const templateTasks = (template.tasks as unknown as TemplateTask[]) ?? [];

    await this.prisma.$transaction(async (tx) => {
      const key = await this.nextKey(tx, kind);
      await tx.workflowRequest.create({
        data: {
          id,
          key,
          kind,
          subjectUserId: input.subjectUserId,
          managerId: input.managerId ?? subject.managerId,
          departmentId: input.departmentId ?? subject.departmentId,
          templateId: template.id,
          effectiveDate,
          notes: input.notes ?? null,
          disableAccountOnComplete: input.disableAccountOnComplete,
          createdById: actor.id,
        },
      });

      let sortOrder = 0;
      for (const task of templateTasks) {
        await tx.workflowTask.create({
          data: {
            id: uuidv7(),
            requestId: id,
            title: task.title,
            description: task.description ?? null,
            ownerTeamId: task.ownerTeamId ?? null,
            status: 'PENDING',
            required: task.required ?? true,
            dueDate: new Date(effectiveDate.getTime() + (task.offsetDays ?? 0) * 86_400_000),
            sortOrder: sortOrder++,
          },
        });
      }

      // Offboarding couples asset recovery: every active assignment becomes a task (WF-5).
      if (kind === 'OFFBOARDING') {
        const assets = await tx.asset.findMany({
          where: { currentAssigneeId: input.subjectUserId, status: 'ASSIGNED' },
        });
        for (const asset of assets) {
          await tx.workflowTask.create({
            data: {
              id: uuidv7(),
              requestId: id,
              title: `Recover ${asset.tag} — ${asset.name}`,
              description: 'Completing this task returns the asset to stock.',
              status: 'PENDING',
              required: true,
              assetId: asset.id,
              dueDate: effectiveDate,
              sortOrder: sortOrder++,
            },
          });
        }
      }

      await this.audit.record(tx, {
        action: 'workflow.created',
        entityType: 'workflow_request',
        entityId: id,
        entityKey: key,
        after: { kind, subjectUserId: input.subjectUserId, templateId: template.id },
        actorId: actor.id,
      });
      await tx.outboxEvent.create({
        data: {
          id: uuidv7(),
          type: 'workflow.created',
          aggregateType: 'workflow_request',
          aggregateId: id,
          payload: { requestId: id, key, kind, subjectUserId: input.subjectUserId },
        },
      });
    });

    return this.getRequest(id, actor);
  }

  // ───────── Tasks ─────────

  async updateTask(taskId: string, input: UpdateWorkflowTaskInput, actor: AuthUser) {
    const task = await this.loadTask(taskId);
    if (task.version !== input.version) throw this.stale();
    this.assertCanAct(task, actor);

    await this.prisma.workflowTask.update({
      where: { id: taskId },
      data: {
        ...(input.ownerUserId !== undefined ? { ownerUserId: input.ownerUserId } : {}),
        ...(input.ownerTeamId !== undefined ? { ownerTeamId: input.ownerTeamId } : {}),
        ...(input.dueDate !== undefined
          ? { dueDate: input.dueDate ? new Date(`${input.dueDate}T00:00:00Z`) : null }
          : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
        version: { increment: 1 },
      },
    });
    return this.getRequest(task.requestId, actor);
  }

  async transitionTask(taskId: string, input: TaskTransitionInput, actor: AuthUser) {
    const task = await this.loadTask(taskId);
    if (task.version !== input.version) throw this.stale();
    this.assertCanAct(task, actor);

    const decision = canTaskTransition(task.status, input.to, {
      permissions: actor.permissions,
      required: task.required,
    });
    if (!decision.ok) {
      if (decision.code === 'FORBIDDEN') {
        throw errors.forbidden('Only workflow managers can skip required tasks.');
      }
      throw errors.businessRule(
        'WORKFLOW_INVALID_TRANSITION',
        `Task cannot move from ${task.status} to ${input.to}.`,
      );
    }
    if (decision.rule.requiresReason && !input.reason?.trim()) {
      throw errors.businessRule('TASK_SKIP_REASON_REQUIRED', 'A skip reason is required.');
    }

    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.workflowTask.updateMany({
        where: { id: task.id, version: input.version },
        data: {
          status: input.to,
          ...(input.to === 'COMPLETED' ? { completedAt: now, completedById: actor.id } : {}),
          ...(input.to === 'SKIPPED' ? { skipReason: input.reason ?? null } : {}),
          ...(input.notes !== undefined ? { notes: input.notes } : {}),
          version: { increment: 1 },
        },
      });
      if (updated.count === 0) throw this.stale();

      // Completing an asset-recovery task returns the asset to stock (WF-5).
      if (input.to === 'COMPLETED' && task.assetId) {
        await this.recoverAsset(tx, task.assetId, actor.id);
      }

      await this.audit.record(tx, {
        action: 'workflow.task_updated',
        entityType: 'workflow_task',
        entityId: task.id,
        after: { status: input.to },
        actorId: actor.id,
      });

      await this.maybeCompleteRequest(tx, task.requestId, actor.id);
    });

    return this.getRequest(task.requestId, actor);
  }

  // ───────── Internals ─────────

  private async maybeCompleteRequest(
    tx: Prisma.TransactionClient,
    requestId: string,
    actorId: string,
  ) {
    const request = await tx.workflowRequest.findUnique({
      where: { id: requestId },
      include: { tasks: true },
    });
    if (!request || request.status !== 'OPEN') return;

    const requiredRemaining = request.tasks.filter(
      (task) => task.required && !TERMINAL_TASKS.includes(task.status),
    );
    if (requiredRemaining.length > 0) return;

    const now = new Date();
    await tx.workflowRequest.update({
      where: { id: requestId },
      data: { status: 'COMPLETED', completedAt: now },
    });

    // WF-6: offboarding completion optionally disables the account.
    if (request.kind === 'OFFBOARDING' && request.disableAccountOnComplete) {
      const subject = await tx.user.findUnique({ where: { id: request.subjectUserId } });
      if (subject && subject.status !== 'DISABLED') {
        await tx.user.update({
          where: { id: subject.id },
          data: { status: 'DISABLED' },
        });
        await tx.session.updateMany({
          where: { userId: subject.id, revokedAt: null },
          data: { revokedAt: now },
        });
        await this.audit.record(tx, {
          action: 'user.status_changed',
          entityType: 'user',
          entityId: subject.id,
          before: { status: subject.status },
          after: { status: 'DISABLED', via: 'offboarding' },
          actorId: actorId,
        });
      }
    }

    await this.audit.record(tx, {
      action: 'workflow.completed',
      entityType: 'workflow_request',
      entityId: requestId,
      entityKey: request.key,
      actorId: actorId,
    });
    await tx.outboxEvent.create({
      data: {
        id: uuidv7(),
        type: 'workflow.completed',
        aggregateType: 'workflow_request',
        aggregateId: requestId,
        payload: { requestId, key: request.key, kind: request.kind },
      },
    });
  }

  private async recoverAsset(tx: Prisma.TransactionClient, assetId: string, actorId: string) {
    const asset = await tx.asset.findUnique({ where: { id: assetId } });
    if (!asset || !asset.currentAssigneeId) return;
    const now = new Date();
    await tx.assetAssignment.updateMany({
      where: { assetId, returnedAt: null },
      data: { returnedAt: now, returnedById: actorId, note: 'Recovered via offboarding' },
    });
    await tx.asset.update({
      where: { id: assetId },
      data: {
        currentAssigneeId: null,
        status: asset.status === 'IN_REPAIR' ? 'IN_REPAIR' : 'IN_STOCK',
        version: { increment: 1 },
      },
    });
    await tx.assetEvent.create({
      data: {
        id: uuidv7(),
        assetId,
        actorId,
        type: 'UNASSIGNED',
        fromValue: asset.currentAssigneeId,
        metadata: { via: 'offboarding' },
      },
    });
    await this.audit.record(tx, {
      action: 'asset.unassigned',
      entityType: 'asset',
      entityId: assetId,
      entityKey: asset.tag,
      before: { currentAssigneeId: asset.currentAssigneeId },
      after: { currentAssigneeId: null },
      actorId,
    });
  }

  private async loadTask(taskId: string) {
    const task = await this.prisma.workflowTask.findUnique({ where: { id: taskId } });
    if (!task) throw errors.notFound('TASK_NOT_FOUND', 'Workflow task not found.');
    return task;
  }

  private assertCanAct(
    task: { ownerUserId: string | null; ownerTeamId: string | null },
    actor: AuthUser,
  ) {
    if (actor.permissions.includes('workflow:manage')) return;
    if (task.ownerUserId && task.ownerUserId === actor.id) return;
    if (task.ownerTeamId && actor.teamIds.includes(task.ownerTeamId)) return;
    // Unassigned tasks are claimable by anyone with workflow:view.
    if (!task.ownerUserId && !task.ownerTeamId) return;
    throw errors.forbidden('This task is owned by another team or user.');
  }

  private progress(tasks: { status: string; required: boolean }[]) {
    const required = tasks.filter((task) => task.required);
    return {
      total: tasks.length,
      done: tasks.filter((task) => TERMINAL_TASKS.includes(task.status)).length,
      requiredTotal: required.length,
      requiredDone: required.filter((task) => TERMINAL_TASKS.includes(task.status)).length,
    };
  }

  private stale(): DomainError {
    return new DomainError(
      'CONFLICT_STALE_VERSION',
      409,
      'This task was updated by someone else. Reload to see the latest version.',
      [{ field: 'version', issue: 'stale' }],
    );
  }

  private async nextKey(tx: Prisma.TransactionClient, kind: WorkflowKind): Promise<string> {
    const rows = await tx.$queryRaw<Array<{ nextval: bigint }>>`SELECT nextval('workflow_key_seq') AS nextval`;
    const prefix = kind === 'ONBOARDING' ? 'ONB' : 'OFF';
    return `${prefix}-${String(rows[0]!.nextval).padStart(6, '0')}`;
  }
}
