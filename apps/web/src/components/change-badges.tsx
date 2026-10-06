import type { ChangeRisk, ChangeStatus, ChangeType } from '@opsdesk/contracts';
import { cn } from '@/lib/utils';

const TYPE_META: Record<ChangeType, { label: string; className: string }> = {
  STANDARD: { label: 'Standard', className: 'bg-status-info-bg text-status-info-fg' },
  NORMAL: { label: 'Normal', className: 'bg-status-neutral-bg text-status-neutral-fg' },
  EMERGENCY: { label: 'Emergency', className: 'bg-status-danger-bg text-status-danger-fg' },
};

export function ChangeTypeBadge({ type }: { type: ChangeType }) {
  const meta = TYPE_META[type];
  return (
    <span
      className={cn('inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium', meta.className)}
      aria-label={`Type: ${meta.label}`}
    >
      {meta.label}
    </span>
  );
}

const RISK_META: Record<ChangeRisk, { label: string; className: string }> = {
  LOW: { label: 'Low risk', className: 'bg-status-muted-bg text-status-muted-fg' },
  MEDIUM: { label: 'Medium risk', className: 'bg-status-waiting-bg text-status-waiting-fg' },
  HIGH: { label: 'High risk', className: 'bg-status-warning-bg text-status-warning-fg' },
  CRITICAL: { label: 'Critical risk', className: 'bg-status-danger-bg text-status-danger-fg' },
};

export function ChangeRiskBadge({ risk }: { risk: ChangeRisk }) {
  const meta = RISK_META[risk];
  return (
    <span
      className={cn('inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium', meta.className)}
      aria-label={`Risk: ${meta.label}`}
    >
      {meta.label}
    </span>
  );
}

const STATUS_META: Record<ChangeStatus, { label: string; className: string }> = {
  DRAFT: { label: 'Draft', className: 'bg-status-neutral-bg text-status-neutral-fg' },
  SUBMITTED: { label: 'Submitted', className: 'bg-status-info-bg text-status-info-fg' },
  UNDER_REVIEW: { label: 'Under review', className: 'bg-status-waiting-bg text-status-waiting-fg' },
  APPROVED: { label: 'Approved', className: 'bg-status-success-bg text-status-success-fg' },
  REJECTED: { label: 'Rejected', className: 'bg-status-danger-bg text-status-danger-fg' },
  SCHEDULED: { label: 'Scheduled', className: 'bg-status-info-bg text-status-info-fg' },
  IMPLEMENTING: { label: 'Implementing', className: 'bg-status-progress-bg text-status-progress-fg' },
  VALIDATING: { label: 'Validating', className: 'bg-status-progress-bg text-status-progress-fg' },
  COMPLETED: { label: 'Completed', className: 'bg-status-success-bg text-status-success-fg' },
  FAILED: { label: 'Failed', className: 'bg-status-danger-bg text-status-danger-fg' },
  ROLLED_BACK: { label: 'Rolled back', className: 'bg-status-warning-bg text-status-warning-fg' },
  CLOSED: { label: 'Closed', className: 'bg-status-muted-bg text-status-muted-fg' },
  CANCELLED: { label: 'Cancelled', className: 'bg-status-muted-bg text-status-muted-fg' },
};

export function ChangeStatusBadge({ status }: { status: ChangeStatus }) {
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

export function changeStatusLabel(status: ChangeStatus): string {
  return STATUS_META[status].label;
}
