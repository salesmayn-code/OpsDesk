'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { ApiClientError } from '@/lib/api-client';
import { useAssetTypes, useCreateAsset } from '@/features/assets/hooks';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/field';

export default function NewAssetPage() {
  const router = useRouter();
  const types = useAssetTypes();
  const createAsset = useCreateAsset();

  const [typeId, setTypeId] = useState('');
  const [name, setName] = useState('');
  const [manufacturer, setManufacturer] = useState('');
  const [model, setModel] = useState('');
  const [serialNumber, setSerialNumber] = useState('');
  const [purchaseDate, setPurchaseDate] = useState('');
  const [purchaseCost, setPurchaseCost] = useState('');
  const [warrantyExpiry, setWarrantyExpiry] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    createAsset.mutate(
      {
        typeId,
        name,
        ...(manufacturer.trim() ? { manufacturer: manufacturer.trim() } : {}),
        ...(model.trim() ? { model: model.trim() } : {}),
        ...(serialNumber.trim() ? { serialNumber: serialNumber.trim() } : {}),
        ...(purchaseDate ? { purchaseDate } : {}),
        ...(purchaseCost ? { purchaseCost: Number(purchaseCost) } : {}),
        ...(warrantyExpiry ? { warrantyExpiry } : {}),
        ...(notes.trim() ? { notes: notes.trim() } : {}),
      },
      {
        onSuccess: (result) => router.push(`/assets/${result.data.tag}`),
        onError: (mutationError) =>
          setError(
            mutationError instanceof ApiClientError
              ? mutationError.message
              : 'Something went wrong. Try again.',
          ),
      },
    );
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-display font-semibold tracking-tight">Register asset</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          The tag is generated automatically from the asset type prefix.
        </p>
      </div>
      <form onSubmit={onSubmit} className="space-y-4 rounded-card border border-border bg-card p-6">
        {error ? (
          <p role="alert" className="rounded-control bg-status-danger-bg px-3 py-2 text-sm text-status-danger-fg">
            {error}
          </p>
        ) : null}

        <Field label="Asset type" htmlFor="asset-type" required>
          <select
            id="asset-type"
            required
            value={typeId}
            onChange={(event) => setTypeId(event.target.value)}
            className="h-9 w-full rounded-control border border-border bg-card px-2 text-sm"
          >
            <option value="">Select a type…</option>
            {(types.data?.data ?? [])
              .filter((type) => type.isActive)
              .map((type) => (
                <option key={type.id} value={type.id}>
                  {type.name} ({type.tagPrefix})
                </option>
              ))}
          </select>
        </Field>

        <Field label="Name" htmlFor="asset-name" required>
          <Input
            id="asset-name"
            required
            maxLength={150}
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Dell Latitude 5550"
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Manufacturer" htmlFor="asset-manufacturer">
            <Input
              id="asset-manufacturer"
              value={manufacturer}
              onChange={(event) => setManufacturer(event.target.value)}
            />
          </Field>
          <Field label="Model" htmlFor="asset-model">
            <Input id="asset-model" value={model} onChange={(event) => setModel(event.target.value)} />
          </Field>
          <Field label="Serial number" htmlFor="asset-serial">
            <Input
              id="asset-serial"
              value={serialNumber}
              onChange={(event) => setSerialNumber(event.target.value)}
            />
          </Field>
          <Field label="Purchase cost" htmlFor="asset-cost">
            <Input
              id="asset-cost"
              type="number"
              min="0"
              step="0.01"
              value={purchaseCost}
              onChange={(event) => setPurchaseCost(event.target.value)}
            />
          </Field>
          <Field label="Purchase date" htmlFor="asset-purchase">
            <Input
              id="asset-purchase"
              type="date"
              value={purchaseDate}
              onChange={(event) => setPurchaseDate(event.target.value)}
            />
          </Field>
          <Field label="Warranty expiry" htmlFor="asset-warranty">
            <Input
              id="asset-warranty"
              type="date"
              value={warrantyExpiry}
              onChange={(event) => setWarrantyExpiry(event.target.value)}
            />
          </Field>
        </div>

        <Field label="Notes" htmlFor="asset-notes">
          <textarea
            id="asset-notes"
            rows={3}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            className="w-full rounded-control border border-border bg-card px-3 py-2 text-sm"
          />
        </Field>

        <Button type="submit" disabled={createAsset.isPending}>
          {createAsset.isPending ? 'Registering…' : 'Register asset'}
        </Button>
      </form>
    </div>
  );
}
