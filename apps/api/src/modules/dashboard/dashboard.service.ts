import { Injectable } from '@nestjs/common';
import type { Priority, TicketStatus } from '@prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';
import type { AuthUser } from '../../common/auth-user';

const OPEN_STATUSES: TicketStatus[] = [
  'NEW',
  'TRIAGED',
  'ASSIGNED',
  'IN_PROGRESS',
  'WAITING_FOR_USER',
  'ESCALATED',
  'REOPENED',
];

const TICKET_LIST_SELECT = {
  id: true,
  key: true,
  title: true,
  status: true,
  priority: true,
  slaState: true,
  updatedAt: true,
} as const;

const SLA_RANK: Record<string, number> = { BREACHED: 0, AT_RISK: 1, PAUSED: 2, ON_TRACK: 3 };
const PRIORITY_RANK: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async employee(actor: AuthUser) {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const [myOpen, awaitingResponse, recentlyResolved, myAssets, unreadNotifications] =
      await Promise.all([
        this.prisma.ticket.count({
          where: { requesterId: actor.id, status: { in: OPEN_STATUSES } },
        }),
        this.prisma.ticket.count({
          where: { requesterId: actor.id, status: 'WAITING_FOR_USER' },
        }),
        this.prisma.ticket.findMany({
          where: {
            requesterId: actor.id,
            status: { in: ['RESOLVED', 'CLOSED'] },
            resolvedAt: { gte: thirtyDaysAgo },
          },
          select: TICKET_LIST_SELECT,
          orderBy: { resolvedAt: 'desc' },
          take: 5,
        }),
        this.prisma.asset.findMany({
          where: { currentAssigneeId: actor.id, status: 'ASSIGNED' },
          select: { id: true, tag: true, name: true, type: { select: { name: true } } },
          orderBy: { name: 'asc' },
          take: 10,
        }),
        this.prisma.notification.findMany({
          where: { recipientId: actor.id },
          orderBy: { id: 'desc' },
          take: 5,
          select: { id: true, type: true, title: true, link: true, readAt: true, createdAt: true },
        }),
      ]);

    return {
      data: {
        stats: { myOpen, awaitingResponse, recentlyResolved: recentlyResolved.length },
        recentlyResolved: recentlyResolved.map((ticket) => this.ticket(ticket)),
        myAssets,
        unreadNotifications: unreadNotifications.map((notification) => ({
          ...notification,
          readAt: notification.readAt?.toISOString() ?? null,
          createdAt: notification.createdAt.toISOString(),
        })),
      },
    };
  }

  async agent(actor: AuthUser) {
    const teamFilter = { teamId: { in: actor.teamIds } };
    const [assignedToMe, unassignedInTeams, criticalHigh, slaAtRisk, slaBreached, waiting, attention] =
      await Promise.all([
        this.prisma.ticket.count({
          where: { assigneeId: actor.id, status: { in: OPEN_STATUSES } },
        }),
        this.prisma.ticket.count({
          where: { ...teamFilter, assigneeId: null, status: { in: OPEN_STATUSES } },
        }),
        this.prisma.ticket.count({
          where: {
            assigneeId: actor.id,
            priority: { in: ['CRITICAL', 'HIGH'] },
            status: { in: OPEN_STATUSES },
          },
        }),
        this.prisma.ticket.count({
          where: {
            OR: [{ assigneeId: actor.id }, teamFilter],
            slaState: 'AT_RISK',
            status: { in: OPEN_STATUSES },
          },
        }),
        this.prisma.ticket.count({
          where: {
            OR: [{ assigneeId: actor.id }, teamFilter],
            slaState: 'BREACHED',
            status: { in: OPEN_STATUSES },
          },
        }),
        this.prisma.ticket.count({
          where: { assigneeId: actor.id, status: 'WAITING_FOR_USER' },
        }),
        this.prisma.ticket.findMany({
          where: {
            OR: [{ assigneeId: actor.id }, teamFilter],
            status: { in: OPEN_STATUSES },
          },
          select: TICKET_LIST_SELECT,
          take: 100,
        }),
      ]);

    const needsAttention = [...attention]
      .sort((a, b) => {
        const sla = (SLA_RANK[a.slaState ?? ''] ?? 9) - (SLA_RANK[b.slaState ?? ''] ?? 9);
        if (sla !== 0) return sla;
        const priority =
          (PRIORITY_RANK[a.priority] ?? 9) - (PRIORITY_RANK[b.priority] ?? 9);
        if (priority !== 0) return priority;
        return a.updatedAt.getTime() - b.updatedAt.getTime();
      })
      .slice(0, 10)
      .map((ticket) => this.ticket(ticket));

    return {
      data: {
        stats: { assignedToMe, unassignedInTeams, criticalHigh, slaAtRisk, slaBreached, waiting },
        needsAttention,
      },
    };
  }

  async manager(_actor: AuthUser) {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [open, byPriority, byStatus, avgRows, complianceRows, breaches7d, byTeamRows, teams] =
      await Promise.all([
        this.prisma.ticket.count({ where: { status: { in: OPEN_STATUSES } } }),
        this.prisma.ticket.groupBy({
          by: ['priority'],
          where: { status: { in: OPEN_STATUSES } },
          _count: { _all: true },
        }),
        this.prisma.ticket.groupBy({
          by: ['status'],
          where: { status: { in: OPEN_STATUSES } },
          _count: { _all: true },
        }),
        this.prisma.$queryRaw<Array<{ avg_minutes: number | null }>>`
          SELECT AVG(EXTRACT(EPOCH FROM (resolved_at - created_at)) / 60)::float8 AS avg_minutes
          FROM tickets
          WHERE resolved_at IS NOT NULL AND resolved_at >= ${thirtyDaysAgo}
        `,
        this.prisma.$queryRaw<Array<{ total: bigint; on_time: bigint }>>`
          SELECT COUNT(*)::bigint AS total,
                 COUNT(*) FILTER (WHERE completed_at <= due_at)::bigint AS on_time
          FROM sla_timers
          WHERE kind = 'RESOLUTION' AND completed_at IS NOT NULL AND completed_at >= ${thirtyDaysAgo}
        `,
        this.prisma.slaTimer.count({ where: { breachedAt: { gte: sevenDaysAgo } } }),
        this.prisma.ticket.groupBy({
          by: ['teamId'],
          where: { status: { in: OPEN_STATUSES }, teamId: { not: null } },
          _count: { _all: true },
        }),
        this.prisma.team.findMany({ select: { id: true, name: true } }),
      ]);

    const teamNames = new Map(teams.map((team) => [team.id, team.name]));
    const byTeam = byTeamRows
      .map((row) => ({
        teamId: row.teamId,
        name: row.teamId ? (teamNames.get(row.teamId) ?? 'Unknown') : 'Unassigned',
        open: row._count._all,
      }))
      .sort((a, b) => b.open - a.open)
      .slice(0, 8);

    const compliance = complianceRows[0];
    const totalCompleted = Number(compliance?.total ?? 0);
    const onTime = Number(compliance?.on_time ?? 0);
    const slaCompliancePercent =
      totalCompleted > 0 ? Math.round((onTime / totalCompleted) * 100) : null;

    return {
      data: {
        stats: {
          open,
          avgResolutionMinutes:
            avgRows[0]?.avg_minutes != null ? Math.round(avgRows[0].avg_minutes) : null,
          slaCompliancePercent,
          breaches7d,
        },
        byPriority: byPriority.map((row) => ({
          priority: row.priority as Priority,
          count: row._count._all,
        })),
        byStatus: byStatus.map((row) => ({ status: row.status, count: row._count._all })),
        byTeam,
      },
    };
  }

  /** Admin overview (DSH-4). */
  async admin(_actor: AuthUser) {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const [
      usersTotal,
      usersActive,
      usersInvited,
      ticketsOpen,
      incidentsOpen,
      assetsTotal,
      assetsAssigned,
      workflowPending,
      breaches7d,
      recentActivity,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { status: 'ACTIVE' } }),
      this.prisma.user.count({ where: { status: 'INVITED' } }),
      this.prisma.ticket.count({ where: { status: { in: OPEN_STATUSES } } }),
      this.prisma.incident.count({ where: { status: { notIn: ['RESOLVED', 'CLOSED'] } } }),
      this.prisma.asset.count(),
      this.prisma.asset.count({ where: { status: 'ASSIGNED' } }),
      this.prisma.workflowRequest.count({ where: { status: 'OPEN' } }),
      this.prisma.slaTimer.count({ where: { breachedAt: { gte: sevenDaysAgo } } }),
      this.prisma.auditLog.findMany({
        orderBy: { id: 'desc' },
        take: 10,
        select: {
          id: true,
          action: true,
          entityType: true,
          entityKey: true,
          actorEmail: true,
          createdAt: true,
        },
      }),
    ]);

    return {
      data: {
        stats: {
          usersTotal,
          usersActive,
          usersInvited,
          ticketsOpen,
          incidentsOpen,
          assetsTotal,
          assetsAssigned,
          workflowPending,
          breaches7d,
        },
        recentActivity: recentActivity.map((entry) => ({
          id: entry.id,
          action: entry.action,
          entityType: entry.entityType,
          entityKey: entry.entityKey,
          actorEmail: entry.actorEmail,
          createdAt: entry.createdAt.toISOString(),
        })),
      },
    };
  }

  private ticket(ticket: {
    id: string;
    key: string;
    title: string;
    status: TicketStatus;
    priority: Priority;
    slaState: string | null;
    updatedAt: Date;
  }) {
    return {
      id: ticket.id,
      key: ticket.key,
      title: ticket.title,
      status: ticket.status,
      priority: ticket.priority,
      slaState: ticket.slaState,
      updatedAt: ticket.updatedAt.toISOString(),
    };
  }
}
