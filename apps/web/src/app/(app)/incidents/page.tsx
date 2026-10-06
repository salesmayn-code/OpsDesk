'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { useIncidents } from '@/features/incidents/hooks';
import { IncidentStatusBadge, SeverityBadge } from '@/components/incident-badges';
import { Button } from '@/components/ui/button';
import { relativeTime } from '@/lib/format';
import type { IncidentSeverity, IncidentStatus } from '@opsdesk/contracts';

function IncidentsView() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const status = searchParams.get('status') ?? '';
  const severity = searchParams.get('severity') ?? '';
  const page = Number(searchParams.get('page') ?? '1');

  const query = new URLSearchParams();
  if (status) query.set('status', status);
  if (severity) query.set('severity', severity);
  query.set('page', String(page));
  query.set('pageSize', '25');

  const { data, isLoading, isError, refetch } = useIncidents(query.toString());

  const setParams = (updates: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(updates)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    if (!('page' in updates)) params.delete('page');
    router.replace(`${pathname}?${params.toString()}`);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-display font-semibold tracking-tight">Incidents</h1>
        <Link href="/incidents/new">
          <Button>Declare incident</Button>
        </Link>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="incident-status" className="sr-only">
          Filter by status
        </label>
        <select
          id="incident-status"
          value={status}
          onChange={(event) => setParams({ status: event.target.value || null })}
          className="h-9 rounded-control border border-border bg-card px-2 text-sm"
        >
          <option value="">Any status</option>
          <option value="IDENTIFIED">Identified</option>
          <option value="INVESTIGATING">Investigating</option>
          <option value="ESCALATED">Escalated</option>
          <option value="MITIGATING">Mitigating</option>
          <option value="MONITORING">Monitoring</option>
          <option value="RESOLVED">Resolved</option>
          <option value="CLOSED">Closed</option>
        </select>
        <label htmlFor="incident-severity" className="sr-only">
          Filter by severity
        </label>
        <select
          id="incident-severity"
          value={severity}
          onChange={(event) => setParams({ severity: event.target.value || null })}
          className="h-9 rounded-control border border-border bg-card px-2 text-sm"
        >
          <option value="">Any severity</option>
          <option value="SEV1">SEV1</option>
          <option value="SEV2">SEV2</option>
          <option value="SEV3">SEV3</option>
          <option value="SEV4">SEV4</option>
        </select>
      </div>

      {isLoading ? (
        <div role="status" aria-label="Loading incidents" className="space-y-3 rounded-card border border-border bg-card p-4">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="h-4 w-full animate-pulse rounded bg-card-muted" />
          ))}
        </div>
      ) : isError ? (
        <div className="rounded-card border border-border bg-card p-6 text-sm">
          <p role="alert">Could not load incidents.</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => void refetch()}>
            Retry
          </Button>
        </div>
      ) : (data?.data ?? []).length === 0 ? (
        <div className="rounded-card border border-border bg-card p-8 text-center text-sm text-muted-foreground">
          No incidents match these filters.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-card border border-border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th scope="col" className="px-3 py-2 font-medium">Key</th>
                <th scope="col" className="px-3 py-2 font-medium">Title</th>
                <th scope="col" className="px-3 py-2 font-medium">Severity</th>
                <th scope="col" className="px-3 py-2 font-medium">Status</th>
                <th scope="col" className="hidden px-3 py-2 font-medium md:table-cell">Service</th>
                <th scope="col" className="hidden px-3 py-2 font-medium lg:table-cell">Tickets</th>
                <th scope="col" className="hidden px-3 py-2 font-medium sm:table-cell">Updated</th>
              </tr>
            </thead>
            <tbody>
              {data!.data.map((incident) => (
                <tr key={incident.id} className="border-b border-border last:border-0 hover:bg-card-muted">
                  <td className="px-3 py-2 font-mono text-xs">
                    <Link href={`/incidents/${incident.key}`} className="text-primary hover:underline">
                      {incident.key}
                    </Link>
                  </td>
                  <td className="max-w-[320px] truncate px-3 py-2">
                    <Link href={`/incidents/${incident.key}`} className="hover:underline">
                      {incident.title}
                    </Link>
                  </td>
                  <td className="px-3 py-2">
                    <SeverityBadge severity={incident.severity as IncidentSeverity} />
                  </td>
                  <td className="px-3 py-2">
                    <IncidentStatusBadge status={incident.status as IncidentStatus} />
                  </td>
                  <td className="hidden px-3 py-2 text-muted-foreground md:table-cell">
                    {incident.service?.name ?? '—'}
                  </td>
                  <td className="hidden px-3 py-2 text-muted-foreground lg:table-cell">
                    {incident.ticketCount}
                  </td>
                  <td className="hidden whitespace-nowrap px-3 py-2 text-muted-foreground sm:table-cell">
                    {relativeTime(incident.updatedAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data && data.meta.totalPages > 1 ? (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            Page {data.meta.page} of {data.meta.totalPages} · {data.meta.total} incidents
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setParams({ page: String(page - 1) })}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= data.meta.totalPages}
              onClick={() => setParams({ page: String(page + 1) })}
            >
              Next
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function IncidentsPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Loading incidents…</p>}>
      <IncidentsView />
    </Suspense>
  );
}
