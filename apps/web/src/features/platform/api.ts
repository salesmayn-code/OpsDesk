import type { Notification } from '@opsdesk/contracts';
import { apiFetch } from '@/lib/api-client';

export interface NotificationList {
  data: Notification[];
  meta: { nextCursor: string | null };
}

export interface SearchResults {
  tickets: { id: string; key: string; title: string; status: string; priority: string }[];
  assets: { id: string; tag: string; name: string; status: string; type: { name: string } }[];
  users: { id: string; firstName: string; lastName: string; email: string; jobTitle: string | null }[];
}

export interface DashboardData {
  stats: Record<string, number | null>;
  [key: string]: unknown;
}

export interface AuditLogRow {
  id: string;
  actorId: string | null;
  actorEmail: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  entityKey: string | null;
  before: unknown;
  after: unknown;
  metadata: unknown;
  requestId: string | null;
  createdAt: string;
}

export function fetchNotifications(query: string): Promise<NotificationList> {
  return apiFetch(`/notifications${query ? `?${query}` : ''}`);
}

export function fetchUnreadCount(): Promise<{ data: { count: number } }> {
  return apiFetch('/notifications/unread-count');
}

export function markNotificationRead(id: string): Promise<{ data: { success: boolean } }> {
  return apiFetch(`/notifications/${encodeURIComponent(id)}/read`, { method: 'POST' });
}

export function markAllNotificationsRead(): Promise<{ data: { success: boolean } }> {
  return apiFetch('/notifications/read-all', { method: 'POST' });
}

export function searchAll(q: string): Promise<{ data: SearchResults }> {
  return apiFetch(`/search?q=${encodeURIComponent(q)}`);
}

export function fetchDashboard(
  role: 'employee' | 'agent' | 'manager' | 'admin',
): Promise<{ data: DashboardData }> {
  return apiFetch(`/dashboard/${role}`);
}

export function fetchAuditLogs(
  query: string,
): Promise<{ data: AuditLogRow[]; meta: { nextCursor: string | null } }> {
  return apiFetch(`/audit-logs${query ? `?${query}` : ''}`);
}
