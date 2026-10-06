import type {
  CreateIncidentInput,
  CreatePostmortemActionInput,
  IncidentNoteInput,
  IncidentSeverity,
  IncidentStatus,
  IncidentTransitionInput,
  PageMeta,
  UpdateIncidentInput,
  UpdatePostmortemActionInput,
  UpsertPostmortemInput,
} from '@opsdesk/contracts';
import { apiFetch } from '@/lib/api-client';

export interface IncidentSummaryDto {
  id: string;
  key: string;
  title: string;
  description: string;
  severity: IncidentSeverity;
  status: IncidentStatus;
  service: { id: string; name: string } | null;
  ownerId: string | null;
  commanderId: string | null;
  teamId: string | null;
  declaredById: string;
  version: number;
  ticketCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface IncidentDetailDto extends IncidentSummaryDto {
  impact: string | null;
  startedAt: string;
  detectedAt: string;
  mitigatedAt: string | null;
  resolvedAt: string | null;
  closedAt: string | null;
  rootCause: string | null;
  mitigation: string | null;
  resolution: string | null;
  preventiveAction: string | null;
  postmortem: { id: string; status: string; publishedAt: string | null } | null;
  tickets: { id: string; key: string; title: string; status: string; priority: string }[];
  can: { manage: boolean; close: boolean; postmortem: boolean };
  allowedTransitions: IncidentStatus[];
}

export interface IncidentTimelineEventDto {
  id: string;
  type: string;
  actor: { id: string; firstName: string; lastName: string } | null;
  body: string | null;
  fromValue: string | null;
  toValue: string | null;
  occurredAt: string;
  createdAt: string;
}

export interface PostmortemDto {
  id: string;
  status: string;
  summary: string | null;
  impact: string | null;
  timelineSummary: string | null;
  rootCause: string | null;
  contributingFactors: string | null;
  wentWell: string | null;
  wentWrong: string | null;
  ownerId: string | null;
  publishedAt: string | null;
  version: number;
}

export interface PostmortemActionDto {
  id: string;
  kind: string;
  description: string;
  ownerId: string | null;
  dueDate: string | null;
  status: string;
  completedAt: string | null;
}

export function fetchIncidents(query: string): Promise<{ data: IncidentSummaryDto[]; meta: PageMeta }> {
  return apiFetch(`/incidents${query ? `?${query}` : ''}`);
}

export function fetchIncident(key: string): Promise<{ data: IncidentDetailDto }> {
  return apiFetch(`/incidents/${encodeURIComponent(key)}`);
}

export function fetchIncidentTimeline(key: string): Promise<{ data: IncidentTimelineEventDto[] }> {
  return apiFetch(`/incidents/${encodeURIComponent(key)}/timeline`);
}

export function fetchServices(): Promise<{ data: { id: string; name: string; isActive: boolean }[] }> {
  return apiFetch('/services');
}

export function createIncident(input: CreateIncidentInput): Promise<{ data: IncidentDetailDto }> {
  return apiFetch('/incidents', { method: 'POST', body: JSON.stringify(input) });
}

export function updateIncident(
  id: string,
  input: UpdateIncidentInput,
): Promise<{ data: IncidentDetailDto }> {
  return apiFetch(`/incidents/${id}`, { method: 'PATCH', body: JSON.stringify(input) });
}

export function transitionIncident(
  id: string,
  input: IncidentTransitionInput,
): Promise<{ data: IncidentDetailDto }> {
  return apiFetch(`/incidents/${id}/transitions`, { method: 'POST', body: JSON.stringify(input) });
}

export function addIncidentNote(
  id: string,
  input: IncidentNoteInput,
): Promise<{ data: IncidentTimelineEventDto[] }> {
  return apiFetch(`/incidents/${id}/timeline`, { method: 'POST', body: JSON.stringify(input) });
}

export function linkIncidentTickets(
  id: string,
  ticketIds: string[],
): Promise<{ data: IncidentDetailDto }> {
  return apiFetch(`/incidents/${id}/tickets`, {
    method: 'POST',
    body: JSON.stringify({ ticketIds }),
  });
}

export function unlinkIncidentTicket(id: string, ticketId: string): Promise<{ data: IncidentDetailDto }> {
  return apiFetch(`/incidents/${id}/tickets/${ticketId}`, { method: 'DELETE' });
}

export function notifyIncidentRequesters(
  id: string,
  message: string,
): Promise<{ data: { notified: number } }> {
  return apiFetch(`/incidents/${id}/notify-requesters`, {
    method: 'POST',
    body: JSON.stringify({ message }),
  });
}

export function fetchPostmortem(
  key: string,
): Promise<{ data: (PostmortemDto & { actions: PostmortemActionDto[] }) | null }> {
  return apiFetch(`/incidents/${encodeURIComponent(key)}/postmortem`);
}

export function upsertPostmortem(
  id: string,
  input: UpsertPostmortemInput,
): Promise<{ data: PostmortemDto }> {
  return apiFetch(`/incidents/${id}/postmortem`, { method: 'PUT', body: JSON.stringify(input) });
}

export function publishPostmortem(id: string): Promise<{ data: PostmortemDto }> {
  return apiFetch(`/incidents/${id}/postmortem/publish`, { method: 'POST' });
}

export function createPostmortemAction(
  id: string,
  input: CreatePostmortemActionInput,
): Promise<{ data: PostmortemDto }> {
  return apiFetch(`/incidents/${id}/postmortem/actions`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function updatePostmortemAction(
  id: string,
  actionId: string,
  input: UpdatePostmortemActionInput,
): Promise<{ data: PostmortemDto }> {
  return apiFetch(`/incidents/${id}/postmortem/actions/${actionId}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export function linkTicketIncident(
  ticketId: string,
  incidentId: string,
): Promise<{ data: unknown }> {
  return apiFetch(`/tickets/${encodeURIComponent(ticketId)}/incident`, {
    method: 'POST',
    body: JSON.stringify({ incidentId }),
  });
}

export function fetchIncidentOptions(q: string): Promise<{ data: IncidentSummaryDto[] }> {
  return apiFetch(`/incidents?q=${encodeURIComponent(q)}&pageSize=5`);
}
