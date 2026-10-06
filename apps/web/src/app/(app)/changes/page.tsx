'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { useChanges } from '@/features/changes/hooks';
import { ChangeRiskBadge, ChangeStatusBadge, ChangeTypeBadge } from '@/components/change-badges';
import { Button } from '@/components/ui/button';
import { relativeTime } from '@/lib/format';
import type { ChangeRisk, ChangeStatus, ChangeType } from '@opsdesk/contracts';

function ChangesView() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const status = searchParams.get('status') ?? '';
  const type = searchParams.get('type') ?? '';
  const risk = searchParams.get('risk') ?? '';
  const page = Number(searchParams.get('page') ?? '1');

  const query = new URLSearchParams();
  if (status) query.set('status', status);
  if (type) query.set('type', type);
  if (risk) query.set('risk', risk);
  query.set('page', String(page));
  query.set('pageSize', '25');

  const { data, isLoading, isError, refetch } = useChanges(query.toString());

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
        <h1 className="text-display font-semibold tracking-tight">Changes</h1>
        <Link href="/changes/new">
          <Button>New change</Button>
        </Link>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="change-status" className="sr-only">Filter by status</label>
        <select
          id="change-status"
          value={status}
          onChange={(event) => setParams({ status: event.target.value || null })}
          className="h-9 rounded-control border border-border bg-card px-2 text-sm"
        >
          <option value="">Any status</option>
          <option value="DRAFT">Draft</option>
          <option value="SUBMITTED">Submitted</option>
          <option value="UNDER_REVIEW">Under review</option>
          <option value="APPROVED">Approved</option>
          <option value="SCHEDULED">Scheduled</option>
          <option value="IMPLEMENTING">Implementing</option>
          <option value="VALIDATING">Validating</option>
          <option value="COMPLETED">Completed</option>
          <option value="FAILED">Failed</option>
          <option value="CLOSED">Closed</option>
        </select>
        <label htmlFor="change-type" className="sr-only">Filter by type</label>
        <select
          id="change-type"
          value={type}
          onChange={(event) => setParams({ type: event.target.value || null })}
          className="h-9 rounded-control border border-border bg-card px-2 text-sm"
        >
          <option value="">Any type</option>
          <option value="STANDARD">Standard</option>
          <option value="NORMAL">Normal</option>
          <option value="EMERGENCY">Emergency</option>
        </select>
        <label htmlFor="change-risk" className="sr-only">Filter by risk</label>
        <select
          id="change-risk"
          value={risk}
          onChange={(event) => setParams({ risk: event.target.value || null })}
          className="h-9 rounded-control border border-border bg-card px-2 text-sm"
        >
          <option value="">Any risk</option>
          <option value="LOW">Low</option>
          <option value="MEDIUM">Medium</option>
          <option value="HIGH">High</option>
          <option value="CRITICAL">Critical</option>
        </select>
      </div>

      {isLoading ? (
        <div role="status" aria-label="Loading changes" className="space-y-3 rounded-card border border-border bg-card p-4">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="h-4 w-full animate-pulse rounded bg-card-muted" />
          ))}
        </div>
      ) : isError ? (
        <div className="rounded-card border border-border bg-card p-6 text-sm">
          <p role="alert">Could not load changes.</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => void refetch()}>
            Retry
          </Button>
        </div>
      ) : (data?.data ?? []).length === 0 ? (
        <div className="rounded-card border border-border bg-card p-8 text-center text-sm text-muted-foreground">
          No changes match these filters.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-card border border-border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th scope="col" className="px-3 py-2 font-medium">Key</th>
                <th scope="col" className="px-3 py-2 font-medium">Title</th>
                <th scope="col" className="hidden px-3 py-2 font-medium md:table-cell">Type</th>
                <th scope="col" className="px-3 py-2 font-medium">Risk</th>
                <th scope="col" className="px-3 py-2 font-medium">Status</th>
                <th scope="col" className="hidden px-3 py-2 font-medium lg:table-cell">Window</th>
                <th scope="col" className="hidden px-3 py-2 font-medium sm:table-cell">Updated</th>
              </tr>
            </thead>
            <tbody>
              {data!.data.map((change) => (
                <tr key={change.id} className="border-b border-border last:border-0 hover:bg-card-muted">
                  <td className="px-3 py-2 font-mono text-xs">
                    <Link href={`/changes/${change.key}`} className="text-primary hover:underline">
                      {change.key}
                    </Link>
                  </td>
                  <td className="max-w-[300px] truncate px-3 py-2">
                    <Link href={`/changes/${change.key}`} className="hover:underline">
                      {change.title}
                    </Link>
                  </td>
                  <td className="hidden px-3 py-2 md:table-cell">
                    <ChangeTypeBadge type={change.type as ChangeType} />
                  </td>
                  <td className="px-3 py-2">
                    <ChangeRiskBadge risk={change.risk as ChangeRisk} />
                  </td>
                  <td className="px-3 py-2">
                    <ChangeStatusBadge status={change.status as ChangeStatus} />
                  </td>
                  <td className="hidden px-3 py-2 text-muted-foreground lg:table-cell">
                    {change.services.map((service) => service.name).join(', ') || '—'}
                  </td>
                  <td className="hidden whitespace-nowrap px-3 py-2 text-muted-foreground sm:table-cell">
                    {relativeTime(change.updatedAt)}
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
            Page {data.meta.page} of {data.meta.totalPages} · {data.meta.total} changes
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

export default function ChangesPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Loading changes…</p>}>
      <ChangesView />
    </Suspense>
  );
}
