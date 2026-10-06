import { z } from 'zod';
import { uuidSchema } from './common';
import { paginationQuerySchema } from './pagination';

export const changeTypeSchema = z.enum(['STANDARD', 'NORMAL', 'EMERGENCY']);
export type ChangeType = z.infer<typeof changeTypeSchema>;

export const changeRiskSchema = z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);
export type ChangeRisk = z.infer<typeof changeRiskSchema>;

export const changeStatusSchema = z.enum([
  'DRAFT',
  'SUBMITTED',
  'UNDER_REVIEW',
  'APPROVED',
  'REJECTED',
  'SCHEDULED',
  'IMPLEMENTING',
  'VALIDATING',
  'COMPLETED',
  'FAILED',
  'ROLLED_BACK',
  'CLOSED',
  'CANCELLED',
]);
export type ChangeStatus = z.infer<typeof changeStatusSchema>;

export const approvalDecisionSchema = z.enum(['APPROVED', 'REJECTED', 'REQUEST_CHANGES']);
export type ApprovalDecision = z.infer<typeof approvalDecisionSchema>;

export const createChangeSchema = z.strictObject({
  title: z.string().min(5).max(200),
  description: z.string().min(1).max(20000),
  type: changeTypeSchema,
  risk: changeRiskSchema,
  ownerId: uuidSchema.optional(),
  teamId: uuidSchema.optional(),
  incidentId: uuidSchema.optional(),
  serviceIds: z.array(uuidSchema).max(20).optional(),
  scheduledStart: z.iso.datetime().optional(),
  scheduledEnd: z.iso.datetime().optional(),
  implementationPlan: z.string().max(20000).optional(),
  validationPlan: z.string().max(20000).optional(),
  rollbackPlan: z.string().max(20000).optional(),
  impactAnalysis: z.string().max(10000).optional(),
});
export type CreateChangeInput = z.infer<typeof createChangeSchema>;

export const updateChangeSchema = z.strictObject({
  version: z.number().int(),
  title: z.string().min(5).max(200).optional(),
  description: z.string().min(1).max(20000).optional(),
  risk: changeRiskSchema.optional(),
  ownerId: uuidSchema.nullable().optional(),
  teamId: uuidSchema.nullable().optional(),
  incidentId: uuidSchema.nullable().optional(),
  serviceIds: z.array(uuidSchema).max(20).optional(),
  scheduledStart: z.iso.datetime().nullable().optional(),
  scheduledEnd: z.iso.datetime().nullable().optional(),
  implementationPlan: z.string().max(20000).nullable().optional(),
  validationPlan: z.string().max(20000).nullable().optional(),
  rollbackPlan: z.string().max(20000).nullable().optional(),
  impactAnalysis: z.string().max(10000).nullable().optional(),
  outcomeNotes: z.string().max(10000).nullable().optional(),
});
export type UpdateChangeInput = z.infer<typeof updateChangeSchema>;

export const changeTransitionSchema = z.strictObject({
  version: z.number().int(),
  to: changeStatusSchema,
  note: z.string().max(5000).optional(),
});
export type ChangeTransitionInput = z.infer<typeof changeTransitionSchema>;

export const recordApprovalSchema = z.strictObject({
  decision: approvalDecisionSchema,
  comment: z.string().max(2000).optional(),
});
export type RecordApprovalInput = z.infer<typeof recordApprovalSchema>;

export const changeApprovalRuleSchema = z.strictObject({
  type: changeTypeSchema,
  risk: changeRiskSchema,
  requiredApprovals: z.number().int().min(0).max(5),
  approverRoleKey: z.string().max(50),
  requiresAdmin: z.boolean().default(false),
});
export type ChangeApprovalRule = z.infer<typeof changeApprovalRuleSchema>;

export const putChangeApprovalRulesSchema = z.strictObject({
  rules: z.array(changeApprovalRuleSchema).min(1).max(12),
});
export type PutChangeApprovalRulesInput = z.infer<typeof putChangeApprovalRulesSchema>;

export const changeQuerySchema = paginationQuerySchema.extend({
  q: z.string().max(200).optional(),
  status: z.string().max(300).optional(),
  type: z.string().max(100).optional(),
  risk: z.string().max(100).optional(),
  ownerId: uuidSchema.optional(),
  requesterId: uuidSchema.optional(),
  serviceId: uuidSchema.optional(),
  sort: z.string().max(60).optional(),
});
export type ChangeQuery = z.infer<typeof changeQuerySchema>;
