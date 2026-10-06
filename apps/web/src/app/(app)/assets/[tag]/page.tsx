'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import type { AssetStatus } from '@opsdesk/contracts';
import { ApiClientError } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';
import {
  useAsset,
  useAssetHistory,
  useAssetTickets,
  useAssignAsset,
  useTransitionAsset,
  useUnassignAsset,
} from '@/features/assets/hooks';
import { AssetStatusBadge, WarrantyBadge } from '@/components/asset-badges';
import { ConflictBanner } from '@/components/conflict-banner';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/field';
import { formatDateTime } from '@/lib/format';

const TRANSITION_LABELS: Partial<Record<AssetStatus, string>> = {
  IN_STOCK: 'Receive / return to stock',
  IN_REPAIR: 'Send to repair',
  LOST: 'Mark lost',
  RETIRED: 'Retire',
  DISPOSED: 'Dispose',
};

const NOTE_REQUIRED: AssetStatus[] = ['IN_REPAIR', 'LOST', 'IN_STOCK'];

export default function AssetDetailPage() {
  const params = useParams<{ tag: string }>();
  const tag = params.tag;
  const { user } = useAuth();
  const assetQuery = useAsset(tag);
  const history = useAssetHistory(tag);
  const tickets = useAssetTickets(tag);
  const assign = useAssignAsset();
  const unassign = useUnassignAsset();
  const transition = useTransitionAsset();

  const [pending, setPending] = useState<AssetStatus | null>(null);
  const [note, setNote] = useState('');
  const [disposalMethod, setDisposalMethod] = useState('');
  const [banner, setBanner] = useState<{ kind: 'conflict' | 'error'; message: string } | null>(
    null,
  );

  if (assetQuery.isLoading) {
    return <p className="text-sm text-muted-foreground">Loading asset…</p>;
  }
  if (assetQuery.isError || !assetQuery.data) {
    return (
      <div className="rounded-card border border-border bg-card p-6 text-sm">
        <p role="alert">Asset not found or you do not have access.</p>
        <Link href="/assets" className="mt-3 inline-block text-primary hover:underline">
          Back to assets
        </Link>
      </div>
    );
  }

  const asset = assetQuery.data.data;
  const activeAssignment = asset.assignments.find((assignment) => assignment.returnedAt === null);

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

  const submitTransition = (to: AssetStatus) => {
    setBanner(null);
    transition.mutate(
      {
        assetId: asset.id,
        version: asset.version,
        to,
        ...(note.trim() ? { note: note.trim() } : {}),
        ...(to === 'DISPOSED' && disposalMethod.trim()
          ? { disposalMethod: disposalMethod.trim() }
          : {}),
      },
      {
        onSuccess: () => {
          setPending(null);
          setNote('');
          setDisposalMethod('');
        },
        onError,
      },
    );
  };

  const canReassignToMe =
    asset.can.assign &&
    user !== null &&
    ['IN_STOCK', 'ASSIGNED', 'IN_REPAIR'].includes(asset.status) &&
    asset.currentAssignee?.id !== user.id;

  const terminal = asset.status === 'RETIRED' || asset.status === 'DISPOSED';

  return (
    <div className="space-y-4">
      <nav aria-label="Breadcrumb" className="text-sm text-muted-foreground">
        <Link href="/assets" className="hover:underline">
          Assets
        </Link>{' '}
        / <span className="font-mono text-xs">{asset.tag}</span>
      </nav>

      {banner?.kind === 'conflict' ? (
        <ConflictBanner
          message={banner.message}
          onReload={() => {
            setBanner(null);
            void assetQuery.refetch();
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

      <div className="rounded-card border border-border bg-card p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-display font-semibold tracking-tight">
              <span className="font-mono text-title">{asset.tag}</span> · {asset.name}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <AssetStatusBadge status={asset.status} />
              <WarrantyBadge state={asset.warrantyState} expiry={asset.warrantyExpiry} />
              <span className="text-xs text-muted-foreground">{asset.type.name}</span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {canReassignToMe ? (
              <Button
                size="sm"
                variant="outline"
                disabled={assign.isPending}
                onClick={() =>
                  assign.mutate(
                    { assetId: asset.id, version: asset.version, userId: user!.id },
                    { onError },
                  )
                }
              >
                Assign to me
              </Button>
            ) : null}
            {asset.can.assign && asset.currentAssignee ? (
              <Button
                size="sm"
                variant="outline"
                disabled={unassign.isPending}
                onClick={() =>
                  unassign.mutate(
                    { assetId: asset.id, version: asset.version },
                    { onError },
                  )
                }
              >
                Return to stock
              </Button>
            ) : null}
            {!terminal
              ? asset.allowedTransitions
                  .filter((to) => to !== 'ASSIGNED')
                  .map((to) => (
                    <Button
                      key={to}
                      size="sm"
                      variant="outline"
                      disabled={transition.isPending}
                      onClick={() => (NOTE_REQUIRED.includes(to) || to === 'DISPOSED' ? setPending(to) : submitTransition(to))}
                    >
                      {TRANSITION_LABELS[to] ?? to}
                    </Button>
                  ))
              : null}
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
            <p className="text-sm font-medium">{TRANSITION_LABELS[pending] ?? pending}</p>
            {pending === 'DISPOSED' ? (
              <Field label="Disposal method" htmlFor="disposal-method" required>
                <Input
                  id="disposal-method"
                  required
                  value={disposalMethod}
                  onChange={(event) => setDisposalMethod(event.target.value)}
                  placeholder="Recycled, sold, destroyed…"
                />
              </Field>
            ) : null}
            {pending !== 'DISPOSED' ? (
              <Field label="Note" htmlFor="transition-note" required>
                <Input
                  id="transition-note"
                  required
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                />
              </Field>
            ) : null}
            <div className="flex gap-2">
              <Button type="submit" size="sm" disabled={transition.isPending}>
                Confirm
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setPending(null)}>
                Cancel
              </Button>
            </div>
          </form>
        ) : null}

        <dl className="mt-6 grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <dt className="text-xs text-muted-foreground">Serial number</dt>
            <dd>{asset.serialNumber ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Manufacturer / model</dt>
            <dd>{[asset.manufacturer, asset.model].filter(Boolean).join(' ') || '—'}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Purchased</dt>
            <dd>{asset.purchaseDate ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Warranty until</dt>
            <dd>{asset.warrantyExpiry ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Location</dt>
            <dd>{asset.location?.name ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Vendor</dt>
            <dd>{asset.vendor?.name ?? '—'}</dd>
          </div>
        </dl>

        <div className="mt-6 rounded-card border border-border p-4">
          <h2 className="text-sm font-semibold">Assignment</h2>
          {asset.currentAssignee ? (
            <p className="mt-1 text-sm">
              {asset.currentAssignee.firstName} {asset.currentAssignee.lastName} ·{' '}
              {activeAssignment ? `since ${formatDateTime(activeAssignment.assignedAt)}` : ''}
            </p>
          ) : (
            <p className="mt-1 text-sm text-muted-foreground">Not assigned.</p>
          )}
        </div>

        {asset.notes ? (
          <p className="mt-4 whitespace-pre-wrap text-sm text-muted-foreground">{asset.notes}</p>
        ) : null}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-card border border-border bg-card p-6">
          <h2 className="text-title font-semibold">History</h2>
          <ul className="mt-4 space-y-3">
            {(history.data?.data ?? []).map((event) => (
              <li key={event.id} className="text-sm">
                <span className="font-medium">
                  {event.actor ? `${event.actor.firstName} ${event.actor.lastName}` : 'System'}
                </span>{' '}
                <span className="text-muted-foreground">
                  {event.type.toLowerCase().replaceAll('_', ' ')}
                </span>
                <span className="ml-2 text-xs text-muted-foreground">
                  {formatDateTime(event.createdAt)}
                </span>
              </li>
            ))}
            {history.data?.data.length === 0 ? (
              <li className="text-sm text-muted-foreground">No history yet.</li>
            ) : null}
          </ul>
        </div>

        <div className="rounded-card border border-border bg-card p-6">
          <h2 className="text-title font-semibold">Related tickets</h2>
          <ul className="mt-4 space-y-2">
            {(tickets.data?.data ?? []).map((ticket) => (
              <li key={ticket.id} className="text-sm">
                <Link
                  href={`/tickets/${ticket.key}`}
                  className="text-primary underline-offset-4 hover:underline"
                >
                  <span className="font-mono text-xs">{ticket.key}</span> {ticket.title}
                </Link>
              </li>
            ))}
            {tickets.data?.data.length === 0 ? (
              <li className="text-sm text-muted-foreground">No tickets linked to this asset.</li>
            ) : null}
          </ul>
        </div>
      </div>
    </div>
  );
}
