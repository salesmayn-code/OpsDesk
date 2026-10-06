'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import type { ArticleStatus } from '@opsdesk/contracts';
import { useAuth } from '@/lib/auth-context';
import { BookOpen } from 'lucide-react';
import { useArticles } from '@/features/knowledge/hooks';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/empty-state';
import { Input } from '@/components/ui/field';
import { relativeTime } from '@/lib/format';

const STATUS_TONES: Record<ArticleStatus, string> = {
  DRAFT: 'bg-status-neutral-bg text-status-neutral-fg',
  REVIEW: 'bg-status-waiting-bg text-status-waiting-fg',
  PUBLISHED: 'bg-status-success-bg text-status-success-fg',
  ARCHIVED: 'bg-status-muted-bg text-status-muted-fg',
};

function KnowledgeView() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { can } = useAuth();
  const [searchDraft, setSearchDraft] = useState(searchParams.get('q') ?? '');

  const q = searchParams.get('q') ?? '';
  const status = searchParams.get('status') ?? '';

  const query = new URLSearchParams();
  if (q) query.set('q', q);
  if (status) query.set('status', status);
  query.set('pageSize', '50');

  const { data, isLoading, isError } = useArticles(query.toString());

  const setParams = (updates: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(updates)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    router.replace(`${pathname}?${params.toString()}`);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-display font-semibold tracking-tight">Knowledge base</h1>
        {can('kb:create') ? (
          <Link href="/kb/new">
            <Button>New article</Button>
          </Link>
        ) : null}
      </div>

      <form
        role="search"
        className="flex flex-wrap items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          setParams({ q: searchDraft || null });
        }}
      >
        <label htmlFor="kb-search" className="sr-only">
          Search articles
        </label>
        <Input
          id="kb-search"
          value={searchDraft}
          onChange={(event) => setSearchDraft(event.target.value)}
          placeholder="Search articles…"
          className="max-w-xs"
        />
        <Button type="submit" variant="outline">
          Search
        </Button>
        {can('kb:create') ? (
          <>
            <label htmlFor="kb-status" className="sr-only">
              Filter by status
            </label>
            <select
              id="kb-status"
              value={status}
              onChange={(event) => setParams({ status: event.target.value || null })}
              className="h-9 rounded-control border border-border bg-card px-2 text-sm"
            >
              <option value="">Any status</option>
              <option value="DRAFT">Draft</option>
              <option value="REVIEW">In review</option>
              <option value="PUBLISHED">Published</option>
              <option value="ARCHIVED">Archived</option>
            </select>
          </>
        ) : null}
      </form>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading articles…</p>
      ) : isError ? (
        <p role="alert" className="text-sm text-status-danger-fg">
          Could not load articles.
        </p>
      ) : (data?.data ?? []).length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title="No articles found"
          description="Try a different search, or raise a ticket and we'll document the fix."
          action={{ href: '/tickets/new', label: 'Submit a request' }}
        />
      ) : (
        <ul className="space-y-3">
          {data!.data.map((article) => (
            <li key={article.id} className="rounded-card border border-border bg-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <Link
                    href={`/kb/${article.slug}`}
                    className="text-title font-semibold hover:underline"
                  >
                    {article.title}
                  </Link>
                  {article.summary ? (
                    <p className="mt-1 text-sm text-muted-foreground">{article.summary}</p>
                  ) : null}
                  <p className="mt-1 text-xs text-muted-foreground">
                    {article.viewCount} views · updated {relativeTime(article.updatedAt)}
                  </p>
                </div>
                <span
                  className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_TONES[article.status]}`}
                >
                  {article.status.toLowerCase()}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function KnowledgePage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Loading articles…</p>}>
      <KnowledgeView />
    </Suspense>
  );
}
