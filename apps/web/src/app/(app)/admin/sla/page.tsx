'use client';

import { useState, type FormEvent } from 'react';
import {
  useBusinessCalendars,
  useSlaPolicies,
  useSlaPreview,
} from '@/features/admin/hooks';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { formatDateTime } from '@/lib/format';

export default function AdminSlaPage() {
  const policies = useSlaPolicies();
  const calendars = useBusinessCalendars();
  const preview = useSlaPreview();
  const [priority, setPriority] = useState('HIGH');
  const [type, setType] = useState('INCIDENT');

  return (
    <div className="space-y-6">
      <h1 className="text-display font-semibold tracking-tight">SLA policies</h1>

      <section className="space-y-2">
        <h2 className="text-title font-semibold">Policies</h2>
        {policies.isLoading ? (
          <div role="status" aria-label="Loading policies" className="space-y-3 rounded-card border border-border bg-card p-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="h-4 w-full animate-pulse rounded bg-card-muted" />
            ))}
          </div>
        ) : (
          <div className="overflow-x-auto rounded-card border border-border bg-card">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th scope="col" className="px-3 py-2 font-medium">Name</th>
                  <th scope="col" className="px-3 py-2 font-medium">Match</th>
                  <th scope="col" className="px-3 py-2 font-medium">Calendar</th>
                  <th scope="col" className="px-3 py-2 font-medium">Response</th>
                  <th scope="col" className="px-3 py-2 font-medium">Resolution</th>
                  <th scope="col" className="px-3 py-2 font-medium">Thresholds</th>
                  <th scope="col" className="px-3 py-2 font-medium">Flags</th>
                </tr>
              </thead>
              <tbody>
                {(policies.data?.data ?? []).map((policy) => (
                  <tr key={policy.id} className="border-b border-border last:border-0">
                    <td className="px-3 py-2">{policy.name}</td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {[policy.priority ?? 'Any priority', policy.ticketType ?? 'Any type'].join(' · ')}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{policy.calendar.name}</td>
                    <td className="px-3 py-2">{policy.firstResponseMinutes} min</td>
                    <td className="px-3 py-2">{policy.resolutionMinutes} min</td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {policy.warningPercent}% / {policy.escalationPercent}%
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {[policy.isDefault ? 'default' : null, policy.isActive ? 'active' : 'inactive']
                        .filter(Boolean)
                        .join(' · ')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-title font-semibold">Business calendars</h2>
        <div className="overflow-x-auto rounded-card border border-border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th scope="col" className="px-3 py-2 font-medium">Name</th>
                <th scope="col" className="px-3 py-2 font-medium">Timezone</th>
                <th scope="col" className="px-3 py-2 font-medium">Coverage</th>
                <th scope="col" className="px-3 py-2 font-medium">Holidays</th>
              </tr>
            </thead>
            <tbody>
              {(calendars.data?.data ?? []).map((calendar) => (
                <tr key={calendar.id} className="border-b border-border last:border-0">
                  <td className="px-3 py-2">{calendar.name}</td>
                  <td className="px-3 py-2 text-muted-foreground">{calendar.timezone}</td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {calendar.is24x7
                      ? '24×7'
                      : `${calendar.schedule.length} working day(s), ${calendar.schedule[0]?.start ?? '—'}–${calendar.schedule[0]?.end ?? '—'}`}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{calendar.holidays.length}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-3 rounded-card border border-border bg-card p-6">
        <h2 className="text-title font-semibold">Preview calculator</h2>
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(event: FormEvent) => {
            event.preventDefault();
            preview.mutate({ priority, type });
          }}
        >
          <Field label="Priority" htmlFor="preview-priority">
            <select
              id="preview-priority"
              value={priority}
              onChange={(event) => setPriority(event.target.value)}
              className="h-9 rounded-control border border-border bg-card px-2 text-sm"
            >
              <option value="LOW">Low</option>
              <option value="MEDIUM">Medium</option>
              <option value="HIGH">High</option>
              <option value="CRITICAL">Critical</option>
            </select>
          </Field>
          <Field label="Type" htmlFor="preview-type">
            <select
              id="preview-type"
              value={type}
              onChange={(event) => setType(event.target.value)}
              className="h-9 rounded-control border border-border bg-card px-2 text-sm"
            >
              <option value="INCIDENT">Incident</option>
              <option value="SERVICE_REQUEST">Service request</option>
              <option value="ACCESS_REQUEST">Access request</option>
              <option value="HARDWARE_REQUEST">Hardware request</option>
              <option value="SOFTWARE_REQUEST">Software request</option>
            </select>
          </Field>
          <Button type="submit" variant="outline" disabled={preview.isPending}>
            Preview
          </Button>
        </form>

        {preview.data ? (
          <div className="rounded-control bg-card-muted p-4 text-sm" role="status">
            <p className="font-medium">
              Selected policy: {preview.data.data.policy.name} ·{' '}
              {preview.data.data.calendar.name}
            </p>
            <p className="mt-1 text-muted-foreground">
              Response due {formatDateTime(preview.data.data.response.dueAt)} · warning at{' '}
              {formatDateTime(preview.data.data.response.warnAt)}
            </p>
            <p className="mt-1 text-muted-foreground">
              Resolution due {formatDateTime(preview.data.data.resolution.dueAt)} · warning at{' '}
              {formatDateTime(preview.data.data.resolution.warnAt)}
            </p>
          </div>
        ) : null}
      </section>
    </div>
  );
}
