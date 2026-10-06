import { z } from 'zod';
import { uuidSchema } from './common';

const categoryBaseSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  parentId: uuidSchema.nullable(),
  defaultTeamId: uuidSchema.nullable(),
  description: z.string().nullable(),
  sortOrder: z.number().int(),
  isActive: z.boolean(),
});

export type Category = z.infer<typeof categoryBaseSchema> & { children?: Category[] };

export const categorySchema: z.ZodType<Category> = categoryBaseSchema.extend({
  children: z.array(z.lazy(() => categorySchema)).optional(),
});

export const createCategorySchema = z.strictObject({
  name: z.string().min(1).max(100),
  parentId: uuidSchema.nullable().optional(),
  defaultTeamId: uuidSchema.nullable().optional(),
  description: z.string().max(1000).optional(),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
});
export type CreateCategoryInput = z.infer<typeof createCategorySchema>;

export const updateCategorySchema = z.strictObject({
  name: z.string().min(1).max(100).optional(),
  parentId: uuidSchema.nullable().optional(),
  defaultTeamId: uuidSchema.nullable().optional(),
  description: z.string().max(1000).nullable().optional(),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
});
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;

export const resolutionCodeSchema = z.object({
  id: z.uuid(),
  code: z.string(),
  label: z.string(),
  isActive: z.boolean(),
});
export type ResolutionCode = z.infer<typeof resolutionCodeSchema>;

export const assetTypeSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  tagPrefix: z.string(),
  isActive: z.boolean(),
});
export type AssetType = z.infer<typeof assetTypeSchema>;

export const createAssetTypeSchema = z.strictObject({
  name: z.string().min(1).max(80),
  tagPrefix: z.string().min(2).max(6).toUpperCase(),
});
export type CreateAssetTypeInput = z.infer<typeof createAssetTypeSchema>;
