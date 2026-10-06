'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import type { Category, TicketType } from '@opsdesk/contracts';
import { ApiClientError } from '@/lib/api-client';
import { useCategories, useCreateTicket } from '@/features/tickets/hooks';
import { useKbSuggestions } from '@/features/knowledge/hooks';
import Link from 'next/link';
import { TICKET_TYPE_CARDS } from '@/features/tickets/labels';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/field';

interface FlatCategory {
  id: string;
  label: string;
}

function flatten(categories: Category[], depth = 0): FlatCategory[] {
  const out: FlatCategory[] = [];
  for (const category of categories) {
    out.push({ id: category.id, label: `${'— '.repeat(depth)}${category.name}` });
    if (category.children?.length) out.push(...flatten(category.children, depth + 1));
  }
  return out;
}

export default function NewTicketPage() {
  const router = useRouter();
  const categories = useCategories();
  const createTicket = useCreateTicket();

  const [type, setType] = useState<TicketType | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [requestedPriority, setRequestedPriority] = useState('');
  const [error, setError] = useState<string | null>(null);
  const suggestions = useKbSuggestions(title, categoryId || undefined);

  if (!type) {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <h1 className="text-display font-semibold tracking-tight">What do you need?</h1>
        <div className="grid gap-3 sm:grid-cols-2">
          {TICKET_TYPE_CARDS.map((card) => (
            <button
              key={card.type}
              onClick={() => setType(card.type)}
              className="rounded-card border border-border bg-card p-4 text-left hover:border-primary"
            >
              <p className="font-medium">{card.title}</p>
              <p className="mt-1 text-sm text-muted-foreground">{card.description}</p>
            </button>
          ))}
        </div>
      </div>
    );
  }

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    createTicket.mutate(
      {
        title,
        description,
        type,
        ...(categoryId ? { categoryId } : {}),
        ...(requestedPriority
          ? { requestedPriority: requestedPriority as 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' }
          : {}),
      },
      {
        onSuccess: (result) => router.push(`/tickets/${result.data.key}`),
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
        <button
          onClick={() => setType(null)}
          className="text-sm text-primary hover:underline"
        >
          ← Choose a different type
        </button>
        <h1 className="mt-2 text-display font-semibold tracking-tight">New ticket</h1>
      </div>

      <form onSubmit={onSubmit} className="space-y-4 rounded-card border border-border bg-card p-6">
        {error ? (
          <p role="alert" className="rounded-control bg-status-danger-bg px-3 py-2 text-sm text-status-danger-fg">
            {error}
          </p>
        ) : null}

        <Field label="Title" htmlFor="title" required hint="A short summary of the problem or request.">
          <Input
            id="title"
            required
            minLength={5}
            maxLength={200}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
        </Field>

        <Field label="Category" htmlFor="category" required>
          <select
            id="category"
            required
            value={categoryId}
            onChange={(event) => setCategoryId(event.target.value)}
            className="h-9 w-full rounded-control border border-border bg-card px-2 text-sm"
          >
            <option value="">Select a category…</option>
            {flatten(categories.data?.data ?? []).map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </Field>

        {suggestions.data && suggestions.data.data.length > 0 ? (
          <aside
            aria-label="Suggested articles"
            className="rounded-control bg-status-info-bg px-4 py-3 text-sm text-status-info-fg"
          >
            <p className="font-medium">These articles may answer it already:</p>
            <ul className="mt-1 space-y-1">
              {suggestions.data.data.map((article) => (
                <li key={article.id}>
                  <Link href={`/kb/${article.slug}`} className="underline underline-offset-4">
                    {article.title}
                  </Link>
                </li>
              ))}
            </ul>
          </aside>
        ) : null}

        <Field
          label="Description"
          htmlFor="description"
          required
          hint="What happened? When did it start? Any error messages?"
        >
          <textarea
            id="description"
            required
            rows={6}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            className="w-full rounded-control border border-border bg-card px-3 py-2 text-sm"
          />
        </Field>

        <Field label="How urgent is this?" htmlFor="requested-priority">
          <select
            id="requested-priority"
            value={requestedPriority}
            onChange={(event) => setRequestedPriority(event.target.value)}
            className="h-9 w-full rounded-control border border-border bg-card px-2 text-sm"
          >
            <option value="">Not sure — let IT decide</option>
            <option value="LOW">Low — minor inconvenience</option>
            <option value="MEDIUM">Medium — slowing me down</option>
            <option value="HIGH">High — blocking my work</option>
            <option value="CRITICAL">Critical — whole team/company affected</option>
          </select>
        </Field>

        <div className="flex items-center gap-2 pt-2">
          <Button type="submit" disabled={createTicket.isPending}>
            {createTicket.isPending ? 'Submitting…' : 'Submit ticket'}
          </Button>
          <Button type="button" variant="ghost" onClick={() => setType(null)}>
            Back
          </Button>
        </div>
      </form>
    </div>
  );
}
