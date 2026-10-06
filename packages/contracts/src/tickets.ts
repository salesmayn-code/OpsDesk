import { z } from 'zod';
import {
  commentVisibilitySchema,
  prioritySchema,
  slaStateSchema,
  ticketEventTypeSchema,
  ticketStatusSchema,
  ticketTypeSchema,
  slaTimerKindSchema,
} from './enums';
import { paginationQuerySchema } from './pagination';
import { csvEnum, uuidSchema } from './common';

export const userRefSchema = z.object({
  id: z.uuid(),
  firstName: z.string(),
  lastName: z.string(),
  email: z.string(),
});
export type UserRef = z.infer<typeof userRefSchema>;

export const teamRefSchema = z.object({
  id: z.uuid(),
  name: z.string(),
});
export type TeamRef = z.infer<typeof teamRefSchema>;

export const slaTimerSchema = z.object({
  id: z.uuid(),
  ticketId: z.uuid(),
  kind: slaTimerKindSchema,
  state: slaStateSchema,
  targetMinutes: z.number().int(),
  startedAt: z.string(),
  dueAt: z.string(),
  warnAt: z.string(),
  escalateAt: z.string(),
  pausedAt: z.string().nullable(),
  pausedMinutes: z.number().int(),
  warnedAt: z.string().nullable(),
  escalatedAt: z.string().nullable(),
  breachedAt: z.string().nullable(),
  completedAt: z.string().nullable(),
  cancelledAt: z.string().nullable(),
  isCurrent: z.boolean(),
});
export type SlaTimer = z.infer<typeof slaTimerSchema>;

