'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import type { TicketStatus } from '@opsdesk/contracts';
import { ApiClientError } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';
import {
  useAssignTicket,
  useResolutionCodes,
  useTicket,
  useTicketSla,
  useTransitionTicket,
} from '@/features/tickets/hooks';
import { SlaTimer } from '@/components/sla-timer';
import { ActivityTimeline } from '@/components/activity-timeline';
import { CommentComposer } from '@/components/comment-composer';
import { useToast } from '@/components/toast';
import { useKbSuggestions, useLinkArticle, useTicketArticles } from '@/features/knowledge/hooks';
import { useIncidentOptions, useLinkTicketIncident } from '@/features/incidents/hooks';
import { TICKET_TYPE_LABELS } from '@/features/tickets/labels';
import { PriorityBadge, StatusBadge } from '@/components/status-badge';
import { ConflictBanner } from '@/components/conflict-banner';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/field';

const REASON_TRANSITIONS: TicketStatus[] = ['ESCALATED', 'CANCELLED', 'REOPENED'];

const TRANSITION_LABELS: Partial<Record<TicketStatus, string>> = {
  TRIAGED: 'Triage',
  ASSIGNED: 'Assign',
  IN_PROGRESS: 'Start work',
  WAITING_FOR_USER: 'Waiting for user',
  ESCALATED: 'Escalate',
  RESOLVED: 'Resolve',
  REOPENED: 'Reopen',
  CLOSED: 'Close',
  CANCELLED: 'Cancel',
};

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

