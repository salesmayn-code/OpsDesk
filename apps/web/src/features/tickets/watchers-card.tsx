'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiClientError } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/field';
import { useToast } from '@/components/toast';
import { fetchUsers } from '@/features/admin/api';
import { addWatcher, fetchWatchers, removeWatcher } from './api';

/**
 * Watchers follow status changes and public replies. Anyone who can see the ticket may
 * watch it; staff (ticket:update) can add others, which also grants them visibility.
 */
export function WatchersCard({ ticketId, canManage }: { ticketId: string; canManage: boolean }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [search, setSearch] = useState('');
  const queryKey = ['tickets', 'watchers', ticketId];
  const watchers = useQuery({ queryKey, queryFn: () => fetchWatchers(ticketId) });
  const onError = (error: unknown) =>
    toast(error instanceof ApiClientError ? error.message : 'Something went wrong.');
  const options = { onSuccess: (data: { data: unknown }) => queryClient.setQueryData(queryKey, data), onError };
  const add = useMutation({ mutationFn: (userId?: string) => addWatcher(ticketId, userId), ...options });
  const remove = useMutation({ mutationFn: (userId: string) => removeWatcher(ticketId, userId), ...options });

  const list = watchers.data?.data ?? [];
  const watching = list.some((watcher) => watcher.id === user?.id);
  const query = new URLSearchParams({ status: 'ACTIVE', pageSize: '6', q: search.trim() });
  // /users needs user:view, which only staff have; employees never search.
  const candidates = useQuery({
    queryKey: ['admin', 'users', query.toString()],
    queryFn: () => fetchUsers(query.toString()),
    enabled: canManage && search.trim().length > 0,
  });
  const matches = search.trim()
    ? (candidates.data?.data ?? []).filter((u) => !list.some((w) => w.id === u.id))
    : [];

  return (
    <div className="rounded-card border border-border bg-card p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-title font-semibold">Watchers</h2>
        {user ? (
          <Button
            size="sm"
            variant="outline"
            disabled={add.isPending || remove.isPending}
            onClick={() => (watching ? remove.mutate(user.id) : add.mutate(undefined))}
          >
            {watching ? 'Stop watching' : 'Watch'}
          </Button>
        ) : null}
      </div>
      <ul className="mt-3 flex flex-wrap gap-2">
        {list.map((watcher) => (
          <li
            key={watcher.id}
            className="flex items-center gap-1 rounded-full border border-border px-3 py-1 text-xs"
          >
            {watcher.firstName} {watcher.lastName}
            {canManage && watcher.id !== user?.id ? (
              <button
                type="button"
                className="ml-1 text-muted-foreground hover:text-foreground"
                aria-label={`Remove ${watcher.firstName} ${watcher.lastName} from watchers`}
                onClick={() => remove.mutate(watcher.id)}
              >
                ×
              </button>
            ) : null}
          </li>
        ))}
        {watchers.data && list.length === 0 ? (
          <li className="text-sm text-muted-foreground">Nobody is watching this ticket.</li>
        ) : null}
      </ul>
      {canManage ? (
        <div className="mt-3 max-w-sm space-y-1">
          <label htmlFor="add-watcher" className="sr-only">
            Add a watcher
          </label>
          <Input
            id="add-watcher"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Add a watcher by name or email…"
          />
          {matches.length > 0 ? (
            <ul className="divide-y divide-border rounded-control border border-border bg-card">
              {matches.map((candidate) => (
                <li key={candidate.id}>
                  <button
                    type="button"
                    className="block w-full px-3 py-1.5 text-left text-sm hover:bg-card-muted"
                    onClick={() =>
                      add.mutate(candidate.id, {
                        onSuccess: () => {
                          setSearch('');
                          toast(`${candidate.firstName} is now watching`);
                        },
                      })
                    }
                  >
                    {candidate.firstName} {candidate.lastName}{' '}
                    <span className="text-xs text-muted-foreground">{candidate.email}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
