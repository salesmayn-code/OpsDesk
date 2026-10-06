'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { useSearch } from '@/features/platform/hooks';
import { StatusBadge } from '@/components/status-badge';
import { AssetStatusBadge } from '@/components/asset-badges';
import type { TicketStatus } from '@opsdesk/contracts';

export function GlobalSearch() {
  const [value, setValue] = useState('');
  const [term, setTerm] = useState('');
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => setTerm(value), 250);
    return () => clearTimeout(timer);
  }, [value]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
      if (event.key === 'Escape') setOpen(false);
    };
    const onClick = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    document.addEventListener('mousedown', onClick);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('mousedown', onClick);
    };
  }, []);

  const results = useSearch(term);
  const hasResults =
    results.data &&
    (results.data.data.tickets.length > 0 ||
      results.data.data.assets.length > 0 ||
      results.data.data.users.length > 0);

  return (
    <div className="relative flex-1 max-w-md" ref={containerRef}>
      <label htmlFor="global-search" className="sr-only">
        Search tickets, assets, and people
      </label>
      <div className="flex items-center gap-2 rounded-control border border-border bg-card px-3">
        <Search aria-hidden="true" className="h-4 w-4 text-muted-foreground" />
        <input
          ref={inputRef}
          id="global-search"
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder="Search tickets, assets, people…  ⌘K"
          className="h-9 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
      </div>

      {open && term.trim().length >= 2 ? (
        <div className="absolute z-50 mt-2 w-full rounded-card border border-border bg-card shadow-sm">
          {results.isLoading ? (
            <p className="px-4 py-3 text-sm text-muted-foreground">Searching…</p>
          ) : !hasResults ? (
            <p className="px-4 py-3 text-sm text-muted-foreground">No matches.</p>
          ) : (
            <div className="max-h-96 overflow-y-auto py-1">
              {results.data!.data.tickets.length > 0 ? (
                <section aria-label="Tickets">
                  <p className="px-4 pt-2 text-xs font-medium text-muted-foreground">Tickets</p>
                  {results.data!.data.tickets.map((ticket) => (
                    <Link
                      key={ticket.id}
                      href={`/tickets/${ticket.key}`}
                      onClick={() => setOpen(false)}
                      className="flex items-center justify-between gap-2 px-4 py-2 text-sm hover:bg-card-muted"
                    >
                      <span className="truncate">
                        <span className="font-mono text-xs text-muted-foreground">{ticket.key}</span>{' '}
                        {ticket.title}
                      </span>
                      <StatusBadge status={ticket.status as TicketStatus} />
                    </Link>
                  ))}
                </section>
              ) : null}
              {results.data!.data.assets.length > 0 ? (
                <section aria-label="Assets">
                  <p className="px-4 pt-2 text-xs font-medium text-muted-foreground">Assets</p>
                  {results.data!.data.assets.map((asset) => (
                    <Link
                      key={asset.id}
                      href={`/assets/${asset.tag}`}
                      onClick={() => setOpen(false)}
                      className="flex items-center justify-between gap-2 px-4 py-2 text-sm hover:bg-card-muted"
                    >
                      <span className="truncate">
                        <span className="font-mono text-xs text-muted-foreground">{asset.tag}</span>{' '}
                        {asset.name}
                      </span>
                      <AssetStatusBadge status={asset.status as never} />
                    </Link>
                  ))}
                </section>
              ) : null}
              {results.data!.data.users.length > 0 ? (
                <section aria-label="People">
                  <p className="px-4 pt-2 text-xs font-medium text-muted-foreground">People</p>
                  {results.data!.data.users.map((user) => (
                    <div key={user.id} className="px-4 py-2 text-sm">
                      {user.firstName} {user.lastName}{' '}
                      <span className="text-xs text-muted-foreground">{user.email}</span>
                    </div>
                  ))}
                </section>
              ) : null}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
