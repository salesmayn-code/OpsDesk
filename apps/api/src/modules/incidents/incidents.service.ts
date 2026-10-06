import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  CreateIncidentInput,
  CreatePostmortemActionInput,
  IncidentEventType,
  IncidentNoteInput,
  IncidentQuery,
  IncidentSeverity,
  IncidentStatus,
  IncidentTransitionInput,
  LinkIncidentTicketsInput,
  UpdateIncidentInput,
  UpdatePostmortemActionInput,
  UpsertPostmortemInput,
} from '@opsdesk/contracts';
import { DomainError, errors } from '../../common/errors';
import { uuidv7 } from '../../common/id';
import { pageMeta, parseSort, skip } from '../../common/pagination';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { AuthUser } from '../../common/auth-user';
import { canIncidentTransition, allowedIncidentTransitions } from './domain/incident-state-machine';

export const INCIDENT_SORT_FIELDS = ['createdAt', 'updatedAt', 'startedAt', 'severity', 'status'] as const;

export function incidentLookup(idOrKey: string): Prisma.IncidentWhereUniqueInput {
  return /^INC-\d{4}-\d+$/.test(idOrKey.toUpperCase())
    ? { key: idOrKey.toUpperCase() }
    : { id: idOrKey };
}

const DETAIL_INCLUDE = {
  service: { select: { id: true, name: true } },
  postmortem: { select: { id: true, status: true, publishedAt: true } },
  tickets: {
    include: {
      ticket: {
        select: { id: true, key: true, title: true, status: true, priority: true, requesterId: true },
      },
    },
  },
} satisfies Prisma.IncidentInclude;

type IncidentRow = Prisma.IncidentGetPayload<{ include: typeof DETAIL_INCLUDE }>;

