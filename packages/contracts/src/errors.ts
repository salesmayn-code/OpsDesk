import { z } from 'zod';

export const ERROR_CODES = [
  'VALIDATION_FAILED',
  'AUTH_REQUIRED',
  'AUTH_TOKEN_EXPIRED',
  'AUTH_INVALID_CREDENTIALS',
  'FORBIDDEN',
  'ACCOUNT_NOT_ACTIVE',
  'ACCOUNT_LOCKED',
  'TICKET_NOT_FOUND',
  'INCIDENT_NOT_FOUND',
  'INCIDENT_INVALID_TRANSITION',
  'POSTMORTEM_REQUIRED',
  'CHANGE_NOT_FOUND',
  'CHANGE_INVALID_TRANSITION',
  'CHANGE_NOT_APPROVED',
  'WINDOW_NOT_OPEN',
  'SCHEDULE_CONFLICT',
  'SELF_APPROVAL_FORBIDDEN',
  'PLANS_REQUIRED',
  'CHANGE_ALREADY_DECIDED',
  'WORKFLOW_NOT_FOUND',
  'TASK_NOT_FOUND',
  'TEMPLATE_NOT_FOUND',
  'WORKFLOW_INVALID_TRANSITION',
  'TASK_SKIP_REASON_REQUIRED',
  'ARTICLE_NOT_FOUND',
  'ARTICLE_INVALID_TRANSITION',
  'ARTICLE_NOT_PUBLISHED',
  'REPORT_NOT_FOUND',
  'USER_NOT_FOUND',
  'TEAM_NOT_FOUND',
  'DEPARTMENT_NOT_FOUND',
  'CATEGORY_NOT_FOUND',
  'ASSET_NOT_FOUND',
  'ATTACHMENT_NOT_FOUND',
  'SLA_POLICY_NOT_FOUND',
  'COMMENT_NOT_FOUND',
  'NOT_FOUND',
  'CONFLICT',
  'CONFLICT_STALE_VERSION',
  'ASSET_ALREADY_ASSIGNED',
  'ASSET_NOT_ASSIGNABLE',
  'ASSET_INVALID_TRANSITION',
  'EMAIL_TAKEN',
  'TICKET_INVALID_TRANSITION',
  'ASSIGNEE_NOT_IN_TEAM',
  'ASSET_IN_USE',
  'DEPARTMENT_HAS_MEMBERS',
  'TEAM_HAS_TICKETS',
  'RESOLUTION_REQUIRED',
  'REOPEN_WINDOW_EXPIRED',
  'TICKET_READ_ONLY',
  'ATTACHMENT_TOO_LARGE',
  'ATTACHMENT_TYPE_NOT_ALLOWED',
  'ATTACHMENT_LIMIT_REACHED',
  'RATE_LIMITED',
  'INTERNAL_ERROR',
] as const;

export const errorCodeSchema = z.enum(ERROR_CODES);
export type ErrorCode = z.infer<typeof errorCodeSchema>;

export const errorDetailSchema = z.object({
  field: z.string(),
  issue: z.string(),
});
export type ErrorDetail = z.infer<typeof errorDetailSchema>;

export const apiErrorSchema = z.object({
  statusCode: z.number().int(),
  code: errorCodeSchema,
  message: z.string(),
  details: z.array(errorDetailSchema).optional(),
  requestId: z.string(),
});
export type ApiError = z.infer<typeof apiErrorSchema>;
