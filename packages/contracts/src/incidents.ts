import { z } from 'zod';
import { uuidSchema } from './common';
import { paginationQuerySchema } from './pagination';

export const incidentSeveritySchema = z.enum(['SEV1', 'SEV2', 'SEV3', 'SEV4']);
export type IncidentSeverity = z.infer<typeof incidentSeveritySchema>;

export const incidentStatusSchema = z.enum([
  'IDENTIFIED',
  'INVESTIGATING',
  'ESCALATED',
  'MITIGATING',
  'MONITORING',
  'RESOLVED',
  'CLOSED',
]);
export type IncidentStatus = z.infer<typeof incidentStatusSchema>;

export const incidentEventTypeSchema = z.enum([
  'NOTE',
  'STATUS_CHANGED',
  'SEVERITY_CHANGED',
  'OWNER_CHANGED',
  'COMMANDER_CHANGED',
  'TICKET_LINKED',
  'TICKET_UNLINKED',
  'MITIGATION',
  'ROOT_CAUSE',
  'COMMUNICATION',
  'RESOLVED',
  'CLOSED',
]);
export type IncidentEventType = z.infer<typeof incidentEventTypeSchema>;

export const postmortemStatusSchema = z.enum(['DRAFT', 'IN_REVIEW', 'PUBLISHED']);
export type PostmortemStatus = z.infer<typeof postmortemStatusSchema>;

export const actionItemStatusSchema = z.enum(['OPEN', 'IN_PROGRESS', 'DONE', 'CANCELLED']);
export type ActionItemStatus = z.infer<typeof actionItemStatusSchema>;

export const createIncidentSchema = z.strictObject({
  title: z.string().min(5).max(200),
  description: z.string().min(1).max(20000),
  severity: incidentSeveritySchema,
  serviceId: uuidSchema.optional(),
  impact: z.string().max(5000).optional(),
  teamId: uuidSchema.optional(),
  ownerId: uuidSchema.optional(),
  commanderId: uuidSchema.optional(),
  startedAt: z.iso.datetime().optional(),
  detectedAt: z.iso.datetime().optional(),
  detectionMethod: z.string().max(100).optional(),
});
export type CreateIncidentInput = z.infer<typeof createIncidentSchema>;

export const updateIncidentSchema = z.strictObject({
  version: z.number().int(),
  title: z.string().min(5).max(200).optional(),
  description: z.string().min(1).max(20000).optional(),
  impact: z.string().max(5000).nullable().optional(),
  severity: incidentSeveritySchema.optional(),
  serviceId: uuidSchema.nullable().optional(),
  teamId: uuidSchema.nullable().optional(),
  ownerId: uuidSchema.nullable().optional(),
  commanderId: uuidSchema.nullable().optional(),
  preventiveAction: z.string().max(5000).nullable().optional(),
});
export type UpdateIncidentInput = z.infer<typeof updateIncidentSchema>;

export const incidentTransitionSchema = z.strictObject({
  version: z.number().int(),
  to: incidentStatusSchema,
  reason: z.string().max(2000).optional(),
  rootCause: z.string().min(1).max(10000).optional(),
  mitigation: z.string().min(1).max(10000).optional(),
  impact: z.string().min(1).max(5000).optional(),
  resolution: z.string().min(1).max(10000).optional(),
});
export type IncidentTransitionInput = z.infer<typeof incidentTransitionSchema>;

export const incidentNoteSchema = z.strictObject({
  type: z.enum(['NOTE', 'MITIGATION', 'COMMUNICATION', 'ROOT_CAUSE']).default('NOTE'),
  body: z.string().min(1).max(10000),
  occurredAt: z.iso.datetime().optional(),
});
export type IncidentNoteInput = z.infer<typeof incidentNoteSchema>;

export const linkIncidentTicketsSchema = z.strictObject({
  ticketIds: z.array(uuidSchema).min(1).max(100),
});
export type LinkIncidentTicketsInput = z.infer<typeof linkIncidentTicketsSchema>;

export const notifyRequestersSchema = z.strictObject({
  message: z.string().min(1).max(1000),
});
export type NotifyRequestersInput = z.infer<typeof notifyRequestersSchema>;

export const upsertPostmortemSchema = z.strictObject({
  version: z.number().int().optional(),
  summary: z.string().max(10000).nullable().optional(),
  impact: z.string().max(10000).nullable().optional(),
  timelineSummary: z.string().max(20000).nullable().optional(),
  rootCause: z.string().max(10000).nullable().optional(),
  contributingFactors: z.string().max(10000).nullable().optional(),
  wentWell: z.string().max(10000).nullable().optional(),
  wentWrong: z.string().max(10000).nullable().optional(),
  ownerId: uuidSchema.nullable().optional(),
});
export type UpsertPostmortemInput = z.infer<typeof upsertPostmortemSchema>;

export const createPostmortemActionSchema = z.strictObject({
  kind: z.enum(['CORRECTIVE', 'PREVENTIVE']),
  description: z.string().min(1).max(5000),
  ownerId: uuidSchema.nullable().optional(),
  dueDate: z.iso.date().optional(),
});
export type CreatePostmortemActionInput = z.infer<typeof createPostmortemActionSchema>;

export const updatePostmortemActionSchema = z.strictObject({
  status: actionItemStatusSchema.optional(),
  description: z.string().min(1).max(5000).optional(),
  ownerId: uuidSchema.nullable().optional(),
  dueDate: z.iso.date().nullable().optional(),
});
export type UpdatePostmortemActionInput = z.infer<typeof updatePostmortemActionSchema>;

export const incidentQuerySchema = paginationQuerySchema.extend({
  q: z.string().max(200).optional(),
  status: z.string().max(200).optional(),
  severity: z.string().max(100).optional(),
  serviceId: uuidSchema.optional(),
  teamId: uuidSchema.optional(),
  sort: z.string().max(60).optional(),
});
export type IncidentQuery = z.infer<typeof incidentQuerySchema>;

export const createServiceSchema = z.strictObject({
  name: z.string().min(1).max(120),
  description: z.string().max(2000).optional(),
  ownerTeamId: uuidSchema.nullable().optional(),
});
export type CreateServiceInput = z.infer<typeof createServiceSchema>;
