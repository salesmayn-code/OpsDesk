import type {
  BusinessCalendar,
  CreateSlaPolicyInput,
  InviteUserInput,
  PageMeta,
  SlaPolicy,
  UserStatus,
  UpdateSlaPolicyInput,
  UpsertBusinessCalendarInput,
  UserSummary,
} from '@opsdesk/contracts';
import { apiFetch } from '@/lib/api-client';

export interface RoleDto {
  id: string;
  key: string;
  name: string;
  permissions: string[];
}

export interface DepartmentDto {
  id: string;
  name: string;
  code: string;
  memberCount: number;
}

export interface TeamDto {
  id: string;
  name: string;
  description: string | null;
  email: string | null;
  leadId: string | null;
  managerId: string | null;
  archivedAt: string | null;
  memberCount: number;
}

export interface SlaPreviewDto {
  policy: { id: string; name: string; firstResponseMinutes: number; resolutionMinutes: number };
  calendar: { id: string; name: string; timezone: string };
  response: { warnAt: string; escalateAt: string; dueAt: string };
  resolution: { warnAt: string; escalateAt: string; dueAt: string };
}

export function fetchUsers(query: string): Promise<{ data: UserSummary[]; meta: PageMeta }> {
  return apiFetch(`/users${query ? `?${query}` : ''}`);
}

export function fetchRoles(): Promise<{ data: RoleDto[] }> {
  return apiFetch('/roles');
}

export function fetchDepartments(): Promise<{ data: DepartmentDto[] }> {
  return apiFetch('/departments');
}

export function fetchTeams(): Promise<{ data: TeamDto[] }> {
  return apiFetch('/teams');
}

export function inviteUser(input: InviteUserInput): Promise<{ data: UserSummary }> {
  return apiFetch('/users', { method: 'POST', body: JSON.stringify(input) });
}

export function changeUserStatus(
  id: string,
  input: { status: 'ACTIVE' | 'SUSPENDED' | 'DISABLED'; reason?: string },
): Promise<{ data: UserSummary }> {
  return apiFetch(`/users/${id}/status`, { method: 'POST', body: JSON.stringify(input) });
}

export function updateUserRoles(id: string, roleIds: string[]): Promise<{ data: UserSummary }> {
  return apiFetch(`/users/${id}/roles`, { method: 'PUT', body: JSON.stringify({ roleIds }) });
}

export function fetchSlaPolicies(): Promise<{
  data: (SlaPolicy & { calendar: { id: string; name: string; timezone: string; is24x7: boolean } })[];
}> {
  return apiFetch('/sla-policies');
}

export function fetchBusinessCalendars(): Promise<{ data: BusinessCalendar[] }> {
  return apiFetch('/business-calendars');
}

export function createSlaPolicy(input: CreateSlaPolicyInput): Promise<{ data: SlaPolicy }> {
  return apiFetch('/sla-policies', { method: 'POST', body: JSON.stringify(input) });
}

export function updateSlaPolicy(id: string, input: UpdateSlaPolicyInput): Promise<{ data: SlaPolicy }> {
  return apiFetch(`/sla-policies/${id}`, { method: 'PATCH', body: JSON.stringify(input) });
}

export function createBusinessCalendar(
  input: UpsertBusinessCalendarInput,
): Promise<{ data: BusinessCalendar }> {
  return apiFetch('/business-calendars', { method: 'POST', body: JSON.stringify(input) });
}

export function previewSla(input: {
  priority: string;
  type: string;
  categoryId?: string;
}): Promise<{ data: SlaPreviewDto }> {
  return apiFetch('/sla-policies/preview', { method: 'POST', body: JSON.stringify(input) });
}

export function createCategory(input: {
  name: string;
  parentId?: string | null;
  defaultTeamId?: string | null;
  isActive?: boolean;
}): Promise<{ data: { id: string; name: string } }> {
  return apiFetch('/categories', { method: 'POST', body: JSON.stringify(input) });
}

export function updateCategory(
  id: string,
  input: { name?: string; defaultTeamId?: string | null; isActive?: boolean },
): Promise<{ data: { id: string; name: string } }> {
  return apiFetch(`/categories/${id}`, { method: 'PATCH', body: JSON.stringify(input) });
}

export function createAssetType(input: {
  name: string;
  tagPrefix: string;
}): Promise<{ data: { id: string; name: string; tagPrefix: string } }> {
  return apiFetch('/asset-types', { method: 'POST', body: JSON.stringify(input) });
}

export type { UserStatus };
