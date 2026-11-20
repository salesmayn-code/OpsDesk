'use client';

import { useState, type FormEvent } from 'react';
import type { BusinessCalendar, Priority, SlaPolicy, TicketType } from '@opsdesk/contracts';
import { ApiClientError } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/field';
import { useToast } from '@/components/toast';
import { useCategories } from '@/features/tickets/hooks';
import { TICKET_TYPE_LABELS } from '@/features/tickets/labels';
import { useCreateBusinessCalendar, useSaveSlaPolicy } from './hooks';

const SELECT = 'h-9 w-full rounded-control border border-border bg-card px-2 text-sm';
const PRIORITIES: Priority[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const errorMessage = (error: unknown) =>
  error instanceof ApiClientError
    ? [error.message, ...(error.details ?? []).map((d) => `${d.field}: ${d.issue}`)].join(' ')
    : 'Something went wrong.';

/** "90" → "1h 30m": targets are stored in minutes, people think in hours. */
function humanMinutes(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '';
  const days = Math.floor(value / 1440);
  const hours = Math.floor((value % 1440) / 60);
  const minutes = value % 60;
  return [days && `${days}d`, hours && `${hours}h`, minutes && `${minutes}m`].filter(Boolean).join(' ');
}

interface PolicyFormProps {
  policy?: SlaPolicy;
  calendars: BusinessCalendar[];
  onDone: () => void;
}

/** SLA-1: create or edit a policy. Selection order is decided server-side (BR-2). */
export function SlaPolicyForm({ policy, calendars, onDone }: PolicyFormProps) {
  const [form, setForm] = useState({
    name: policy?.name ?? '',
    description: policy?.description ?? '',
    priority: policy?.priority ?? '',
    ticketType: policy?.ticketType ?? '',
    categoryId: policy?.categoryId ?? '',
    calendarId: policy?.calendarId ?? calendars[0]?.id ?? '',
    firstResponseMinutes: policy?.firstResponseMinutes ?? 60,
    resolutionMinutes: policy?.resolutionMinutes ?? 480,
    warningPercent: policy?.warningPercent ?? 75,
    escalationPercent: policy?.escalationPercent ?? 90,
    pauseWhileWaiting: policy ? policy.pauseOnStatuses.includes('WAITING_FOR_USER') : true,
    isDefault: policy?.isDefault ?? false,
    isActive: policy?.isActive ?? true,
    sortOrder: policy?.sortOrder ?? 0,
  });
  const set = (patch: Partial<typeof form>) => setForm((current) => ({ ...current, ...patch }));
  const [error, setError] = useState<string | null>(null);
  const categories = useCategories();
  const save = useSaveSlaPolicy();
  const { toast } = useToast();

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    if (form.escalationPercent <= form.warningPercent) {
      setError('The escalation threshold must be higher than the warning threshold.');
      return;
    }
    save.mutate(
      {
        id: policy?.id,
        name: form.name.trim(),
        ...(form.description.trim() ? { description: form.description.trim() } : {}),
        priority: (form.priority || null) as Priority | null,
        ticketType: (form.ticketType || null) as TicketType | null,
        categoryId: form.categoryId || null,
        calendarId: form.calendarId,
        firstResponseMinutes: form.firstResponseMinutes,
        resolutionMinutes: form.resolutionMinutes,
        warningPercent: form.warningPercent,
        escalationPercent: form.escalationPercent,
        pauseOnStatuses: form.pauseWhileWaiting ? ['WAITING_FOR_USER'] : [],
        isDefault: form.isDefault,
        isActive: form.isActive,
        sortOrder: form.sortOrder,
      },
      {
        onSuccess: () => {
          toast(policy ? 'Policy updated' : 'Policy created');
          onDone();
        },
        onError: (err) => setError(errorMessage(err)),
      },
    );
  };

  const number = (key: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement>) =>
    set({ [key]: Number(event.target.value) } as Partial<typeof form>);

  return (
    <form onSubmit={submit} className="space-y-4 rounded-card border border-border bg-card p-6">
      <h2 className="text-title font-semibold">{policy ? `Edit “${policy.name}”` : 'New SLA policy'}</h2>
      {error ? (
        <p role="alert" className="rounded-control bg-status-danger-bg px-3 py-2 text-sm text-status-danger-fg">
          {error}
        </p>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" htmlFor="sla-name" required>
          <Input id="sla-name" required maxLength={100} value={form.name} onChange={(e) => set({ name: e.target.value })} />
        </Field>
        <Field label="Business calendar" htmlFor="sla-calendar" required>
          <select id="sla-calendar" required className={SELECT} value={form.calendarId} onChange={(e) => set({ calendarId: e.target.value })}>
            {calendars.map((calendar) => (
              <option key={calendar.id} value={calendar.id}>
                {calendar.name}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="Description" htmlFor="sla-description">
        <Input id="sla-description" maxLength={1000} value={form.description} onChange={(e) => set({ description: e.target.value })} />
      </Field>

      <fieldset className="grid gap-4 sm:grid-cols-3">
        <legend className="mb-2 text-sm font-medium">Applies to</legend>
        <Field label="Priority" htmlFor="sla-priority">
          <select id="sla-priority" className={SELECT} value={form.priority} onChange={(e) => set({ priority: e.target.value })}>
            <option value="">Any priority</option>
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {p.charAt(0) + p.slice(1).toLowerCase()}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Ticket type" htmlFor="sla-type">
          <select id="sla-type" className={SELECT} value={form.ticketType} onChange={(e) => set({ ticketType: e.target.value })}>
            <option value="">Any type</option>
            {Object.entries(TICKET_TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Category" htmlFor="sla-category">
          <select id="sla-category" className={SELECT} value={form.categoryId} onChange={(e) => set({ categoryId: e.target.value })}>
            <option value="">Any category</option>
            {categories.data?.data.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </Field>
      </fieldset>

      <fieldset className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <legend className="mb-2 text-sm font-medium">Targets</legend>
        <Field label="First response (minutes)" htmlFor="sla-response" required hint={humanMinutes(form.firstResponseMinutes)}>
          <Input id="sla-response" type="number" min={1} required value={form.firstResponseMinutes} onChange={number('firstResponseMinutes')} />
        </Field>
        <Field label="Resolution (minutes)" htmlFor="sla-resolution" required hint={humanMinutes(form.resolutionMinutes)}>
          <Input id="sla-resolution" type="number" min={1} required value={form.resolutionMinutes} onChange={number('resolutionMinutes')} />
        </Field>
        <Field label="Warn at (%)" htmlFor="sla-warn" required>
          <Input id="sla-warn" type="number" min={1} max={99} required value={form.warningPercent} onChange={number('warningPercent')} />
        </Field>
        <Field label="Escalate at (%)" htmlFor="sla-escalate" required>
          <Input id="sla-escalate" type="number" min={1} max={99} required value={form.escalationPercent} onChange={number('escalationPercent')} />
        </Field>
      </fieldset>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={form.pauseWhileWaiting} onChange={(e) => set({ pauseWhileWaiting: e.target.checked })} />
          Pause resolution timer while waiting for the user
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={form.isDefault} onChange={(e) => set({ isDefault: e.target.checked })} />
          Default (fallback) policy
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={form.isActive} onChange={(e) => set({ isActive: e.target.checked })} />
          Active
        </label>
      </div>

      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={save.isPending}>
          {save.isPending ? 'Saving…' : policy ? 'Save policy' : 'Create policy'}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

/** SLA-4: add a business-hours (or 24×7) calendar. */
export function BusinessCalendarForm({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState('');
  const [timezone, setTimezone] = useState('Asia/Karachi');
  const [is24x7, setIs24x7] = useState(false);
  const [days, setDays] = useState([1, 2, 3, 4, 5]);
  const [start, setStart] = useState('09:00');
  const [end, setEnd] = useState('18:00');
  const [error, setError] = useState<string | null>(null);
  const create = useCreateBusinessCalendar();
  const { toast } = useToast();

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    if (!is24x7 && (days.length === 0 || end <= start)) {
      setError('Pick at least one working day and an end time after the start time.');
      return;
    }
    create.mutate(
      {
        name: name.trim(),
        timezone: timezone.trim(),
        is24x7,
        schedule: is24x7 ? [] : days.map((weekday) => ({ weekday, start, end })),
      },
      {
        onSuccess: () => {
          toast('Calendar created');
          onDone();
        },
        onError: (err) => setError(errorMessage(err)),
      },
    );
  };

  return (
    <form onSubmit={submit} className="space-y-4 rounded-card border border-border bg-card p-6">
      <h2 className="text-title font-semibold">New business calendar</h2>
      {error ? (
        <p role="alert" className="rounded-control bg-status-danger-bg px-3 py-2 text-sm text-status-danger-fg">
          {error}
        </p>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" htmlFor="cal-name" required>
          <Input id="cal-name" required maxLength={100} value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Timezone" htmlFor="cal-tz" required hint="IANA name, e.g. Asia/Karachi or Europe/London.">
          <Input id="cal-tz" required value={timezone} onChange={(e) => setTimezone(e.target.value)} />
        </Field>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={is24x7} onChange={(e) => setIs24x7(e.target.checked)} />
        24×7 coverage
      </label>
      {!is24x7 ? (
        <div className="space-y-3">
          <fieldset className="flex flex-wrap gap-3 text-sm">
            <legend className="mb-2 text-sm font-medium">Working days</legend>
            {WEEKDAYS.map((label, index) => {
              const weekday = index + 1;
              return (
                <label key={label} className="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={days.includes(weekday)}
                    onChange={(e) =>
                      setDays((current) =>
                        e.target.checked ? [...current, weekday].sort() : current.filter((d) => d !== weekday),
                      )
                    }
                  />
                  {label}
                </label>
              );
            })}
          </fieldset>
          <div className="grid max-w-sm grid-cols-2 gap-4">
            <Field label="Start" htmlFor="cal-start" required>
              <Input id="cal-start" type="time" required value={start} onChange={(e) => setStart(e.target.value)} />
            </Field>
            <Field label="End" htmlFor="cal-end" required>
              <Input id="cal-end" type="time" required value={end} onChange={(e) => setEnd(e.target.value)} />
            </Field>
          </div>
        </div>
      ) : null}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={create.isPending}>
          {create.isPending ? 'Saving…' : 'Create calendar'}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
