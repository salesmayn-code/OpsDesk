'use client';

import type { AssetStatus, AssignAssetInput, UnassignAssetInput } from '@opsdesk/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  assignAsset,
  createAsset,
  fetchAsset,
  fetchAssetHistory,
  fetchAssetTickets,
  fetchAssetTypes,
  fetchAssets,
  fetchMyAssets,
  transitionAsset,
  unassignAsset,
  type PaginatedAssets,
} from './api';

export function useAssets(queryString: string) {
  return useQuery<PaginatedAssets>({
    queryKey: ['assets', 'list', queryString],
    queryFn: () => fetchAssets(queryString),
  });
}

export function useAsset(tag: string) {
  return useQuery({
    queryKey: ['assets', 'detail', tag],
    queryFn: () => fetchAsset(tag),
    enabled: tag.length > 0,
  });
}

export function useMyAssets() {
  return useQuery({ queryKey: ['assets', 'mine'], queryFn: fetchMyAssets });
}

export function useAssetHistory(tag: string) {
  return useQuery({
    queryKey: ['assets', 'history', tag],
    queryFn: () => fetchAssetHistory(tag),
    enabled: tag.length > 0,
  });
}

export function useAssetTickets(tag: string) {
  return useQuery({
    queryKey: ['assets', 'tickets', tag],
    queryFn: () => fetchAssetTickets(tag),
    enabled: tag.length > 0,
  });
}

function useAssetMutation<TInput>(
  mutationFn: (input: TInput) => Promise<unknown>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['assets'] });
    },
  });
}

export function useAssignAsset() {
  return useAssetMutation<AssignAssetInput & { assetId: string }>((input) =>
    assignAsset(input.assetId, { version: input.version, userId: input.userId, note: input.note }),
  );
}

export function useUnassignAsset() {
  return useAssetMutation<UnassignAssetInput & { assetId: string }>((input) =>
    unassignAsset(input.assetId, {
      version: input.version,
      note: input.note,
      condition: input.condition,
    }),
  );
}

export function useTransitionAsset() {
  return useAssetMutation<{
    assetId: string;
    version: number;
    to: AssetStatus;
    note?: string;
    disposalMethod?: string;
  }>((input) =>
    transitionAsset(input.assetId, {
      version: input.version,
      to: input.to,
      note: input.note,
      disposalMethod: input.disposalMethod,
    }),
  );
}

export function useCreateAsset() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createAsset,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['assets'] }),
  });
}

export function useAssetTypes() {
  return useQuery({
    queryKey: ['asset-types'],
    queryFn: fetchAssetTypes,
    staleTime: 5 * 60_000,
  });
}
