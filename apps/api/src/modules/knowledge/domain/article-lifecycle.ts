import type { ArticleStatus } from '@opsdesk/contracts';

/** Pure article lifecycle (TRD §6, KB-2). */
export type ArticleDenialCode = 'ARTICLE_INVALID_TRANSITION' | 'FORBIDDEN';

export interface ArticleRule {
  from: ArticleStatus[];
  to: ArticleStatus;
  permissions: string[];
}

export const ARTICLE_RULES: readonly ArticleRule[] = [
  { from: ['DRAFT'], to: 'REVIEW', permissions: ['kb:create'] },
  { from: ['REVIEW'], to: 'PUBLISHED', permissions: ['kb:publish'] },
  { from: ['REVIEW'], to: 'DRAFT', permissions: ['kb:publish'] },
  { from: ['DRAFT'], to: 'ARCHIVED', permissions: ['kb:create'] },
  { from: ['PUBLISHED'], to: 'ARCHIVED', permissions: ['kb:publish'] },
];

export type ArticleDecision = { ok: true; rule: ArticleRule } | { ok: false; code: ArticleDenialCode };

export function canArticleTransition(
  from: ArticleStatus,
  to: ArticleStatus,
  permissions: readonly string[],
): ArticleDecision {
  const rule = ARTICLE_RULES.find((entry) => entry.from.includes(from) && entry.to === to);
  if (!rule) return { ok: false, code: 'ARTICLE_INVALID_TRANSITION' };
  if (!rule.permissions.some((permission) => permissions.includes(permission))) {
    return { ok: false, code: 'FORBIDDEN' };
  }
  return { ok: true, rule };
}
