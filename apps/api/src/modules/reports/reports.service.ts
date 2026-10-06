import { Injectable } from '@nestjs/common';
import type { ReportKey, ReportQuery } from '@opsdesk/contracts';
import { errors } from '../../common/errors';
import { PrismaService } from '../../infra/prisma/prisma.service';

const NIL_TEAM = '00000000-0000-0000-0000-000000000000';

interface StatRow {
  teamId: string;
  priority: string;
  created: number;
  resolved: number;
  breachedResponse: number;
  breachedResolution: number;
  sumFirstResponseMinutes: number;
  sumResolutionMinutes: number;
}

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Nightly rollup into `daily_ticket_stats` (RPT-1). Idempotent per day. */
  async rollupDay(day: Date): Promise<{ rows: number }> {
    const dayStart = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate()));
    const dayEnd = new Date(dayStart.getTime() + 86_400_000);
    const range = { gte: dayStart, lt: dayEnd };

    const [createdGroups, resolvedGroups, firstResponse, resolutionMinutes, responseBreaches, resolutionBreaches] =
      await Promise.all([
        this.prisma.ticket.groupBy({
          by: ['teamId', 'priority'],
          where: { createdAt: range },
          _count: { _all: true },
        }),
        this.prisma.ticket.groupBy({
          by: ['teamId', 'priority'],
          where: { resolvedAt: range },
          _count: { _all: true },
        }),
        this.prisma.$queryRaw<Array<{ team_id: string; priority: string; total: number }>>`
          SELECT COALESCE(team_id, ${NIL_TEAM}::uuid) AS team_id, priority::text AS priority,
                 COALESCE(SUM(EXTRACT(EPOCH FROM (first_response_at - created_at)) / 60), 0)::int AS total
          FROM tickets
          WHERE first_response_at >= ${dayStart} AND first_response_at < ${dayEnd}
          GROUP BY 1, 2
        `,
        this.prisma.$queryRaw<Array<{ team_id: string; priority: string; total: number }>>`
          SELECT COALESCE(team_id, ${NIL_TEAM}::uuid) AS team_id, priority::text AS priority,
                 COALESCE(SUM(EXTRACT(EPOCH FROM (resolved_at - created_at)) / 60), 0)::int AS total
          FROM tickets
          WHERE resolved_at >= ${dayStart} AND resolved_at < ${dayEnd}
          GROUP BY 1, 2
        `,
        this.prisma.$queryRaw<Array<{ team_id: string; priority: string; total: number }>>`
          SELECT COALESCE(t.team_id, ${NIL_TEAM}::uuid) AS team_id, t.priority::text AS priority,
                 COUNT(*)::int AS total
          FROM sla_timers s JOIN tickets t ON t.id = s.ticket_id
          WHERE s.kind = 'RESPONSE' AND s.breached_at >= ${dayStart} AND s.breached_at < ${dayEnd}
          GROUP BY 1, 2
        `,
        this.prisma.$queryRaw<Array<{ team_id: string; priority: string; total: number }>>`
          SELECT COALESCE(t.team_id, ${NIL_TEAM}::uuid) AS team_id, t.priority::text AS priority,
                 COUNT(*)::int AS total
          FROM sla_timers s JOIN tickets t ON t.id = s.ticket_id
          WHERE s.kind = 'RESOLUTION' AND s.breached_at >= ${dayStart} AND s.breached_at < ${dayEnd}
          GROUP BY 1, 2
        `,
      ]);

    const rows = new Map<string, StatRow>();
    const key = (teamId: string, priority: string) => `${teamId}:${priority}`;
    const ensure = (teamId: string, priority: string): StatRow => {
      const existing = rows.get(key(teamId, priority));
      if (existing) return existing;
      const row: StatRow = {
        teamId,
        priority,
        created: 0,
        resolved: 0,
        breachedResponse: 0,
        breachedResolution: 0,
        sumFirstResponseMinutes: 0,
        sumResolutionMinutes: 0,
      };
      rows.set(key(teamId, priority), row);
      return row;
    };

    for (const group of createdGroups) {
      ensure(group.teamId ?? NIL_TEAM, group.priority).created = group._count._all;
    }
    for (const group of resolvedGroups) {
      ensure(group.teamId ?? NIL_TEAM, group.priority).resolved = group._count._all;
    }
    for (const row of firstResponse) {
      ensure(row.team_id, row.priority).sumFirstResponseMinutes = Number(row.total);
    }
    for (const row of resolutionMinutes) {
      ensure(row.team_id, row.priority).sumResolutionMinutes = Number(row.total);
    }
    for (const row of responseBreaches) {
      ensure(row.team_id, row.priority).breachedResponse = Number(row.total);
    }
    for (const row of resolutionBreaches) {
      ensure(row.team_id, row.priority).breachedResolution = Number(row.total);
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.dailyTicketStats.deleteMany({ where: { day: dayStart } });
      if (rows.size > 0) {
        await tx.dailyTicketStats.createMany({
          data: [...rows.values()].map((row) => ({
            day: dayStart,
            teamId: row.teamId,
            priority: row.priority as never,
            created: row.created,
            resolved: row.resolved,
            breachedResponse: row.breachedResponse,
            breachedResolution: row.breachedResolution,
            sumFirstResponseMinutes: row.sumFirstResponseMinutes,
            sumResolutionMinutes: row.sumResolutionMinutes,
          })),
        });
      }
    });
    return { rows: rows.size };
  }

  async report(reportKey: ReportKey, query: ReportQuery) {
    const to = query.to ? new Date(query.to) : new Date();
    const from = query.from ? new Date(query.from) : new Date(to.getTime() - 30 * 86_400_000);

    switch (reportKey) {
      case 'volume': {
        const [created, resolved] = await Promise.all([
          this.prisma.$queryRaw<Array<{ day: string; count: number }>>`
            SELECT to_char(date_trunc('day', created_at), 'YYYY-MM-DD') AS day, COUNT(*)::int AS count
            FROM tickets WHERE created_at >= ${from} AND created_at < ${to}
            GROUP BY 1 ORDER BY 1
          `,
          this.prisma.$queryRaw<Array<{ day: string; count: number }>>`
            SELECT to_char(date_trunc('day', resolved_at), 'YYYY-MM-DD') AS day, COUNT(*)::int AS count
            FROM tickets WHERE resolved_at >= ${from} AND resolved_at < ${to}
            GROUP BY 1 ORDER BY 1
          `,
        ]);
        const days = new Map<string, { day: string; created: number; resolved: number }>();
        for (const row of created) {
          days.set(row.day, { day: row.day, created: Number(row.count), resolved: 0 });
        }
        for (const row of resolved) {
          const entry = days.get(row.day) ?? { day: row.day, created: 0, resolved: 0 };
          entry.resolved = Number(row.count);
          days.set(row.day, entry);
        }
        return { from, to, rows: [...days.values()].sort((a, b) => a.day.localeCompare(b.day)) };
      }
      case 'sla-compliance': {
        const rows = await this.prisma.$queryRaw<
          Array<{ team_id: string; team: string; total: number; on_time: number }>
        >`
          SELECT COALESCE(t.team_id, ${NIL_TEAM}::uuid) AS team_id,
                 COALESCE(tm.name, 'Unassigned') AS team,
                 COUNT(*)::int AS total,
                 COUNT(*) FILTER (WHERE s.completed_at <= s.due_at)::int AS on_time
          FROM sla_timers s
          JOIN tickets t ON t.id = s.ticket_id
          LEFT JOIN teams tm ON tm.id = t.team_id
          WHERE s.kind = 'RESOLUTION' AND s.completed_at >= ${from} AND s.completed_at < ${to}
          GROUP BY 1, 2
          ORDER BY 3 DESC
        `;
        return {
          from,
          to,
          rows: rows.map((row) => ({
            teamId: row.team_id,
            team: row.team,
            total: Number(row.total),
            onTime: Number(row.on_time),
            compliancePercent: Number(row.total) > 0 ? Math.round((Number(row.on_time) / Number(row.total)) * 100) : null,
          })),
        };
      }
      case 'breaches': {
        const rows = await this.prisma.$queryRaw<
          Array<{ kind: string; team: string; count: number }>
        >`
          SELECT s.kind::text AS kind, COALESCE(tm.name, 'Unassigned') AS team, COUNT(*)::int AS count
          FROM sla_timers s
          JOIN tickets t ON t.id = s.ticket_id
          LEFT JOIN teams tm ON tm.id = t.team_id
          WHERE s.breached_at >= ${from} AND s.breached_at < ${to}
          GROUP BY 1, 2
          ORDER BY 3 DESC
        `;
        return {
          from,
          to,
          rows: rows.map((row) => ({ kind: row.kind, team: row.team, count: Number(row.count) })),
        };
      }
      case 'categories': {
        const rows = await this.prisma.$queryRaw<Array<{ category: string; count: number }>>`
          SELECT COALESCE(c.name, 'Uncategorised') AS category, COUNT(*)::int AS count
          FROM tickets t LEFT JOIN categories c ON c.id = t.category_id
          WHERE t.created_at >= ${from} AND t.created_at < ${to}
          GROUP BY 1 ORDER BY 2 DESC
        `;
        return {
          from,
          to,
          rows: rows.map((row) => ({ category: row.category, count: Number(row.count) })),
        };
      }
      case 'response-times': {
        const rows = await this.prisma.$queryRaw<
          Array<{
            team: string;
            avg_first_response_minutes: number | null;
            avg_resolution_minutes: number | null;
          }>
        >`
          SELECT COALESCE(tm.name, 'Unassigned') AS team,
                 ROUND(AVG(EXTRACT(EPOCH FROM (t.first_response_at - t.created_at)) / 60))::int AS avg_first_response_minutes,
                 ROUND(AVG(EXTRACT(EPOCH FROM (t.resolved_at - t.created_at)) / 60))::int AS avg_resolution_minutes
          FROM tickets t LEFT JOIN teams tm ON tm.id = t.team_id
          WHERE t.created_at >= ${from} AND t.created_at < ${to}
          GROUP BY 1 ORDER BY 1
        `;
        return {
          from,
          to,
          rows: rows.map((row) => ({
            team: row.team,
            avgFirstResponseMinutes: row.avg_first_response_minutes,
            avgResolutionMinutes: row.avg_resolution_minutes,
          })),
        };
      }
      default:
        throw errors.notFound('REPORT_NOT_FOUND', 'Unknown report.');
    }
  }

  /** CSV export (RPT-3). */
  toCsv(rows: Record<string, unknown>[]): string {
    if (rows.length === 0) return '';
    const headers = Object.keys(rows[0]!);
    const escape = (value: unknown): string => {
      if (value === null || value === undefined) return '';
      const text = String(value);
      return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
    };
    return [
      headers.join(','),
      ...rows.map((row) => headers.map((header) => escape(row[header])).join(',')),
    ].join('\n');
  }
}
