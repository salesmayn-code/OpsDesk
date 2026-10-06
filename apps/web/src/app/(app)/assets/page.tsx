'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { useAssets } from '@/features/assets/hooks';
import { AssetStatusBadge, WarrantyBadge } from '@/components/asset-badges';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/field';
import { relativeTime } from '@/lib/format';

function AssetsView() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [searchDraft, setSearchDraft] = useState(searchParams.get('q') ?? '');

  const status = searchParams.get('status') ?? '';
  const warranty = searchParams.get('warranty') ?? '';
  const q = searchParams.get('q') ?? '';
  const page = Number(searchParams.get('page') ?? '1');

  const queryString = (() => {
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    if (warranty) params.set('warranty', warranty);
    if (q) params.set('q', q);
    params.set('page', String(page));
    params.set('pageSize', '25');
    return params.toString();
  })();

  const { data, isLoading, isError, refetch } = useAssets(queryString);

  const setParams = (updates: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(updates)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    if (!('page' in updates)) params.delete('page');
    router.replace(`${pathname}?${params.toString()}`);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-display font-semibold tracking-tight">Assets</h1>
        <Link href="/my/assets">
          <Button variant="outline">My assets</Button>
        </Link>
      </div>

      <form
        role="search"
        className="flex flex-wrap items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          setParams({ q: searchDraft || null });
        }}
      >
        <label htmlFor="asset-search" className="sr-only">
          Search assets
        </label>
        <Input
          id="asset-search"
          value={searchDraft}
          onChange={(event) => setSearchDraft(event.target.value)}
          placeholder="Search name, serial, or tag…"
          className="max-w-xs"
        />
        <label htmlFor="asset-status-filter" className="sr-only">
          Filter by status
        </label>
        <select
          id="asset-status-filter"
          value={status}
          onChange={(event) => setParams({ status: event.target.value || null })}
          className="h-9 rounded-control border border-border bg-card px-2 text-sm"
        >
          <option value="">Any status</option>
          <option value="PROCURED">Procured</option>
          <option value="IN_STOCK">In stock</option>
          <option value="ASSIGNED">Assigned</option>
          <option value="IN_REPAIR">In repair</option>
          <option value="LOST">Lost</option>
          <option value="RETIRED">Retired</option>
          <option value="DISPOSED">Disposed</option>
        </select>
        <label htmlFor="asset-warranty-filter" className="sr-only">
          Filter by warranty
        </label>
        <select
          id="asset-warranty-filter"
          value={warranty}
          onChange={(event) => setParams({ warranty: event.target.value || null })}
          className="h-9 rounded-control border border-border bg-card px-2 text-sm"
        >
          <option value="">Any warranty</option>
          <option value="active">Active</option>
          <option value="expiring">Expiring soon</option>
          <option value="expired">Expired</option>
        </select>
        <Button type="submit" variant="outline">
          Search
        </Button>
      </form>

      {isLoading ? (
        <div role="status" aria-label="Loading assets" className="space-y-3 rounded-card border border-border bg-card p-4">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="h-4 w-full animate-pulse rounded bg-card-muted" />
          ))}
        </div>
      ) : isError ? (
        <div className="rounded-card border border-border bg-card p-6 text-sm">
          <p role="alert">Could not load assets.</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => void refetch()}>
            Retry
          </Button>
        </div>
      ) : data && data.data.length === 0 ? (
        <div className="rounded-card border border-border bg-card p-8 text-center">
          <p className="text-sm text-muted-foreground">No assets match these filters.</p>
          <Button
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={() => setParams({ status: null, warranty: null, q: null })}
          >
            Clear filters
          </Button>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-card border border-border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th scope="col" className="px-3 py-2 font-medium">
                  Tag
                </th>
                <th scope="col" className="px-3 py-2 font-medium">
                  Name
                </th>
                <th scope="col" className="hidden px-3 py-2 font-medium md:table-cell">
                  Type
                </th>
                <th scope="col" className="px-3 py-2 font-medium">
                  Status
                </th>
                <th scope="col" className="hidden px-3 py-2 font-medium lg:table-cell">
                  Assigned to
                </th>
                <th scope="col" className="px-3 py-2 font-medium">
                  Warranty
                </th>
                <th scope="col" className="hidden px-3 py-2 font-medium sm:table-cell">
                  Updated
                </th>
              </tr>
            </thead>
            <tbody>
              {data?.data.map((asset) => (
                <tr key={asset.id} className="border-b border-border last:border-0 hover:bg-card-muted">
                  <td className="px-3 py-2 font-mono text-xs">
                    <Link
                      href={`/assets/${asset.tag}`}
                      className="text-primary underline-offset-4 hover:underline"
                    >
                      {asset.tag}
                    </Link>
                  </td>
                  <td className="max-w-[280px] truncate px-3 py-2">
                    <Link href={`/assets/${asset.tag}`} className="hover:underline">
                      {asset.name}
                    </Link>
                  </td>
                  <td className="hidden px-3 py-2 text-muted-foreground md:table-cell">
                    {asset.type.name}
                  </td>
                  <td className="px-3 py-2">
                    <AssetStatusBadge status={asset.status} />
                  </td>
                  <td className="hidden px-3 py-2 text-muted-foreground lg:table-cell">
                    {asset.currentAssignee
                      ? `${asset.currentAssignee.firstName} ${asset.currentAssignee.lastName}`
                      : '—'}
                  </td>
                  <td className="px-3 py-2">
                    <WarrantyBadge state={asset.warrantyState} expiry={asset.warrantyExpiry} />
                  </td>
                  <td className="hidden whitespace-nowrap px-3 py-2 text-muted-foreground sm:table-cell">
                    {relativeTime(asset.updatedAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data && data.meta.totalPages > 1 ? (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            Page {data.meta.page} of {data.meta.totalPages} · {data.meta.total} assets
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setParams({ page: String(page - 1) })}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= data.meta.totalPages}
              onClick={() => setParams({ page: String(page + 1) })}
            >
              Next
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function AssetsPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Loading assets…</p>}>
      <AssetsView />
    </Suspense>
  );
}
