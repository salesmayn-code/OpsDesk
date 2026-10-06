import type {
  AssignTicketInput,
  Category,
  CreateTicketInput,
  Me,
  PageMeta,
  ResolutionCode,
  TicketDetail,
  TicketSummary,
  TransitionTicketInput,
} from '@opsdesk/contracts';
import { apiFetch } from '@/lib/api-client';

export interface Paginated<T> {
  data: T[];
  meta: PageMeta;
}

export function fetchTickets(queryString: string): Promise<Paginated<TicketSummary>> {
  return apiFetch(`/tickets${queryString ? `?${queryString}` : ''}`);
}

export function fetchTicket(key: string): Promise<{ data: TicketDetail }> {
  return apiFetch(`/tickets/${encodeURIComponent(key)}`);
}

export function createTicket(input: CreateTicketInput): Promise<{ data: TicketDetail }> {
  return apiFetch('/tickets', { method: 'POST', body: JSON.stringify(input) });
}

export function transitionTicket(
  id: string,
  input: TransitionTicketInput,
): Promise<{ data: TicketDetail }> {
  return apiFetch(`/tickets/${id}/transitions`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function assignTicket(id: string, input: AssignTicketInput): Promise<{ data: TicketDetail }> {
  return apiFetch(`/tickets/${id}/assignment`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function fetchCategories(): Promise<{ data: Category[] }> {
  return apiFetch('/categories');
}

export function fetchResolutionCodes(): Promise<{ data: ResolutionCode[] }> {
  return apiFetch('/resolution-codes');
}

export interface TicketSlaTimer {
  id: string;
  kind: 'RESPONSE' | 'RESOLUTION';
  state: string;
  targetMinutes: number;
  startedAt: string;
  dueAt: string;
  pausedAt: string | null;
  pausedMinutes: number;
  breachedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  percentConsumed: number | null;
}

export interface TicketSlaResponse {
  policy: { id: string; name: string; calendarName: string; timezone: string } | null;
  timers: TicketSlaTimer[];
  events: { id: string; type: string; createdAt: string }[];
}

export function fetchTicketSla(idOrKey: string): Promise<{ data: TicketSlaResponse }> {
  return apiFetch(`/tickets/${encodeURIComponent(idOrKey)}/sla`);
}

export interface CommentDto {
  id: string;
  ticketId: string;
  author: { id: string; firstName: string; lastName: string; email: string };
  visibility: 'PUBLIC' | 'INTERNAL';
  body: string;
  editedAt: string | null;
  createdAt: string;
}

export interface HistoryEventDto {
  id: string;
  ticketId: string;
  actor: { id: string; firstName: string; lastName: string; email: string } | null;
  type: string;
  fromValue: string | null;
  toValue: string | null;
  metadata: Record<string, unknown> | null;
  isInternal: boolean;
  createdAt: string;
}

export interface AttachmentDto {
  id: string;
  ticketId: string;
  uploadedById: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  isInternal: boolean;
  createdAt: string;
}

export function fetchComments(ticketId: string): Promise<{ data: CommentDto[] }> {
  return apiFetch(`/tickets/${encodeURIComponent(ticketId)}/comments`);
}

export function createComment(
  ticketId: string,
  input: { body: string; visibility: 'PUBLIC' | 'INTERNAL' },
): Promise<{ data: CommentDto }> {
  return apiFetch(`/tickets/${encodeURIComponent(ticketId)}/comments`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function fetchHistory(ticketId: string): Promise<{ data: HistoryEventDto[] }> {
  return apiFetch(`/tickets/${encodeURIComponent(ticketId)}/history`);
}

export function fetchAttachments(ticketId: string): Promise<{ data: AttachmentDto[] }> {
  return apiFetch(`/tickets/${encodeURIComponent(ticketId)}/attachments`);
}

export function uploadAttachment(
  ticketId: string,
  file: File,
  isInternal: boolean,
): Promise<{ data: AttachmentDto }> {
  const form = new FormData();
  form.append('file', file);
  return apiFetch(`/tickets/${encodeURIComponent(ticketId)}/attachments?isInternal=${isInternal}`, {
    method: 'POST',
    body: form,
  });
}

export function attachmentDownloadUrl(attachmentId: string): string {
  return `/api/v1/attachments/${encodeURIComponent(attachmentId)}/download`;
}

export function fetchMe(): Promise<{ data: Me }> {
  return apiFetch('/auth/me');
}