export const ticketSummarySchema = z.object({
  id: z.uuid(),
  key: z.string(),
  title: z.string(),
  type: ticketTypeSchema,
  status: ticketStatusSchema,
  priority: prioritySchema,
  requestedPriority: prioritySchema.nullable(),
  categoryId: uuidSchema.nullable(),
  subcategoryId: uuidSchema.nullable(),
  requester: userRefSchema,
  assignee: userRefSchema.nullable(),
  team: teamRefSchema.nullable(),
  assetId: uuidSchema.nullable(),
  slaState: slaStateSchema.nullable(),
  firstResponseAt: z.string().nullable(),
  dueAt: z.string().nullable(),
  resolvedAt: z.string().nullable(),
  closedAt: z.string().nullable(),
  cancelledAt: z.string().nullable(),
  version: z.number().int(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type TicketSummary = z.infer<typeof ticketSummarySchema>;

export const ticketPermissionsSchema = z.object({
  can: z.record(z.string(), z.boolean()),
});
export type TicketPermissions = z.infer<typeof ticketPermissionsSchema>;

export const ticketDetailSchema = ticketSummarySchema.extend({
  description: z.string(),
  createdById: uuidSchema,
  departmentId: uuidSchema.nullable(),
  slaPolicyId: uuidSchema.nullable(),
  resolutionCodeId: uuidSchema.nullable(),
  resolutionSummary: z.string().nullable(),
  reopenCount: z.number().int(),
  can: z.record(z.string(), z.boolean()).optional(),
  allowedTransitions: z.array(ticketStatusSchema).optional(),
  asset: z
    .object({ id: z.uuid(), tag: z.string(), name: z.string(), status: z.string() })
    .nullable()
    .optional(),
  slaTimers: z.array(slaTimerSchema).optional(),
  incident: z
    .object({ id: z.uuid(), key: z.string(), title: z.string(), status: z.string(), severity: z.string() })
    .nullable()
    .optional(),
});
export type TicketDetail = z.infer<typeof ticketDetailSchema>;

export const createTicketSchema = z.strictObject({
  title: z.string().min(5).max(200),
  description: z.string().min(1).max(20000),
  type: ticketTypeSchema,
  categoryId: uuidSchema.optional(),
  subcategoryId: uuidSchema.optional(),
  requestedPriority: prioritySchema.optional(),
  assetId: uuidSchema.optional(),
  requesterId: uuidSchema.optional(),
  teamId: uuidSchema.optional(),
  assigneeId: uuidSchema.optional(),
});
export type CreateTicketInput = z.infer<typeof createTicketSchema>;

export const updateTicketSchema = z.strictObject({
  version: z.number().int(),
  title: z.string().min(5).max(200).optional(),
  description: z.string().min(1).max(20000).optional(),
  priority: prioritySchema.optional(),
  type: ticketTypeSchema.optional(),
  categoryId: uuidSchema.nullable().optional(),
  subcategoryId: uuidSchema.nullable().optional(),
  assetId: uuidSchema.nullable().optional(),
});
export type UpdateTicketInput = z.infer<typeof updateTicketSchema>;

export const ticketResolutionSchema = z.strictObject({
  code: z.string().min(1).max(40),
  summary: z.string().min(1).max(5000),
});
export type TicketResolution = z.infer<typeof ticketResolutionSchema>;

export const transitionTicketSchema = z.strictObject({
  version: z.number().int(),
  to: ticketStatusSchema,
  reason: z.string().max(2000).optional(),
  resolution: ticketResolutionSchema.optional(),
});
export type TransitionTicketInput = z.infer<typeof transitionTicketSchema>;

export const assignTicketSchema = z.strictObject({
  version: z.number().int(),
  teamId: uuidSchema.nullable().optional(),
  assigneeId: uuidSchema.nullable().optional(),
  note: z.string().max(1000).optional(),
});
export type AssignTicketInput = z.infer<typeof assignTicketSchema>;

export const ticketQuerySchema = paginationQuerySchema.extend({
  q: z.string().max(200).optional(),
  status: csvEnum(['NEW', 'TRIAGED', 'ASSIGNED', 'IN_PROGRESS', 'WAITING_FOR_USER', 'ESCALATED', 'RESOLVED', 'REOPENED', 'CLOSED', 'CANCELLED']).optional(),
  priority: csvEnum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
  type: csvEnum(['INCIDENT', 'SERVICE_REQUEST', 'ACCESS_REQUEST', 'HARDWARE_REQUEST', 'SOFTWARE_REQUEST']).optional(),
  categoryId: uuidSchema.optional(),
  teamId: uuidSchema.optional(),
  assigneeId: uuidSchema.optional(),
  requesterId: uuidSchema.optional(),
  departmentId: uuidSchema.optional(),
  assetId: uuidSchema.optional(),
  slaState: csvEnum(['ON_TRACK', 'AT_RISK', 'BREACHED', 'PAUSED', 'COMPLETED', 'CANCELLED']).optional(),
  createdFrom: z.iso.datetime().optional(),
  createdTo: z.iso.datetime().optional(),
  updatedFrom: z.iso.datetime().optional(),
  updatedTo: z.iso.datetime().optional(),
  view: z.enum(['mine', 'team', 'unassigned', 'all']).optional(),
  sort: z.string().max(60).optional(),
});
export type TicketQuery = z.infer<typeof ticketQuerySchema>;

export const createCommentSchema = z.strictObject({
  body: z.string().min(1).max(10000),
  visibility: commentVisibilitySchema.default('PUBLIC'),
});
export type CreateCommentInput = z.infer<typeof createCommentSchema>;

export const updateCommentSchema = z.strictObject({
  body: z.string().min(1).max(10000),
});
export type UpdateCommentInput = z.infer<typeof updateCommentSchema>;

export const commentSchema = z.object({
  id: z.uuid(),
  ticketId: z.uuid(),
  author: userRefSchema,
  visibility: commentVisibilitySchema,
  body: z.string(),
  editedAt: z.string().nullable(),
  createdAt: z.string(),
});
export type Comment = z.infer<typeof commentSchema>;

export const ticketEventSchema = z.object({
  id: z.uuid(),
  ticketId: z.uuid(),
  actor: userRefSchema.nullable(),
  type: ticketEventTypeSchema,
  fromValue: z.string().nullable(),
  toValue: z.string().nullable(),
  metadata: z.record(z.string(), z.unknown()).nullable(),
  isInternal: z.boolean(),
  createdAt: z.string(),
});
export type TicketEvent = z.infer<typeof ticketEventSchema>;

export const attachmentSchema = z.object({
  id: z.uuid(),
  ticketId: z.uuid(),
  uploadedById: uuidSchema,
  originalName: z.string(),
  mimeType: z.string(),
  sizeBytes: z.number().int(),
  isInternal: z.boolean(),
  createdAt: z.string(),
});
export type Attachment = z.infer<typeof attachmentSchema>;

export const watcherInputSchema = z.strictObject({
  userId: uuidSchema.optional(),
});
export type WatcherInput = z.infer<typeof watcherInputSchema>;
