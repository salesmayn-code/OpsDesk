import { z } from 'zod';

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export const pageMetaSchema = z.object({
  page: z.number().int(),
  pageSize: z.number().int(),
  total: z.number().int(),
  totalPages: z.number().int(),
});
export type PageMeta = z.infer<typeof pageMetaSchema>;

export const cursorQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

export const cursorMetaSchema = z.object({
  nextCursor: z.string().nullable(),
});
export type CursorMeta = z.infer<typeof cursorMetaSchema>;

export function paginatedSchema<T extends z.ZodType>(item: T) {
  return z.object({ data: z.array(item), meta: pageMetaSchema });
}

export function cursorPaginatedSchema<T extends z.ZodType>(item: T) {
  return z.object({ data: z.array(item), meta: cursorMetaSchema });
}
