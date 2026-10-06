'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import type { ChangeRisk, ChangeType } from '@opsdesk/contracts';
import { ApiClientError } from '@/lib/api-client';
import { useCreateChange } from '@/features/changes/hooks';
import { useServices } from '@/features/incidents/hooks';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/field';

export default function NewChangePage() {
  const router = useRouter();
  const services = useServices();
  const createChange = useCreateChange();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<ChangeType>('NORMAL');
  const [risk, setRisk] = useState<ChangeRisk>('MEDIUM');
  const [selectedServices, setSelectedServices] = useState<string[]>([]);
  const [scheduledStart, setScheduledStart] = useState('');
  const [scheduledEnd, setScheduledEnd] = useState('');
  const [implementationPlan, setImplementationPlan] = useState('');
  const [validationPlan, setValidationPlan] = useState('');
  const [rollbackPlan, setRollbackPlan] = useState('');
  const [error, setError] = useState<string | null>(null);

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    createChange.mutate(
      {
        title,
        description,
        type,
        risk,
        ...(selectedServices.length ? { serviceIds: selectedServices } : {}),
        ...(scheduledStart ? { scheduledStart: new Date(scheduledStart).toISOString() } : {}),
        ...(scheduledEnd ? { scheduledEnd: new Date(scheduledEnd).toISOString() } : {}),
        ...(implementationPlan.trim() ? { implementationPlan: implementationPlan.trim() } : {}),
        ...(validationPlan.trim() ? { validationPlan: validationPlan.trim() } : {}),
        ...(rollbackPlan.trim() ? { rollbackPlan: rollbackPlan.trim() } : {}),
      },
      {
        onSuccess: (result) => router.push(`/changes/${result.data.key}`),
        onError: (mutationError) =>
          setError(
            mutationError instanceof ApiClientError
              ? mutationError.message
              : 'Something went wrong. Try again.',
          ),
      },
    );
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-display font-semibold tracking-tight">New change request</h1>
      <form onSubmit={onSubmit} className="space-y-4 rounded-card border border-border bg-card p-6">
        {error ? (
          <p role="alert" className="rounded-control bg-status-danger-bg px-3 py-2 text-sm text-status-danger-fg">
            {error}
          </p>
        ) : null}

        <Field label="Title" htmlFor="change-title" required>
          <Input
            id="change-title"
            required
            minLength={5}
            maxLength={200}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Type" htmlFor="change-type-input" required>
            <select
              id="change-type-input"
              value={type}
              onChange={(event) => setType(event.target.value as ChangeType)}
              className="h-9 w-full rounded-control border border-border bg-card px-2 text-sm"
            >
              <option value="STANDARD">Standard — pre-approved</option>
              <option value="NORMAL">Normal — requires approval</option>
              <option value="EMERGENCY">Emergency</option>
            </select>
          </Field>
          <Field label="Risk" htmlFor="change-risk-input" required>
            <select
              id="change-risk-input"
              value={risk}
              onChange={(event) => setRisk(event.target.value as ChangeRisk)}
              className="h-9 w-full rounded-control border border-border bg-card px-2 text-sm"
            >
              <option value="LOW">Low</option>
              <option value="MEDIUM">Medium</option>
              <option value="HIGH">High</option>
              <option value="CRITICAL">Critical</option>
            </select>
          </Field>
        </div>

        <Field label="Description" htmlFor="change-description" required>
          <textarea
            id="change-description"
            required
            rows={4}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            className="w-full rounded-control border border-border bg-card px-3 py-2 text-sm"
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Window start" htmlFor="change-window-start">
            <Input
              id="change-window-start"
              type="datetime-local"
              value={scheduledStart}
              onChange={(event) => setScheduledStart(event.target.value)}
            />
          </Field>
          <Field label="Window end" htmlFor="change-window-end">
            <Input
              id="change-window-end"
              type="datetime-local"
              value={scheduledEnd}
              onChange={(event) => setScheduledEnd(event.target.value)}
            />
          </Field>
        </div>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Affected services</legend>
          {(services.data?.data ?? []).map((service) => (
            <label key={service.id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={selectedServices.includes(service.id)}
                onChange={(event) =>
                  setSelectedServices((current) =>
                    event.target.checked
                      ? [...current, service.id]
                      : current.filter((id) => id !== service.id),
                  )
                }
              />
              {service.name}
            </label>
          ))}
        </fieldset>

        <Field label="Implementation plan" htmlFor="change-implementation" required hint="Required before submitting.">
          <textarea
            id="change-implementation"
            rows={3}
            value={implementationPlan}
            onChange={(event) => setImplementationPlan(event.target.value)}
            className="w-full rounded-control border border-border bg-card px-3 py-2 text-sm"
          />
        </Field>
        <Field label="Validation plan" htmlFor="change-validation" required>
          <textarea
            id="change-validation"
            rows={3}
            value={validationPlan}
            onChange={(event) => setValidationPlan(event.target.value)}
            className="w-full rounded-control border border-border bg-card px-3 py-2 text-sm"
          />
        </Field>
        <Field label="Rollback plan" htmlFor="change-rollback" required>
          <textarea
            id="change-rollback"
            rows={3}
            value={rollbackPlan}
            onChange={(event) => setRollbackPlan(event.target.value)}
            className="w-full rounded-control border border-border bg-card px-3 py-2 text-sm"
          />
        </Field>

        <Button type="submit" disabled={createChange.isPending}>
          {createChange.isPending ? 'Creating…' : 'Create draft'}
        </Button>
      </form>
    </div>
  );
}
