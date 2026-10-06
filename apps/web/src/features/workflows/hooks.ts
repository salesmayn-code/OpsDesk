'use client';

import type { TaskStatus, WorkflowKind } from '@opsdesk/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createWorkflow,
  fetchUserOptions,
  fetchWorkflow,
  fetchWorkflowTemplates,
  fetchWorkflows,
  transitionTask,
} from './api';

export function useWorkflows(kind: WorkflowKind, query: string) {
  return useQuery({
    queryKey: ['workflows', kind, 'list', query],
    queryFn: () => fetchWorkflows(kind, query),
  });
}

export function useWorkflow(kind: WorkflowKind, key: string) {
  return useQuery({
    queryKey: ['workflows', kind, 'detail', key],
    queryFn: () => fetchWorkflow(kind, key),
    enabled: key.length > 0,
  });
}

export function useTransitionTask(kind: WorkflowKind, key: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { taskId: string; version: number; to: TaskStatus; reason?: string }) =>
      transitionTask(input.taskId, {
        version: input.version,
        to: input.to,
        ...(input.reason ? { reason: input.reason } : {}),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['workflows', kind, 'detail', key] });
      void queryClient.invalidateQueries({ queryKey: ['workflows', kind, 'list'] });
    },
  });
}

export function useCreateWorkflow() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      kind: WorkflowKind;
      input: {
        subjectUserId: string;
        effectiveDate: string;
        templateId?: string;
        notes?: string;
        disableAccountOnComplete?: boolean;
      };
    }) => createWorkflow(input.kind, input.input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['workflows'] }),
  });
}

export function useWorkflowTemplates(kind: WorkflowKind) {
  return useQuery({
    queryKey: ['workflow-templates', kind],
    queryFn: () => fetchWorkflowTemplates(kind),
    staleTime: 5 * 60_000,
  });
}

export function useUserOptions(q: string) {
  return useQuery({
    queryKey: ['user-options', q],
    queryFn: () => fetchUserOptions(q),
    enabled: q.trim().length >= 2,
    staleTime: 30_000,
  });
}
