import type {
  AssetStatus,
  AssetSummary,
  AssignAssetInput,
  PageMeta,
  UnassignAssetInput,
  AssetTransitionInput,
} from '@opsdesk/contracts';
import { apiFetch } from '@/lib/api-client';

export interface PaginatedAssets {
  data: AssetSummary[];
  meta: PageMeta;
}

export interface AssetAssignmentDto {
  id: string;
  user: { id: string; firstName: string; lastName: string };
  assignedAt: string;
  returnedAt: string | null;
  returnCondition: string | null;
  note: string | null;
}

export interface AssetDetailDto extends AssetSummary {
  location: { id: string; name: string } | null;
  vendor: { id: string; name: string } | null;
  notes: string | null;
  disposalMethod: string | null;
  assignments: AssetAssignmentDto[];
  can: { update: boolean; assign: boolean; retire: boolean; dispose: boolean };
  allowedTransitions: AssetStatus[];
}

export interface AssetEventDto {
  id: string;
  type: string;
  actor: { id: string; firstName: string; lastName: string } | null;
  fromValue: string | null;
  toValue: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export function fetchAssets(queryString: string): Promise<PaginatedAssets> {
  return apiFetch(`/assets${queryString ? `?${queryString}` : ''}`);
}

export function fetchAsset(tag: string): Promise<{ data: AssetDetailDto }> {
  return apiFetch(`/assets/${encodeURIComponent(tag)}`);
}

export function fetchMyAssets(): Promise<{ data: AssetSummary[] }> {
  return apiFetch('/users/me/assets');
}

export function fetchAssetHistory(tag: string): Promise<{ data: AssetEventDto[] }> {
  return apiFetch(`/assets/${encodeURIComponent(tag)}/history`);
}

export function fetchAssetTickets(
  tag: string,
): Promise<{ data: { id: string; key: string; title: string; status: string }[] }> {
  return apiFetch(`/assets/${encodeURIComponent(tag)}/tickets`);
}

export function assignAsset(
  id: string,
  input: AssignAssetInput,
): Promise<{ data: AssetDetailDto }> {
  return apiFetch(`/assets/${encodeURIComponent(id)}/assign`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function unassignAsset(
  id: string,
  input: UnassignAssetInput,
): Promise<{ data: AssetDetailDto }> {
  return apiFetch(`/assets/${encodeURIComponent(id)}/unassign`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function transitionAsset(
  id: string,
  input: AssetTransitionInput,
): Promise<{ data: AssetDetailDto }> {
  return apiFetch(`/assets/${encodeURIComponent(id)}/transitions`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function createAsset(input: {
  typeId: string;
  name: string;
  manufacturer?: string;
  model?: string;
  serialNumber?: string;
  purchaseDate?: string;
  purchaseCost?: number;
  warrantyExpiry?: string;
  notes?: string;
}): Promise<{ data: AssetDetailDto }> {
  return apiFetch('/assets', { method: 'POST', body: JSON.stringify(input) });
}

export function fetchAssetTypes(): Promise<{
  data: { id: string; name: string; tagPrefix: string; isActive: boolean }[];
}> {
  return apiFetch('/asset-types');
}
