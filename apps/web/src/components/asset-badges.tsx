import type { AssetStatus, WarrantyState } from '@opsdesk/contracts';
import { cn } from '@/lib/utils';

const STATUS_META: Record<AssetStatus, { label: string; className: string }> = {
  PROCURED: { label: 'Procured', className: 'bg-status-neutral-bg text-status-neutral-fg' },
  IN_STOCK: { label: 'In stock', className: 'bg-status-info-bg text-status-info-fg' },
  ASSIGNED: { label: 'Assigned', className: 'bg-status-progress-bg text-status-progress-fg' },
  IN_REPAIR: { label: 'In repair', className: 'bg-status-warning-bg text-status-warning-fg' },
  LOST: { label: 'Lost', className: 'bg-status-danger-bg text-status-danger-fg' },
  RETIRED: { label: 'Retired', className: 'bg-status-muted-bg text-status-muted-fg' },
  DISPOSED: { label: 'Disposed', className: 'bg-status-muted-bg text-status-muted-fg' },
};

export function AssetStatusBadge({ status }: { status: AssetStatus }) {
  const meta = STATUS_META[status];
  return (
    <span
      className={cn('inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium', meta.className)}
      aria-label={`Status: ${meta.label}`}
    >
      {meta.label}
    </span>
  );
}

const WARRANTY_META: Record<WarrantyState, { label: string; className: string }> = {
  active: { label: '✓ Active', className: 'text-status-success-fg' },
  expiring: { label: '⚠ Expiring', className: 'text-status-warning-fg' },
  expired: { label: '✕ Expired', className: 'text-status-danger-fg' },
};

export function WarrantyBadge({
  state,
  expiry,
}: {
  state: WarrantyState | null;
  expiry: string | null;
}) {
  if (!state) return <span className="text-xs text-muted-foreground">—</span>;
  const meta = WARRANTY_META[state];
  return (
    <span
      className={cn('text-xs font-medium', meta.className)}
      title={expiry ? `Warranty until ${expiry}` : undefined}
      aria-label={`Warranty: ${state}`}
    >
      {meta.label}
    </span>
  );
}
