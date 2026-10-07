'use client';

import { useState } from 'react';
import { useAuditLogs } from '@/features/platform/hooks';
import type { AuditLogRow } from '@/features/platform/api';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/field';
import { formatDateTime } from '@/lib/format';

/** "IN_PROGRESS" → "In progress"; leaves free text untouched. */
function humanizeValue(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'object') return JSON.stringify(value);
  const text = String(value);
  if (/^[A-Z][A-Z0-9_]*$/.test(text)) {
    return text.charAt(0) + text.slice(1).toLowerCase().replaceAll('_', ' ');
  }
  return text;
}

/** Field-level transition tags for changed rows; metadata list otherwise. */
function DiffView({ row }: { row: AuditLogRow }) {
  const before = (row.before ?? {}) as Record<string, unknown>;
  const after = (row.after ?? {}) as Record<string, unknown>;
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].filter(
    (key) => JSON.stringify(before[key]) !== JSON.stringify(after[key]),
  );

  if (keys.length === 0) {
    const entries = Object.entries((row.metadata ?? {}) as Record<string, unknown>);
    if (entries.length === 0) {
      return <p className="mt-2 text-xs text-muted-foreground">No details recorded.</p>;
    }
    return (
      <dl className="mt-2 max-w-xl space-y-1 text-xs">
        {entries.map(([key, value]) => (
          <div key={key} className="flex flex-wrap gap-2">
            <dt className="font-mono text-muted-foreground">{key}</dt>
            <dd>{humanizeValue(value)}</dd>
          </div>
        ))}
      </dl>
    );
  }

  return (
    <ul className="mt-2 max-w-xl space-y-1.5 text-xs">
      {keys.map((key) => (
        <li key={key} className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-muted-foreground">{key}</span>
          <span className="rounded bg-status-danger-bg px-1.5 py-0.5 text-status-danger-fg line-through">
            {humanizeValue(before[key])}
          </span>
          <span aria-hidden="true" className="text-muted-foreground">
            →
          </span>
          <span className="rounded bg-status-success-bg px-1.5 py-0.5 text-status-success-fg">
            {humanizeValue(after[key])}
          </span>
        </li>
      ))}
    </ul>
  );
}

export default function AuditLogPage() {
  const [action, setAction] = useState('');
  const [entityType, setEntityType] = useState('');
  const [applied, setApplied] = useState({ action: '', entityType: '' });
  const [cursor, setCursor] = useState<string | undefined>(undefined);

  const query = new URLSearchParams({ limit: '50' });
  if (applied.action) query.set('action', applied.action);
  if (applied.entityType) query.set('entityType', applied.entityType);
  if (cursor) query.set('cursor', cursor);

  const logs = useAuditLogs(query.toString());

  return (
    <div className="space-y-4">
      <h1 className="text-display font-semibold tracking-tight">Audit log</h1>

      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          setCursor(undefined);
          setApplied({ action, entityType });
        }}
      >
        <Field label="Action contains" htmlFor="audit-action">
          <Input
            id="audit-action"
            value={action}
            onChange={(event) => setAction(event.target.value)}
            placeholder="ticket."
          />
        </Field>
        <Field label="Entity type" htmlFor="audit-entity">
          <Input
            id="audit-entity"
            value={entityType}
            onChange={(event) => setEntityType(event.target.value)}
            placeholder="ticket"
          />
        </Field>
        <Button type="submit" variant="outline">
          Filter
        </Button>
      </form>

      {logs.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading audit entries…</p>
      ) : logs.isError ? (
        <p role="alert" className="text-sm text-status-danger-fg">
          Could not load audit entries.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-card border border-border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th scope="col" className="px-3 py-2 font-medium">Time</th>
                <th scope="col" className="px-3 py-2 font-medium">Actor</th>
                <th scope="col" className="px-3 py-2 font-medium">Action</th>
                <th scope="col" className="px-3 py-2 font-medium">Entity</th>
                <th scope="col" className="hidden px-3 py-2 font-medium lg:table-cell">Request</th>
              </tr>
            </thead>
            <tbody>
              {(logs.data?.data ?? []).map((row) => (
                <tr key={row.id} className="border-b border-border align-top last:border-0">
                  <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">
                    {formatDateTime(row.createdAt)}
                  </td>
                  <td className="px-3 py-2">{row.actorEmail ?? 'System'}</td>
                  <td className="px-3 py-2 font-mono text-xs">{row.action}</td>
                  <td className="px-3 py-2">
                    <details>
                      <summary className="cursor-pointer text-xs">
                        {row.entityType}
                        {row.entityKey ? ` · ${row.entityKey}` : ''}
                      </summary>
                      <DiffView row={row} />
                    </details>
                  </td>
                  <td className="hidden px-3 py-2 font-mono text-xs text-muted-foreground lg:table-cell">
                    {row.requestId ?? '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {logs.data?.meta.nextCursor ? (
        <Button
          variant="outline"
          size="sm"
          onClick={() => setCursor(logs.data!.meta.nextCursor!)}
        >
          Load more
        </Button>
      ) : null}
    </div>
  );
}
