'use client';

import { useQuery } from '@tanstack/react-query';
import { fetchReport } from './api';

export function useReport(key: string, from: string, to: string) {
  return useQuery({
    queryKey: ['reports', key, from, to],
    queryFn: () => fetchReport(key, from, to),
  });
}
