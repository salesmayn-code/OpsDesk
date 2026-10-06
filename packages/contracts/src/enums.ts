import { z } from 'zod';

export const userStatusSchema = z.enum(['INVITED', 'ACTIVE', 'SUSPENDED', 'DISABLED']);
export type UserStatus = z.infer<typeof userStatusSchema>;

export const authTokenTypeSchema = z.enum([
  'PASSWORD_RESET',
  'INVITATION',
  'EMAIL_VERIFICATION',
]);
export type AuthTokenType = z.infer<typeof authTokenTypeSchema>;

export const ticketTypeSchema = z.enum([
  'INCIDENT',
  'SERVICE_REQUEST',
  'ACCESS_REQUEST',
  'HARDWARE_REQUEST',
  'SOFTWARE_REQUEST',
]);
export type TicketType = z.infer<typeof ticketTypeSchema>;

export const ticketStatusSchema = z.enum([
  'NEW',
  'TRIAGED',
  'ASSIGNED',
  'IN_PROGRESS',
  'WAITING_FOR_USER',
  'ESCALATED',
  'RESOLVED',
  'REOPENED',
  'CLOSED',
  'CANCELLED',
]);
export type TicketStatus = z.infer<typeof ticketStatusSchema>;

export const prioritySchema = z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);
export type Priority = z.infer<typeof prioritySchema>;

export const commentVisibilitySchema = z.enum(['PUBLIC', 'INTERNAL']);
export type CommentVisibility = z.infer<typeof commentVisibilitySchema>;

export const ticketEventTypeSchema = z.enum([
  'CREATED',
  'UPDATED',
  'STATUS_CHANGED',
  'PRIORITY_CHANGED',
  'CATEGORY_CHANGED',
  'ASSIGNED',
  'REASSIGNED',
  'UNASSIGNED',
  'COMMENT_ADDED',
  'INTERNAL_NOTE_ADDED',
  'ATTACHMENT_ADDED',
  'ATTACHMENT_REMOVED',
  'SLA_APPLIED',
  'SLA_CHANGED',
  'SLA_BREACHED',
  'ASSET_LINKED',
  'ASSET_UNLINKED',
  'INCIDENT_LINKED',
  'INCIDENT_UNLINKED',
  'ARTICLE_LINKED',
  'RESOLVED',
  'REOPENED',
  'CLOSED',
  'CANCELLED',
  'WATCHER_ADDED',
]);
export type TicketEventType = z.infer<typeof ticketEventTypeSchema>;

export const slaTimerKindSchema = z.enum(['RESPONSE', 'RESOLUTION']);
export type SlaTimerKind = z.infer<typeof slaTimerKindSchema>;

export const slaStateSchema = z.enum([
  'ON_TRACK',
  'AT_RISK',
  'BREACHED',
  'PAUSED',
  'COMPLETED',
  'CANCELLED',
]);
export type SlaState = z.infer<typeof slaStateSchema>;

export const slaEventTypeSchema = z.enum([
  'STARTED',
  'PAUSED',
  'RESUMED',
  'WARNING',
  'ESCALATED',
  'BREACHED',
  'COMPLETED',
  'RECALCULATED',
  'CANCELLED',
]);
export type SlaEventType = z.infer<typeof slaEventTypeSchema>;

export const assetStatusSchema = z.enum([
  'PROCURED',
  'IN_STOCK',
  'ASSIGNED',
  'IN_REPAIR',
  'LOST',
  'RETIRED',
  'DISPOSED',
]);
export type AssetStatus = z.infer<typeof assetStatusSchema>;

export const assetEventTypeSchema = z.enum([
  'CREATED',
  'RECEIVED',
  'ASSIGNED',
  'REASSIGNED',
  'UNASSIGNED',
  'SENT_TO_REPAIR',
  'RETURNED_FROM_REPAIR',
  'MARKED_LOST',
  'FOUND',
  'RETIRED',
  'DISPOSED',
  'UPDATED',
  'TICKET_LINKED',
]);
export type AssetEventType = z.infer<typeof assetEventTypeSchema>;

export const notificationTypeSchema = z.enum([
  'TICKET_ASSIGNED',
  'TICKET_STATUS_CHANGED',
  'TICKET_COMMENT_ADDED',
  'TICKET_RESOLVED',
  'SLA_WARNING',
  'SLA_ESCALATION',
  'SLA_BREACHED',
  'ASSET_ASSIGNED',
  'ASSET_WARRANTY_EXPIRING',
  'INCIDENT_DECLARED',
  'INCIDENT_UPDATED',
  'CHANGE_APPROVAL_REQUESTED',
  'CHANGE_DECIDED',
  'WORKFLOW_TASK_ASSIGNED',
  'MENTION',
]);
export type NotificationType = z.infer<typeof notificationTypeSchema>;

export const warrantyStateSchema = z.enum(['active', 'expiring', 'expired']);
export type WarrantyState = z.infer<typeof warrantyStateSchema>;

export const ticketViewSchema = z.enum(['mine', 'team', 'unassigned', 'all']);
export type TicketView = z.infer<typeof ticketViewSchema>;
