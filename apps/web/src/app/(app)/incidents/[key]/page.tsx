'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import type { IncidentSeverity, IncidentStatus } from '@opsdesk/contracts';
import { ApiClientError } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';
import { searchAll } from '@/features/platform/api';
import {
  useAddIncidentNote,
  useIncident,
  useIncidentTimeline,
  useLinkIncidentTickets,
  useNotifyIncidentRequesters,
  usePostmortem,
  usePublishPostmortem,
  useTransitionIncident,
  useUnlinkIncidentTicket,
  useUpdateIncident,
  useUpsertPostmortem,
  useCreatePostmortemAction,
  useUpdatePostmortemAction,
} from '@/features/incidents/hooks';
import { IncidentStatusBadge, SeverityBadge, incidentStatusLabel } from '@/components/incident-badges';
import { ConflictBanner } from '@/components/conflict-banner';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/field';
import { formatDateTime, relativeTime } from '@/lib/format';

const TRANSITION_LABELS: Partial<Record<IncidentStatus, string>> = {
  INVESTIGATING: 'Start investigating',
  ESCALATED: 'Escalate',
  MITIGATING: 'Start mitigating',
  MONITORING: 'Monitoring',
  RESOLVED: 'Resolve',
  CLOSED: 'Close',
};

function durationSince(iso: string): string {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

export default function IncidentDetailPage() {
  const params = useParams<{ key: string }>();
  const key = params.key;
  const { user } = useAuth();
  const incidentQuery = useIncident(key);
  const timeline = useIncidentTimeline(key);
  const postmortem = usePostmortem(key);

  const [banner, setBanner] = useState<{ kind: 'conflict' | 'error'; message: string } | null>(null);
  const [pendingResolve, setPendingResolve] = useState(false);
  const [rootCause, setRootCause] = useState('');
  const [mitigation, setMitigation] = useState('');
  const [impact, setImpact] = useState('');
  const [resolution, setResolution] = useState('');
  const [noteType, setNoteType] = useState<'NOTE' | 'MITIGATION' | 'COMMUNICATION' | 'ROOT_CAUSE'>('NOTE');
  const [noteBody, setNoteBody] = useState('');
  const [ticketKeyInput, setTicketKeyInput] = useState('');
  const [notifyMessage, setNotifyMessage] = useState('');
  const [notified, setNotified] = useState<number | null>(null);
  const [pmSummary, setPmSummary] = useState('');
  const [pmRootCause, setPmRootCause] = useState('');
  const [pmWentWell, setPmWentWell] = useState('');
  const [pmWentWrong, setPmWentWrong] = useState('');
  const [actionText, setActionText] = useState('');

  const transition = useTransitionIncident(incidentQuery.data?.data.id ?? '', key);
  const update = useUpdateIncident(incidentQuery.data?.data.id ?? '', key);
  const addNote = useAddIncidentNote(incidentQuery.data?.data.id ?? '', key);
  const linkTickets = useLinkIncidentTickets(incidentQuery.data?.data.id ?? '', key);
  const unlinkTicket = useUnlinkIncidentTicket(incidentQuery.data?.data.id ?? '', key);
  const notify = useNotifyIncidentRequesters(incidentQuery.data?.data.id ?? '', key);
  const upsertPostmortem = useUpsertPostmortem(incidentQuery.data?.data.id ?? '', key);
  const publishPostmortem = usePublishPostmortem(incidentQuery.data?.data.id ?? '', key);
  const createAction = useCreatePostmortemAction(incidentQuery.data?.data.id ?? '', key);
  const updateAction = useUpdatePostmortemAction(incidentQuery.data?.data.id ?? '', key);

  if (incidentQuery.isLoading) return <p className="text-sm text-muted-foreground">Loading incident…</p>;
  if (incidentQuery.isError || !incidentQuery.data) {
    return (
      <div className="rounded-card border border-border bg-card p-6 text-sm">
        <p role="alert">Incident not found or you do not have access.</p>
        <Link href="/incidents" className="mt-3 inline-block text-primary hover:underline">
          Back to incidents
        </Link>
      </div>
    );
  }

  const incident = incidentQuery.data.data;
  const terminal = incident.status === 'CLOSED';
  const onError = (error: unknown) => {
    if (error instanceof ApiClientError && error.code === 'CONFLICT_STALE_VERSION') {
      setBanner({ kind: 'conflict', message: error.message });
    } else {
      setBanner({
        kind: 'error',
        message: error instanceof ApiClientError ? error.message : 'Something went wrong.',
      });
    }
  };

  const submitResolve = () => {
    setBanner(null);
    transition.mutate(
      {
        incidentId: incident.id,
        version: incident.version,
        to: 'RESOLVED',
        rootCause: rootCause.trim(),
        mitigation: mitigation.trim(),
        impact: impact.trim(),
        ...(resolution.trim() ? { resolution: resolution.trim() } : {}),
      },
      { onSuccess: () => setPendingResolve(false), onError },
    );
  };

  const submitLink = async () => {
    setBanner(null);
    const term = ticketKeyInput.trim();
    if (!term) return;
    try {
      const results = await searchAll(term);
      const match = results.data.tickets.find(
        (ticket) => ticket.key.toUpperCase() === term.toUpperCase(),
      );
      if (!match) {
        setBanner({ kind: 'error', message: `No ticket found for ${term}.` });
        return;
      }
      linkTickets.mutate(
        { incidentId: incident.id, ticketIds: [match.id] },
        { onSuccess: () => setTicketKeyInput(''), onError },
      );
    } catch {
      setBanner({ kind: 'error', message: 'Ticket lookup failed.' });
    }
  };

  return (
    <div className="space-y-4">
      <nav aria-label="Breadcrumb" className="text-sm text-muted-foreground">
        <Link href="/incidents" className="hover:underline">
          Incidents
        </Link>{' '}
        / <span className="font-mono text-xs">{incident.key}</span>
      </nav>

      {incident.severity === 'SEV1' ? (
        <p className="rounded-control bg-status-danger-fg px-4 py-2 text-sm font-semibold text-white">
          MAJOR INCIDENT · {incident.title}
        </p>
      ) : null}

      {banner?.kind === 'conflict' ? (
        <ConflictBanner
          message={banner.message}
          onReload={() => {
            setBanner(null);
            void incidentQuery.refetch();
          }}
        />
      ) : banner ? (
        <p role="alert" className="rounded-control bg-status-danger-bg px-4 py-3 text-sm text-status-danger-fg">
          {banner.message}
        </p>
      ) : null}

      <div className="rounded-card border border-border bg-card p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-display font-semibold tracking-tight">{incident.title}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <SeverityBadge severity={incident.severity} />
              <IncidentStatusBadge status={incident.status} />
              <span className="text-xs text-muted-foreground">
                {incident.service?.name ?? 'No service'} · open {durationSince(incident.startedAt)}
              </span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {incident.can.manage && !terminal ? (
              <label className="text-xs text-muted-foreground">
                Severity
                <select
                  aria-label="Severity"
                  value={incident.severity}
                  onChange={(event) =>
                    update.mutate(
                      {
                        incidentId: incident.id,
                        version: incident.version,
                        severity: event.target.value as IncidentSeverity,
                      },
                      { onError },
                    )
                  }
                  className="ml-2 h-8 rounded-control border border-border bg-card px-2 text-sm"
                >
                  <option value="SEV1">SEV1</option>
                  <option value="SEV2">SEV2</option>
                  <option value="SEV3">SEV3</option>
                  <option value="SEV4">SEV4</option>
                </select>
              </label>
            ) : null}
            {!terminal
              ? incident.allowedTransitions.map((to) => (
                  <Button
                    key={to}
                    size="sm"
                    variant={to === 'CLOSED' ? 'outline' : 'primary'}
                    disabled={transition.isPending}
                    onClick={() =>
                      to === 'RESOLVED'
                        ? setPendingResolve(true)
                        : transition.mutate(
                            { incidentId: incident.id, version: incident.version, to },
                            { onError },
                          )
                    }
                  >
                    {TRANSITION_LABELS[to] ?? incidentStatusLabel(to)}
                  </Button>
                ))
              : null}
            {incident.status === 'RESOLVED' &&
            !incident.allowedTransitions.includes('CLOSED') &&
            incident.postmortem?.status !== 'PUBLISHED' ? (
              <span title="Publish the postmortem before closing a SEV1/SEV2 incident.">
                <Button size="sm" variant="outline" disabled>
                  Close
                </Button>
              </span>
            ) : null}
          </div>
        </div>

        {pendingResolve ? (
          <form
            className="mt-5 space-y-3 rounded-card border border-border bg-card-muted p-4"
            onSubmit={(event) => {
              event.preventDefault();
              submitResolve();
            }}
          >
            <p className="text-sm font-medium">Resolve incident</p>
            <Field label="Root cause" htmlFor="incident-root-cause" required>
              <Input id="incident-root-cause" required value={rootCause} onChange={(e) => setRootCause(e.target.value)} />
            </Field>
            <Field label="Mitigation" htmlFor="incident-mitigation" required>
              <Input id="incident-mitigation" required value={mitigation} onChange={(e) => setMitigation(e.target.value)} />
            </Field>
            <Field label="Impact" htmlFor="incident-impact-resolve" required>
              <Input id="incident-impact-resolve" required value={impact} onChange={(e) => setImpact(e.target.value)} />
            </Field>
            <Field label="Resolution notes" htmlFor="incident-resolution">
              <Input id="incident-resolution" value={resolution} onChange={(e) => setResolution(e.target.value)} />
            </Field>
            <div className="flex gap-2">
              <Button type="submit" size="sm" disabled={transition.isPending}>
                Confirm
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setPendingResolve(false)}>
                Cancel
              </Button>
            </div>
          </form>
        ) : null}

        <p className="mt-4 whitespace-pre-wrap text-sm">{incident.description}</p>
        <dl className="mt-4 grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
          {incident.impact ? (
            <div>
              <dt className="text-xs text-muted-foreground">Impact</dt>
              <dd>{incident.impact}</dd>
            </div>
          ) : null}
          {incident.rootCause ? (
            <div>
              <dt className="text-xs text-muted-foreground">Root cause</dt>
              <dd>{incident.rootCause}</dd>
            </div>
          ) : null}
          <div>
            <dt className="text-xs text-muted-foreground">Detected</dt>
            <dd>{formatDateTime(incident.detectedAt)}</dd>
          </div>
          {incident.resolvedAt ? (
            <div>
              <dt className="text-xs text-muted-foreground">Resolved</dt>
              <dd>{formatDateTime(incident.resolvedAt)}</dd>
            </div>
          ) : null}
        </dl>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-card border border-border bg-card p-6">
          <h2 className="text-title font-semibold">Timeline</h2>
          <ul className="mt-4 space-y-3">
            {(timeline.data?.data ?? []).map((event) => (
              <li key={event.id} className="border-l-2 border-border py-1 pl-3 text-sm">
                <p>
                  <span className="font-medium">
                    {event.actor ? `${event.actor.firstName} ${event.actor.lastName}` : 'System'}
                  </span>{' '}
                  <span className="text-muted-foreground">
                    {event.type === 'STATUS_CHANGED' && event.toValue
                      ? `moved to ${incidentStatusLabel(event.toValue as IncidentStatus)}`
                      : event.type.toLowerCase().replaceAll('_', ' ')}
                  </span>
                </p>
                {event.body ? <p className="mt-0.5 whitespace-pre-wrap">{event.body}</p> : null}
                <p className="mt-0.5 text-xs text-muted-foreground">{relativeTime(event.occurredAt)}</p>
              </li>
            ))}
            {(timeline.data?.data ?? []).length === 0 ? (
              <li className="text-sm text-muted-foreground">No timeline entries yet.</li>
            ) : null}
          </ul>

          {!terminal ? (
            <form
              className="mt-5 space-y-3 border-t border-border pt-4"
              onSubmit={(event) => {
                event.preventDefault();
                if (!noteBody.trim()) return;
                addNote.mutate(
                  { incidentId: incident.id, type: noteType, body: noteBody.trim() },
                  {
                    onSuccess: () => setNoteBody(''),
                    onError,
                  },
                );
              }}
            >
              <div className="flex gap-2">
                <label htmlFor="incident-note-type" className="sr-only">
                  Update type
                </label>
                <select
                  id="incident-note-type"
                  value={noteType}
                  onChange={(event) => setNoteType(event.target.value as typeof noteType)}
                  className="h-9 rounded-control border border-border bg-card px-2 text-sm"
                >
                  <option value="NOTE">Note</option>
                  <option value="MITIGATION">Mitigation</option>
                  <option value="COMMUNICATION">Communication</option>
                  <option value="ROOT_CAUSE">Root cause</option>
                </select>
              </div>
              <label htmlFor="incident-note" className="sr-only">
                Update
              </label>
              <textarea
                id="incident-note"
                rows={3}
                value={noteBody}
                onChange={(event) => setNoteBody(event.target.value)}
                placeholder="Add an update to the timeline…"
                className="w-full rounded-control border border-border bg-card px-3 py-2 text-sm"
              />
              <Button type="submit" size="sm" disabled={addNote.isPending}>
                Add update
              </Button>
            </form>
          ) : null}
        </div>

        <div className="space-y-4">
          <div className="rounded-card border border-border bg-card p-6">
            <h2 className="text-title font-semibold">Linked tickets</h2>
            <ul className="mt-3 space-y-2">
              {incident.tickets.map((ticket) => (
                <li key={ticket.id} className="flex items-center justify-between gap-2 text-sm">
                  <Link href={`/tickets/${ticket.key}`} className="text-primary hover:underline">
                    <span className="font-mono text-xs">{ticket.key}</span> {ticket.title}
                  </Link>
                  {incident.can.manage ? (
                    <button
                      type="button"
                      className="text-xs text-muted-foreground hover:text-status-danger-fg"
                      onClick={() =>
                        unlinkTicket.mutate(
                          { incidentId: incident.id, ticketId: ticket.id },
                          { onError },
                        )
                      }
                    >
                      Unlink
                    </button>
                  ) : null}
                </li>
              ))}
              {incident.tickets.length === 0 ? (
                <li className="text-sm text-muted-foreground">No tickets linked yet.</li>
              ) : null}
            </ul>
            {incident.can.manage && !terminal ? (
              <form
                className="mt-3 flex gap-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  void submitLink();
                }}
              >
                <label htmlFor="link-ticket" className="sr-only">
                  Ticket key
                </label>
                <Input
                  id="link-ticket"
                  value={ticketKeyInput}
                  onChange={(event) => setTicketKeyInput(event.target.value)}
                  placeholder="TKT-004821"
                  className="max-w-[180px] font-mono text-xs"
                />
                <Button type="submit" size="sm" variant="outline" disabled={linkTickets.isPending}>
                  Link ticket
                </Button>
              </form>
            ) : null}
          </div>

          <div className="rounded-card border border-border bg-card p-6">
            <h2 className="text-title font-semibold">Requester communication</h2>
            {incident.can.manage && !terminal ? (
              <form
                className="mt-3 space-y-3"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (!notifyMessage.trim()) return;
                  setNotified(null);
                  notify.mutate(
                    { incidentId: incident.id, message: notifyMessage.trim() },
                    {
                      onSuccess: (result) => {
                        setNotified((result as { data: { notified: number } }).data.notified);
                        setNotifyMessage('');
                      },
                      onError,
                    },
                  );
                }}
              >
                <label htmlFor="notify-message" className="sr-only">
                  Message to requesters
                </label>
                <textarea
                  id="notify-message"
                  rows={3}
                  value={notifyMessage}
                  onChange={(event) => setNotifyMessage(event.target.value)}
                  placeholder="Update every requester on the linked tickets…"
                  className="w-full rounded-control border border-border bg-card px-3 py-2 text-sm"
                />
                <Button type="submit" size="sm" variant="outline" disabled={notify.isPending}>
                  Notify requesters
                </Button>
                {notified !== null ? (
                  <p role="status" className="text-xs text-status-success-fg">
                    Notified {notified} requester(s).
                  </p>
                ) : null}
              </form>
            ) : (
              <p className="mt-3 text-sm text-muted-foreground">
                {incident.can.manage ? 'Closed incidents are read-only.' : 'Managers can notify requesters.'}
              </p>
            )}
          </div>

          <div className="rounded-card border border-border bg-card p-6">
            <div className="flex items-center justify-between">
              <h2 className="text-title font-semibold">Postmortem</h2>
              <span className="text-xs text-muted-foreground">
                {postmortem.data?.data ? postmortem.data.data.status : 'Not started'}
              </span>
            </div>

            {incident.can.postmortem ? (
              <form
                className="mt-3 space-y-3"
                onSubmit={(event) => {
                  event.preventDefault();
                  upsertPostmortem.mutate(
                    {
                      ...(postmortem.data?.data ? { version: postmortem.data.data.version } : {}),
                      ...(pmSummary.trim() ? { summary: pmSummary.trim() } : {}),
                      ...(pmRootCause.trim() ? { rootCause: pmRootCause.trim() } : {}),
                      ...(pmWentWell.trim() ? { wentWell: pmWentWell.trim() } : {}),
                      ...(pmWentWrong.trim() ? { wentWrong: pmWentWrong.trim() } : {}),
                    },
                    { onError },
                  );
                }}
              >
                <Field label="Summary" htmlFor="pm-summary">
                  <textarea
                    id="pm-summary"
                    rows={2}
                    value={pmSummary || postmortem.data?.data?.summary || ''}
                    onChange={(event) => setPmSummary(event.target.value)}
                    className="w-full rounded-control border border-border bg-card px-3 py-2 text-sm"
                  />
                </Field>
                <Field label="Root cause" htmlFor="pm-root-cause">
                  <textarea
                    id="pm-root-cause"
                    rows={2}
                    value={pmRootCause || postmortem.data?.data?.rootCause || ''}
                    onChange={(event) => setPmRootCause(event.target.value)}
                    className="w-full rounded-control border border-border bg-card px-3 py-2 text-sm"
                  />
                </Field>
                <Field label="What went well" htmlFor="pm-went-well">
                  <textarea
                    id="pm-went-well"
                    rows={2}
                    value={pmWentWell || postmortem.data?.data?.wentWell || ''}
                    onChange={(event) => setPmWentWell(event.target.value)}
                    className="w-full rounded-control border border-border bg-card px-3 py-2 text-sm"
                  />
                </Field>
                <Field label="What went wrong" htmlFor="pm-went-wrong">
                  <textarea
                    id="pm-went-wrong"
                    rows={2}
                    value={pmWentWrong || postmortem.data?.data?.wentWrong || ''}
                    onChange={(event) => setPmWentWrong(event.target.value)}
                    className="w-full rounded-control border border-border bg-card px-3 py-2 text-sm"
                  />
                </Field>
                <div className="flex gap-2">
                  <Button type="submit" size="sm" variant="outline" disabled={upsertPostmortem.isPending}>
                    Save draft
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    disabled={publishPostmortem.isPending || postmortem.data?.data?.status === 'PUBLISHED'}
                    onClick={() => publishPostmortem.mutate(undefined, { onError })}
                  >
                    Publish
                  </Button>
                </div>
              </form>
            ) : postmortem.data?.data ? (
              <p className="mt-3 whitespace-pre-wrap text-sm">
                {postmortem.data.data.summary ?? 'No summary yet.'}
              </p>
            ) : (
              <p className="mt-3 text-sm text-muted-foreground">
                The postmortem editor is available to incident managers.
              </p>
            )}

            <ul className="mt-4 space-y-2 border-t border-border pt-3">
              {(postmortem.data?.data?.actions ?? []).map((action) => (
                <li key={action.id} className="flex items-center justify-between gap-2 text-sm">
                  <span>
                    <span className="text-xs text-muted-foreground">{action.kind}</span>{' '}
                    {action.description}
                  </span>
                  {incident.can.postmortem && action.status !== 'DONE' ? (
                    <button
                      type="button"
                      className="text-xs text-primary hover:underline"
                      onClick={() =>
                        updateAction.mutate(
                          { actionId: action.id, body: { status: 'DONE' } },
                          { onError },
                        )
                      }
                    >
                      Mark done
                    </button>
                  ) : (
                    <span className="text-xs text-status-success-fg">{action.status}</span>
                  )}
                </li>
              ))}
            </ul>
            {incident.can.postmortem ? (
              <form
                className="mt-3 flex gap-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (!actionText.trim()) return;
                  createAction.mutate(
                    { kind: 'PREVENTIVE', description: actionText.trim() },
                    { onSuccess: () => setActionText(''), onError },
                  );
                }}
              >
                <label htmlFor="pm-action" className="sr-only">
                  Action item
                </label>
                <Input
                  id="pm-action"
                  value={actionText}
                  onChange={(event) => setActionText(event.target.value)}
                  placeholder="Add a preventive action…"
                />
                <Button type="submit" size="sm" variant="outline" disabled={createAction.isPending}>
                  Add
                </Button>
              </form>
            ) : null}
          </div>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Declared by you? {incident.declaredById === user?.id ? 'Yes' : 'No'} · Last updated{' '}
        {relativeTime(incident.updatedAt)}
      </p>
    </div>
  );
}
