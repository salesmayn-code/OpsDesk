import { Injectable } from '@nestjs/common';
import type { Prisma, SlaState } from '@prisma/client';
import type { UpdateSlaPolicyInput, UpsertBusinessCalendarInput } from '@opsdesk/contracts';
import type { AuthUser } from '../../common/auth-user';
import { errors } from '../../common/errors';
import { uuidv7 } from '../../common/id';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ticketLookup } from '../tickets/tickets.repository';
import { canViewTicket } from '../tickets/tickets.policy';
import {
  addBusinessMinutes,
  businessMinutesBetween,
  businessPercentConsumed,
  type BusinessCalendarConfig,
  type ScheduleWindow,
} from './domain/business-hours';
import { selectPolicy, type PolicySelectionCandidate } from './domain/policy-selector';
import type { TicketEffects } from '../tickets/domain/ticket-state-machine';

type Db = Prisma.TransactionClient | PrismaService;

type PolicyWithCalendar = Prisma.SlaPolicyGetPayload<{
  include: { calendar: { include: { holidays: true } } };
}>;

export interface TicketForSla {
  id: string;
  key: string;
  priority: string;
  type: string;
  categoryId: string | null;
  createdAt: Date;
  slaPolicyId: string | null;
}

function calendarConfig(calendar: PolicyWithCalendar['calendar']): BusinessCalendarConfig {
  return {
    timezone: calendar.timezone,
    is24x7: calendar.is24x7,
    schedule: (calendar.schedule as unknown as ScheduleWindow[]) ?? [],
    holidays: calendar.holidays.map((holiday) => holiday.date.toISOString().slice(0, 10)),
  };
}

const STATE_RANK: Record<SlaState, number> = {
  CANCELLED: 0,
  COMPLETED: 1,
  ON_TRACK: 2,
  PAUSED: 3,
  AT_RISK: 4,
  BREACHED: 5,
};

