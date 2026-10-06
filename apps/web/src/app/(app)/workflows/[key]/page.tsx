'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import type { TaskStatus } from '@opsdesk/contracts';
import { ApiClientError } from '@/lib/api-client';
import { kindFromKey } from '@/features/workflows/api';
import { useTransitionTask, useWorkflow } from '@/features/workflows/hooks';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/field';
import { formatDateTime } from '@/lib/format';

const TASK_TONES: Record<TaskStatus, string> = {
  PENDING: 'bg-status-neutral-bg text-status-neutral-fg',
  IN_PROGRESS: 'bg-status-progress-bg text-status-progress-fg',
  BLOCKED: 'bg-status-danger-bg text-status-danger-fg',
  COMPLETED: 'bg-status-success-bg text-status-success-fg',
  SKIPPED: 'bg-status-muted-bg text-status-muted-fg',
};

export default function WorkflowDetailPage() {
  const params = useParams<{ key: string }>();
  const key = params.key;
  const kind = kindFromKey(key);
  const workflowQuery = useWorkflow(kind, key);
  const transition = useTransitionTask(kind, key);

  const [banner, setBanner] = useState<string | null>(null);
  const [skipTaskId, setSkipTaskId] = useState<string | null>(null);
  const [skipReason, setSkipReason] = useState('');

  if (workflowQuery.isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (workflowQuery.isError || !workflowQuery.data) {
    return (
      <div className="rounded-card border border-border bg-card p-6 text-sm">
        <p role="alert">Workflow not found or you do not have access.</p>
        <Link href="/workflows" className="mt-3 inline-block text-primary hover:underline">
          Back to workflows
        </Link>
      </div>
    );
  }

  const workflow = workflowQuery.data.data;
  const terminal = workflow.status !== 'OPEN';

  const act = (taskId: string, version: number, to: TaskStatus, reason?: string) => {
    setBanner(null);
    transition.mutate(
      { taskId, version, to, ...(reason ? { reason } : {}) },
      {
        onSuccess: () => {
          setSkipTaskId(null);
          setSkipReason('');
        },
        onError: (error) =>
          setBanner(error instanceof ApiClientError ? error.message : 'Something went wrong.'),
      },
    );
  };

  return (
    <div className="space-y-4">
      <nav aria-label="Breadcrumb" className="text-sm text-muted-foreground">
        <Link href={`/workflows?kind=${kind}`} className="hover:underline">
          {kind === 'ONBOARDING' ? 'Onboarding' : 'Offboarding'}
        </Link>{' '}
        / <span className="font-mono text-xs">{workflow.key}</span>
      </nav>

      {banner ? (
        <p role="alert" className="rounded-control bg-status-danger-bg px-4 py-3 text-sm text-status-danger-fg">
          {banner}
        </p>
      ) : null}

      <div className="rounded-card border border-border bg-card p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-display font-semibold tracking-tight">
              {kind === 'ONBOARDING' ? 'Onboarding' : 'Offboarding'} ·{' '}
              {workflow.subject ? `${workflow.subject.firstName} ${workflow.subject.lastName}` : '—'}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Effective {workflow.effectiveDate} · Template {workflow.template?.name ?? '—'} ·{' '}
              {workflow.progress.requiredDone}/{workflow.progress.requiredTotal} required tasks done
            </p>
          </div>
          <span className="inline-flex rounded-full bg-status-info-bg px-3 py-1 text-xs font-medium text-status-info-fg">
            {workflow.status.toLowerCase()}
          </span>
        </div>
        {workflow.completedAt ? (
          <p className="mt-3 text-sm text-status-success-fg">
            Completed {formatDateTime(workflow.completedAt)}
            {kind === 'OFFBOARDING' && workflow.disableAccountOnComplete
              ? ' · account disabled'
              : ''}
          </p>
        ) : null}
        {workflow.notes ? (
          <p className="mt-3 whitespace-pre-wrap text-sm text-muted-foreground">{workflow.notes}</p>
        ) : null}
      </div>

      <div className="rounded-card border border-border bg-card p-6">
        <h2 className="text-title font-semibold">Checklist</h2>
        <ul className="mt-4 space-y-3">
          {workflow.tasks.map((task) => (
            <li key={task.id} className="rounded-card border border-border p-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">
                    {task.title}
                    {task.required ? (
                      <span className="ml-2 text-xs text-status-danger-fg">required</span>
                    ) : (
                      <span className="ml-2 text-xs text-muted-foreground">optional</span>
                    )}
                  </p>
                  {task.description ? (
                    <p className="mt-0.5 text-xs text-muted-foreground">{task.description}</p>
                  ) : null}
                  <p className="mt-1 text-xs text-muted-foreground">
                    {task.dueDate ? `Due ${task.dueDate}` : 'No due date'}
                    {task.skipReason ? ` · skipped: ${task.skipReason}` : ''}
                    {task.completedAt ? ` · done ${formatDateTime(task.completedAt)}` : ''}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${TASK_TONES[task.status]}`}
                  >
                    {task.status.toLowerCase().replaceAll('_', ' ')}
                  </span>
                  {!terminal && task.canAct ? (
                    <>
                      {task.status === 'PENDING' ? (
                        <Button size="sm" variant="outline" onClick={() => act(task.id, task.version, 'IN_PROGRESS')}>
                          Start
                        </Button>
                      ) : null}
                      {task.status === 'IN_PROGRESS' || task.status === 'PENDING' ? (
                        <Button size="sm" onClick={() => act(task.id, task.version, 'COMPLETED')}>
                          Complete
                        </Button>
                      ) : null}
                      {task.status === 'IN_PROGRESS' || task.status === 'PENDING' ? (
                        <Button size="sm" variant="outline" onClick={() => act(task.id, task.version, 'BLOCKED')}>
                          Block
                        </Button>
                      ) : null}
                      {task.status === 'BLOCKED' ? (
                        <Button size="sm" variant="outline" onClick={() => act(task.id, task.version, 'IN_PROGRESS')}>
                          Resume
                        </Button>
                      ) : null}
                      {task.status !== 'COMPLETED' && task.status !== 'SKIPPED' && !task.required ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setSkipTaskId(task.id);
                            setSkipReason('');
                          }}
                        >
                          Skip
                        </Button>
                      ) : null}
                      {task.status !== 'COMPLETED' &&
                      task.status !== 'SKIPPED' &&
                      task.required &&
                      workflow.can.manage ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setSkipTaskId(task.id);
                            setSkipReason('');
                          }}
                        >
                          Skip
                        </Button>
                      ) : null}
                    </>
                  ) : null}
                </div>
              </div>

              {skipTaskId === task.id ? (
                <form
                  className="mt-3 flex gap-2 border-t border-border pt-3"
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (!skipReason.trim()) return;
                    act(task.id, task.version, 'SKIPPED', skipReason.trim());
                  }}
                >
                  <label htmlFor={`skip-${task.id}`} className="sr-only">
                    Skip reason
                  </label>
                  <Input
                    id={`skip-${task.id}`}
                    value={skipReason}
                    onChange={(event) => setSkipReason(event.target.value)}
                    placeholder="Reason for skipping…"
                  />
                  <Button type="submit" size="sm" variant="outline" disabled={transition.isPending}>
                    Confirm skip
                  </Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => setSkipTaskId(null)}>
                    Cancel
                  </Button>
                </form>
              ) : null}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
