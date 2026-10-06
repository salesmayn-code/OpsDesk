'use client';

import type { InviteUserInput } from '@opsdesk/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  changeUserStatus,
  createAssetType,
  createCategory,
  fetchBusinessCalendars,
  fetchDepartments,
  fetchRoles,
  fetchSlaPolicies,
  fetchTeams,
  fetchUsers,
  inviteUser,
  previewSla,
  updateCategory,
  updateUserRoles,
} from './api';

export function useAdminUsers(query: string) {
  return useQuery({ queryKey: ['admin', 'users', query], queryFn: () => fetchUsers(query) });
}

export function useRoles() {
  return useQuery({ queryKey: ['admin', 'roles'], queryFn: fetchRoles, staleTime: 5 * 60_000 });
}

export function useDepartments() {
  return useQuery({
    queryKey: ['admin', 'departments'],
    queryFn: fetchDepartments,
    staleTime: 5 * 60_000,
  });
}

export function useTeams() {
  return useQuery({ queryKey: ['admin', 'teams'], queryFn: fetchTeams, staleTime: 5 * 60_000 });
}

function useUserMutation<TInput>(mutationFn: (input: TInput) => Promise<unknown>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'users'] }),
  });
}

export function useInviteUser() {
  return useUserMutation<InviteUserInput>((input) => inviteUser(input));
}

export function useChangeUserStatus() {
  return useUserMutation<{
    id: string;
    status: 'ACTIVE' | 'SUSPENDED' | 'DISABLED';
    reason?: string;
  }>(({ id, ...body }) => changeUserStatus(id, body));
}

export function useUpdateUserRoles() {
  return useUserMutation<{ id: string; roleIds: string[] }>(({ id, roleIds }) =>
    updateUserRoles(id, roleIds),
  );
}

export function useSlaPolicies() {
  return useQuery({ queryKey: ['admin', 'sla-policies'], queryFn: fetchSlaPolicies });
}

export function useBusinessCalendars() {
  return useQuery({ queryKey: ['admin', 'calendars'], queryFn: fetchBusinessCalendars });
}

export function useSlaPreview() {
  return useMutation({
    mutationFn: (input: { priority: string; type: string; categoryId?: string }) =>
      previewSla(input),
  });
}

function useCatalogMutation<TInput>(mutationFn: (input: TInput) => Promise<unknown>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['categories'] });
      void queryClient.invalidateQueries({ queryKey: ['asset-types'] });
    },
  });
}

export function useCreateCategory() {
  return useCatalogMutation<{
    name: string;
    parentId?: string | null;
    defaultTeamId?: string | null;
    isActive?: boolean;
  }>((input) => createCategory(input));
}

export function useUpdateCategory() {
  return useCatalogMutation<{
    id: string;
    name?: string;
    defaultTeamId?: string | null;
    isActive?: boolean;
  }>(({ id, ...body }) => updateCategory(id, body));
}

export function useCreateAssetType() {
  return useCatalogMutation<{ name: string; tagPrefix: string }>((input) => createAssetType(input));
}
