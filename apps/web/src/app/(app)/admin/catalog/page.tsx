'use client';

import { useState, type FormEvent } from 'react';
import { useCategories } from '@/features/tickets/hooks';
import { useAssetTypes } from '@/features/assets/hooks';
import {
  useCreateAssetType,
  useCreateCategory,
  useTeams,
  useUpdateCategory,
} from '@/features/admin/hooks';
import { useToast } from '@/components/toast';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/field';
import type { Category } from '@opsdesk/contracts';

interface FlatCategory {
  id: string;
  name: string;
  isActive: boolean;
  defaultTeamId: string | null;
  depth: number;
}

function flatten(categories: Category[], depth = 0): FlatCategory[] {
  const out: FlatCategory[] = [];
  for (const category of categories) {
    out.push({
      id: category.id,
      name: category.name,
      isActive: category.isActive,
      defaultTeamId: category.defaultTeamId,
      depth,
    });
    if (category.children?.length) out.push(...flatten(category.children, depth + 1));
  }
  return out;
}

export default function AdminCatalogPage() {
  const categories = useCategories();
  const assetTypes = useAssetTypes();
  const teams = useTeams();
  const createCategory = useCreateCategory();
  const updateCategory = useUpdateCategory();
  const createAssetType = useCreateAssetType();
  const { toast } = useToast();
  const [error, setError] = useState<string | null>(null);

  const flat = flatten(categories.data?.data ?? []);

  return (
    <div className="space-y-6">
      <h1 className="text-display font-semibold tracking-tight">Catalog</h1>

      {error ? (
        <p role="alert" className="rounded-control bg-status-danger-bg px-3 py-2 text-sm text-status-danger-fg">
          {error}
        </p>
      ) : null}

      <section className="space-y-3">
        <h2 className="text-title font-semibold">Ticket categories</h2>
        <div className="overflow-x-auto rounded-card border border-border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th scope="col" className="px-3 py-2 font-medium">Name</th>
                <th scope="col" className="px-3 py-2 font-medium">Routing team</th>
                <th scope="col" className="px-3 py-2 font-medium">Active</th>
                <th scope="col" className="px-3 py-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {flat.map((category) => (
                <tr key={category.id} className="border-b border-border last:border-0">
                  <td className="px-3 py-2">
                    <span style={{ paddingLeft: `${category.depth * 16}px` }}>{category.name}</span>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {teams.data?.data.find((team) => team.id === category.defaultTeamId)?.name ?? '—'}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {category.isActive ? 'yes' : 'no'}
                  </td>
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      className="text-xs text-primary hover:underline"
                      onClick={() =>
                        updateCategory.mutate(
                          { id: category.id, isActive: !category.isActive },
                          {
                            onSuccess: () =>
                              toast(category.isActive ? 'Category deactivated' : 'Category activated'),
                            onError: (mutationError) =>
                              setError(
                                mutationError instanceof Error ? mutationError.message : 'Failed.',
                              ),
                          },
                        )
                      }
                    >
                      {category.isActive ? 'Deactivate' : 'Activate'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <form
          className="flex flex-wrap items-end gap-3 rounded-card border border-border bg-card p-4"
          onSubmit={(event: FormEvent<HTMLFormElement>) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            createCategory.mutate(
              {
                name: String(form.get('name')),
                parentId: String(form.get('parentId') || '') || null,
                defaultTeamId: String(form.get('defaultTeamId') || '') || null,
              },
              {
                onSuccess: () => {
                  event.currentTarget.reset();
                  toast('Category created');
                },
                onError: (mutationError) =>
                  setError(mutationError instanceof Error ? mutationError.message : 'Failed.'),
              },
            );
          }}
        >
          <Field label="New category" htmlFor="category-name" required>
            <Input id="category-name" name="name" required maxLength={100} />
          </Field>
          <Field label="Parent" htmlFor="category-parent">
            <select
              id="category-parent"
              name="parentId"
              className="h-9 rounded-control border border-border bg-card px-2 text-sm"
            >
              <option value="">Top level</option>
              {flat.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Routing team" htmlFor="category-team">
            <select
              id="category-team"
              name="defaultTeamId"
              className="h-9 rounded-control border border-border bg-card px-2 text-sm"
            >
              <option value="">None</option>
              {(teams.data?.data ?? []).map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))}
            </select>
          </Field>
          <Button type="submit" variant="outline" disabled={createCategory.isPending}>
            Add category
          </Button>
        </form>
      </section>

      <section className="space-y-3">
        <h2 className="text-title font-semibold">Asset types</h2>
        <div className="overflow-x-auto rounded-card border border-border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th scope="col" className="px-3 py-2 font-medium">Name</th>
                <th scope="col" className="px-3 py-2 font-medium">Tag prefix</th>
              </tr>
            </thead>
            <tbody>
              {(assetTypes.data?.data ?? []).map((type) => (
                <tr key={type.id} className="border-b border-border last:border-0">
                  <td className="px-3 py-2">{type.name}</td>
                  <td className="px-3 py-2 font-mono text-xs">{type.tagPrefix}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <form
          className="flex flex-wrap items-end gap-3 rounded-card border border-border bg-card p-4"
          onSubmit={(event: FormEvent<HTMLFormElement>) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            createAssetType.mutate(
              {
                name: String(form.get('name')),
                tagPrefix: String(form.get('tagPrefix')).toUpperCase(),
              },
              {
                onSuccess: () => {
                  event.currentTarget.reset();
                  toast('Asset type created');
                },
                onError: (mutationError) =>
                  setError(mutationError instanceof Error ? mutationError.message : 'Failed.'),
              },
            );
          }}
        >
          <Field label="New asset type" htmlFor="asset-type-name" required>
            <Input id="asset-type-name" name="name" required maxLength={80} />
          </Field>
          <Field label="Tag prefix" htmlFor="asset-type-prefix" required>
            <Input id="asset-type-prefix" name="tagPrefix" required minLength={2} maxLength={6} />
          </Field>
          <Button type="submit" variant="outline" disabled={createAssetType.isPending}>
            Add asset type
          </Button>
        </form>
      </section>
    </div>
  );
}
