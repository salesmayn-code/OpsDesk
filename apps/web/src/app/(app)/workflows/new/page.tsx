'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import type { WorkflowKind } from '@opsdesk/contracts';
import { ApiClientError } from '@/lib/api-client';
import {
  useCreateWorkflow,
  useUserOptions,
  useWorkflowTemplates,
} from '@/features/workflows/hooks';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/field';

export default function NewWorkflowPage() {
  const router = useRouter();
  const [kind, setKind] = useState<WorkflowKind>('ONBOARDING');
  const [subjectQuery, setSubjectQuery] = useState('');
  const [subject, setSubject] = useState<{ id: string; name: string } | null>(null);
  const [effectiveDate, setEffectiveDate] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [notes, setNotes] = useState('');
  const [disableAccount, setDisableAccount] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const templates = useWorkflowTemplates(kind);
  const userOptions = useUserOptions(subject ? '' : subjectQuery);
  const createWorkflow = useCreateWorkflow();

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    if (!subject) {
      setError('Select the person this workflow is for.');
      return;
    }
    createWorkflow.mutate(
      {
        kind,
        input: {
          subjectUserId: subject.id,
          effectiveDate,
          ...(templateId ? { templateId } : {}),
          ...(notes.trim() ? { notes: notes.trim() } : {}),
          ...(kind === 'OFFBOARDING' ? { disableAccountOnComplete: disableAccount } : {}),
        },
      },
      {
        onSuccess: (result) => router.push(`/workflows/${result.data.key}`),
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
      <h1 className="text-display font-semibold tracking-tight">New workflow</h1>
      <form onSubmit={onSubmit} className="space-y-4 rounded-card border border-border bg-card p-6">
        {error ? (
          <p role="alert" className="rounded-control bg-status-danger-bg px-3 py-2 text-sm text-status-danger-fg">
            {error}
          </p>
        ) : null}

        <div role="tablist" aria-label="Workflow kind" className="flex gap-1">
          {(['ONBOARDING', 'OFFBOARDING'] as WorkflowKind[]).map((option) => (
            <button
              key={option}
              type="button"
              role="tab"
              aria-selected={kind === option}
              onClick={() => {
                setKind(option);
                setTemplateId('');
              }}
              className={
                kind === option
                  ? 'rounded-control bg-card-muted px-3 py-1.5 text-sm font-medium'
                  : 'rounded-control px-3 py-1.5 text-sm text-muted-foreground hover:bg-card-muted'
              }
            >
              {option === 'ONBOARDING' ? 'Onboarding' : 'Offboarding'}
            </button>
          ))}
        </div>

        <Field label="Person" htmlFor="workflow-subject" required hint="Search by name or email.">
          {subject ? (
            <div className="flex items-center justify-between rounded-control border border-border bg-card px-3 py-2 text-sm">
              <span>{subject.name}</span>
              <button
                type="button"
                className="text-xs text-primary hover:underline"
                onClick={() => {
                  setSubject(null);
                  setSubjectQuery('');
                }}
              >
                Change
              </button>
            </div>
          ) : (
            <>
              <Input
                id="workflow-subject"
                value={subjectQuery}
                onChange={(event) => setSubjectQuery(event.target.value)}
                placeholder="Type at least 2 characters…"
              />
              {(userOptions.data?.data ?? []).length > 0 && subjectQuery.trim().length >= 2 ? (
                <ul className="mt-1 divide-y divide-border rounded-control border border-border bg-card">
                  {userOptions.data!.data.map((user) => (
                    <li key={user.id}>
                      <button
                        type="button"
                        className="block w-full px-3 py-2 text-left text-sm hover:bg-card-muted"
                        onClick={() =>
                          setSubject({
                            id: user.id,
                            name: `${user.firstName} ${user.lastName} (${user.email})`,
                          })
                        }
                      >
                        {user.firstName} {user.lastName}{' '}
                        <span className="text-xs text-muted-foreground">{user.email}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </>
          )}
        </Field>

        <Field label="Effective date" htmlFor="workflow-date" required>
          <Input
            id="workflow-date"
            type="date"
            required
            value={effectiveDate}
            onChange={(event) => setEffectiveDate(event.target.value)}
          />
        </Field>

        <Field label="Template" htmlFor="workflow-template" hint="Defaults to the department template.">
          <select
            id="workflow-template"
            value={templateId}
            onChange={(event) => setTemplateId(event.target.value)}
            className="h-9 w-full rounded-control border border-border bg-card px-2 text-sm"
          >
            <option value="">Default template</option>
            {(templates.data?.data ?? [])
              .filter((template) => template.isActive)
              .map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name}
                </option>
              ))}
          </select>
        </Field>

        <Field label="Notes" htmlFor="workflow-notes">
          <textarea
            id="workflow-notes"
            rows={3}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            className="w-full rounded-control border border-border bg-card px-3 py-2 text-sm"
          />
        </Field>

        {kind === 'OFFBOARDING' ? (
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={disableAccount}
              onChange={(event) => setDisableAccount(event.target.checked)}
            />
            Disable the account when all tasks complete
          </label>
        ) : null}

        <Button type="submit" disabled={createWorkflow.isPending}>
          {createWorkflow.isPending ? 'Creating…' : 'Create workflow'}
        </Button>
      </form>
    </div>
  );
}
