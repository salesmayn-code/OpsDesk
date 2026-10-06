'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

const TONES: Record<string, { text: string; bar: string }> = {
  ON_TRACK: { text: 'text-status-success-fg', bar: 'bg-status-success-fg' },
  AT_RISK: { text: 'text-status-warning-fg', bar: 'bg-status-warning-fg' },
  BREACHED: { text: 'text-status-danger-fg', bar: 'bg-status-danger-fg' },
  PAUSED: { text: 'text-status-waiting-fg', bar: 'bg-status-waiting-fg' },
  COMPLETED: { text: 'text-status-success-fg', bar: 'bg-status-success-fg' },
  CANCELLED: { text: 'text-status-muted-fg', bar: 'bg-status-muted-fg' },
};

function formatDuration(ms: number): string {
  const totalMinutes = Math.max(0, Math.round(ms / 60_000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export interface SlaTimerProps {
  kind: 'RESPONSE' | 'RESOLUTION';
  state: string;
  dueAt: string;
  percentConsumed: number | null;
}

/**
 * Server-time based countdown; re-renders every 30s from dueAt (UI/UX §4).
 * Colour + text carry the state (never colour-only).
 */
export function SlaTimer({ kind, state, dueAt, percentConsumed }: SlaTimerProps) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(interval);
  }, []);

  const remainingMs = new Date(dueAt).getTime() - now;
  const tone = TONES[state] ?? TONES.ON_TRACK!;
  const percent = Math.min(100, Math.max(0, percentConsumed ?? 0));

  const label =
    state === 'COMPLETED'
      ? 'Met'
      : state === 'CANCELLED'
        ? 'Cancelled'
        : state === 'PAUSED'
          ? 'Paused while waiting'
          : remainingMs <= 0
            ? `Breached ${formatDuration(-remainingMs)} ago`
            : `${formatDuration(remainingMs)} remaining`;

  return (
    <div role="timer" aria-label={`${kind === 'RESPONSE' ? 'First response' : 'Resolution'} SLA`}>
      <div className="flex items-baseline justify-between gap-4 text-xs">
        <span className="text-muted-foreground">
          {kind === 'RESPONSE' ? 'Response' : 'Resolution'}
        </span>
        <span className={cn('font-medium', tone.text)}>{label}</span>
      </div>
      <div
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="SLA consumed"
        className="relative mt-1 h-1.5 w-full min-w-40 overflow-hidden rounded-full bg-border"
      >
        <div
          className={cn('h-full rounded-full transition-[width]', tone.bar)}
          style={{ width: `${percent}%` }}
        />
        <span aria-hidden="true" className="absolute inset-y-0 left-[75%] w-px bg-border" />
        <span aria-hidden="true" className="absolute inset-y-0 left-[90%] w-px bg-border" />
      </div>
    </div>
  );
}
