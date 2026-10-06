import type { PageMeta, TaskStatus, WorkflowKind, WorkflowStatus } from '@opsdesk/contracts';
import { apiFetch } from '@/lib/api-client';

export interface WorkflowSummaryDto {
  id: string;
  key: string;
  kind: WorkflowKind;
  status: WorkflowStatus;
  subjectUserId: string;
  subject: { id: string; firstName: string; lastName: string; email: string } | null;
  effectiveDate: string;
  templateName: string | null;
  progress: { total: number; done: number; requiredTotal: number; requiredDone: number };
  createdAt: string;
}

export interface WorkflowTaskDto {
  id: string;
  title: string;
  description: string | null;
  ownerUserId: string | null;
  ownerTeamId: string | null;
  status: TaskStatus;
  required: boolean;
  assetId: string | null;
  dueDate: string | null;
  completedAt: string | null;
  skipReason: string | null;
  notes: string | null;
  version: number;
  canAct: boolean;
}

export interface WorkflowDetailDto {
  id: string;
  key: string;
  kind: WorkflowKind;
  status: WorkflowStatus;
  subject: { id: string; firstName: string; lastName: string; email: string; status: string } | null;
  managerId: string | null;
  departmentId: string | null;
  template: { id: string; name: string } | null;
  effectiveDate: string;
  notes: string | null;
  disableAccountOnComplete: boolean;
  completedAt: string | null;
  progress: { total: number; done: number; requiredTotal: number; requiredDone: number };
  can: { manage: boolean };
  tasks: WorkflowTaskDto[];
}

export function kindFromKey(key: string): WorkflowKind {
  return key.toUpperCase().startsWith('OFF-') ? 'OFFBOARDING' : 'ONBOARDING';
}

export function fetchWorkflows(
  kind: WorkflowKind,
  query: string,
): Promise<{ data: WorkflowSummaryDto[]; meta: PageMeta }> {
  const path = kind === 'ONBOARDING' ? 'onboarding' : 'offboarding';
  return apiFetch(`/${path}${query ? `?${query}` : ''}`);
}

export function fetchWorkflow(
  kind: WorkflowKind,
  key: string,
): Promise<{ data: WorkflowDetailDto }> {
  const path = kind === 'ONBOARDING' ? 'onboarding' : 'offboarding';
  return apiFetch(`/${path}/${encodeURIComponent(key)}`);
}

export function transitionTask(
  taskId: string,
  input: { version: number; to: TaskStatus; reason?: string },
): Promise<{ data: WorkflowDetailDto }> {
  return apiFetch(`/workflow-tasks/${taskId}/transitions`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function createWorkflow(
  kind: WorkflowKind,
  input: {
    subjectUserId: string;
    effectiveDate: string;
    templateId?: string;
    notes?: string;
    disableAccountOnComplete?: boolean;
  },
): Promise<{ data: WorkflowDetailDto }> {
  const path = kind === 'ONBOARDING' ? 'onboarding' : 'offboarding';
  return apiFetch(`/${path}`, { method: 'POST', body: JSON.stringify(input) });
}

export function fetchWorkflowTemplates(
  kind: WorkflowKind,
): Promise<{ data: { id: string; kind: WorkflowKind; name: string; isActive: boolean }[] }> {
  return apiFetch(`/workflow-templates?kind=${kind}`);
}

export function fetchUserOptions(
  q: string,
): Promise<{
  data: { id: string; firstName: string; lastName: string; email: string }[];
}> {
  return apiFetch(`/users?q=${encodeURIComponent(q)}&pageSize=8`);
}
