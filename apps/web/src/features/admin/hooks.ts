'use client';

import type {
  CreateSlaPolicyInput,
  InviteUserInput,
  SetTeamMembersInput,
  UpdateDepartmentInput,
  UpdateTeamInput,
  UpdateUserInput,
} from '@opsdesk/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  changeUserStatus,
  createAssetType,
  createBusinessCalendar,
  createCategory,
  createDepartment,
  createSlaPolicy,
  createTeam,
  fetchBusinessCalendars,
  fetchDepartments,
  fetchRoles,
  fetchSlaPolicies,
  fetchTeam,
  fetchTeams,
  fetchUsers,
  inviteUser,
  previewSla,
  setTeamMembers,
  updateCategory,
  updateDepartment,
  updateSlaPolicy,
  updateTeam,
  updateUser,
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

export function useSaveSlaPolicy() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: CreateSlaPolicyInput & { id?: string }) =>
      id ? updateSlaPolicy(id, input) : createSlaPolicy(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'sla-policies'] }),
  });
}

export function useCreateBusinessCalendar() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createBusinessCalendar,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'calendars'] }),
  });
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

/** Org changes ripple into team pickers, user lists and dashboards, so refresh all admin data. */
function useOrgMutation<TInput>(mutationFn: (input: TInput) => Promise<unknown>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin'] }),
  });
}

export function useTeam(id: string | null) {
  return useQuery({
    queryKey: ['admin', 'teams', id],
    queryFn: () => fetchTeam(id!),
    enabled: Boolean(id),
  });
}

export function useCreateTeam() {
  return useOrgMutation(createTeam);
}

export function useUpdateTeam() {
  return useOrgMutation(({ id, ...input }: UpdateTeamInput & { id: string }) => updateTeam(id, input));
}

export function useSetTeamMembers() {
  return useOrgMutation(({ id, ...input }: SetTeamMembersInput & { id: string }) =>
    setTeamMembers(id, input),
  );
}

export function useCreateDepartment() {
  return useOrgMutation(createDepartment);
}

export function useUpdateDepartment() {
  return useOrgMutation(({ id, ...input }: UpdateDepartmentInput & { id: string }) =>
    updateDepartment(id, input),
  );
}

export function useUpdateUser() {
  return useOrgMutation(({ id, ...input }: UpdateUserInput & { id: string }) => updateUser(id, input));
}
