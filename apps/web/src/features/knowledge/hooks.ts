'use client';

import type { ArticleStatus } from '@opsdesk/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createArticle,
  fetchArticle,
  fetchArticles,
  fetchSuggestions,
  fetchTicketArticles,
  linkArticleToTicket,
  transitionArticle,
  updateArticle,
} from './api';

export function useArticles(query: string) {
  return useQuery({ queryKey: ['kb', 'list', query], queryFn: () => fetchArticles(query) });
}

export function useArticle(slug: string) {
  return useQuery({
    queryKey: ['kb', 'article', slug],
    queryFn: () => fetchArticle(slug),
    enabled: slug.length > 0,
  });
}

export function useKbSuggestions(q: string, categoryId?: string) {
  const params = q.trim().length >= 3 || categoryId ? { q, categoryId } : null;
  return useQuery({
    queryKey: ['kb', 'suggest', q, categoryId ?? ''],
    queryFn: () => fetchSuggestions(q, categoryId),
    enabled: params !== null,
    staleTime: 30_000,
  });
}

export function useCreateArticle() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createArticle,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['kb', 'list'] }),
  });
}

export function useUpdateArticle(slug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      id: string;
      version: number;
      title?: string;
      summary?: string | null;
      content?: string;
      categoryId?: string | null;
    }) => {
      const { id, ...body } = input;
      return updateArticle(id, body);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['kb', 'article', slug] });
      void queryClient.invalidateQueries({ queryKey: ['kb', 'list'] });
    },
  });
}

export function useTransitionArticle(slug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; version: number; to: ArticleStatus; note?: string }) => {
      const { id, ...body } = input;
      return transitionArticle(id, body);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['kb', 'article', slug] });
      void queryClient.invalidateQueries({ queryKey: ['kb', 'list'] });
    },
  });
}

export function useLinkArticle() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { ticketId: string; articleId: string }) =>
      linkArticleToTicket(input.ticketId, input.articleId),
    onSuccess: (_result, input) => {
      void queryClient.invalidateQueries({ queryKey: ['kb', 'ticket-articles', input.ticketId] });
      void queryClient.invalidateQueries({ queryKey: ['tickets', 'history', input.ticketId] });
      void queryClient.invalidateQueries({ queryKey: ['tickets', 'detail'] });
    },
  });
}

export function useTicketArticles(ticketId: string) {
  return useQuery({
    queryKey: ['kb', 'ticket-articles', ticketId],
    queryFn: () => fetchTicketArticles(ticketId),
    enabled: ticketId.length > 0,
  });
}
