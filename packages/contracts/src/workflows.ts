import { z } from 'zod';
import { uuidSchema } from './common';
import { paginationQuerySchema } from './pagination';

export const workflowKindSchema = z.enum(['ONBOARDING', 'OFFBOARDING']);
export type WorkflowKind = z.infer<typeof workflowKindSchema>;

export const workflowStatusSchema = z.enum(['OPEN', 'COMPLETED', 'CANCELLED']);
export type WorkflowStatus = z.infer<typeof workflowStatusSchema>;

export const taskStatusSchema = z.enum(['PENDING', 'IN_PROGRESS', 'BLOCKED', 'COMPLETED', 'SKIPPED']);
export type TaskStatus = z.infer<typeof taskStatusSchema>;

export const templateTaskSchema = z.strictObject({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  ownerTeamId: uuidSchema.optional(),
  ownerRoleKey: z.string().max(50).optional(),
  offsetDays: z.number().int().min(-30).max(90).default(0),
  required: z.boolean().default(true),
  kind: z.enum(['GENERIC', 'ASSET_RECOVERY']).default('GENERIC'),
});
export type TemplateTask = z.infer<typeof templateTaskSchema>;

export const createWorkflowTemplateSchema = z.strictObject({
  kind: workflowKindSchema,
  name: z.string().min(1).max(120),
  departmentId: uuidSchema.nullable().optional(),
  tasks: z.array(templateTaskSchema).min(1).max(50),
  isActive: z.boolean().optional(),
});
export type CreateWorkflowTemplateInput = z.infer<typeof createWorkflowTemplateSchema>;

export const updateWorkflowTemplateSchema = z.strictObject({
  name: z.string().min(1).max(120).optional(),
  departmentId: uuidSchema.nullable().optional(),
  tasks: z.array(templateTaskSchema).min(1).max(50).optional(),
  isActive: z.boolean().optional(),
});
export type UpdateWorkflowTemplateInput = z.infer<typeof updateWorkflowTemplateSchema>;

export const createWorkflowRequestSchema = z.strictObject({
  subjectUserId: uuidSchema,
  effectiveDate: z.iso.date(),
  managerId: uuidSchema.nullable().optional(),
  departmentId: uuidSchema.nullable().optional(),
  templateId: uuidSchema.optional(),
  notes: z.string().max(5000).optional(),
  disableAccountOnComplete: z.boolean().default(true),
});
export type CreateWorkflowRequestInput = z.infer<typeof createWorkflowRequestSchema>;

export const workflowQuerySchema = paginationQuerySchema.extend({
  status: z.string().max(100).optional(),
  subjectUserId: uuidSchema.optional(),
  departmentId: uuidSchema.optional(),
  sort: z.string().max(60).optional(),
});
export type WorkflowQuery = z.infer<typeof workflowQuerySchema>;

export const taskTransitionSchema = z.strictObject({
  version: z.number().int(),
  to: taskStatusSchema,
  reason: z.string().max(1000).optional(),
  notes: z.string().max(2000).optional(),
});
export type TaskTransitionInput = z.infer<typeof taskTransitionSchema>;

export const updateWorkflowTaskSchema = z.strictObject({
  version: z.number().int(),
  ownerUserId: uuidSchema.nullable().optional(),
  ownerTeamId: uuidSchema.nullable().optional(),
  dueDate: z.iso.date().nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});
export type UpdateWorkflowTaskInput = z.infer<typeof updateWorkflowTaskSchema>;