export default function TicketDetailPage() {
  const params = useParams<{ key: string }>();
  const key = params.key;
  const { user, can } = useAuth();
  const { data, isLoading, isError, refetch } = useTicket(key);
  const sla = useTicketSla(key);
  const resolutionCodes = useResolutionCodes();
  const transition = useTransitionTicket();
  const assign = useAssignTicket();

  const [pending, setPending] = useState<TicketStatus | null>(null);
  const [reason, setReason] = useState('');
  const [resolutionCode, setResolutionCode] = useState('');
  const [resolutionSummary, setResolutionSummary] = useState('');
  const [banner, setBanner] = useState<{ kind: 'conflict' | 'error'; message: string } | null>(
    null,
  );
  const [incidentSearch, setIncidentSearch] = useState('');
  const [articleSearch, setArticleSearch] = useState('');
  const { toast } = useToast();
  const incidentOptions = useIncidentOptions(incidentSearch);
  const linkIncident = useLinkTicketIncident();
  const articleSuggestions = useKbSuggestions(articleSearch);
  const linkArticle = useLinkArticle();
  const linkedArticles = useTicketArticles(key);

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading ticket…</p>;
  if (isError || !data) {
    return (
      <div className="rounded-card border border-border bg-card p-6 text-sm">
        <p role="alert">Ticket not found or you do not have access.</p>
        <Link href="/tickets" className="mt-3 inline-block text-primary hover:underline">
          Back to tickets
        </Link>
      </div>
    );
  }

  const ticket = data.data;

  const onMutationError = (error: unknown) => {
    if (error instanceof ApiClientError && error.code === 'CONFLICT_STALE_VERSION') {
      setBanner({ kind: 'conflict', message: error.message });
    } else {
      setBanner({
        kind: 'error',
        message: error instanceof ApiClientError ? error.message : 'Something went wrong.',
      });
    }
  };

  const submitTransition = (to: TicketStatus) => {
    setBanner(null);
    transition.mutate(
      {
        ticketId: ticket.id,
        version: ticket.version,
        to,
        ...(REASON_TRANSITIONS.includes(to) && reason.trim() ? { reason: reason.trim() } : {}),
        ...(to === 'RESOLVED'
          ? { resolution: { code: resolutionCode, summary: resolutionSummary.trim() } }
          : {}),
      },
      {
        onSuccess: () => {
          setPending(null);
          setReason('');
          setResolutionCode('');
          setResolutionSummary('');
        },
        onError: onMutationError,
      },
    );
  };

  const canAssignToMe =
    Boolean(ticket.can?.assign) &&
    ticket.team !== null &&
    user !== null &&
    user.teamIds.includes(ticket.team.id) &&
    ticket.assignee?.id !== user.id &&
    !['CLOSED', 'CANCELLED', 'RESOLVED'].includes(ticket.status);

  const primary = ticket.allowedTransitions?.[0];
  const others = (ticket.allowedTransitions ?? []).filter((status) => status !== primary);

  return (
    <div className="space-y-4">
      <nav aria-label="Breadcrumb" className="text-sm text-muted-foreground">
        <Link href="/tickets" className="hover:underline">
          Tickets
        </Link>{' '}
        / <span className="font-mono text-xs">{ticket.key}</span>
      </nav>

      {banner?.kind === 'conflict' ? (
        <ConflictBanner
          message={banner.message}
          onReload={() => {
            setBanner(null);
            void refetch();
          }}
        />
      ) : banner ? (
        <p
          role="alert"
          className="rounded-control bg-status-danger-bg px-4 py-3 text-sm text-status-danger-fg"
        >
          {banner.message}
        </p>
      ) : null}

      {ticket.status === 'WAITING_FOR_USER' && ticket.requester.id === user?.id ? (
        <p className="rounded-control bg-status-waiting-bg px-4 py-3 text-sm text-status-waiting-fg">
          IT is waiting for your reply.
        </p>
      ) : null}

      <div className="rounded-card border border-border bg-card p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-display font-semibold tracking-tight">{ticket.title}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <StatusBadge status={ticket.status} />
              <PriorityBadge priority={ticket.priority} />
              <span className="text-xs text-muted-foreground">
                {TICKET_TYPE_LABELS[ticket.type]}
              </span>
            </div>
            {sla.data && sla.data.data.timers.length > 0 ? (
              <div className="mt-4 grid max-w-md gap-3 sm:grid-cols-2">
                {sla.data.data.timers.map((timer) => (
                  <SlaTimer
                    key={timer.id}
                    kind={timer.kind}
                    state={timer.state}
                    dueAt={timer.dueAt}
                    percentConsumed={timer.percentConsumed}
                  />
                ))}
              </div>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {canAssignToMe ? (
              <Button
                variant="outline"
                size="sm"
                disabled={assign.isPending}
                onClick={() =>
                  assign.mutate(
                    { ticketId: ticket.id, version: ticket.version, assigneeId: user!.id },
                    { onError: onMutationError },
                  )
                }
              >
                Assign to me
              </Button>
            ) : null}
            {primary ? (
              <Button
                size="sm"
                disabled={transition.isPending}
                onClick={() =>
                  ['ESCALATED', 'CANCELLED', 'REOPENED', 'RESOLVED'].includes(primary)
                    ? setPending(primary)
                    : submitTransition(primary)
                }
              >
                {TRANSITION_LABELS[primary] ?? primary}
              </Button>
            ) : null}
            {others.map((status) => (
              <Button
                key={status}
                variant="outline"
                size="sm"
                disabled={transition.isPending}
                onClick={() =>
                  ['ESCALATED', 'CANCELLED', 'REOPENED', 'RESOLVED'].includes(status)
                    ? setPending(status)
                    : submitTransition(status)
                }
              >
                {TRANSITION_LABELS[status] ?? status}
              </Button>
            ))}
          </div>
        </div>

        {pending ? (
          <form
            className="mt-5 space-y-3 rounded-card border border-border bg-card-muted p-4"
            onSubmit={(event) => {
              event.preventDefault();
              submitTransition(pending);
            }}
          >
            <p className="text-sm font-medium">
              {TRANSITION_LABELS[pending] ?? pending}
              {pending === 'WAITING_FOR_USER' ? ' — a public reply on the ticket is required' : ''}
            </p>
            {pending === 'RESOLVED' ? (
              <>
                <Field label="Resolution code" htmlFor="resolution-code" required>
                  <select
                    id="resolution-code"
                    required
                    value={resolutionCode}
                    onChange={(event) => setResolutionCode(event.target.value)}
                    className="h-9 w-full rounded-control border border-border bg-card px-2 text-sm"
                  >
                    <option value="">Select a code…</option>
                    {resolutionCodes.data?.data.map((code) => (
                      <option key={code.id} value={code.code}>
                        {code.label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Resolution summary" htmlFor="resolution-summary" required>
                  <textarea
                    id="resolution-summary"
                    required
                    rows={3}
                    value={resolutionSummary}
                    onChange={(event) => setResolutionSummary(event.target.value)}
                    className="w-full rounded-control border border-border bg-card px-3 py-2 text-sm"
                    placeholder="What fixed the issue? This is visible to the requester."
                  />
                </Field>
              </>
            ) : null}
            {REASON_TRANSITIONS.includes(pending) ? (
              <Field label="Reason" htmlFor="transition-reason" required>
                <Input
                  id="transition-reason"
                  required
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                />
              </Field>
            ) : null}
            <div className="flex gap-2">
              <Button type="submit" size="sm" disabled={transition.isPending}>
                {transition.isPending ? 'Saving…' : 'Confirm'}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setPending(null)}
              >
                Cancel
              </Button>
            </div>
          </form>
        ) : null}

        <dl className="mt-6 grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs text-muted-foreground">Requester</dt>
            <dd>
              {ticket.requester.firstName} {ticket.requester.lastName}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Assignee</dt>
            <dd>
              {ticket.assignee
                ? `${ticket.assignee.firstName} ${ticket.assignee.lastName}`
                : 'Unassigned'}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Team</dt>
            <dd>{ticket.team?.name ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Created</dt>
            <dd>{formatDate(ticket.createdAt)}</dd>
          </div>
          {ticket.resolvedAt ? (
            <div>
              <dt className="text-xs text-muted-foreground">Resolved</dt>
              <dd>{formatDate(ticket.resolvedAt)}</dd>
            </div>
          ) : null}
          {ticket.asset ? (
            <div>
              <dt className="text-xs text-muted-foreground">Asset</dt>
              <dd className="font-mono text-xs">{ticket.asset.tag}</dd>
            </div>
          ) : null}
        </dl>
      </div>

      <div className="rounded-card border border-border bg-card p-6">
        <h2 className="text-title font-semibold">Description</h2>
        <p className="mt-3 whitespace-pre-wrap text-sm">{ticket.description}</p>
        {ticket.resolutionSummary ? (
          <div className="mt-5 rounded-card bg-status-success-bg p-4">
            <p className="text-xs font-medium text-status-success-fg">Resolution</p>
            <p className="mt-1 whitespace-pre-wrap text-sm text-status-success-fg">
              {ticket.resolutionSummary}
            </p>
          </div>
        ) : null}
      </div>

      <div className="rounded-card border border-border bg-card p-6">
        <h2 className="text-title font-semibold">Knowledge &amp; related incident</h2>

        <div className="mt-3 space-y-2">
          <p className="text-xs text-muted-foreground">Linked incident</p>
          {ticket.incident ? (
            <Link
              href={`/incidents/${ticket.incident.key}`}
              className="text-sm text-primary hover:underline"
            >
              <span className="font-mono text-xs">{ticket.incident.key}</span>{' '}
              {ticket.incident.title}
            </Link>
          ) : can('incident:manage') ? (
            <div className="space-y-1">
              <label htmlFor="link-incident" className="sr-only">
                Find incident by key
              </label>
              <Input
                id="link-incident"
                value={incidentSearch}
                onChange={(event) => setIncidentSearch(event.target.value)}
                placeholder="Search incident key (INC-2026-001)…"
                className="max-w-xs font-mono text-xs"
              />
              {(incidentOptions.data?.data ?? []).length > 0 ? (
                <ul className="divide-y divide-border rounded-control border border-border bg-card">
                  {incidentOptions.data!.data.map((incident) => (
                    <li key={incident.id}>
                      <button
                        type="button"
                        className="block w-full px-3 py-1.5 text-left text-sm hover:bg-card-muted"
                        onClick={() =>
                          linkIncident.mutate(
                            { ticketId: ticket.id, incidentId: incident.id },
                            {
                              onSuccess: () => {
                                setIncidentSearch('');
                                toast(`Linked to ${incident.key}`);
                              },
                            },
                          )
                        }
                      >
                        <span className="font-mono text-xs">{incident.key}</span> {incident.title}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Not linked.</p>
          )}
        </div>

        <div className="mt-4 space-y-2 border-t border-border pt-3">
          <p className="text-xs text-muted-foreground">Knowledge articles</p>
          <ul className="space-y-1">
            {(linkedArticles.data?.data ?? []).map((article) => (
              <li key={article.id} className="text-sm">
                <Link href={`/kb/${article.slug}`} className="text-primary hover:underline">
                  {article.title}
                </Link>
              </li>
            ))}
            {(linkedArticles.data?.data ?? []).length === 0 ? (
              <li className="text-sm text-muted-foreground">No articles attached yet.</li>
            ) : null}
          </ul>
          {can('kb:view') ? (
            <div className="space-y-1">
              <label htmlFor="attach-article" className="sr-only">
                Search knowledge articles
              </label>
              <Input
                id="attach-article"
                value={articleSearch}
                onChange={(event) => setArticleSearch(event.target.value)}
                placeholder="Search articles to attach…"
                className="max-w-xs"
              />
              {(articleSuggestions.data?.data ?? []).length > 0 ? (
                <ul className="divide-y divide-border rounded-control border border-border bg-card">
                  {articleSuggestions.data!.data.map((article) => (
                    <li key={article.id}>
                      <button
                        type="button"
                        className="block w-full px-3 py-1.5 text-left text-sm hover:bg-card-muted"
                        onClick={() =>
                          linkArticle.mutate(
                            { ticketId: ticket.id, articleId: article.id },
                            {
                              onSuccess: () => {
                                setArticleSearch('');
                                toast('Article attached');
                              },
                            },
                          )
                        }
                      >
                        {article.title}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      <div className="rounded-card border border-border bg-card p-6">
        <h2 className="text-title font-semibold">Activity</h2>
        <div className="mt-4">
          <ActivityTimeline ticketId={ticket.id} />
        </div>
        {ticket.status === 'CLOSED' || ticket.status === 'CANCELLED' ? (
          <p className="mt-6 text-sm text-muted-foreground">
            This ticket is closed and read-only.
          </p>
        ) : (
          <CommentComposer
            ticketId={ticket.id}
            canInternal={Boolean(ticket.can?.comment_internal)}
          />
        )}
      </div>
    </div>
  );
}