@Injectable()
export class SlaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ───────── Policy selection ─────────

  async resolvePolicy(db: Db, ticket: Pick<TicketForSla, 'priority' | 'type' | 'categoryId'>) {
    const policies = await db.slaPolicy.findMany({
      where: { isActive: true },
      include: { calendar: { include: { holidays: true } } },
    });
    const candidates: PolicySelectionCandidate[] = policies.map((policy) => ({
      id: policy.id,
      priority: policy.priority,
      ticketType: policy.ticketType,
      categoryId: policy.categoryId,
      sortOrder: policy.sortOrder,
      isDefault: policy.isDefault,
    }));
    const { policy: selected } = selectPolicy(
      { priority: ticket.priority, ticketType: ticket.type, categoryId: ticket.categoryId },
      candidates,
    );
    const policy = policies.find((entry) => entry.id === selected.id)!;
    return { policy, calendar: calendarConfig(policy.calendar) };
  }

  private thresholds(
    startedAt: Date,
    targetMinutes: number,
    warningPercent: number,
    escalationPercent: number,
    calendar: BusinessCalendarConfig,
    pausedMinutes = 0,
  ) {
    return {
      warnAt: addBusinessMinutes(
        startedAt,
        Math.ceil((targetMinutes * warningPercent) / 100) + pausedMinutes,
        calendar,
      ),
      escalateAt: addBusinessMinutes(
        startedAt,
        Math.ceil((targetMinutes * escalationPercent) / 100) + pausedMinutes,
        calendar,
      ),
      dueAt: addBusinessMinutes(startedAt, targetMinutes + pausedMinutes, calendar),
    };
  }

  private stateFor(
    now: Date,
    dueAt: Date,
    startedAt: Date,
    targetMinutes: number,
    warningPercent: number,
    pausedMinutes: number,
    calendar: BusinessCalendarConfig,
    paused: boolean,
  ): 'ON_TRACK' | 'AT_RISK' | 'BREACHED' | 'PAUSED' {
    if (paused) return 'PAUSED';
    if (now.getTime() > dueAt.getTime()) return 'BREACHED';
    const percent = businessPercentConsumed(startedAt, now, targetMinutes, pausedMinutes, calendar);
    return percent >= warningPercent ? 'AT_RISK' : 'ON_TRACK';
  }

  // ───────── Timer lifecycle ─────────

  async startForTicket(tx: Prisma.TransactionClient, ticket: TicketForSla): Promise<void> {
    const { policy, calendar } = await this.resolvePolicy(tx, ticket);
    const startedAt = ticket.createdAt;
    let resolutionDueAt: Date | null = null;

    for (const kind of ['RESPONSE', 'RESOLUTION'] as const) {
      const targetMinutes =
        kind === 'RESPONSE' ? policy.firstResponseMinutes : policy.resolutionMinutes;
      const bounds = this.thresholds(
        startedAt,
        targetMinutes,
        policy.warningPercent,
        policy.escalationPercent,
        calendar,
      );
      if (kind === 'RESOLUTION') resolutionDueAt = bounds.dueAt;

      const timer = await tx.slaTimer.create({
        data: {
          id: uuidv7(),
          ticketId: ticket.id,
          policyId: policy.id,
          kind,
          targetMinutes,
          state: 'ON_TRACK',
          startedAt,
          ...bounds,
        },
      });
      await tx.slaEvent.create({
        data: {
          id: uuidv7(),
          timerId: timer.id,
          ticketId: ticket.id,
          type: 'STARTED',
          metadata: { policyId: policy.id, targetMinutes },
        },
      });
    }

    await tx.ticket.update({
      where: { id: ticket.id },
      data: { slaPolicyId: policy.id, dueAt: resolutionDueAt, slaState: 'ON_TRACK' },
    });
    await tx.ticketEvent.create({
      data: {
        id: uuidv7(),
        ticketId: ticket.id,
        type: 'SLA_APPLIED',
        metadata: {
          policyId: policy.id,
          policyName: policy.name,
          firstResponseMinutes: policy.firstResponseMinutes,
          resolutionMinutes: policy.resolutionMinutes,
        },
      },
    });
  }

  async applyEffects(
    tx: Prisma.TransactionClient,
    ticket: TicketForSla,
    effects: TicketEffects,
  ): Promise<void> {
    const now = new Date();
    if (effects.pauseResolution) await this.pauseResolution(tx, ticket.id, now);
    if (effects.resumeResolution) await this.resumeResolution(tx, ticket.id, now);
    if (effects.completeResolution) await this.completeTimers(tx, ticket.id, 'RESOLUTION', now);
    if (effects.stopSla) await this.cancelTimers(tx, ticket.id, now);
    if (effects.restartResolution) await this.restartResolution(tx, ticket, now);
    await this.updateTicketSlaState(tx, ticket.id);
  }

  private async pauseResolution(tx: Prisma.TransactionClient, ticketId: string, now: Date) {
    const timers = await tx.slaTimer.findMany({
      where: {
        ticketId,
        kind: 'RESOLUTION',
        isCurrent: true,
        completedAt: null,
        cancelledAt: null,
        pausedAt: null,
      },
    });
    for (const timer of timers) {
      await tx.slaTimer.update({
        where: { id: timer.id },
        data: { pausedAt: now, state: 'PAUSED' },
      });
      await tx.slaEvent.create({
        data: { id: uuidv7(), timerId: timer.id, ticketId, type: 'PAUSED' },
      });
    }
  }

  private async resumeResolution(tx: Prisma.TransactionClient, ticketId: string, now: Date) {
    const timers = await tx.slaTimer.findMany({
      where: {
        ticketId,
        kind: 'RESOLUTION',
        isCurrent: true,
        completedAt: null,
        cancelledAt: null,
        pausedAt: { not: null },
      },
    });
    for (const timer of timers) {
      const policy = timer.policyId
        ? await tx.slaPolicy.findUnique({
            where: { id: timer.policyId },
            include: { calendar: { include: { holidays: true } } },
          })
        : null;
      if (!policy || !timer.pausedAt) continue;
      const calendar = calendarConfig(policy.calendar);
      const pausedBusinessMinutes = businessMinutesBetween(timer.pausedAt, now, calendar);
      const pausedMinutes = timer.pausedMinutes + pausedBusinessMinutes;
      const bounds = this.thresholds(
        timer.startedAt,
        timer.targetMinutes,
        policy.warningPercent,
        policy.escalationPercent,
        calendar,
        pausedMinutes,
      );
      const state = this.stateFor(
        now,
        bounds.dueAt,
        timer.startedAt,
        timer.targetMinutes,
        policy.warningPercent,
        pausedMinutes,
        calendar,
        false,
      );
      await tx.slaTimer.update({
        where: { id: timer.id },
        data: { pausedAt: null, pausedMinutes, ...bounds, state },
      });
      await tx.slaEvent.create({
        data: {
          id: uuidv7(),
          timerId: timer.id,
          ticketId,
          type: 'RESUMED',
          metadata: { pausedMinutes: pausedBusinessMinutes, totalPausedMinutes: pausedMinutes },
        },
      });
    }
  }

  private async completeTimers(
    tx: Prisma.TransactionClient,
    ticketId: string,
    kind: 'RESPONSE' | 'RESOLUTION',
    now: Date,
  ) {
    const timers = await tx.slaTimer.findMany({
      where: { ticketId, kind, isCurrent: true, completedAt: null, cancelledAt: null },
    });
    for (const timer of timers) {
      await tx.slaTimer.update({
        where: { id: timer.id },
        data: { completedAt: now, state: 'COMPLETED', pausedAt: null },
      });
      await tx.slaEvent.create({
        data: { id: uuidv7(), timerId: timer.id, ticketId, type: 'COMPLETED' },
      });
    }
  }

  private async cancelTimers(tx: Prisma.TransactionClient, ticketId: string, now: Date) {
    const timers = await tx.slaTimer.findMany({
      where: { ticketId, isCurrent: true, completedAt: null, cancelledAt: null },
    });
    for (const timer of timers) {
      await tx.slaTimer.update({
        where: { id: timer.id },
        data: { cancelledAt: now, state: 'CANCELLED', pausedAt: null },
      });
      await tx.slaEvent.create({
        data: { id: uuidv7(), timerId: timer.id, ticketId, type: 'CANCELLED' },
      });
    }
  }

  private async restartResolution(
    tx: Prisma.TransactionClient,
    ticket: TicketForSla,
    now: Date,
  ) {
    const existing = await tx.slaTimer.findMany({
      where: { ticketId: ticket.id, kind: 'RESOLUTION', isCurrent: true },
    });
    for (const timer of existing) {
      await tx.slaTimer.update({ where: { id: timer.id }, data: { isCurrent: false } });
    }

    const policyRow = ticket.slaPolicyId
      ? await tx.slaPolicy.findUnique({
          where: { id: ticket.slaPolicyId },
          include: { calendar: { include: { holidays: true } } },
        })
      : null;
    if (!policyRow) return;
    const calendar = calendarConfig(policyRow.calendar);
    const bounds = this.thresholds(
      now,
      policyRow.resolutionMinutes,
      policyRow.warningPercent,
      policyRow.escalationPercent,
      calendar,
    );
    const timer = await tx.slaTimer.create({
      data: {
        id: uuidv7(),
        ticketId: ticket.id,
        policyId: policyRow.id,
        kind: 'RESOLUTION',
        targetMinutes: policyRow.resolutionMinutes,
        state: 'ON_TRACK',
        startedAt: now,
        ...bounds,
      },
    });
    await tx.slaEvent.create({
      data: {
        id: uuidv7(),
        timerId: timer.id,
        ticketId: ticket.id,
        type: 'STARTED',
        metadata: { restarted: true, policyId: policyRow.id },
      },
    });
    await tx.ticket.update({ where: { id: ticket.id }, data: { dueAt: bounds.dueAt } });
  }

  /** Recomputes active timers after a priority/type/category change (SLA-2, SLA-7). */
  async recalculateForTicket(tx: Prisma.TransactionClient, ticket: TicketForSla): Promise<void> {
    const { policy, calendar } = await this.resolvePolicy(tx, ticket);
    const timers = await tx.slaTimer.findMany({
      where: { ticketId: ticket.id, isCurrent: true, completedAt: null, cancelledAt: null },
    });
    let resolutionDueAt: Date | null = null;

    for (const timer of timers) {
      const targetMinutes =
        timer.kind === 'RESPONSE' ? policy.firstResponseMinutes : policy.resolutionMinutes;
      const bounds = this.thresholds(
        timer.startedAt,
        targetMinutes,
        policy.warningPercent,
        policy.escalationPercent,
        calendar,
        timer.pausedMinutes,
      );
      if (timer.kind === 'RESOLUTION') resolutionDueAt = bounds.dueAt;

      await tx.slaTimer.update({
        where: { id: timer.id },
        data: {
          policyId: policy.id,
          targetMinutes,
          ...bounds,
          state: this.stateFor(
            new Date(),
            bounds.dueAt,
            timer.startedAt,
            targetMinutes,
            policy.warningPercent,
            timer.pausedMinutes,
            calendar,
            timer.pausedAt !== null,
          ),
        },
      });
      await tx.slaEvent.create({
        data: {
          id: uuidv7(),
          timerId: timer.id,
          ticketId: ticket.id,
          type: 'RECALCULATED',
          metadata: { policyId: policy.id, oldDueAt: timer.dueAt, newDueAt: bounds.dueAt },
        },
      });
    }

    await tx.ticket.update({
      where: { id: ticket.id },
      data: { slaPolicyId: policy.id, dueAt: resolutionDueAt ?? undefined },
    });
    await this.updateTicketSlaState(tx, ticket.id);
  }

  async updateTicketSlaState(tx: Prisma.TransactionClient, ticketId: string): Promise<void> {
    const timers = await tx.slaTimer.findMany({
      where: { ticketId, isCurrent: true },
    });
    if (timers.length === 0) return;
    const worst = timers.reduce<SlaState>(
      (current, timer) =>
        (STATE_RANK[timer.state] ?? 0) > (STATE_RANK[current] ?? 0) ? timer.state : current,
      'CANCELLED',
    );
    const resolution = timers.find((timer) => timer.kind === 'RESOLUTION');
    await tx.ticket.update({
      where: { id: ticketId },
      data: { slaState: worst, ...(resolution ? { dueAt: resolution.dueAt } : {}) },
    });
  }

  /** TKT-18: first public staff reply completes the RESPONSE timer. */
  async completeResponseTimer(
    tx: Prisma.TransactionClient,
    ticketId: string,
    now: Date = new Date(),
  ): Promise<void> {
    await this.completeTimers(tx, ticketId, 'RESPONSE', now);
    await this.updateTicketSlaState(tx, ticketId);
  }

  // ───────── Evaluator (SLA-6) ─────────

  async evaluate(now: Date): Promise<{ scanned: number; warned: number; escalated: number; breached: number }> {
    const timers = await this.prisma.slaTimer.findMany({
      where: {
        isCurrent: true,
        completedAt: null,
        cancelledAt: null,
        pausedAt: null,
        OR: [
          { breachedAt: null, dueAt: { lte: now } },
          { warnedAt: null, warnAt: { lte: now } },
          { escalatedAt: null, escalateAt: { lte: now } },
        ],
      },
      take: 500,
    });

    const counts = { scanned: timers.length, warned: 0, escalated: 0, breached: 0 };

    for (const timer of timers) {
      await this.prisma.$transaction(async (tx) => {
        if (!timer.warnedAt && timer.warnAt.getTime() <= now.getTime()) {
          const updated = await tx.slaTimer.updateMany({
            where: { id: timer.id, warnedAt: null, state: { not: 'BREACHED' } },
            data: { warnedAt: now, state: 'AT_RISK' },
          });
          if (updated.count === 1) {
            counts.warned += 1;
            await tx.slaEvent.create({
              data: { id: uuidv7(), timerId: timer.id, ticketId: timer.ticketId, type: 'WARNING' },
            });
            await this.emit(tx, 'sla.warning', timer.ticketId, {
              ticketId: timer.ticketId,
              timerId: timer.id,
              kind: timer.kind,
              dueAt: timer.dueAt,
            });
          }
        }

        if (!timer.escalatedAt && timer.escalateAt.getTime() <= now.getTime()) {
          const updated = await tx.slaTimer.updateMany({
            where: { id: timer.id, escalatedAt: null },
            data: { escalatedAt: now },
          });
          if (updated.count === 1) {
            counts.escalated += 1;
            await tx.slaEvent.create({
              data: {
                id: uuidv7(),
                timerId: timer.id,
                ticketId: timer.ticketId,
                type: 'ESCALATED',
              },
            });
            await this.emit(tx, 'sla.escalated', timer.ticketId, {
              ticketId: timer.ticketId,
              timerId: timer.id,
              kind: timer.kind,
              dueAt: timer.dueAt,
            });
          }
        }

        if (!timer.breachedAt && timer.dueAt.getTime() <= now.getTime()) {
          const updated = await tx.slaTimer.updateMany({
            where: { id: timer.id, breachedAt: null },
            data: { breachedAt: now, state: 'BREACHED', pausedAt: null },
          });
          if (updated.count === 1) {
            counts.breached += 1;
            await tx.slaEvent.create({
              data: {
                id: uuidv7(),
                timerId: timer.id,
                ticketId: timer.ticketId,
                type: 'BREACHED',
                metadata: { dueAt: timer.dueAt },
              },
            });
            await tx.ticketEvent.create({
              data: {
                id: uuidv7(),
                ticketId: timer.ticketId,
                type: 'SLA_BREACHED',
                metadata: { kind: timer.kind, dueAt: timer.dueAt },
              },
            });
            await this.audit.record(tx, {
              action: 'sla.breached',
              entityType: 'ticket',
              entityId: timer.ticketId,
              metadata: { timerId: timer.id, kind: timer.kind, dueAt: timer.dueAt },
            });
            await this.emit(tx, 'sla.breached', timer.ticketId, {
              ticketId: timer.ticketId,
              timerId: timer.id,
              kind: timer.kind,
              dueAt: timer.dueAt,
            });
          }
        }

        await this.updateTicketSlaState(tx, timer.ticketId);
      });
    }

    return counts;
  }

  // ───────── Queries for controllers ─────────

  async getTicketSla(idOrKey: string, actor: AuthUser) {
    const ticket = await this.prisma.ticket.findUnique({
      where: ticketLookup(idOrKey),
      include: {
        watchers: { select: { userId: true } },
        team: { select: { managerId: true } },
        slaPolicy: { include: { calendar: { include: { holidays: true } } } },
        slaTimers: { where: { isCurrent: true }, orderBy: { kind: 'asc' } },
      },
    });
    if (
      !ticket ||
      !canViewTicket(actor, {
        requesterId: ticket.requesterId,
        assigneeId: ticket.assigneeId,
        teamId: ticket.teamId,
        teamManagerId: ticket.team?.managerId ?? null,
        watcherIds: ticket.watchers.map((watcher) => watcher.userId),
      })
    ) {
      throw errors.notFound('TICKET_NOT_FOUND', 'Ticket not found or you do not have access.');
    }

    const calendar = ticket.slaPolicy ? calendarConfig(ticket.slaPolicy.calendar) : null;
    const events = await this.prisma.slaEvent.findMany({
      where: { ticketId: ticket.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    return {
      data: {
        policy: ticket.slaPolicy
          ? {
              id: ticket.slaPolicy.id,
              name: ticket.slaPolicy.name,
              calendarName: ticket.slaPolicy.calendar.name,
              timezone: ticket.slaPolicy.calendar.timezone,
            }
          : null,
        timers: ticket.slaTimers.map((timer) => ({
          id: timer.id,
          kind: timer.kind,
          state: timer.state,
          targetMinutes: timer.targetMinutes,
          startedAt: timer.startedAt.toISOString(),
          dueAt: timer.dueAt.toISOString(),
          warnAt: timer.warnAt.toISOString(),
          escalateAt: timer.escalateAt.toISOString(),
          pausedAt: timer.pausedAt?.toISOString() ?? null,
          pausedMinutes: timer.pausedMinutes,
          warnedAt: timer.warnedAt?.toISOString() ?? null,
          escalatedAt: timer.escalatedAt?.toISOString() ?? null,
          breachedAt: timer.breachedAt?.toISOString() ?? null,
          completedAt: timer.completedAt?.toISOString() ?? null,
          cancelledAt: timer.cancelledAt?.toISOString() ?? null,
          isCurrent: timer.isCurrent,
          percentConsumed: calendar
            ? businessPercentConsumed(
                timer.startedAt,
                new Date(),
                timer.targetMinutes,
                timer.pausedMinutes,
                calendar,
              )
            : null,
        })),
        events: events.map((event) => ({
          id: event.id,
          type: event.type,
          metadata: event.metadata,
          createdAt: event.createdAt.toISOString(),
        })),
      },
    };
  }

  // ───────── Policy / calendar administration ─────────

  async listPolicies() {
    const policies = await this.prisma.slaPolicy.findMany({
      include: { calendar: { select: { id: true, name: true, timezone: true, is24x7: true } } },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    return { data: policies };
  }

  async listCalendars() {
    const calendars = await this.prisma.businessCalendar.findMany({
      include: { holidays: { orderBy: { date: 'asc' } } },
      orderBy: { name: 'asc' },
    });
    return {
      data: calendars.map((calendar) => ({
        id: calendar.id,
        name: calendar.name,
        timezone: calendar.timezone,
        is24x7: calendar.is24x7,
        schedule: calendar.schedule,
        holidays: calendar.holidays.map((holiday) => ({
          date: holiday.date.toISOString().slice(0, 10),
          name: holiday.name,
        })),
      })),
    };
  }

  async createCalendar(input: UpsertBusinessCalendarInput) {
    const id = uuidv7();
    await this.prisma.$transaction(async (tx) => {
      await tx.businessCalendar.create({
        data: {
          id,
          name: input.name,
          timezone: input.timezone,
          is24x7: input.is24x7,
          schedule: input.schedule as unknown as Prisma.InputJsonValue,
        },
      });
      if (input.holidays?.length) {
        await tx.holiday.createMany({
          data: input.holidays.map((holiday) => ({
            id: uuidv7(),
            calendarId: id,
            date: new Date(`${holiday.date}T00:00:00Z`),
            name: holiday.name,
          })),
        });
      }
      await this.audit.record(tx, {
        action: 'settings.updated',
        entityType: 'business_calendar',
        entityId: id,
        after: { name: input.name, timezone: input.timezone },
      });
    });
    const calendars = await this.listCalendars();
    return { data: calendars.data.find((calendar) => calendar.id === id) };
  }

  async createPolicy(input: {
    name: string;
    description?: string;
    priority?: string | null;
    ticketType?: string | null;
    categoryId?: string | null;
    calendarId: string;
    firstResponseMinutes: number;
    resolutionMinutes: number;
    warningPercent: number;
    escalationPercent: number;
    pauseOnStatuses: string[];
    isDefault: boolean;
    isActive: boolean;
    sortOrder: number;
  }) {
    const calendar = await this.prisma.businessCalendar.findUnique({
      where: { id: input.calendarId },
    });
    if (!calendar) throw errors.notFound('NOT_FOUND', 'Business calendar not found.');
    if (input.resolutionMinutes < input.firstResponseMinutes) {
      throw errors.businessRule(
        'VALIDATION_FAILED',
        'Resolution target must be at least the first-response target.',
      );
    }

    const id = uuidv7();
    await this.prisma.$transaction(async (tx) => {
      if (input.isDefault) {
        await tx.slaPolicy.updateMany({
          where: { isDefault: true },
          data: { isDefault: false },
        });
      }
      await tx.slaPolicy.create({
        data: {
          id,
          name: input.name,
          description: input.description ?? null,
          priority: (input.priority ?? null) as never,
          ticketType: (input.ticketType ?? null) as never,
          categoryId: input.categoryId ?? null,
          calendarId: input.calendarId,
          firstResponseMinutes: input.firstResponseMinutes,
          resolutionMinutes: input.resolutionMinutes,
          warningPercent: input.warningPercent,
          escalationPercent: input.escalationPercent,
          pauseOnStatuses: input.pauseOnStatuses as never,
          isDefault: input.isDefault,
          isActive: input.isActive,
          sortOrder: input.sortOrder,
        },
      });
      await this.audit.record(tx, {
        action: 'sla_policy.created',
        entityType: 'sla_policy',
        entityId: id,
        after: { name: input.name, priority: input.priority, targets: [input.firstResponseMinutes, input.resolutionMinutes] },
      });
    });
    const policies = await this.listPolicies();
    return { data: policies.data.find((policy) => policy.id === id) };
  }

  async updatePolicy(id: string, input: UpdateSlaPolicyInput) {
    const policy = await this.prisma.slaPolicy.findUnique({ where: { id } });
    if (!policy) throw errors.notFound('SLA_POLICY_NOT_FOUND', 'SLA policy not found.');

    if (
      input.firstResponseMinutes !== undefined &&
      input.resolutionMinutes !== undefined &&
      input.resolutionMinutes < input.firstResponseMinutes
    ) {
      throw errors.businessRule(
        'VALIDATION_FAILED',
        'Resolution target must be at least the first-response target.',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      if (input.isDefault === true) {
        await tx.slaPolicy.updateMany({
          where: { isDefault: true, id: { not: id } },
          data: { isDefault: false },
        });
      }
      await tx.slaPolicy.update({
        where: { id },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.description !== undefined ? { description: input.description } : {}),
          ...(input.priority !== undefined ? { priority: input.priority as never } : {}),
          ...(input.ticketType !== undefined ? { ticketType: input.ticketType as never } : {}),
          ...(input.categoryId !== undefined ? { categoryId: input.categoryId } : {}),
          ...(input.calendarId !== undefined ? { calendarId: input.calendarId } : {}),
          ...(input.firstResponseMinutes !== undefined
            ? { firstResponseMinutes: input.firstResponseMinutes }
            : {}),
          ...(input.resolutionMinutes !== undefined
            ? { resolutionMinutes: input.resolutionMinutes }
            : {}),
          ...(input.warningPercent !== undefined ? { warningPercent: input.warningPercent } : {}),
          ...(input.escalationPercent !== undefined
            ? { escalationPercent: input.escalationPercent }
            : {}),
          ...(input.pauseOnStatuses !== undefined
            ? { pauseOnStatuses: input.pauseOnStatuses as never }
            : {}),
          ...(input.isDefault !== undefined ? { isDefault: input.isDefault } : {}),
          ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
          ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
        },
      });
      await this.audit.record(tx, {
        action: 'sla_policy.updated',
        entityType: 'sla_policy',
        entityId: id,
        before: {
          name: policy.name,
          firstResponseMinutes: policy.firstResponseMinutes,
          resolutionMinutes: policy.resolutionMinutes,
        },
        after: input as Record<string, unknown>,
      });
    });
    const policies = await this.listPolicies();
    return { data: policies.data.find((entry) => entry.id === id) };
  }

  async preview(input: {
    priority: string;
    type: string;
    categoryId?: string | null;
    createdAt?: string;
  }) {
    const { policy, calendar } = await this.resolvePolicy(this.prisma, {
      priority: input.priority,
      type: input.type,
      categoryId: input.categoryId ?? null,
    });
    const startedAt = input.createdAt ? new Date(input.createdAt) : new Date();
    return {
      data: {
        policy: {
          id: policy.id,
          name: policy.name,
          firstResponseMinutes: policy.firstResponseMinutes,
          resolutionMinutes: policy.resolutionMinutes,
          warningPercent: policy.warningPercent,
          escalationPercent: policy.escalationPercent,
        },
        calendar: { id: policy.calendar.id, name: policy.calendar.name, timezone: policy.calendar.timezone },
        response: this.thresholds(
          startedAt,
          policy.firstResponseMinutes,
          policy.warningPercent,
          policy.escalationPercent,
          calendar,
        ),
        resolution: this.thresholds(
          startedAt,
          policy.resolutionMinutes,
          policy.warningPercent,
          policy.escalationPercent,
          calendar,
        ),
      },
    };
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
        aggregateType: 'ticket',
        aggregateId,
        payload: payload as Prisma.InputJsonValue,
      },
    });
  }
}
