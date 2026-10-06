import type { ChangeStatus } from '@opsdesk/contracts';

/**
 * Pure change-management state machine (TRD §6.4). No Nest/Prisma imports.
 * Approval progression is computed by the service (rules + self-approval guard).
 */

export type ChangeDenialCode =
  | 'CHANGE_INVALID_TRANSITION'
  | 'FORBIDDEN'
  | 'PLANS_REQUIRED'
  | 'CHANGE_NOT_APPROVED'
  | 'WINDOW_NOT_OPEN'
  | 'VALIDATION_FAILED';

export interface ChangeTransitionContext {
  permissions: readonly string[];
  isRequester: boolean;
  isOwner: boolean;
  isStandard: boolean;
  plansFilled: boolean;
  scheduleInFuture: boolean;
  isEmergency: boolean;
  requiredApprovalsMet: boolean;
  hasRejected: boolean;
  now: Date;
  scheduledStart: Date | null;
}

export interface ChangeRule {
  from: ChangeStatus[];
  to: ChangeStatus;
  permissions: string[];
  actorRequesterOrOwner?: boolean;
  requiresPlans?: boolean;
  requiresFutureSchedule?: boolean;
  requiresApproval?: boolean;
  requiresNote?: boolean;
  /** IMPLEMENTING may start no earlier than scheduledStart − 15 minutes. */
  scheduleWindow?: boolean;
}

export type ChangeDecision = { ok: true; rule: ChangeRule } | { ok: false; code: ChangeDenialCode };

export const CHANGE_RULES: readonly ChangeRule[] = [
  {
    from: ['DRAFT'],
    to: 'SUBMITTED',
    permissions: [],
    actorRequesterOrOwner: true,
    requiresPlans: true,
    requiresFutureSchedule: true,
  },
  { from: ['SUBMITTED'], to: 'UNDER_REVIEW', permissions: ['change:approve'] },
  { from: ['SUBMITTED'], to: 'APPROVED', permissions: [] },
  {
    from: ['UNDER_REVIEW'],
    to: 'APPROVED',
    permissions: [],
    requiresApproval: true,
  },
  { from: ['UNDER_REVIEW'], to: 'REJECTED', permissions: ['change:approve'] },
  { from: ['UNDER_REVIEW'], to: 'DRAFT', permissions: ['change:approve'] },
  {
    from: ['APPROVED'],
    to: 'SCHEDULED',
    permissions: ['change:update'],
    actorRequesterOrOwner: true,
  },
  {
    from: ['SCHEDULED'],
    to: 'IMPLEMENTING',
    permissions: ['change:implement'],
    scheduleWindow: true,
  },
  { from: ['IMPLEMENTING'], to: 'VALIDATING', permissions: ['change:implement'] },
  { from: ['VALIDATING'], to: 'COMPLETED', permissions: ['change:implement'], requiresNote: true },
  {
    from: ['IMPLEMENTING', 'VALIDATING'],
    to: 'FAILED',
    permissions: ['change:implement'],
    requiresNote: true,
  },
  { from: ['FAILED'], to: 'ROLLED_BACK', permissions: ['change:implement'], requiresNote: true },
  { from: ['ROLLED_BACK', 'COMPLETED'], to: 'CLOSED', permissions: ['change:implement'] },
  {
    from: ['DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'SCHEDULED'],
    to: 'CANCELLED',
    permissions: ['change:update'],
    actorRequesterOrOwner: true,
  },
];

export function canChangeTransition(
  from: ChangeStatus,
  to: ChangeStatus,
  ctx: ChangeTransitionContext,
): ChangeDecision {
  const rule = CHANGE_RULES.find((entry) => entry.from.includes(from) && entry.to === to);
  if (!rule) return { ok: false, code: 'CHANGE_INVALID_TRANSITION' };

  const hasPermission = rule.permissions.some((permission) => ctx.permissions.includes(permission));
  const actorOk =
    hasPermission ||
    (rule.actorRequesterOrOwner && (ctx.isRequester || ctx.isOwner)) ||
    (rule.permissions.length === 0 && !rule.actorRequesterOrOwner);

  if (to === 'APPROVED' && rule.permissions.length === 0) {
    // SUBMITTED -> APPROVED only for STANDARD changes (pre-approved).
    if (from === 'SUBMITTED' && !ctx.isStandard) return { ok: false, code: 'CHANGE_NOT_APPROVED' };
  }
  if (to === 'APPROVED' && rule.requiresApproval && !ctx.requiredApprovalsMet) {
    return { ok: false, code: 'CHANGE_NOT_APPROVED' };
  }
  if (!actorOk) return { ok: false, code: 'FORBIDDEN' };
  if (rule.requiresPlans && !ctx.plansFilled) return { ok: false, code: 'PLANS_REQUIRED' };
  if (rule.requiresFutureSchedule && !ctx.scheduleInFuture && !ctx.isEmergency) {
    return { ok: false, code: 'VALIDATION_FAILED' };
  }
  if (rule.scheduleWindow) {
    if (!ctx.scheduledStart) return { ok: false, code: 'VALIDATION_FAILED' };
    const earliest = ctx.scheduledStart.getTime() - 15 * 60 * 1000;
    if (ctx.now.getTime() < earliest) return { ok: false, code: 'WINDOW_NOT_OPEN' };
  }
  return { ok: true, rule };
}

export function allowedChangeTransitions(
  from: ChangeStatus,
  ctx: ChangeTransitionContext,
): ChangeStatus[] {
  const targets: ChangeStatus[] = [
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
  ];
  return targets.filter((to) => canChangeTransition(from, to, ctx).ok);
}
