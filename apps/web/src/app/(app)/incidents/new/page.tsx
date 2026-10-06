'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import type { IncidentSeverity } from '@opsdesk/contracts';
import { ApiClientError } from '@/lib/api-client';
import { useCreateIncident, useServices } from '@/features/incidents/hooks';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/field';

export default function NewIncidentPage() {
  const router = useRouter();
  const services = useServices();
  const createIncident = useCreateIncident();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [severity, setSeverity] = useState<IncidentSeverity>('SEV3');
  const [serviceId, setServiceId] = useState('');
  const [impact, setImpact] = useState('');
  const [error, setError] = useState<string | null>(null);

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    createIncident.mutate(
      {
        title,
        description,
        severity,
        ...(serviceId ? { serviceId } : {}),
        ...(impact.trim() ? { impact } : {}),
      },
      {
        onSuccess: (result) => router.push(`/incidents/${result.data.key}`),
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
      <h1 className="text-display font-semibold tracking-tight">Declare incident</h1>
      <form onSubmit={onSubmit} className="space-y-4 rounded-card border border-border bg-card p-6">
        {error ? (
          <p role="alert" className="rounded-control bg-status-danger-bg px-3 py-2 text-sm text-status-danger-fg">
            {error}
          </p>
        ) : null}

        <Field label="Title" htmlFor="incident-title" required>
          <Input
            id="incident-title"
            required
            minLength={5}
            maxLength={200}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
        </Field>

        <Field label="Severity" htmlFor="incident-severity-input" required>
          <select
            id="incident-severity-input"
            required
            value={severity}
            onChange={(event) => setSeverity(event.target.value as IncidentSeverity)}
            className="h-9 w-full rounded-control border border-border bg-card px-2 text-sm"
          >
            <option value="SEV1">SEV1 — Critical, company-wide</option>
            <option value="SEV2">SEV2 — Major, department-wide</option>
            <option value="SEV3">SEV3 — Moderate</option>
            <option value="SEV4">SEV4 — Minor</option>
          </select>
        </Field>

        <Field label="Service" htmlFor="incident-service">
          <select
            id="incident-service"
            value={serviceId}
            onChange={(event) => setServiceId(event.target.value)}
            className="h-9 w-full rounded-control border border-border bg-card px-2 text-sm"
          >
            <option value="">Not sure</option>
            {(services.data?.data ?? []).map((service) => (
              <option key={service.id} value={service.id}>
                {service.name}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Description" htmlFor="incident-description" required>
          <textarea
            id="incident-description"
            required
            rows={5}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            className="w-full rounded-control border border-border bg-card px-3 py-2 text-sm"
            placeholder="What is happening? When did it start? Who is affected?"
          />
        </Field>

        <Field label="Impact" htmlFor="incident-impact">
          <textarea
            id="incident-impact"
            rows={3}
            value={impact}
            onChange={(event) => setImpact(event.target.value)}
            className="w-full rounded-control border border-border bg-card px-3 py-2 text-sm"
            placeholder="Who and what is affected?"
          />
        </Field>

        <Button type="submit" disabled={createIncident.isPending}>
          {createIncident.isPending ? 'Declaring…' : 'Declare incident'}
        </Button>
      </form>
    </div>
  );
}
