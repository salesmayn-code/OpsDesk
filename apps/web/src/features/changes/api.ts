import type {
  ChangeRisk,
  ChangeStatus,
  ChangeTransitionInput,
  ChangeType,
  CreateChangeInput,
  PageMeta,
  RecordApprovalInput,
  UpdateChangeInput,
} from '@opsdesk/contracts';
import { apiFetch } from '@/lib/api-client';

export interface ChangeSummaryDto {
  id: string;
  key: string;
  title: string;
  description: string;
  type: ChangeType;
  risk: ChangeRisk;
  status: ChangeStatus;
  requesterId: string;
  ownerId: string | null;
  teamId: string | null;
  approvalRound: number;
  requiredApprovals: number;
  version: number;
  services: { id: string; name: string }[];
  incident: { id: string; key: string } | null;
  createdAt: string;
  updatedAt: string;
}

export interface ChangeApprovalDto {
  id: string;
  approverId: string;
  decision: string;
  comment: string | null;
  createdAt: string;
}

export interface ChangeDetailDto extends ChangeSummaryDto {
  scheduledStart: string | null;
  scheduledEnd: string | null;
  actualStart: string | null;
  actualEnd: string | null;
  implementationPlan: string | null;
  validationPlan: string | null;
  rollbackPlan: string | null;
  impactAnalysis: string | null;
  outcomeNotes: string | null;
  requiresAdminApproval: boolean;
  approvedCount: number;
  adminApproved: boolean;
  approvals: ChangeApprovalDto[];
  can: { update: boolean; approve: boolean; implement: boolean };
  allowedTransitions: ChangeStatus[];
}

export interface ChangeHistoryDto {
  id: string;
  type: string;
  actorId: string | null;
  fromValue: string | null;
  toValue: string | null;
  metadata: unknown;
  createdAt: string;
}

export function fetchChanges(query: string): Promise<{ data: ChangeSummaryDto[]; meta: PageMeta }> {
  return apiFetch(`/changes${query ? `?${query}` : ''}`);
}

export function fetchChange(key: string): Promise<{ data: ChangeDetailDto }> {
  return apiFetch(`/changes/${encodeURIComponent(key)}`);
}

export function fetchChangeHistory(key: string): Promise<{ data: ChangeHistoryDto[] }> {
  return apiFetch(`/changes/${encodeURIComponent(key)}/history`);
}

export function createChange(input: CreateChangeInput): Promise<{ data: ChangeDetailDto }> {
  return apiFetch('/changes', { method: 'POST', body: JSON.stringify(input) });
}

export function updateChange(id: string, input: UpdateChangeInput): Promise<{ data: ChangeDetailDto }> {
  return apiFetch(`/changes/${id}`, { method: 'PATCH', body: JSON.stringify(input) });
}

export function submitChange(id: string): Promise<{ data: ChangeDetailDto }> {
  return apiFetch(`/changes/${id}/submit`, { method: 'POST' });
}

export function transitionChange(
  id: string,
  input: ChangeTransitionInput,
): Promise<{ data: ChangeDetailDto }> {
  return apiFetch(`/changes/${id}/transitions`, { method: 'POST', body: JSON.stringify(input) });
}

export function recordChangeApproval(
  id: string,
  input: RecordApprovalInput,
): Promise<{ data: ChangeDetailDto }> {
  return apiFetch(`/changes/${id}/approvals`, { method: 'POST', body: JSON.stringify(input) });
}
