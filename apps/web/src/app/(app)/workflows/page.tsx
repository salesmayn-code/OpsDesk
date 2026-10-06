'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import type { WorkflowKind } from '@opsdesk/contracts';
import { useWorkflows } from '@/features/workflows/hooks';
import { relativeTime } from '@/lib/format';

function statusTone(status: string): string {
  if (status === 'COMPLETED') return 'bg-status-success-bg text-status-success-fg';
  if (status === 'CANCELLED') return 'bg-status-muted-bg text-status-muted-fg';
  return 'bg-status-info-bg text-status-info-fg';
}

function WorkflowsView() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const kind = (searchParams.get('kind') ?? 'ONBOARDING') as WorkflowKind;
  const status = searchParams.get('status') ?? '';
  const page = Number(searchParams.get('page') ?? '1');

  const query = new URLSearchParams();
  if (status) query.set('status', status);
  query.set('page', String(page));
  query.set('pageSize', '25');

  const { data, isLoading, isError } = useWorkflows(kind, query.toString());

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
      <h1 className="text-display font-semibold tracking-tight">Workflows</h1>

      <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="Workflow kind">
        {(['ONBOARDING', 'OFFBOARDING'] as WorkflowKind[]).map((option) => (
          <button
            key={option}
            role="tab"
            aria-selected={kind === option}
            onClick={() => setParams({ kind: option, status: null, page: null })}
            className={
              kind === option
                ? 'rounded-control bg-card px-3 py-1.5 text-sm font-medium shadow-sm'
                : 'rounded-control px-3 py-1.5 text-sm text-muted-foreground hover:bg-card-muted'
            }
          >
            {option === 'ONBOARDING' ? 'Onboarding' : 'Offboarding'}
          </button>
        ))}
        <label htmlFor="workflow-status" className="sr-only">Filter by status</label>
        <select
          id="workflow-status"
          value={status}
          onChange={(event) => setParams({ status: event.target.value || null })}
          className="ml-auto h-9 rounded-control border border-border bg-card px-2 text-sm"
        >
          <option value="">Any status</option>
          <option value="OPEN">Open</option>
          <option value="COMPLETED">Completed</option>
          <option value="CANCELLED">Cancelled</option>
        </select>
      </div>

      {isLoading ? (
        <div role="status" aria-label="Loading workflows" className="space-y-3 rounded-card border border-border bg-card p-4">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="h-4 w-full animate-pulse rounded bg-card-muted" />
          ))}
        </div>
      ) : isError ? (
        <p role="alert" className="text-sm text-status-danger-fg">
          Could not load workflows.
        </p>
      ) : (data?.data ?? []).length === 0 ? (
        <div className="rounded-card border border-border bg-card p-8 text-center text-sm text-muted-foreground">
          No {kind === 'ONBOARDING' ? 'onboarding' : 'offboarding'} requests yet.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-card border border-border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th scope="col" className="px-3 py-2 font-medium">Key</th>
                <th scope="col" className="px-3 py-2 font-medium">Subject</th>
                <th scope="col" className="px-3 py-2 font-medium">Effective</th>
                <th scope="col" className="px-3 py-2 font-medium">Progress</th>
                <th scope="col" className="px-3 py-2 font-medium">Status</th>
                <th scope="col" className="hidden px-3 py-2 font-medium sm:table-cell">Created</th>
              </tr>
            </thead>
            <tbody>
              {data!.data.map((workflow) => (
                <tr key={workflow.id} className="border-b border-border last:border-0 hover:bg-card-muted">
                  <td className="px-3 py-2 font-mono text-xs">
                    <Link href={`/workflows/${workflow.key}`} className="text-primary hover:underline">
                      {workflow.key}
                    </Link>
                  </td>
                  <td className="px-3 py-2">
                    {workflow.subject
                      ? `${workflow.subject.firstName} ${workflow.subject.lastName}`
                      : '—'}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{workflow.effectiveDate}</td>
                  <td className="px-3 py-2">
                    {workflow.progress.requiredDone}/{workflow.progress.requiredTotal} required
                  </td>
                  <td className="px-3 py-2">
                    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${statusTone(workflow.status)}`}>
                      {workflow.status.toLowerCase()}
                    </span>
                  </td>
                  <td className="hidden whitespace-nowrap px-3 py-2 text-muted-foreground sm:table-cell">
                    {relativeTime(workflow.createdAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function WorkflowsPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Loading workflows…</p>}>
      <WorkflowsView />
    </Suspense>
  );
}
