'use client';

import { useMemo, useState } from 'react';
import { REPORTS, reportCsvUrl, type ReportRow } from '@/features/reports/api';
import { useReport } from '@/features/reports/hooks';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/field';

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

function isoNow(): string {
  return new Date(Date.now() + 86_400_000).toISOString();
}

function formatCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  return String(value);
}

/** Lightweight SVG grouped bars: created vs resolved per day. */
function VolumeChart({ rows }: { rows: { day: string; created: number; resolved: number }[] }) {
  const max = Math.max(...rows.map((row) => Math.max(row.created, row.resolved)), 1);
  const height = 120;
  const width = Math.max(rows.length * 26, 240);
  return (
    <div className="overflow-x-auto rounded-card border border-border bg-card p-4">
      <div className="mb-2 flex items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-sm bg-primary" /> Created
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-sm bg-status-success-fg" /> Resolved
        </span>
      </div>
      <svg role="img" aria-label="Ticket volume chart" width={width} height={height} className="block">
        {rows.map((row, index) => {
          const x = index * 26 + 4;
          const createdHeight = Math.round((row.created / max) * (height - 24));
          const resolvedHeight = Math.round((row.resolved / max) * (height - 24));
          return (
            <g key={row.day}>
              <rect
                x={x}
                y={height - 18 - createdHeight}
                width={9}
                height={createdHeight}
                className="fill-primary"
              >
                <title>{`${row.day}: ${row.created} created`}</title>
              </rect>
              <rect
                x={x + 11}
                y={height - 18 - resolvedHeight}
                width={9}
                height={resolvedHeight}
                className="fill-status-success-fg"
              >
                <title>{`${row.day}: ${row.resolved} resolved`}</title>
              </rect>
            </g>
          );
        })}
      </svg>
      <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
        <span>{rows[0]?.day}</span>
        <span>{rows[rows.length - 1]?.day}</span>
      </div>
    </div>
  );
}

/** Horizontal distribution bars for single-metric reports. */
function DistributionBars({ rows }: { rows: ReportRow[] }) {
  const first = rows[0] ?? {};
  const numericKey = Object.keys(first).find((key) => typeof first[key] === 'number');
  const labelKey = Object.keys(first).find((key) => typeof first[key] === 'string');
  if (!numericKey || !labelKey) return null;
  const max = Math.max(...rows.map((row) => Number(row[numericKey] ?? 0)), 1);
  return (
    <div className="space-y-2 rounded-card border border-border bg-card p-4">
      {rows.map((row, index) => (
        <div key={index} className="space-y-1">
          <div className="flex justify-between text-sm">
            <span>{String(row[labelKey] ?? '—')}</span>
            <span className="text-muted-foreground">{String(row[numericKey])}</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-card-muted">
            <div
              className="h-full rounded-full bg-primary"
              style={{ width: `${Math.round((Number(row[numericKey]) / max) * 100)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function ReportsPage() {
  const [reportKey, setReportKey] = useState('volume');
  const [preset, setPreset] = useState<7 | 30 | 90 | 0>(30);
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');

  const { from, to } = useMemo(() => {
    if (preset === 0) {
      return {
        from: customFrom ? new Date(`${customFrom}T00:00:00`).toISOString() : isoDaysAgo(30),
        to: customTo ? new Date(`${customTo}T23:59:59`).toISOString() : isoNow(),
      };
    }
    return { from: isoDaysAgo(preset), to: isoNow() };
  }, [preset, customFrom, customTo]);

  const report = useReport(reportKey, from, to);
  const rows: ReportRow[] = report.data?.data ?? [];
  const columns = rows.length > 0 ? Object.keys(rows[0]!) : [];
  const active = REPORTS.find((entry) => entry.key === reportKey)!;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-display font-semibold tracking-tight">Reports</h1>
          <p className="mt-1 text-sm text-muted-foreground">{active.description}</p>
        </div>
        <a href={reportCsvUrl(reportKey, from, to)} className="inline-flex">
          <Button variant="outline" size="sm">
            Export CSV
          </Button>
        </a>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="report-key" className="sr-only">
          Report
        </label>
        <select
          id="report-key"
          value={reportKey}
          onChange={(event) => setReportKey(event.target.value)}
          className="h-9 rounded-control border border-border bg-card px-2 text-sm"
        >
          {REPORTS.map((entry) => (
            <option key={entry.key} value={entry.key}>
              {entry.label}
            </option>
          ))}
        </select>

        <div role="group" aria-label="Date range" className="flex items-center gap-1">
          {([7, 30, 90] as const).map((days) => (
            <Button
              key={days}
              size="sm"
              variant={preset === days ? 'primary' : 'outline'}
              onClick={() => setPreset(days)}
            >
              Last {days}d
            </Button>
          ))}
          <Button
            size="sm"
            variant={preset === 0 ? 'primary' : 'outline'}
            onClick={() => setPreset(0)}
          >
            Custom
          </Button>
        </div>

        {preset === 0 ? (
          <div className="flex items-center gap-2">
            <label htmlFor="report-from" className="text-xs text-muted-foreground">
              From
            </label>
            <Input
              id="report-from"
              type="date"
              value={customFrom}
              onChange={(event) => setCustomFrom(event.target.value)}
              className="w-36"
            />
            <label htmlFor="report-to" className="text-xs text-muted-foreground">
              To
            </label>
            <Input
              id="report-to"
              type="date"
              value={customTo}
              onChange={(event) => setCustomTo(event.target.value)}
              className="w-36"
            />
          </div>
        ) : null}
      </div>

      {report.isLoading ? (
        <div role="status" aria-label="Running report" className="space-y-3 rounded-card border border-border bg-card p-4">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="h-4 w-full animate-pulse rounded bg-card-muted" />
          ))}
        </div>
      ) : report.isError ? (
        <p role="alert" className="text-sm text-status-danger-fg">
          Could not run this report.
        </p>
      ) : rows.length === 0 ? (
        <div className="rounded-card border border-border bg-card p-8 text-center text-sm text-muted-foreground">
          No data in this range.
        </div>
      ) : (
        <>
        {reportKey === 'volume' ? (
          <VolumeChart rows={rows as unknown as { day: string; created: number; resolved: number }[]} />
        ) : (
          <DistributionBars rows={rows} />
        )}
        <div className="overflow-x-auto rounded-card border border-border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                {columns.map((column) => (
                  <th key={column} scope="col" className="px-3 py-2 font-medium">
                    {column.replaceAll('_', ' ')}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={index} className="border-b border-border last:border-0">
                  {columns.map((column) => (
                    <td key={column} className="px-3 py-2">
                      {formatCell(row[column])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </>
      )}
    </div>
  );
}
