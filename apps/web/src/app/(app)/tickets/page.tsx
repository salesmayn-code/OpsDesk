'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import type { TicketStatus } from '@opsdesk/contracts';
import { useAuth } from '@/lib/auth-context';
import { useAssignTicket, useTickets } from '@/features/tickets/hooks';
import { TICKET_TYPE_LABELS } from '@/features/tickets/labels';
import { PriorityBadge, StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/field';
import { relativeTime } from '@/lib/format';
import { useToast } from '@/components/toast';
import { cn } from '@/lib/utils';

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'Any status' },
  { value: 'NEW', label: 'New' },
  { value: 'TRIAGED', label: 'Triaged' },
  { value: 'ASSIGNED', label: 'Assigned' },
  { value: 'IN_PROGRESS', label: 'In progress' },
  { value: 'WAITING_FOR_USER', label: 'Waiting for user' },
  { value: 'ESCALATED', label: 'Escalated' },
  { value: 'RESOLVED', label: 'Resolved' },
  { value: 'CLOSED', label: 'Closed' },
];

const SORTABLE_COLUMNS: { field: string; label: string; className?: string }[] = [
  { field: 'key', label: 'Key' },
  { field: 'title', label: 'Title' },
  { field: 'priority', label: 'Priority' },
  { field: 'status', label: 'Status' },
  { field: 'updatedAt', label: 'Updated', className: 'hidden sm:table-cell' },
];

