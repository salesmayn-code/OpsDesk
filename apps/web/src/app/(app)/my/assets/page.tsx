'use client';

import Link from 'next/link';
import { Laptop } from 'lucide-react';
import { useMyAssets } from '@/features/assets/hooks';
import { AssetStatusBadge, WarrantyBadge } from '@/components/asset-badges';
import { EmptyState } from '@/components/empty-state';

export default function MyAssetsPage() {
  const { data, isLoading, isError } = useMyAssets();

  return (
    <div className="space-y-4">
      <h1 className="text-display font-semibold tracking-tight">My assets</h1>
      <p className="text-sm text-muted-foreground">
        Company equipment currently in your possession.
      </p>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading assets…</p>
      ) : isError ? (
        <p role="alert" className="text-sm text-status-danger-fg">
          Could not load your assets.
        </p>
      ) : data && data.data.length === 0 ? (
        <EmptyState
          icon={Laptop}
          title="No assets assigned"
          description="Company equipment assigned to you will show up here."
          action={{ href: '/tickets/new', label: 'Request equipment' }}
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {data?.data.map((asset) => (
            <div key={asset.id} className="rounded-card border border-border bg-card p-4">
              <div className="flex items-center justify-between gap-2">
                <Link
                  href={`/assets/${asset.tag}`}
                  className="font-mono text-sm text-primary underline-offset-4 hover:underline"
                >
                  {asset.tag}
                </Link>
                <AssetStatusBadge status={asset.status} />
              </div>
              <p className="mt-2 font-medium">{asset.name}</p>
              <p className="text-xs text-muted-foreground">{asset.type.name}</p>
              <div className="mt-2">
                <WarrantyBadge state={asset.warrantyState} expiry={asset.warrantyExpiry} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
