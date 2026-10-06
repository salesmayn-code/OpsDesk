'use client';

import { useState } from 'react';
import { useAuditLogs } from '@/features/platform/hooks';
import type { AuditLogRow } from '@/features/platform/api';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/field';
import { formatDateTime } from '@/lib/format';

function formatDiffValue(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

/** Side-by-side changed-field list; falls back to metadata for non-diff rows. */
function DiffView({ row }: { row: AuditLogRow }) {
  const before = (row.before ?? {}) as Record<string, unknown>;
  const after = (row.after ?? {}) as Record<string, unknown>;
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].filter(
    (key) => JSON.stringify(before[key]) !== JSON.stringify(after[key]),
  );

  return (
    <>
      {keys.length > 0 ? (
        <ul className="mt-2 max-w-lg space-y-1 text-xs">
          {keys.map((key) => (
            <li key={key}>
              <span className="font-mono">{key}</span>:{' '}
              <span className="text-status-danger-fg line-through">
                {formatDiffValue(before[key])}
              </span>{' '}
              <span aria-hidden="true">→</span>{' '}
              <span className="text-status-success-fg">{formatDiffValue(after[key])}</span>
            </li>
          ))}
        </ul>
      ) : null}
      <pre className="mt-2 max-w-lg overflow-x-auto rounded bg-card-muted p-2 text-xs">
        {JSON.stringify(
          keys.length > 0 ? { before, after } : (row.metadata ?? {}),
          null,
          2,
        )}
      </pre>
    </>
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