function TicketsView() {
  const { can, user } = useAuth();
  const { toast } = useToast();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [searchDraft, setSearchDraft] = useState(searchParams.get('q') ?? '');
  const [density, setDensity] = useState<'comfortable' | 'compact'>('comfortable');
  const [selected, setSelected] = useState<string[]>([]);

  const view = searchParams.get('view') ?? (can('ticket:view_team') ? 'team' : 'mine');
  const status = searchParams.get('status') ?? '';
  const priority = searchParams.get('priority') ?? '';
  const q = searchParams.get('q') ?? '';
  const page = Number(searchParams.get('page') ?? '1');
  const sort = searchParams.get('sort') ?? '';

  const queryString = (() => {
    const params = new URLSearchParams();
    params.set('view', view);
    if (status) params.set('status', status);
    if (priority) params.set('priority', priority);
    if (q) params.set('q', q);
    if (sort) params.set('sort', sort);
    params.set('page', String(page));
    params.set('pageSize', '25');
    return params.toString();
  })();

  const { data, isLoading, isError, refetch } = useTickets(queryString);
  const assign = useAssignTicket();

  const setParams = (updates: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(updates)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    if (!('page' in updates)) params.delete('page');
    router.replace(`${pathname}?${params.toString()}`);
  };

  const toggleSort = (field: string) => {
    const next = sort === field ? `-${field}` : field;
    setParams({ sort: next });
  };

  const rows = data?.data ?? [];
  const allSelected = rows.length > 0 && rows.every((ticket) => selected.includes(ticket.id));

  const bulkAssignToMe = async () => {
    if (!user) return;
    let done = 0;
    for (const id of selected) {
      const ticket = rows.find((row) => row.id === id);
      if (!ticket) continue;
      try {
        await assign.mutateAsync({ ticketId: ticket.id, version: ticket.version, assigneeId: user.id });
        done += 1;
      } catch {
        // Skip tickets that changed underneath us; the list refreshes after.
      }
    }
    setSelected([]);
    toast(`${done} ticket(s) assigned to you`);
  };

  const views: { value: string; label: string; visible: boolean }[] = [
    { value: 'mine', label: 'Mine', visible: true },
    { value: 'team', label: 'My teams', visible: can('ticket:view_team') },
    { value: 'unassigned', label: 'Unassigned', visible: can('ticket:view_team') },
    { value: 'all', label: 'All', visible: can('ticket:view_all') },
  ];

  const rowPadding = density === 'compact' ? 'py-1.5' : 'py-2.5';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-display font-semibold tracking-tight">Tickets</h1>
        <Link href="/tickets/new">
          <Button>+ New ticket</Button>
        </Link>
      </div>

      <div className="flex flex-wrap items-center gap-1" role="tablist" aria-label="Ticket views">
        {views
          .filter((entry) => entry.visible)
          .map((entry) => (
            <button
              key={entry.value}
              role="tab"
              aria-selected={view === entry.value}
              onClick={() => setParams({ view: entry.value, page: null })}
              className={
                view === entry.value
                  ? 'rounded-control bg-card px-3 py-1.5 text-sm font-medium shadow-sm'
                  : 'rounded-control px-3 py-1.5 text-sm text-muted-foreground hover:bg-card-muted'
              }
            >
              {entry.label}
            </button>
          ))}
      </div>

      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          setParams({ q: searchDraft || null });
        }}
        role="search"
      >
        <label htmlFor="ticket-search" className="sr-only">
          Search tickets
        </label>
        <Input
          id="ticket-search"
          value={searchDraft}
          onChange={(event) => setSearchDraft(event.target.value)}
          placeholder="Search title or key…"
          className="max-w-xs"
        />
        <label htmlFor="status-filter" className="sr-only">
          Filter by status
        </label>
        <select
          id="status-filter"
          value={status}
          onChange={(event) => setParams({ status: event.target.value || null })}
          className="h-9 rounded-control border border-border bg-card px-2 text-sm"
        >
          {STATUS_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <label htmlFor="priority-filter" className="sr-only">
          Filter by priority
        </label>
        <select
          id="priority-filter"
          value={priority}
          onChange={(event) => setParams({ priority: event.target.value || null })}
          className="h-9 rounded-control border border-border bg-card px-2 text-sm"
        >
          <option value="">Any priority</option>
          <option value="LOW">Low</option>
          <option value="MEDIUM">Medium</option>
          <option value="HIGH">High</option>
          <option value="CRITICAL">Critical</option>
        </select>
        <Button type="submit" variant="outline">
          Search
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setDensity((value) => (value === 'compact' ? 'comfortable' : 'compact'))}
        >
          {density === 'compact' ? 'Comfortable rows' : 'Compact rows'}
        </Button>
      </form>

      {selected.length > 0 ? (
        <div
          role="toolbar"
          aria-label="Bulk actions"
          className="flex flex-wrap items-center gap-3 rounded-card border border-border bg-card px-4 py-2 text-sm"
        >
          <span>{selected.length} selected</span>
          {can('ticket:assign') ? (
            <Button size="sm" variant="outline" onClick={() => void bulkAssignToMe()} disabled={assign.isPending}>
              Assign to me
            </Button>
          ) : null}
          <Button size="sm" variant="ghost" onClick={() => setSelected([])}>
            Clear
          </Button>
        </div>
      ) : null}

      {isLoading ? (
        <div role="status" aria-label="Loading tickets" className="space-y-3 rounded-card border border-border bg-card p-4">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="h-4 w-full animate-pulse rounded bg-card-muted" />
          ))}
        </div>
      ) : isError ? (
        <div className="rounded-card border border-border bg-card p-6 text-sm">
          <p role="alert">Could not load tickets.</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => void refetch()}>
            Retry
          </Button>
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-card border border-border bg-card p-8 text-center">
          <p className="text-sm text-muted-foreground">No tickets match these filters.</p>
          <Button
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={() => setParams({ status: null, priority: null, q: null })}
          >
            Clear filters
          </Button>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-card border border-border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th scope="col" className="w-8 px-3 py-2">
                  <input
                    type="checkbox"
                    aria-label="Select all tickets"
                    checked={allSelected}
                    onChange={(event) =>
                      setSelected(event.target.checked ? rows.map((ticket) => ticket.id) : [])
                    }
                  />
                </th>
                {SORTABLE_COLUMNS.map((column) => (
                  <th
                    key={column.field}
                    scope="col"
                    aria-sort={
                      sort === column.field
                        ? 'ascending'
                        : sort === `-${column.field}`
                          ? 'descending'
                          : 'none'
                    }
                    className={cn('px-3 py-2 font-medium', column.className)}
                  >
                    <button
                      type="button"
                      className="hover:text-foreground"
                      onClick={() => toggleSort(column.field)}
                    >
                      {column.label}
                      {sort === column.field ? ' ↑' : sort === `-${column.field}` ? ' ↓' : ''}
                    </button>
                  </th>
                ))}
                <th scope="col" className="hidden px-3 py-2 font-medium md:table-cell">
                  Type
                </th>
                <th scope="col" className="hidden px-3 py-2 font-medium lg:table-cell">
                  Assignee
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((ticket) => (
                <tr key={ticket.id} className="border-b border-border last:border-0 hover:bg-card-muted">
                  <td className={cn('px-3', rowPadding)}>
                    <input
                      type="checkbox"
                      aria-label={`Select ${ticket.key}`}
                      checked={selected.includes(ticket.id)}
                      onChange={(event) =>
                        setSelected((current) =>
                          event.target.checked
                            ? [...current, ticket.id]
                            : current.filter((id) => id !== ticket.id),
                        )
                      }
                    />
                  </td>
                  <td className={cn('px-3 font-mono text-xs', rowPadding)}>
                    <Link
                      href={`/tickets/${ticket.key}`}
                      className="text-primary underline-offset-4 hover:underline"
                    >
                      {ticket.key}
                    </Link>
                  </td>
                  <td className={cn('max-w-[320px] truncate px-3', rowPadding)}>
                    <Link href={`/tickets/${ticket.key}`} className="hover:underline">
                      {ticket.title}
                    </Link>
                  </td>
                  <td className={cn('px-3', rowPadding)}>
                    <PriorityBadge priority={ticket.priority} />
                  </td>
                  <td className={cn('px-3', rowPadding)}>
                    <StatusBadge status={ticket.status as TicketStatus} />
                  </td>
                  <td className={cn('hidden whitespace-nowrap px-3 text-muted-foreground sm:table-cell', rowPadding)}>
                    {relativeTime(ticket.updatedAt)}
                  </td>
                  <td className={cn('hidden px-3 text-muted-foreground md:table-cell', rowPadding)}>
                    {TICKET_TYPE_LABELS[ticket.type]}
                  </td>
                  <td className={cn('hidden px-3 text-muted-foreground lg:table-cell', rowPadding)}>
                    {ticket.assignee ? `${ticket.assignee.firstName} ${ticket.assignee.lastName}` : '—'}
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
            Page {data.meta.page} of {data.meta.totalPages} · {data.meta.total} tickets
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setParams({ page: String(page - 1), view })}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= data.meta.totalPages}
              onClick={() => setParams({ page: String(page + 1), view })}
            >
              Next
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function TicketsPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Loading tickets…</p>}>
      <TicketsView />
    </Suspense>
  );
}