@Injectable()
export class IncidentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ───────── Queries ─────────

  async list(query: IncidentQuery, _actor: AuthUser) {
    const where: Prisma.IncidentWhereInput = {};
    if (query.q) {
      where.OR = [
        { title: { contains: query.q, mode: 'insensitive' } },
        { key: { equals: query.q.toUpperCase() } },
      ];
    }
    if (query.status) where.status = { in: query.status.split(',') as IncidentStatus[] };
    if (query.severity) where.severity = { in: query.severity.split(',') as never };
    if (query.serviceId) where.serviceId = query.serviceId;
    if (query.teamId) where.teamId = query.teamId;

    const orderBy = (parseSort(query.sort, INCIDENT_SORT_FIELDS) ?? [
      { createdAt: 'desc' },
    ]) as Prisma.IncidentOrderByWithRelationInput[];
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.incident.count({ where }),
      this.prisma.incident.findMany({
        where,
        orderBy,
        skip: skip(query.page, query.pageSize),
        take: query.pageSize,
        include: { service: { select: { id: true, name: true } }, _count: { select: { tickets: true } } },
      }),
    ]);
    return {
      data: rows.map((row) =>
        this.toSummary({
          ...row,
          service: row.service,
          ticketCount: row._count.tickets,
        }),
      ),
      meta: pageMeta(query.page, query.pageSize, total),
    };
  }

  async getDetail(idOrKey: string, actor: AuthUser) {
    const incident = await this.load(idOrKey);
    const allowedTransitions = allowedIncidentTransitions(incident.status, {
      permissions: actor.permissions,
      severity: incident.severity,
      postmortemPublished: incident.postmortem?.status === 'PUBLISHED',
    });
    return {
      data: {
        ...this.toSummary({
          ...incident,
          service: incident.service,
          ticketCount: incident.tickets.length,
        }),
        impact: incident.impact,
        detectionMethod: incident.detectionMethod,
        startedAt: incident.startedAt.toISOString(),
        detectedAt: incident.detectedAt.toISOString(),
        mitigatedAt: incident.mitigatedAt?.toISOString() ?? null,
        resolvedAt: incident.resolvedAt?.toISOString() ?? null,
        closedAt: incident.closedAt?.toISOString() ?? null,
        rootCause: incident.rootCause,
        mitigation: incident.mitigation,
        resolution: incident.resolution,
        preventiveAction: incident.preventiveAction,
        postmortem: incident.postmortem
          ? {
              id: incident.postmortem.id,
              status: incident.postmortem.status,
              publishedAt: incident.postmortem.publishedAt?.toISOString() ?? null,
            }
          : null,
        tickets: incident.tickets.map((link) => ({
          id: link.ticket.id,
          key: link.ticket.key,
          title: link.ticket.title,
          status: link.ticket.status,
          priority: link.ticket.priority,
        })),
        can: {
          manage: actor.permissions.includes('incident:manage'),
          close: actor.permissions.includes('incident:close'),
          postmortem: actor.permissions.includes('postmortem:manage'),
        },
        allowedTransitions,
      },
    };
  }

  async timeline(idOrKey: string, _actor: AuthUser) {
    const incident = await this.load(idOrKey);
    const events = await this.prisma.incidentEvent.findMany({
      where: { incidentId: incident.id },
      orderBy: [{ occurredAt: 'asc' }, { createdAt: 'asc' }],
      take: 500,
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
        body: event.body,
        fromValue: event.fromValue,
        toValue: event.toValue,
        occurredAt: event.occurredAt.toISOString(),
        createdAt: event.createdAt.toISOString(),
      })),
    };
  }

  // ───────── Commands ─────────

  async create(input: CreateIncidentInput, actor: AuthUser) {
    const now = new Date();
    const id = uuidv7();
    await this.prisma.$transaction(async (tx) => {
      if (input.serviceId) await this.assertService(tx, input.serviceId);
      const key = await this.nextKey(tx, now.getUTCFullYear());
      await tx.incident.create({
        data: {
          id,
          key,
          title: input.title,
          description: input.description,
          severity: input.severity,
          status: 'IDENTIFIED',
          serviceId: input.serviceId ?? null,
          impact: input.impact ?? null,
          teamId: input.teamId ?? null,
          ownerId: input.ownerId ?? null,
          commanderId: input.commanderId ?? null,
          startedAt: input.startedAt ? new Date(input.startedAt) : now,
          detectedAt: input.detectedAt ? new Date(input.detectedAt) : now,
          detectionMethod: input.detectionMethod ?? null,
          declaredById: actor.id,
        },
      });
      await this.appendEvent(tx, id, actor.id, 'STATUS_CHANGED', {
        toValue: 'IDENTIFIED',
        body: 'Incident declared.',
      });
      await this.audit.record(tx, {
        action: 'incident.declared',
        entityType: 'incident',
        entityId: id,
        entityKey: key,
        after: { title: input.title, severity: input.severity, serviceId: input.serviceId ?? null },
      });
      await this.emit(tx, 'incident.declared', id, {
        incidentId: id,
        key,
        severity: input.severity,
        title: input.title,
      });
    });
    return this.getDetail(id, actor);
  }

  async update(idOrKey: string, input: UpdateIncidentInput, actor: AuthUser) {
    const incident = await this.load(idOrKey);
    if (incident.version !== input.version) throw this.stale();
    if (input.severity !== undefined && !actor.permissions.includes('incident:manage')) {
      throw errors.forbidden('Changing severity requires incident management permission.');
    }
    if (input.serviceId) await this.assertService(this.prisma, input.serviceId);

    const data: Prisma.IncidentUncheckedUpdateInput = { version: { increment: 1 } };
    const changes: Record<string, unknown> = {};
    for (const field of ['title', 'description', 'impact', 'serviceId', 'teamId', 'ownerId', 'commanderId', 'preventiveAction'] as const) {
      if (input[field] !== undefined) {
        (data as Record<string, unknown>)[field] = input[field];
        changes[field] = input[field];
      }
    }
    if (input.severity !== undefined && input.severity !== incident.severity) {
      data.severity = input.severity;
      changes.severity = input.severity;
    }

    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.incident.updateMany({
        where: { id: incident.id, version: input.version },
        data,
      });
      if (updated.count === 0) throw this.stale();
      if (input.severity !== undefined && input.severity !== incident.severity) {
        await this.appendEvent(tx, incident.id, actor.id, 'SEVERITY_CHANGED', {
          fromValue: incident.severity,
          toValue: input.severity,
        });
      }
      if (input.ownerId !== undefined && input.ownerId !== incident.ownerId) {
        await this.appendEvent(tx, incident.id, actor.id, 'OWNER_CHANGED', {
          fromValue: incident.ownerId,
          toValue: input.ownerId,
        });
      }
      if (input.commanderId !== undefined && input.commanderId !== incident.commanderId) {
        await this.appendEvent(tx, incident.id, actor.id, 'COMMANDER_CHANGED', {
          fromValue: incident.commanderId,
          toValue: input.commanderId,
        });
      }
      await this.audit.record(tx, {
        action: 'incident.updated',
        entityType: 'incident',
        entityId: incident.id,
        entityKey: incident.key,
        before: { severity: incident.severity, ownerId: incident.ownerId, commanderId: incident.commanderId },
        after: changes,
      });
    });
    return this.getDetail(incident.id, actor);
  }

  async transition(idOrKey: string, input: IncidentTransitionInput, actor: AuthUser) {
    const incident = await this.load(idOrKey);
    if (incident.version !== input.version) throw this.stale();

    const decision = canIncidentTransition(incident.status, input.to, {
      permissions: actor.permissions,
      severity: incident.severity,
      postmortemPublished: incident.postmortem?.status === 'PUBLISHED',
    });
    if (!decision.ok) {
      if (decision.code === 'FORBIDDEN') throw errors.forbidden();
      if (decision.code === 'POSTMORTEM_REQUIRED') {
        throw errors.businessRule(
          'POSTMORTEM_REQUIRED',
          'Publish the postmortem before closing a SEV1/SEV2 incident.',
        );
      }
      throw errors.businessRule(
        'INCIDENT_INVALID_TRANSITION',
        `Incident cannot move from ${incident.status} to ${input.to}.`,
      );
    }
    const { rule } = decision;
    if (rule.requiresResolution) {
      if (!input.rootCause?.trim() || !input.mitigation?.trim() || !input.impact?.trim()) {
        throw errors.businessRule(
          'VALIDATION_FAILED',
          'Root cause, impact, and mitigation are required to resolve an incident.',
        );
      }
    }

    const now = new Date();
    const data: Prisma.IncidentUncheckedUpdateInput = { status: input.to, version: { increment: 1 } };
    if (input.to === 'MITIGATING') data.mitigatedAt = incident.mitigatedAt ?? now;
    if (input.to === 'RESOLVED') {
      data.resolvedAt = now;
      data.rootCause = input.rootCause ?? incident.rootCause;
      data.mitigation = input.mitigation ?? incident.mitigation;
      data.impact = input.impact ?? incident.impact;
      data.resolution = input.resolution ?? null;
    }
    if (input.to === 'CLOSED') data.closedAt = now;

    const eventType =
      input.to === 'RESOLVED' ? 'RESOLVED' : input.to === 'CLOSED' ? 'CLOSED' : 'STATUS_CHANGED';
    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.incident.updateMany({
        where: { id: incident.id, version: input.version },
        data,
      });
      if (updated.count === 0) throw this.stale();
      await this.appendEvent(tx, incident.id, actor.id, eventType, {
        fromValue: incident.status,
        toValue: input.to,
        body: input.reason ?? null,
      });
      await this.audit.record(tx, {
        action: `incident.${input.to.toLowerCase()}`,
        entityType: 'incident',
        entityId: incident.id,
        entityKey: incident.key,
        before: { status: incident.status },
        after: { status: input.to },
      });
      await this.emit(tx, 'incident.updated', incident.id, {
        incidentId: incident.id,
        key: incident.key,
        from: incident.status,
        to: input.to,
      });
    });
    return this.getDetail(incident.id, actor);
  }

  async addNote(idOrKey: string, input: IncidentNoteInput, actor: AuthUser) {
    const incident = await this.load(idOrKey);
    await this.prisma.$transaction(async (tx) => {
      await this.appendEvent(tx, incident.id, actor.id, input.type, {
        body: input.body,
        ...(input.occurredAt ? { occurredAt: new Date(input.occurredAt) } : {}),
      });
      if (input.type === 'MITIGATION') {
        await tx.incident.update({
          where: { id: incident.id },
          data: { mitigation: input.body, mitigatedAt: incident.mitigatedAt ?? new Date() },
        });
      }
      if (input.type === 'ROOT_CAUSE') {
        await tx.incident.update({ where: { id: incident.id }, data: { rootCause: input.body } });
      }
    });
    return this.timeline(incident.id, actor);
  }

  async linkTickets(idOrKey: string, input: LinkIncidentTicketsInput, actor: AuthUser) {
    const incident = await this.load(idOrKey);
    const tickets = await this.prisma.ticket.findMany({
      where: { id: { in: input.ticketIds } },
      select: { id: true, key: true },
    });
    if (tickets.length !== input.ticketIds.length) {
      throw errors.notFound('TICKET_NOT_FOUND', 'One or more tickets were not found.');
    }
    try {
      await this.prisma.$transaction(async (tx) => {
        for (const ticket of tickets) {
          await tx.incidentTicket.create({
            data: {
              incidentId: incident.id,
              ticketId: ticket.id,
              linkedById: actor.id,
            },
          });
          await this.appendEvent(tx, incident.id, actor.id, 'TICKET_LINKED', {
            toValue: ticket.key,
            body: `Linked ticket ${ticket.key}`,
          });
        }
        await this.audit.record(tx, {
          action: 'incident.tickets_linked',
          entityType: 'incident',
          entityId: incident.id,
          entityKey: incident.key,
          after: { tickets: tickets.map((ticket) => ticket.key) },
        });
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw errors.conflict('CONFLICT', 'A ticket can only be linked to one incident.');
      }
      throw error;
    }
    return this.getDetail(incident.id, actor);
  }

  async unlinkTicket(idOrKey: string, ticketIdOrKey: string, actor: AuthUser) {
    const incident = await this.load(idOrKey);
    const ticket = await this.prisma.ticket.findUnique({
      where: /^TKT-/.test(ticketIdOrKey.toUpperCase())
        ? { key: ticketIdOrKey.toUpperCase() }
        : { id: ticketIdOrKey },
      select: { id: true, key: true },
    });
    if (!ticket) throw errors.notFound('TICKET_NOT_FOUND', 'Ticket not found.');

    const deleted = await this.prisma.$transaction(async (tx) => {
      const result = await tx.incidentTicket.deleteMany({
        where: { incidentId: incident.id, ticketId: ticket.id },
      });
      if (result.count > 0) {
        await this.appendEvent(tx, incident.id, actor.id, 'TICKET_UNLINKED', {
          fromValue: ticket.key,
          body: `Unlinked ticket ${ticket.key}`,
        });
        await this.audit.record(tx, {
          action: 'incident.tickets_unlinked',
          entityType: 'incident',
          entityId: incident.id,
          entityKey: incident.key,
          before: { tickets: [ticket.key] },
        });
      }
      return result.count;
    });
    if (deleted === 0) throw errors.notFound('NOT_FOUND', 'Ticket is not linked to this incident.');
    return this.getDetail(incident.id, actor);
  }

  /** Bulk communication to linked ticket requesters (INC-4). */
  async notifyRequesters(idOrKey: string, message: string, actor: AuthUser) {
    const incident = await this.load(idOrKey);
    const requesters = [
      ...new Map(
        incident.tickets.map((link) => [link.ticket.requesterId, link.ticket]),
      ).values(),
    ];
    if (requesters.length === 0) {
      return { data: { notified: 0 } };
    }

    await this.prisma.$transaction(async (tx) => {
      const event = await this.appendEvent(tx, incident.id, actor.id, 'COMMUNICATION', {
        body: message,
      });
      await tx.notification.createMany({
        data: requesters.map((ticket) => ({
          id: uuidv7(),
          recipientId: ticket.requesterId,
          type: 'INCIDENT_UPDATED',
          title: `Update on incident ${incident.key}`,
          message: message.slice(0, 1000),
          entityType: 'incident',
          entityId: incident.id,
          link: `/tickets/${ticket.key}`,
          dedupeKey: `incident.communication:${event.id}:${ticket.requesterId}`,
        })),
        skipDuplicates: true,
      });
      await this.audit.record(tx, {
        action: 'incident.requesters_notified',
        entityType: 'incident',
        entityId: incident.id,
        entityKey: incident.key,
        metadata: { notified: requesters.length },
      });
    });
    return { data: { notified: requesters.length } };
  }

  // ───────── Postmortem ─────────

  async getPostmortem(idOrKey: string, _actor: AuthUser) {
    const incident = await this.load(idOrKey);
    const postmortem = await this.prisma.postmortem.findUnique({
      where: { incidentId: incident.id },
      include: { actions: { orderBy: { id: 'asc' } } },
    });
    return {
      data: postmortem
        ? {
            ...this.postmortemView(postmortem),
            actions: postmortem.actions.map((action) => this.actionView(action)),
          }
        : null,
    };
  }

  async upsertPostmortem(idOrKey: string, input: UpsertPostmortemInput, actor: AuthUser) {
    const incident = await this.load(idOrKey);
    const existing = await this.prisma.postmortem.findUnique({
      where: { incidentId: incident.id },
    });
    if (existing && existing.version !== input.version) throw this.stale();

    const fields: {
      summary?: string | null;
      impact?: string | null;
      timelineSummary?: string | null;
      rootCause?: string | null;
      contributingFactors?: string | null;
      wentWell?: string | null;
      wentWrong?: string | null;
      ownerId?: string | null;
    } = {};
    for (const key of ['summary', 'impact', 'timelineSummary', 'rootCause', 'contributingFactors', 'wentWell', 'wentWrong', 'ownerId'] as const) {
      if (input[key] !== undefined) fields[key] = input[key];
    }

    await this.prisma.$transaction(async (tx) => {
      if (existing) {
        const updated = await tx.postmortem.updateMany({
          where: { id: existing.id, version: input.version },
          data: { ...fields, version: { increment: 1 } },
        });
        if (updated.count === 0) throw this.stale();
      } else {
        await tx.postmortem.create({
          data: { id: uuidv7(), incidentId: incident.id, status: 'DRAFT', ...fields },
        });
      }
      await this.audit.record(tx, {
        action: 'incident.postmortem_updated',
        entityType: 'incident',
        entityId: incident.id,
        entityKey: incident.key,
      });
    });
    return this.getPostmortem(incident.id, actor);
  }

  async publishPostmortem(idOrKey: string, actor: AuthUser) {
    const incident = await this.load(idOrKey);
    const postmortem = await this.prisma.postmortem.findUnique({
      where: { incidentId: incident.id },
    });
    if (!postmortem) throw errors.notFound('NOT_FOUND', 'Postmortem not found.');
    if (!postmortem.summary?.trim() || !postmortem.rootCause?.trim()) {
      throw errors.businessRule(
        'VALIDATION_FAILED',
        'A summary and root cause are required before publishing.',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.postmortem.update({
        where: { id: postmortem.id },
        data: { status: 'PUBLISHED', publishedAt: new Date(), version: { increment: 1 } },
      });
      await this.appendEvent(tx, incident.id, actor.id, 'NOTE', {
        body: 'Postmortem published.',
      });
      await this.audit.record(tx, {
        action: 'incident.postmortem_published',
        entityType: 'incident',
        entityId: incident.id,
        entityKey: incident.key,
      });
    });
    return this.getPostmortem(incident.id, actor);
  }

  async createAction(idOrKey: string, input: CreatePostmortemActionInput, actor: AuthUser) {
    const incident = await this.load(idOrKey);
    const postmortem = await this.prisma.postmortem.findUnique({
      where: { incidentId: incident.id },
    });
    if (!postmortem) throw errors.notFound('NOT_FOUND', 'Create the postmortem first.');
    await this.prisma.postmortemAction.create({
      data: {
        id: uuidv7(),
        postmortemId: postmortem.id,
        kind: input.kind,
        description: input.description,
        ownerId: input.ownerId ?? null,
        dueDate: input.dueDate ? new Date(`${input.dueDate}T00:00:00Z`) : null,
      },
    });
    return this.getPostmortem(incident.id, actor);
  }

  async updateAction(
    idOrKey: string,
    actionId: string,
    input: UpdatePostmortemActionInput,
    actor: AuthUser,
  ) {
    const incident = await this.load(idOrKey);
    const action = await this.prisma.postmortemAction.findFirst({
      where: { id: actionId, postmortem: { incidentId: incident.id } },
    });
    if (!action) throw errors.notFound('NOT_FOUND', 'Action item not found.');

    await this.prisma.postmortemAction.update({
      where: { id: actionId },
      data: {
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.ownerId !== undefined ? { ownerId: input.ownerId } : {}),
        ...(input.dueDate !== undefined
          ? { dueDate: input.dueDate ? new Date(`${input.dueDate}T00:00:00Z`) : null }
          : {}),
        ...(input.status === 'DONE' ? { completedAt: new Date() } : {}),
        ...(input.status && input.status !== 'DONE' ? { completedAt: null } : {}),
      },
    });
    return this.getPostmortem(incident.id, actor);
  }

  // ───────── Services register ─────────

  async listServices() {
    const services = await this.prisma.service.findMany({ orderBy: { name: 'asc' } });
    return { data: services };
  }

  async createService(
    input: { name: string; description?: string; ownerTeamId?: string | null },
    _actor: AuthUser,
  ) {
    const id = uuidv7();
    await this.prisma.$transaction(async (tx) => {
      await tx.service.create({
        data: {
          id,
          name: input.name,
          description: input.description ?? null,
          ownerTeamId: input.ownerTeamId ?? null,
        },
      });
      await this.audit.record(tx, {
        action: 'incident.service_created',
        entityType: 'service',
        entityId: id,
        after: { name: input.name },
      });
    });
    return { data: { id, name: input.name } };
  }

  // ───────── Helpers ─────────

  private async load(idOrKey: string): Promise<IncidentRow> {
    const incident = await this.prisma.incident.findUnique({
      where: incidentLookup(idOrKey),
      include: DETAIL_INCLUDE,
    });
    if (!incident) throw errors.notFound('INCIDENT_NOT_FOUND', 'Incident not found.');
    return incident;
  }

  private toSummary(incident: {
    id: string;
    key: string;
    title: string;
    description: string;
    severity: IncidentSeverity;
    status: IncidentStatus;
    service: { id: string; name: string } | null;
    ownerId: string | null;
    commanderId: string | null;
    teamId: string | null;
    declaredById: string;
    version: number;
    ticketCount: number;
    createdAt: Date;
    updatedAt: Date;
  }) {
    const service = incident.service;
    const ticketCount = incident.ticketCount;
    return {
      id: incident.id,
      key: incident.key,
      title: incident.title,
      description: incident.description,
      severity: incident.severity,
      status: incident.status,
      service: service ? { id: service.id, name: service.name } : null,
      ownerId: incident.ownerId,
      commanderId: incident.commanderId,
      teamId: incident.teamId,
      declaredById: incident.declaredById,
      version: incident.version,
      ticketCount,
      createdAt: incident.createdAt.toISOString(),
      updatedAt: incident.updatedAt.toISOString(),
    };
  }

  private postmortemView(postmortem: Prisma.PostmortemGetPayload<Record<string, never>>) {
    return {
      id: postmortem.id,
      status: postmortem.status,
      summary: postmortem.summary,
      impact: postmortem.impact,
      timelineSummary: postmortem.timelineSummary,
      rootCause: postmortem.rootCause,
      contributingFactors: postmortem.contributingFactors,
      wentWell: postmortem.wentWell,
      wentWrong: postmortem.wentWrong,
      ownerId: postmortem.ownerId,
      publishedAt: postmortem.publishedAt?.toISOString() ?? null,
      version: postmortem.version,
    };
  }

  private actionView(action: Prisma.PostmortemActionGetPayload<Record<string, never>>) {
    return {
      id: action.id,
      kind: action.kind,
      description: action.description,
      ownerId: action.ownerId,
      dueDate: action.dueDate?.toISOString().slice(0, 10) ?? null,
      status: action.status,
      completedAt: action.completedAt?.toISOString() ?? null,
    };
  }

  private stale(): DomainError {
    return new DomainError(
      'CONFLICT_STALE_VERSION',
      409,
      'This incident was updated by someone else. Reload to see the latest version.',
      [{ field: 'version', issue: 'stale' }],
    );
  }

  private async assertService(
    db: Prisma.TransactionClient | PrismaService,
    serviceId: string,
  ): Promise<void> {
    const service = await db.service.findUnique({ where: { id: serviceId } });
    if (!service) throw errors.notFound('NOT_FOUND', 'Service not found.');
  }

  private async nextKey(tx: Prisma.TransactionClient, year: number): Promise<string> {
    await tx.$executeRaw`INSERT INTO incident_key_counters (year, last) VALUES (${year}, 0) ON CONFLICT (year) DO NOTHING`;
    const rows = await tx.$queryRaw<Array<{ last: number }>>`SELECT last FROM incident_key_counters WHERE year = ${year} FOR UPDATE`;
    const next = Number(rows[0]!.last) + 1;
    await tx.$executeRaw`UPDATE incident_key_counters SET last = ${next} WHERE year = ${year}`;
    return `INC-${year}-${String(next).padStart(3, '0')}`;
  }

  private appendEvent(
    tx: Prisma.TransactionClient,
    incidentId: string,
    actorId: string | null,
    type: IncidentEventType,
    extras: { body?: string | null; fromValue?: string | null; toValue?: string | null; occurredAt?: Date } = {},
  ) {
    return tx.incidentEvent.create({
      data: {
        id: uuidv7(),
        incidentId,
        actorId,
        type,
        body: extras.body ?? null,
        fromValue: extras.fromValue ?? null,
        toValue: extras.toValue ?? null,
        occurredAt: extras.occurredAt ?? new Date(),
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
        aggregateType: 'incident',
        aggregateId,
        payload: payload as Prisma.InputJsonValue,
      },
    });
  }
}
