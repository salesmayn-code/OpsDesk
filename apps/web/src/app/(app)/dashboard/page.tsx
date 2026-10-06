'use client';

import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { useDashboard } from '@/features/platform/hooks';
import { PriorityBadge, StatusBadge } from '@/components/status-badge';
import { relativeTime } from '@/lib/format';
import type { Priority, TicketStatus } from '@opsdesk/contracts';

interface TicketRow {
  id: string;
  key: string;
  title: string;
  status: TicketStatus;
  priority: Priority;
  slaState: string | null;
  updatedAt: string;
}

function StatCard({
  label,
  value,
  href,
}: {
  label: string;
  value: number | string | null | undefined;
  href?: string;
}) {
  const content = (
    <div className="rounded-card border border-border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value ?? '—'}</p>
    </div>
  );
  return href ? <Link href={href}>{content}</Link> : content;
}

function TicketTable({ rows }: { rows: TicketRow[] }) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">Nothing needs attention.</p>;
  }
  return (
    <div className="overflow-x-auto rounded-card border border-border bg-card">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs text-muted-foreground">
            <th scope="col" className="px-3 py-2 font-medium">Key</th>
            <th scope="col" className="px-3 py-2 font-medium">Title</th>
            <th scope="col" className="px-3 py-2 font-medium">Priority</th>
            <th scope="col" className="px-3 py-2 font-medium">Status</th>
            <th scope="col" className="hidden px-3 py-2 font-medium sm:table-cell">Updated</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((ticket) => (
            <tr key={ticket.id} className="border-b border-border last:border-0 hover:bg-card-muted">
              <td className="px-3 py-2 font-mono text-xs">
                <Link href={`/tickets/${ticket.key}`} className="text-primary hover:underline">
                  {ticket.key}
                </Link>
              </td>
              <td className="max-w-[280px] truncate px-3 py-2">
                <Link href={`/tickets/${ticket.key}`} className="hover:underline">
                  {ticket.title}
                </Link>
              </td>
              <td className="px-3 py-2"><PriorityBadge priority={ticket.priority} /></td>
              <td className="px-3 py-2"><StatusBadge status={ticket.status} /></td>
              <td className="hidden whitespace-nowrap px-3 py-2 text-muted-foreground sm:table-cell">
                {relativeTime(ticket.updatedAt)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function DashboardPage() {
  const { user, can } = useAuth();
  const isAgent = can('ticket:view_team');
  const isManager = can('ticket:view_all');
  const isAdmin = can('settings:manage');
  const employee = useDashboard('employee');
  const agent = useDashboard('agent', isAgent);
  const manager = useDashboard('manager', isManager);
  const admin = useDashboard('admin', isAdmin);

  const agentStats = (agent.data?.data.stats ?? {}) as Record<string, number>;
  const managerStats = (manager.data?.data.stats ?? {}) as Record<string, number | null>;
  const employeeStats = (employee.data?.data.stats ?? {}) as Record<string, number>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Welcome back, {user?.firstName}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {isManager ? 'Operations overview' : isAgent ? 'Your queue at a glance' : 'Your requests and equipment'}
        </p>
      </div>

      {isAdmin && admin.data ? (
        <section className="space-y-4" aria-label="Admin dashboard">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Users (active / total)"
              value={`${(admin.data.data.stats as Record<string, number>).usersActive ?? 0} / ${(admin.data.data.stats as Record<string, number>).usersTotal ?? 0}`}
              href="/admin/users"
            />
            <StatCard
              label="Open tickets"
              value={(admin.data.data.stats as Record<string, number>).ticketsOpen}
              href="/tickets?view=all"
            />
            <StatCard
              label="Open incidents"
              value={(admin.data.data.stats as Record<string, number>).incidentsOpen}
              href="/incidents"
            />
            <StatCard
              label="Assets assigned / total"
              value={`${(admin.data.data.stats as Record<string, number>).assetsAssigned ?? 0} / ${(admin.data.data.stats as Record<string, number>).assetsTotal ?? 0}`}
              href="/assets"
            />
            <StatCard
              label="Pending workflows"
              value={(admin.data.data.stats as Record<string, number>).workflowPending}
              href="/workflows"
            />
            <StatCard
              label="Breaches (7d)"
              value={(admin.data.data.stats as Record<string, number>).breaches7d}
              href="/tickets?slaState=BREACHED"
            />
            <StatCard
              label="Invited users"
              value={(admin.data.data.stats as Record<string, number>).usersInvited}
              href="/admin/users?status=INVITED"
            />
          </div>
          {Array.isArray(admin.data.data.recentActivity) ? (
            <div className="rounded-card border border-border bg-card p-4">
              <h2 className="text-sm font-semibold">Recent system activity</h2>
              <ul className="mt-2 space-y-1 text-sm">
                {(
                  admin.data.data.recentActivity as {
                    id: string;
                    action: string;
                    entityType: string;
                    entityKey: string | null;
                    actorEmail: string | null;
                    createdAt: string;
                  }[]
                ).map((entry) => (
                  <li key={entry.id} className="flex justify-between gap-3">
                    <span className="truncate">
                      <span className="font-mono text-xs">{entry.action}</span>{' '}
                      <span className="text-muted-foreground">
                        {entry.entityType}
                        {entry.entityKey ? ` · ${entry.entityKey}` : ''} · {entry.actorEmail ?? 'system'}
                      </span>
                    </span>
                    <span className="whitespace-nowrap text-xs text-muted-foreground">
                      {relativeTime(entry.createdAt)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>
      ) : null}

      {isManager ? (
        <section className="space-y-4" aria-label="Manager dashboard">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Open tickets" value={managerStats.open} href="/tickets?view=all" />
            <StatCard label="SLA compliance (30d)" value={managerStats.slaCompliancePercent != null ? `${managerStats.slaCompliancePercent}%` : null} href="/reports" />
            <StatCard label="Avg resolution (min)" value={managerStats.avgResolutionMinutes} href="/reports" />
            <StatCard label="Breaches (7d)" value={managerStats.breaches7d} href="/tickets?slaState=BREACHED" />
          </div>
          {Array.isArray(manager.data?.data.byTeam) ? (
            <div className="rounded-card border border-border bg-card p-4">
              <h2 className="text-sm font-semibold">Open by team</h2>
              <ul className="mt-2 space-y-2 text-sm">
                {(manager.data!.data.byTeam as { teamId: string; name: string; open: number }[]).map(
                  (team, _index, all) => {
                    const max = Math.max(...all.map((entry) => entry.open), 1);
                    return (
                      <li key={team.teamId} className="space-y-1">
                        <Link
                          href={`/tickets?teamId=${team.teamId}`}
                          className="flex justify-between hover:underline"
                        >
                          <span>{team.name}</span>
                          <span className="text-muted-foreground">{team.open}</span>
                        </Link>
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-card-muted">
                          <div
                            className="h-full rounded-full bg-primary"
                            style={{ width: `${Math.round((team.open / max) * 100)}%` }}
                          />
                        </div>
                      </li>
                    );
                  },
                )}
              </ul>
            </div>
          ) : null}
        </section>
      ) : null}

      {isAgent ? (
        <section className="space-y-4" aria-label="Agent dashboard">
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <StatCard label="Assigned to me" value={agentStats.assignedToMe} href="/tickets?view=mine" />
            <StatCard label="Unassigned (my teams)" value={agentStats.unassignedInTeams} href="/tickets?view=unassigned" />
            <StatCard label="Critical / High" value={agentStats.criticalHigh} href="/tickets?priority=CRITICAL,HIGH" />
            <StatCard label="SLA at risk" value={agentStats.slaAtRisk} href="/tickets?slaState=AT_RISK" />
            <StatCard label="SLA breached" value={agentStats.slaBreached} href="/tickets?slaState=BREACHED" />
            <StatCard label="Waiting for user" value={agentStats.waiting} href="/tickets?status=WAITING_FOR_USER" />
          </div>
          <div>
            <h2 className="mb-2 text-sm font-semibold">Needs attention</h2>
            <TicketTable rows={(agent.data?.data.needsAttention ?? []) as TicketRow[]} />
          </div>
        </section>
      ) : null}

      {!isAgent ? (
        <section className="space-y-4" aria-label="Employee dashboard">
          <div className="grid gap-3 sm:grid-cols-3">
            <StatCard label="My open tickets" value={employeeStats.myOpen} href="/tickets?view=mine" />
            <StatCard label="Awaiting my response" value={employeeStats.awaitingResponse} href="/tickets?status=WAITING_FOR_USER&view=mine" />
            <StatCard label="Resolved (30d)" value={employeeStats.recentlyResolved} href="/tickets?status=RESOLVED,CLOSED&view=mine" />
          </div>
          <div>
            <h2 className="mb-2 text-sm font-semibold">Recently resolved</h2>
            <TicketTable rows={(employee.data?.data.recentlyResolved ?? []) as TicketRow[]} />
          </div>
          <div className="rounded-card border border-border bg-card p-4">
            <h2 className="text-sm font-semibold">My assets</h2>
            <ul className="mt-2 space-y-1 text-sm">
              {((employee.data?.data.myAssets ?? []) as { id: string; tag: string; name: string }[]).map((asset) => (
                <li key={asset.id}>
                  <Link href={`/assets/${asset.tag}`} className="text-primary hover:underline">
                    <span className="font-mono text-xs">{asset.tag}</span> {asset.name}
                  </Link>
                </li>
              ))}
              {(employee.data?.data.myAssets as unknown[] | undefined)?.length === 0 ? (
                <li className="text-muted-foreground">No assets assigned.</li>
              ) : null}
            </ul>
          </div>
        </section>
      ) : null}
    </div>
  );
}
