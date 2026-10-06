'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import type { ChangeStatus } from '@opsdesk/contracts';
import { ApiClientError } from '@/lib/api-client';
import {
  useChange,
  useChangeHistory,
  useRecordChangeApproval,
  useSubmitChange,
  useTransitionChange,
} from '@/features/changes/hooks';
import {
  ChangeRiskBadge,
  ChangeStatusBadge,
  ChangeTypeBadge,
  changeStatusLabel,
} from '@/components/change-badges';
import { ConflictBanner } from '@/components/conflict-banner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/field';
import { formatDateTime, relativeTime } from '@/lib/format';

const TRANSITION_LABELS: Partial<Record<ChangeStatus, string>> = {
  SCHEDULED: 'Confirm schedule',
  IMPLEMENTING: 'Start implementation',
  VALIDATING: 'Validate',
  COMPLETED: 'Mark completed',
  FAILED: 'Mark failed',
  ROLLED_BACK: 'Rolled back',
  CLOSED: 'Close',
  CANCELLED: 'Cancel change',
  DRAFT: 'Return to draft',
  REJECTED: 'Reject',
  UNDER_REVIEW: 'Start review',
};

export default function ChangeDetailPage() {
  const params = useParams<{ key: string }>();
  const key = params.key;
  const changeQuery = useChange(key);
  const history = useChangeHistory(key);

  const changeId = changeQuery.data?.data.id ?? '';
  const submit = useSubmitChange(changeId, key);
  const transition = useTransitionChange(changeId, key);
  const approval = useRecordChangeApproval(changeId, key);

  const [banner, setBanner] = useState<{ kind: 'conflict' | 'error'; message: string } | null>(null);
  const [note, setNote] = useState('');
  const [pendingTransition, setPendingTransition] = useState<ChangeStatus | null>(null);
  const [approvalComment, setApprovalComment] = useState('');

  if (changeQuery.isLoading) return <p className="text-sm text-muted-foreground">Loading change…</p>;
  if (changeQuery.isError || !changeQuery.data) {
    return (
      <div className="rounded-card border border-border bg-card p-6 text-sm">
        <p role="alert">Change not found or you do not have access.</p>
        <Link href="/changes" className="mt-3 inline-block text-primary hover:underline">
          Back to changes
        </Link>
      </div>
    );
  }

  const change = changeQuery.data.data;
  const terminal = ['CLOSED', 'CANCELLED', 'REJECTED'].includes(change.status);

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

  const submitTransition = (to: ChangeStatus, transitionNote?: string) => {
    setBanner(null);
    transition.mutate(
      { changeId: change.id, version: change.version, to, ...(transitionNote ? { note: transitionNote } : {}) },
      {
        onSuccess: () => {
          setPendingTransition(null);
          setNote('');
        },
        onError,
      },
    );
  };

  const decide = (decision: 'APPROVED' | 'REJECTED' | 'REQUEST_CHANGES') => {
    setBanner(null);
    approval.mutate(
      {
        changeId: change.id,
        decision,
        ...(approvalComment.trim() ? { comment: approvalComment.trim() } : {}),
      },
      { onSuccess: () => setApprovalComment(''), onError },
    );
  };

  return (
    <div className="space-y-4">
      <nav aria-label="Breadcrumb" className="text-sm text-muted-foreground">
        <Link href="/changes" className="hover:underline">
          Changes
        </Link>{' '}
        / <span className="font-mono text-xs">{change.key}</span>
      </nav>

      {banner?.kind === 'conflict' ? (
        <ConflictBanner
          message={banner.message}
          onReload={() => {
            setBanner(null);
            void changeQuery.refetch();
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
            <h1 className="text-display font-semibold tracking-tight">{change.title}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <ChangeStatusBadge status={change.status} />
              <ChangeTypeBadge type={change.type} />
              <ChangeRiskBadge risk={change.risk} />
              {change.incident ? (
                <Link
                  href={`/incidents/${change.incident.key}`}
                  className="text-xs text-primary hover:underline"
                >
                  {change.incident.key}
                </Link>
              ) : null}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {change.status === 'DRAFT' ? (
              <Button
                size="sm"
                disabled={submit.isPending}
                onClick={() => submit.mutate({ changeId: change.id }, { onError })}
              >
                Submit for approval
              </Button>
            ) : null}
            {!terminal
              ? change.allowedTransitions
                  .filter((to) => to !== 'CANCELLED' && to !== 'REJECTED' && to !== 'DRAFT')
                  .map((to) => (
                    <Button
                      key={to}
                      size="sm"
                      variant="outline"
                      disabled={transition.isPending}
                      onClick={() =>
                        ['COMPLETED', 'FAILED', 'ROLLED_BACK'].includes(to)
                          ? setPendingTransition(to)
                          : submitTransition(to)
                      }
                    >
                      {TRANSITION_LABELS[to] ?? changeStatusLabel(to)}
                    </Button>
                  ))
              : null}
            {!terminal &&
            change.status === 'SCHEDULED' &&
            !change.allowedTransitions.includes('IMPLEMENTING') ? (
              <span title="Implementation opens 15 minutes before the scheduled window starts.">
                <Button size="sm" variant="outline" disabled>
                  Start implementation
                </Button>
              </span>
            ) : null}
            {!terminal && change.allowedTransitions.includes('CANCELLED') ? (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => submitTransition('CANCELLED')}
                disabled={transition.isPending}
              >
                Cancel change
              </Button>
            ) : null}
          </div>
        </div>

        {pendingTransition ? (
          <form
            className="mt-5 space-y-3 rounded-card border border-border bg-card-muted p-4"
            onSubmit={(event) => {
              event.preventDefault();
              submitTransition(pendingTransition, note.trim());
            }}
          >
            <p className="text-sm font-medium">
              {TRANSITION_LABELS[pendingTransition] ?? pendingTransition}
            </p>
            <label htmlFor="change-note" className="block text-sm font-medium">
              Note (required)
            </label>
            <Input
              id="change-note"
              required
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
            <div className="flex gap-2">
              <Button type="submit" size="sm" disabled={transition.isPending}>
                Confirm
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setPendingTransition(null)}>
                Cancel
              </Button>
            </div>
          </form>
        ) : null}

        <p className="mt-4 whitespace-pre-wrap text-sm">{change.description}</p>
        <dl className="mt-4 grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs text-muted-foreground">Window</dt>
            <dd>
              {change.scheduledStart ? formatDateTime(change.scheduledStart) : 'Not scheduled'} →{' '}
              {change.scheduledEnd ? formatDateTime(change.scheduledEnd) : '—'}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Services</dt>
            <dd>{change.services.map((service) => service.name).join(', ') || '—'}</dd>
          </div>
          {change.actualStart ? (
            <div>
              <dt className="text-xs text-muted-foreground">Actual start</dt>
              <dd>{formatDateTime(change.actualStart)}</dd>
            </div>
          ) : null}
          {change.outcomeNotes ? (
            <div>
              <dt className="text-xs text-muted-foreground">Outcome notes</dt>
              <dd>{change.outcomeNotes}</dd>
            </div>
          ) : null}
        </dl>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-card border border-border bg-card p-6">
          <h2 className="text-title font-semibold">Approvals</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Round {change.approvalRound} · {change.approvedCount}/{change.requiredApprovals} approved
            {change.requiresAdminApproval ? ` · admin approval ${change.adminApproved ? 'received' : 'required'}` : ''}
          </p>

          {change.can.approve ? (
            <form
              className="mt-4 space-y-3 border-b border-border pb-4"
              onSubmit={(event) => {
                event.preventDefault();
              }}
            >
              <label htmlFor="approval-comment" className="sr-only">
                Approval comment
              </label>
              <textarea
                id="approval-comment"
                rows={2}
                value={approvalComment}
                onChange={(event) => setApprovalComment(event.target.value)}
                placeholder="Comment (optional)…"
                className="w-full rounded-control border border-border bg-card px-3 py-2 text-sm"
              />
              <div className="flex flex-wrap gap-2">
                <Button type="button" size="sm" disabled={approval.isPending} onClick={() => decide('APPROVED')}>
                  Approve
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={approval.isPending}
                  onClick={() => decide('REQUEST_CHANGES')}
                >
                  Request changes
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="danger"
                  disabled={approval.isPending}
                  onClick={() => decide('REJECTED')}
                >
                  Reject
                </Button>
              </div>
            </form>
          ) : null}

          <ul className="mt-4 space-y-2">
            {change.approvals.map((entry) => (
              <li key={entry.id} className="text-sm">
                <span className="font-medium">{entry.approverId.slice(0, 8)}…</span>{' '}
                <span
                  className={
                    entry.decision === 'APPROVED'
                      ? 'text-status-success-fg'
                      : entry.decision === 'REJECTED'
                        ? 'text-status-danger-fg'
                        : 'text-status-warning-fg'
                  }
                >
                  {entry.decision.toLowerCase().replaceAll('_', ' ')}
                </span>
                {entry.comment ? <span className="text-muted-foreground"> — {entry.comment}</span> : null}
                <span className="ml-2 text-xs text-muted-foreground">{relativeTime(entry.createdAt)}</span>
              </li>
            ))}
            {change.approvals.length === 0 ? (
              <li className="text-sm text-muted-foreground">No decisions yet.</li>
            ) : null}
          </ul>
        </div>

        <div className="space-y-4">
          <div className="rounded-card border border-border bg-card p-6">
            <h2 className="text-title font-semibold">Plans</h2>
            <dl className="mt-3 space-y-3 text-sm">
              {[
                ['Implementation', change.implementationPlan],
                ['Validation', change.validationPlan],
                ['Rollback', change.rollbackPlan],
                ['Impact analysis', change.impactAnalysis],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="text-xs text-muted-foreground">{label}</dt>
                  <dd className="whitespace-pre-wrap">{value ?? 'Not provided'}</dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="rounded-card border border-border bg-card p-6">
            <h2 className="text-title font-semibold">History</h2>
            <ul className="mt-3 space-y-2">
              {(history.data?.data ?? []).map((event) => (
                <li key={event.id} className="text-sm">
                  <span className="text-muted-foreground">
                    {event.type.toLowerCase().replaceAll('_', ' ')}
                  </span>
                  {event.toValue ? <span className="ml-1">→ {changeStatusLabel(event.toValue as ChangeStatus)}</span> : null}
                  <span className="ml-2 text-xs text-muted-foreground">{relativeTime(event.createdAt)}</span>
                </li>
              ))}
              {(history.data?.data ?? []).length === 0 ? (
                <li className="text-sm text-muted-foreground">No history yet.</li>
              ) : null}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
