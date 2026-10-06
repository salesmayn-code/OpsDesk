import { z } from 'zod';
import { assetStatusSchema, assetEventTypeSchema, warrantyStateSchema } from './enums';
import { paginationQuerySchema } from './pagination';
import { csvEnum, uuidSchema } from './common';

export const assetTypeRefSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  tagPrefix: z.string(),
});
export type AssetTypeRef = z.infer<typeof assetTypeRefSchema>;

export const assetSummarySchema = z.object({
  id: z.uuid(),
  tag: z.string(),
  name: z.string(),
  type: assetTypeRefSchema,
  status: assetStatusSchema,
  manufacturer: z.string().nullable(),
  model: z.string().nullable(),
  serialNumber: z.string().nullable(),
  purchaseDate: z.string().nullable(),
  purchaseCost: z.string().nullable(),
  warrantyExpiry: z.string().nullable(),
  warrantyState: warrantyStateSchema.nullable(),
  locationId: uuidSchema.nullable(),
  departmentId: uuidSchema.nullable(),
  currentAssignee: z
    .object({ id: z.uuid(), firstName: z.string(), lastName: z.string(), email: z.string() })
    .nullable(),
  version: z.number().int(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type AssetSummary = z.infer<typeof assetSummarySchema>;

export const assetDetailSchema = assetSummarySchema.extend({
  vendorId: uuidSchema.nullable(),
  notes: z.string().nullable(),
  disposalMethod: z.string().nullable(),
});
export type AssetDetail = z.infer<typeof assetDetailSchema>;

export const createAssetSchema = z.strictObject({
  tag: z.string().min(3).max(20).optional(),
  typeId: uuidSchema,
  name: z.string().min(1).max(150),
  manufacturer: z.string().max(100).optional(),
  model: z.string().max(100).optional(),
  serialNumber: z.string().max(100).optional(),
  purchaseDate: z.iso.date().optional(),
  purchaseCost: z.coerce.number().min(0).optional(),
  warrantyExpiry: z.iso.date().optional(),
  vendorId: uuidSchema.optional(),
  locationId: uuidSchema.optional(),
  departmentId: uuidSchema.optional(),
  notes: z.string().max(5000).optional(),
});
export type CreateAssetInput = z.infer<typeof createAssetSchema>;

export const updateAssetSchema = z.strictObject({
  version: z.number().int(),
  name: z.string().min(1).max(150).optional(),
  manufacturer: z.string().max(100).nullable().optional(),
  model: z.string().max(100).nullable().optional(),
  serialNumber: z.string().max(100).nullable().optional(),
  purchaseDate: z.iso.date().nullable().optional(),
  purchaseCost: z.coerce.number().min(0).nullable().optional(),
  warrantyExpiry: z.iso.date().nullable().optional(),
  vendorId: uuidSchema.nullable().optional(),
  locationId: uuidSchema.nullable().optional(),
  departmentId: uuidSchema.nullable().optional(),
  notes: z.string().max(5000).nullable().optional(),
});
export type UpdateAssetInput = z.infer<typeof updateAssetSchema>;

export const assignAssetSchema = z.strictObject({
  version: z.number().int(),
  userId: uuidSchema,
  note: z.string().max(1000).optional(),
});
export type AssignAssetInput = z.infer<typeof assignAssetSchema>;

export const unassignAssetSchema = z.strictObject({
  version: z.number().int(),
  note: z.string().max(1000).optional(),
  condition: z.string().max(50).optional(),
});
export type UnassignAssetInput = z.infer<typeof unassignAssetSchema>;

export const assetTransitionSchema = z.strictObject({
  version: z.number().int(),
  to: assetStatusSchema,
  note: z.string().max(2000).optional(),
  disposalMethod: z.string().max(100).optional(),
});
export type AssetTransitionInput = z.infer<typeof assetTransitionSchema>;

export const assetQuerySchema = paginationQuerySchema.extend({
  q: z.string().max(200).optional(),
  typeId: uuidSchema.optional(),
  status: csvEnum(['PROCURED', 'IN_STOCK', 'ASSIGNED', 'IN_REPAIR', 'LOST', 'RETIRED', 'DISPOSED']).optional(),
  departmentId: uuidSchema.optional(),
  assignedUserId: uuidSchema.optional(),
  warranty: warrantyStateSchema.optional(),
  locationId: uuidSchema.optional(),
  sort: z.string().max(60).optional(),
});
export type AssetQuery = z.infer<typeof assetQuerySchema>;

export const assetAssignmentSchema = z.object({
  id: z.uuid(),
  assetId: z.uuid(),
  user: z.object({ id: z.uuid(), firstName: z.string(), lastName: z.string() }),
  assignedAt: z.string(),
  returnedAt: z.string().nullable(),
  returnCondition: z.string().nullable(),
  note: z.string().nullable(),
});
export type AssetAssignment = z.infer<typeof assetAssignmentSchema>;

export const assetEventSchema = z.object({
  id: z.uuid(),
  assetId: z.uuid(),
  actorId: uuidSchema.nullable(),
  type: assetEventTypeSchema,
  fromValue: z.string().nullable(),
  toValue: z.string().nullable(),
  metadata: z.record(z.string(), z.unknown()).nullable(),
  createdAt: z.string(),
});
export type AssetEvent = z.infer<typeof assetEventSchema>;
