'use client';

import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/field';
import { useToast } from '@/components/toast';
import { useAdminUsers, useDepartments } from '@/features/admin/hooks';
import type { AssetDetailDto } from './api';
import { useAssignAsset, useUpdateAsset } from './hooks';

interface PanelProps {
  asset: AssetDetailDto;
  onDone: () => void;
  onError: (error: unknown) => void;
}

/** AST-3: hand the asset to any active user (closes the previous assignment atomically). */
export function AssignAssetPanel({ asset, onDone, onError }: PanelProps) {
  const [search, setSearch] = useState('');
  const [note, setNote] = useState('');
  const query = new URLSearchParams({ status: 'ACTIVE', pageSize: '8' });
  if (search.trim()) query.set('q', search.trim());
  const users = useAdminUsers(query.toString());
  const assign = useAssignAsset();
  const { toast } = useToast();

  const candidates = (users.data?.data ?? []).filter((u) => u.id !== asset.currentAssignee?.id);

  return (
    <div className="mt-5 space-y-3 rounded-card border border-border bg-card-muted p-4">
      <p className="text-sm font-medium">
        {asset.currentAssignee ? 'Reassign' : 'Assign'} {asset.tag}
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Find a person" htmlFor="assign-search">
          <Input id="assign-search" autoFocus value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name or email…" />
        </Field>
        <Field label="Note" htmlFor="assign-note" hint="Optional, e.g. “Replacement for LAP-00118”.">
          <Input id="assign-note" maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </div>
      <ul className="divide-y divide-border rounded-control border border-border bg-card" aria-label="Matching people">
        {candidates.map((user) => (
          <li key={user.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
            <span>
              {user.firstName} {user.lastName}{' '}
              <span className="text-xs text-muted-foreground">
                {user.email}
                {user.departmentName ? ` · ${user.departmentName}` : ''}
              </span>
            </span>
            <Button
              size="sm"
              variant="outline"
              disabled={assign.isPending}
              aria-label={`Assign to ${user.firstName} ${user.lastName}`}
              onClick={() =>
                assign.mutate(
                  { assetId: asset.id, version: asset.version, userId: user.id, ...(note.trim() ? { note: note.trim() } : {}) },
                  {
                    onSuccess: () => {
                      toast(`${asset.tag} assigned to ${user.firstName} ${user.lastName}`);
                      onDone();
                    },
                    onError,
                  },
                )
              }
            >
              Assign
            </Button>
          </li>
        ))}
        {users.data && candidates.length === 0 ? (
          <li className="px-3 py-2 text-sm text-muted-foreground">No matching active users.</li>
        ) : null}
      </ul>
      <Button type="button" size="sm" variant="ghost" onClick={onDone}>
        Cancel
      </Button>
    </div>
  );
}

/** AST-1: edit the register fields; the tag and type are permanent identifiers. */
export function EditAssetPanel({ asset, onDone, onError }: PanelProps) {
  const departments = useDepartments();
  const update = useUpdateAsset();
  const { toast } = useToast();

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const text = (key: string) => String(form.get(key) ?? '').trim() || null;
    const cost = text('purchaseCost');
    update.mutate(
      {
        assetId: asset.id,
        version: asset.version,
        name: text('name') ?? asset.name,
        manufacturer: text('manufacturer'),
        model: text('model'),
        serialNumber: text('serialNumber'),
        purchaseDate: text('purchaseDate'),
        purchaseCost: cost === null ? null : Number(cost),
        warrantyExpiry: text('warrantyExpiry'),
        departmentId: text('departmentId'),
        notes: text('notes'),
      },
      {
        onSuccess: () => {
          toast('Asset updated');
          onDone();
        },
        onError,
      },
    );
  };

  const date = (iso: string | null) => (iso ? iso.slice(0, 10) : '');

  return (
    <form onSubmit={submit} className="mt-5 space-y-3 rounded-card border border-border bg-card-muted p-4">
      <p className="text-sm font-medium">Edit details</p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Name" htmlFor="asset-name" required>
          <Input id="asset-name" name="name" required maxLength={150} defaultValue={asset.name} />
        </Field>
        <Field label="Manufacturer" htmlFor="asset-manufacturer">
          <Input id="asset-manufacturer" name="manufacturer" maxLength={100} defaultValue={asset.manufacturer ?? ''} />
        </Field>
        <Field label="Model" htmlFor="asset-model">
          <Input id="asset-model" name="model" maxLength={100} defaultValue={asset.model ?? ''} />
        </Field>
        <Field label="Serial number" htmlFor="asset-serial" hint="Must be unique.">
          <Input id="asset-serial" name="serialNumber" maxLength={100} defaultValue={asset.serialNumber ?? ''} />
        </Field>
        <Field label="Purchase date" htmlFor="asset-purchased">
          <Input id="asset-purchased" name="purchaseDate" type="date" defaultValue={date(asset.purchaseDate)} />
        </Field>
        <Field label="Purchase cost" htmlFor="asset-cost">
          <Input id="asset-cost" name="purchaseCost" type="number" min={0} step="0.01" defaultValue={asset.purchaseCost ?? ''} />
        </Field>
        <Field label="Warranty expiry" htmlFor="asset-warranty">
          <Input id="asset-warranty" name="warrantyExpiry" type="date" defaultValue={date(asset.warrantyExpiry)} />
        </Field>
        <Field label="Department" htmlFor="asset-department">
          <select id="asset-department" name="departmentId" defaultValue={asset.departmentId ?? ''} className="h-9 w-full rounded-control border border-border bg-card px-2 text-sm">
            <option value="">No department</option>
            {(departments.data?.data ?? []).map((department) => (
              <option key={department.id} value={department.id}>
                {department.name}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="Notes" htmlFor="asset-notes">
        <textarea id="asset-notes" name="notes" rows={3} maxLength={5000} defaultValue={asset.notes ?? ''} className="w-full rounded-control border border-border bg-card px-3 py-2 text-sm" />
      </Field>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={update.isPending}>
          {update.isPending ? 'Saving…' : 'Save details'}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
