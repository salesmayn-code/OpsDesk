import type { ArticleStatus, PageMeta } from '@opsdesk/contracts';
import { apiFetch } from '@/lib/api-client';

export interface ArticleSummaryDto {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  categoryId: string | null;
  status: ArticleStatus;
  viewCount: number;
  publishedAt: string | null;
  updatedAt: string;
  version: number;
}

export interface ArticleDetailDto extends ArticleSummaryDto {
  content: string;
  authorId: string;
  reviewerId: string | null;
}

export interface ArticleSuggestionDto {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
}

export function fetchArticles(query: string): Promise<{ data: ArticleSummaryDto[]; meta: PageMeta }> {
  return apiFetch(`/kb/articles${query ? `?${query}` : ''}`);
}

export function fetchArticle(slug: string): Promise<{ data: ArticleDetailDto }> {
  return apiFetch(`/kb/articles/${encodeURIComponent(slug)}`);
}

export function createArticle(input: {
  title: string;
  summary?: string;
  content: string;
  categoryId?: string;
}): Promise<{ data: ArticleDetailDto }> {
  return apiFetch('/kb/articles', { method: 'POST', body: JSON.stringify(input) });
}

export function updateArticle(
  id: string,
  input: { version: number; title?: string; summary?: string | null; content?: string; categoryId?: string | null },
): Promise<{ data: ArticleDetailDto }> {
  return apiFetch(`/kb/articles/${id}`, { method: 'PATCH', body: JSON.stringify(input) });
}

export function transitionArticle(
  id: string,
  input: { version: number; to: ArticleStatus; note?: string },
): Promise<{ data: ArticleDetailDto }> {
  return apiFetch(`/kb/articles/${id}/transitions`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function fetchSuggestions(
  q: string,
  categoryId?: string,
): Promise<{ data: ArticleSuggestionDto[] }> {
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  if (categoryId) params.set('categoryId', categoryId);
  return apiFetch(`/kb/suggest?${params.toString()}`);
}

export function linkArticleToTicket(
  ticketId: string,
  articleId: string,
): Promise<{ data: { id: string; slug: string; title: string } }> {
  return apiFetch(`/tickets/${encodeURIComponent(ticketId)}/articles`, {
    method: 'POST',
    body: JSON.stringify({ articleId }),
  });
}

export function fetchTicketArticles(
  ticketId: string,
): Promise<{ data: { id: string; slug: string; title: string; summary: string | null }[] }> {
  return apiFetch(`/tickets/${encodeURIComponent(ticketId)}/articles`);
}
