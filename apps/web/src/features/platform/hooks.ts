'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fetchAuditLogs,
  fetchDashboard,
  fetchNotifications,
  fetchUnreadCount,
  markAllNotificationsRead,
  markNotificationRead,
  searchAll,
  type NotificationList,
} from './api';

export function useNotifications(query: string) {
  return useQuery<NotificationList>({
    queryKey: ['notifications', 'list', query],
    queryFn: () => fetchNotifications(query),
  });
}

export function useUnreadCount() {
  return useQuery({
    queryKey: ['notifications', 'unread-count'],
    queryFn: fetchUnreadCount,
    refetchInterval: 30_000,
  });
}

export function useMarkNotificationRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: markNotificationRead,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
}

export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: markAllNotificationsRead,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
}

export function useSearch(q: string) {
  return useQuery({
    queryKey: ['search', q],
    queryFn: () => searchAll(q),
    enabled: q.trim().length >= 2,
    staleTime: 10_000,
  });
}

export function useDashboard(
  role: 'employee' | 'agent' | 'manager' | 'admin',
  enabled = true,
) {
  return useQuery({
    queryKey: ['dashboard', role],
    queryFn: () => fetchDashboard(role),
    enabled,
  });
}

export function useAuditLogs(query: string) {
  return useQuery({
    queryKey: ['audit', query],
    queryFn: () => fetchAuditLogs(query),
  });
}
