import type { IncidentSeverity, IncidentStatus } from '@opsdesk/contracts';
import { cn } from '@/lib/utils';

const SEVERITY_META: Record<IncidentSeverity, { label: string; className: string }> = {
  SEV1: { label: 'SEV1', className: 'bg-status-danger-fg text-white' },
  SEV2: { label: 'SEV2', className: 'bg-status-danger-bg text-status-danger-fg' },
  SEV3: { label: 'SEV3', className: 'bg-status-warning-bg text-status-warning-fg' },
  SEV4: { label: 'SEV4', className: 'bg-status-info-bg text-status-info-fg' },
};

export function SeverityBadge({ severity, className }: { severity: IncidentSeverity; className?: string }) {
  const meta = SEVERITY_META[severity];
  return (
    <span
      className={cn('inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold', meta.className, className)}
      aria-label={`Severity: ${meta.label}`}
    >
      {meta.label}
    </span>
  );
}

const STATUS_META: Record<IncidentStatus, { label: string; className: string }> = {
  IDENTIFIED: { label: 'Identified', className: 'bg-status-neutral-bg text-status-neutral-fg' },
  INVESTIGATING: { label: 'Investigating', className: 'bg-status-progress-bg text-status-progress-fg' },
  ESCALATED: { label: 'Escalated', className: 'bg-status-warning-bg text-status-warning-fg' },
  MITIGATING: { label: 'Mitigating', className: 'bg-status-progress-bg text-status-progress-fg' },
  MONITORING: { label: 'Monitoring', className: 'bg-status-waiting-bg text-status-waiting-fg' },
  RESOLVED: { label: 'Resolved', className: 'bg-status-success-bg text-status-success-fg' },
  CLOSED: { label: 'Closed', className: 'bg-status-muted-bg text-status-muted-fg' },
};

export function IncidentStatusBadge({ status }: { status: IncidentStatus }) {
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

export function incidentStatusLabel(status: IncidentStatus): string {
  return STATUS_META[status].label;
}
