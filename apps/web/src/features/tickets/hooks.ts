'use client';

import type { AssignTicketInput, CreateTicketInput, TransitionTicketInput } from '@opsdesk/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  assignTicket,
  createComment,
  createTicket,
  fetchAttachments,
  fetchCategories,
  fetchComments,
  fetchHistory,
  fetchResolutionCodes,
  fetchTicket,
  fetchTicketSla,
  fetchTickets,
  transitionTicket,
  uploadAttachment,
  type Paginated,
} from './api';
import type { TicketDetail, TicketSummary } from '@opsdesk/contracts';

export function useTickets(queryString: string) {
  return useQuery<Paginated<TicketSummary>>({
    queryKey: ['tickets', 'list', queryString],
    queryFn: () => fetchTickets(queryString),
  });
}

export function useTicket(key: string) {
  return useQuery<{ data: TicketDetail }>({
    queryKey: ['tickets', 'detail', key],
    queryFn: () => fetchTicket(key),
  });
}

export function useCategories() {
  return useQuery({
    queryKey: ['categories'],
    queryFn: fetchCategories,
    staleTime: 5 * 60_000,
  });
}

export function useTicketSla(idOrKey: string) {
  return useQuery({
    queryKey: ['tickets', 'sla', idOrKey],
    queryFn: () => fetchTicketSla(idOrKey),
    enabled: idOrKey.length > 0,
  });
}

export function useTicketActivity(ticketId: string) {
  const queryClient = useQueryClient();
  const comments = useQuery({
    queryKey: ['tickets', 'comments', ticketId],
    queryFn: () => fetchComments(ticketId),
    enabled: ticketId.length > 0,
  });
  const history = useQuery({
    queryKey: ['tickets', 'history', ticketId],
    queryFn: () => fetchHistory(ticketId),
    enabled: ticketId.length > 0,
  });
  const attachments = useQuery({
    queryKey: ['tickets', 'attachments', ticketId],
    queryFn: () => fetchAttachments(ticketId),
    enabled: ticketId.length > 0,
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['tickets', 'comments', ticketId] });
    void queryClient.invalidateQueries({ queryKey: ['tickets', 'history', ticketId] });
    void queryClient.invalidateQueries({ queryKey: ['tickets', 'attachments', ticketId] });
    void queryClient.invalidateQueries({ queryKey: ['tickets', 'detail', ticketId] });
  };

  return { comments, history, attachments, invalidate };
}

export function useCreateComment(ticketId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { body: string; visibility: 'PUBLIC' | 'INTERNAL' }) =>
      createComment(ticketId, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['tickets', 'comments', ticketId] });
      void queryClient.invalidateQueries({ queryKey: ['tickets', 'history', ticketId] });
      void queryClient.invalidateQueries({ queryKey: ['tickets', 'detail'] });
      void queryClient.invalidateQueries({ queryKey: ['tickets', 'sla', ticketId] });
    },
  });
}

export function useUploadAttachment(ticketId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { file: File; isInternal: boolean }) =>
      uploadAttachment(ticketId, input.file, input.isInternal),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['tickets', 'attachments', ticketId] });
      void queryClient.invalidateQueries({ queryKey: ['tickets', 'history', ticketId] });
    },
  });
}

export function useResolutionCodes() {
  return useQuery({
    queryKey: ['resolution-codes'],
    queryFn: fetchResolutionCodes,
    staleTime: 5 * 60_000,
  });
}

function useTicketMutation<TInput>(
  mutationFn: (input: TInput) => Promise<{ data: TicketDetail }>,
  onSuccess?: (ticket: TicketDetail) => void,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ['tickets'] });
      onSuccess?.(result.data);
    },
  });
}

export function useTransitionTicket() {
  return useTicketMutation<TransitionTicketInput & { ticketId: string }>(
    ({ ticketId, ...body }) => transitionTicket(ticketId, body),
  );
}

export function useAssignTicket() {
  return useTicketMutation<AssignTicketInput & { ticketId: string }>(
    ({ ticketId, ...body }) => assignTicket(ticketId, body),
  );
}

export function useCreateTicket() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateTicketInput) => createTicket(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['tickets'] });
    },
  });
}
