'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { ApiClientError } from '@/lib/api-client';
import { useCreateArticle } from '@/features/knowledge/hooks';
import { useCategories } from '@/features/tickets/hooks';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/field';
import { MarkdownPreview } from '@/components/markdown';

export default function NewArticlePage() {
  const router = useRouter();
  const categories = useCategories();
  const createArticle = useCreateArticle();

  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [content, setContent] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [contentTab, setContentTab] = useState<'write' | 'preview'>('write');
  const [error, setError] = useState<string | null>(null);

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    createArticle.mutate(
      {
        title,
        content,
        ...(summary.trim() ? { summary } : {}),
        ...(categoryId ? { categoryId } : {}),
      },
      {
        onSuccess: (result) => router.push(`/kb/${result.data.slug}`),
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
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-display font-semibold tracking-tight">New article</h1>
      <form onSubmit={onSubmit} className="space-y-4 rounded-card border border-border bg-card p-6">
        {error ? (
          <p role="alert" className="rounded-control bg-status-danger-bg px-3 py-2 text-sm text-status-danger-fg">
            {error}
          </p>
        ) : null}

        <Field label="Title" htmlFor="kb-title" required>
          <Input
            id="kb-title"
            required
            minLength={5}
            maxLength={200}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
        </Field>

        <Field label="Summary" htmlFor="kb-summary" hint="Shown in search results and suggestions.">
          <Input
            id="kb-summary"
            maxLength={500}
            value={summary}
            onChange={(event) => setSummary(event.target.value)}
          />
        </Field>

        <Field label="Category" htmlFor="kb-category">
          <select
            id="kb-category"
            value={categoryId}
            onChange={(event) => setCategoryId(event.target.value)}
            className="h-9 w-full rounded-control border border-border bg-card px-2 text-sm"
          >
            <option value="">No category</option>
            {(categories.data?.data ?? []).map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </Field>

        <div>
          <div role="tablist" aria-label="Editor mode" className="mb-2 flex gap-1">
            {(['write', 'preview'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                role="tab"
                aria-selected={contentTab === mode}
                onClick={() => setContentTab(mode)}
                className={
                  contentTab === mode
                    ? 'rounded-control bg-card-muted px-3 py-1 text-sm font-medium'
                    : 'rounded-control px-3 py-1 text-sm text-muted-foreground hover:bg-card-muted'
                }
              >
                {mode === 'write' ? 'Write' : 'Preview'}
              </button>
            ))}
          </div>
          <label htmlFor="kb-content" className="sr-only">
            Content (Markdown)
          </label>
          {contentTab === 'write' ? (
            <textarea
              id="kb-content"
              required
              rows={16}
              value={content}
              onChange={(event) => setContent(event.target.value)}
              className="w-full rounded-control border border-border bg-card px-3 py-2 font-mono text-sm"
              placeholder={'## Steps\n1. …'}
            />
          ) : (
            <div className="min-h-64 rounded-control border border-border bg-card px-3 py-2">
              <MarkdownPreview content={content} />
            </div>
          )}
        </div>

        <div className="flex gap-2">
          <Button type="submit" disabled={createArticle.isPending}>
            {createArticle.isPending ? 'Creating…' : 'Create draft'}
          </Button>
        </div>
      </form>
    </div>
  );
}
