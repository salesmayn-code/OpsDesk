import { z } from 'zod';
import { uuidSchema } from './common';
import { paginationQuerySchema } from './pagination';

export const articleStatusSchema = z.enum(['DRAFT', 'REVIEW', 'PUBLISHED', 'ARCHIVED']);
export type ArticleStatus = z.infer<typeof articleStatusSchema>;

export const createArticleSchema = z.strictObject({
  title: z.string().min(5).max(200),
  summary: z.string().max(500).optional(),
  content: z.string().min(1).max(100000),
  categoryId: uuidSchema.optional(),
  reviewerId: uuidSchema.optional(),
});
export type CreateArticleInput = z.infer<typeof createArticleSchema>;

export const updateArticleSchema = z.strictObject({
  version: z.number().int(),
  title: z.string().min(5).max(200).optional(),
  summary: z.string().max(500).nullable().optional(),
  content: z.string().min(1).max(100000).optional(),
  categoryId: uuidSchema.nullable().optional(),
  reviewerId: uuidSchema.nullable().optional(),
});
export type UpdateArticleInput = z.infer<typeof updateArticleSchema>;

export const articleTransitionSchema = z.strictObject({
  version: z.number().int(),
  to: articleStatusSchema,
  note: z.string().max(2000).optional(),
});
export type ArticleTransitionInput = z.infer<typeof articleTransitionSchema>;

export const articleQuerySchema = paginationQuerySchema.extend({
  q: z.string().max(200).optional(),
  status: articleStatusSchema.optional(),
  categoryId: uuidSchema.optional(),
  sort: z.string().max(60).optional(),
});
export type ArticleQuery = z.infer<typeof articleQuerySchema>;

export const linkArticleSchema = z.strictObject({
  articleId: uuidSchema,
});
export type LinkArticleInput = z.infer<typeof linkArticleSchema>;
