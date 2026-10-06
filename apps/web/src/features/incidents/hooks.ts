'use client';

import type {
  CreateIncidentInput,
  IncidentNoteInput,
  IncidentTransitionInput,
  UpdateIncidentInput,
  UpdatePostmortemActionInput,
  UpsertPostmortemInput,
} from '@opsdesk/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  addIncidentNote,
  createIncident,
  createPostmortemAction,
  fetchIncident,
  fetchIncidentOptions,
  fetchIncidentTimeline,
  fetchIncidents,
  fetchPostmortem,
  fetchServices,
  linkIncidentTickets,
  linkTicketIncident,
  notifyIncidentRequesters,
  publishPostmortem,
  transitionIncident,
  unlinkIncidentTicket,
  updateIncident,
  updatePostmortemAction,
  upsertPostmortem,
} from './api';

export function useIncidents(query: string) {
  return useQuery({
    queryKey: ['incidents', 'list', query],
    queryFn: () => fetchIncidents(query),
  });
}

export function useIncident(key: string) {
  return useQuery({
    queryKey: ['incidents', 'detail', key],
    queryFn: () => fetchIncident(key),
    enabled: key.length > 0,
  });
}

export function useIncidentTimeline(key: string) {
  return useQuery({
    queryKey: ['incidents', 'timeline', key],
    queryFn: () => fetchIncidentTimeline(key),
    enabled: key.length > 0,
  });
}

export function useServices() {
  return useQuery({ queryKey: ['services'], queryFn: fetchServices, staleTime: 5 * 60_000 });
}

export function usePostmortem(key: string) {
  return useQuery({
    queryKey: ['incidents', 'postmortem', key],
    queryFn: () => fetchPostmortem(key),
    enabled: key.length > 0,
  });
}

function useIncidentMutation<TInput>(
  mutationFn: (input: TInput) => Promise<unknown>,
  key: string,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['incidents', 'detail', key] });
      void queryClient.invalidateQueries({ queryKey: ['incidents', 'timeline', key] });
      void queryClient.invalidateQueries({ queryKey: ['incidents', 'list'] });
    },
  });
}

export function useCreateIncident() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateIncidentInput) => createIncident(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['incidents', 'list'] }),
  });
}

export function useTransitionIncident(id: string, key: string) {
  return useIncidentMutation<IncidentTransitionInput & { incidentId: string }>(
    ({ incidentId, ...body }) => transitionIncident(incidentId, body),
    key,
  );
}

export function useUpdateIncident(id: string, key: string) {
  return useIncidentMutation<UpdateIncidentInput & { incidentId: string }>(
    ({ incidentId, ...body }) => updateIncident(incidentId, body),
    key,
  );
}

export function useAddIncidentNote(id: string, key: string) {
  return useIncidentMutation<IncidentNoteInput & { incidentId: string }>(
    ({ incidentId, ...body }) => addIncidentNote(incidentId, body),
    key,
  );
}

export function useLinkIncidentTickets(id: string, key: string) {
  return useIncidentMutation<{ incidentId: string; ticketIds: string[] }>(
    ({ incidentId, ticketIds }) => linkIncidentTickets(incidentId, ticketIds),
    key,
  );
}

export function useUnlinkIncidentTicket(id: string, key: string) {
  return useIncidentMutation<{ incidentId: string; ticketId: string }>(
    ({ incidentId, ticketId }) => unlinkIncidentTicket(incidentId, ticketId),
    key,
  );
}

export function useNotifyIncidentRequesters(id: string, key: string) {
  return useIncidentMutation<{ incidentId: string; message: string }>(
    ({ incidentId, message }) => notifyIncidentRequesters(incidentId, message),
    key,
  );
}

export function useUpsertPostmortem(id: string, key: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpsertPostmortemInput) => upsertPostmortem(id, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['incidents', 'postmortem', key] });
      void queryClient.invalidateQueries({ queryKey: ['incidents', 'detail', key] });
    },
  });
}

export function usePublishPostmortem(id: string, key: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => publishPostmortem(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['incidents', 'postmortem', key] });
      void queryClient.invalidateQueries({ queryKey: ['incidents', 'detail', key] });
      void queryClient.invalidateQueries({ queryKey: ['incidents', 'timeline', key] });
    },
  });
}

export function useCreatePostmortemAction(id: string, key: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { kind: 'CORRECTIVE' | 'PREVENTIVE'; description: string }) =>
      createPostmortemAction(id, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['incidents', 'postmortem', key] }),
  });
}

export function useUpdatePostmortemAction(id: string, key: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { actionId: string; body: UpdatePostmortemActionInput }) =>
      updatePostmortemAction(id, input.actionId, input.body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['incidents', 'postmortem', key] }),
  });
}

export function useLinkTicketIncident() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { ticketId: string; incidentId: string }) =>
      linkTicketIncident(input.ticketId, input.incidentId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tickets'] }),
  });
}

export function useIncidentOptions(q: string) {
  return useQuery({
    queryKey: ['incidents', 'options', q],
    queryFn: () => fetchIncidentOptions(q),
    enabled: q.trim().length >= 3,
    staleTime: 30_000,
  });
}
