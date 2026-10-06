import { API_URL, apiFetch } from '@/lib/api-client';

export type ReportRow = Record<string, string | number | null>;

export const REPORTS: { key: string; label: string; description: string }[] = [
  { key: 'volume', label: 'Ticket volume', description: 'Created vs resolved per day' },
  { key: 'sla-compliance', label: 'SLA compliance', description: 'On-time resolution % by team' },
  { key: 'breaches', label: 'Breaches', description: 'Breached timers by kind and team' },
  { key: 'categories', label: 'Categories', description: 'Tickets created by category' },
  { key: 'response-times', label: 'Response times', description: 'Average first response and resolution by team' },
];

export function fetchReport(
  key: string,
  from: string,
  to: string,
): Promise<{ data: ReportRow[]; meta: { reportKey: string; from: string; to: string } }> {
  return apiFetch(`/reports/${key}?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
}

export function reportCsvUrl(key: string, from: string, to: string): string {
  return `${API_URL}/api/v1/reports/${key}?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&format=csv`;
}
