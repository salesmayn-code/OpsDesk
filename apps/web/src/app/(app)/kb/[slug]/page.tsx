'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import type { ArticleStatus } from '@opsdesk/contracts';
import { ApiClientError } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';
import { useArticle, useTransitionArticle, useUpdateArticle } from '@/features/knowledge/hooks';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/field';
import { MarkdownPreview } from '@/components/markdown';
import { formatDateTime } from '@/lib/format';

const TRANSITION_LABELS: Partial<Record<ArticleStatus, string>> = {
  REVIEW: 'Submit for review',
  PUBLISHED: 'Publish',
  DRAFT: 'Send back to draft',
  ARCHIVED: 'Archive',
};

export default function ArticlePage() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug;
  const { can } = useAuth();
  const articleQuery = useArticle(slug);
  const update = useUpdateArticle(slug);
  const transition = useTransitionArticle(slug);

  const [editing, setEditing] = useState(false);
  const [contentTab, setContentTab] = useState<'write' | 'preview'>('write');
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [content, setContent] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (articleQuery.isLoading) return <p className="text-sm text-muted-foreground">Loading article…</p>;
  if (articleQuery.isError || !articleQuery.data) {
    return (
      <div className="rounded-card border border-border bg-card p-6 text-sm">
        <p role="alert">Article not found.</p>
        <Link href="/kb" className="mt-3 inline-block text-primary hover:underline">
          Back to knowledge base
        </Link>
      </div>
    );
  }

  const article = articleQuery.data.data;
  const canEdit = can('kb:publish') || can('kb:create');
  const onError = (mutationError: unknown) =>
    setError(
      mutationError instanceof ApiClientError ? mutationError.message : 'Something went wrong.',
    );

  const transitions: ArticleStatus[] = [];
  if (article.status === 'DRAFT' && can('kb:create')) transitions.push('REVIEW', 'ARCHIVED');
  if (article.status === 'REVIEW' && can('kb:publish')) transitions.push('PUBLISHED', 'DRAFT');
  if (article.status === 'PUBLISHED' && can('kb:publish')) transitions.push('ARCHIVED');

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <nav aria-label="Breadcrumb" className="text-sm text-muted-foreground">
        <Link href="/kb" className="hover:underline">
          Knowledge base
        </Link>{' '}
        / <span className="font-mono text-xs">{article.slug}</span>
      </nav>

      {error ? (
        <p role="alert" className="rounded-control bg-status-danger-bg px-4 py-3 text-sm text-status-danger-fg">
          {error}
        </p>
      ) : null}

      <article className="rounded-card border border-border bg-card p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-display font-semibold tracking-tight">{article.title}</h1>
            {article.summary ? (
              <p className="mt-1 text-sm text-muted-foreground">{article.summary}</p>
            ) : null}
            <p className="mt-1 text-xs text-muted-foreground">
              {article.status.toLowerCase()} · {article.viewCount} views
              {article.publishedAt ? ` · published ${formatDateTime(article.publishedAt)}` : ''}
            </p>
          </div>
          {canEdit ? (
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setEditing((value) => !value);
                  setTitle(article.title);
                  setSummary(article.summary ?? '');
                  setContent(article.content);
                }}
              >
                {editing ? 'Close editor' : 'Edit'}
              </Button>
              {transitions.map((to) => (
                <Button
                  key={to}
                  size="sm"
                  variant={to === 'PUBLISHED' ? 'primary' : 'outline'}
                  disabled={transition.isPending}
                  onClick={() =>
                    transition.mutate(
                      { id: article.id, version: article.version, to },
                      { onError },
                    )
                  }
                >
                  {TRANSITION_LABELS[to] ?? to}
                </Button>
              ))}
            </div>
          ) : null}
        </div>

        {editing ? (
          <form
            className="mt-5 space-y-3 border-t border-border pt-4"
            onSubmit={(event) => {
              event.preventDefault();
              setError(null);
              update.mutate(
                {
                  id: article.id,
                  version: article.version,
                  title,
                  summary: summary.trim() ? summary : null,
                  content,
                },
                { onSuccess: () => setEditing(false), onError },
              );
            }}
          >
            <Field label="Title" htmlFor="kb-edit-title" required>
              <Input
                id="kb-edit-title"
                required
                minLength={5}
                value={title}
                onChange={(event) => setTitle(event.target.value)}
              />
            </Field>
            <Field label="Summary" htmlFor="kb-edit-summary">
              <Input
                id="kb-edit-summary"
                maxLength={500}
                value={summary}
                onChange={(event) => setSummary(event.target.value)}
              />
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
              <label htmlFor="kb-edit-content" className="sr-only">
                Content (Markdown)
              </label>
              {contentTab === 'write' ? (
                <textarea
                  id="kb-edit-content"
                  required
                  rows={14}
                  value={content}
                  onChange={(event) => setContent(event.target.value)}
                  className="w-full rounded-control border border-border bg-card px-3 py-2 font-mono text-sm"
                />
              ) : (
                <div className="min-h-56 rounded-control border border-border bg-card px-3 py-2">
                  <MarkdownPreview content={content} />
                </div>
              )}
            </div>
            <Button type="submit" size="sm" disabled={update.isPending}>
              {update.isPending ? 'Saving…' : 'Save changes'}
            </Button>
          </form>
        ) : (
          <div className="mt-5 whitespace-pre-wrap text-sm leading-relaxed">{article.content}</div>
        )}
      </article>
    </div>
  );
}
