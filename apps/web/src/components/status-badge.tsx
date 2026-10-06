import type { Priority, TicketStatus } from '@opsdesk/contracts';
import {
  AlertTriangle,
  CheckCircle2,
  Circle,
  CircleDot,
  Clock,
  Flame,
  Lock,
  RotateCcw,
  XCircle,
  ChevronUp,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const STATUS_META: Record<TicketStatus, { label: string; className: string; Icon: typeof Circle }> = {
  NEW: { label: 'New', className: 'bg-status-neutral-bg text-status-neutral-fg', Icon: Circle },
  TRIAGED: { label: 'Triaged', className: 'bg-status-info-bg text-status-info-fg', Icon: CircleDot },
  ASSIGNED: { label: 'Assigned', className: 'bg-status-info-bg text-status-info-fg', Icon: CircleDot },
  IN_PROGRESS: {
    label: 'In progress',
    className: 'bg-status-progress-bg text-status-progress-fg',
    Icon: CircleDot,
  },
  WAITING_FOR_USER: {
    label: 'Waiting for user',
    className: 'bg-status-waiting-bg text-status-waiting-fg',
    Icon: Clock,
  },
  ESCALATED: {
    label: 'Escalated',
    className: 'bg-status-warning-bg text-status-warning-fg',
    Icon: AlertTriangle,
  },
  RESOLVED: {
    label: 'Resolved',
    className: 'bg-status-success-bg text-status-success-fg',
    Icon: CheckCircle2,
  },
  REOPENED: {
    label: 'Reopened',
    className: 'bg-status-warning-bg text-status-warning-fg',
    Icon: RotateCcw,
  },
  CLOSED: { label: 'Closed', className: 'bg-status-muted-bg text-status-muted-fg', Icon: Lock },
  CANCELLED: {
    label: 'Cancelled',
    className: 'bg-status-muted-bg text-status-muted-fg',
    Icon: XCircle,
  },
};

export function StatusBadge({ status, className }: { status: TicketStatus; className?: string }) {
  const { label, className: tone, Icon } = STATUS_META[status];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium',
        tone,
        className,
      )}
      aria-label={`Status: ${label}`}
    >
      <Icon aria-hidden="true" className="h-3.5 w-3.5" />
      {label}
    </span>
  );
}

const PRIORITY_META: Record<Priority, { label: string; className: string; level: number }> = {
  LOW: { label: 'Low', className: 'text-status-neutral-fg', level: 1 },
  MEDIUM: { label: 'Medium', className: 'text-status-waiting-fg', level: 2 },
  HIGH: { label: 'High', className: 'text-status-warning-fg', level: 3 },
  CRITICAL: { label: 'Critical', className: 'text-status-danger-fg', level: 4 },
};

export function PriorityBadge({ priority, className }: { priority: Priority; className?: string }) {
  const { label, className: tone, level } = PRIORITY_META[priority];
  return (
    <span
      className={cn('inline-flex items-center gap-1 text-xs font-medium', tone, className)}
      aria-label={`Priority: ${label}`}
    >
      {priority === 'CRITICAL' ? (
        <Flame aria-hidden="true" className="h-3.5 w-3.5" />
      ) : (
        <span className="flex items-center" aria-hidden="true">
          {Array.from({ length: level }, (_, index) => (
            <ChevronUp key={index} className="h-3.5 w-3.5" />
          ))}
        </span>
      )}
      {label}
    </span>
  );
}

export function statusLabel(status: TicketStatus): string {
  return STATUS_META[status].label;
}
