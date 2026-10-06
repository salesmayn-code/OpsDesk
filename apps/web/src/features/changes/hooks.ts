'use client';

import type {
  ChangeTransitionInput,
  CreateChangeInput,
  RecordApprovalInput,
  UpdateChangeInput,
} from '@opsdesk/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createChange,
  fetchChange,
  fetchChangeHistory,
  fetchChanges,
  recordChangeApproval,
  submitChange,
  transitionChange,
  updateChange,
} from './api';

export function useChanges(query: string) {
  return useQuery({ queryKey: ['changes', 'list', query], queryFn: () => fetchChanges(query) });
}

export function useChange(key: string) {
  return useQuery({
    queryKey: ['changes', 'detail', key],
    queryFn: () => fetchChange(key),
    enabled: key.length > 0,
  });
}

export function useChangeHistory(key: string) {
  return useQuery({
    queryKey: ['changes', 'history', key],
    queryFn: () => fetchChangeHistory(key),
    enabled: key.length > 0,
  });
}

export function useCreateChange() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateChangeInput) => createChange(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['changes', 'list'] }),
  });
}

function useChangeMutation<TInput>(mutationFn: (input: TInput) => Promise<unknown>, key: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['changes', 'detail', key] });
      void queryClient.invalidateQueries({ queryKey: ['changes', 'history', key] });
      void queryClient.invalidateQueries({ queryKey: ['changes', 'list'] });
    },
  });
}

export function useUpdateChange(id: string, key: string) {
  return useChangeMutation<UpdateChangeInput & { changeId: string }>(
    ({ changeId, ...body }) => updateChange(changeId, body),
    key,
  );
}

export function useSubmitChange(id: string, key: string) {
  return useChangeMutation<{ changeId: string }>(
    ({ changeId }) => submitChange(changeId),
    key,
  );
}

export function useTransitionChange(id: string, key: string) {
  return useChangeMutation<ChangeTransitionInput & { changeId: string }>(
    ({ changeId, ...body }) => transitionChange(changeId, body),
    key,
  );
}

export function useRecordChangeApproval(id: string, key: string) {
  return useChangeMutation<RecordApprovalInput & { changeId: string }>(
    ({ changeId, ...body }) => recordChangeApproval(changeId, body),
    key,
  );
}
