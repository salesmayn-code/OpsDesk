import type { TicketStatus } from '@opsdesk/contracts';

/**
 * Pure ticket state machine (TRD §6.1). No Nest/Prisma imports.
 * Services apply the effects after a transition is accepted.
 */

export type DenialCode =
  | 'TICKET_INVALID_TRANSITION'
  | 'FORBIDDEN'
  | 'REOPEN_WINDOW_EXPIRED';

export interface TransitionContext {
  actorId: string;
  permissions: readonly string[];
  isRequester: boolean;
  isAssignee: boolean;
  now: Date;
  resolvedAt: Date | null;
  reopenWindowDays: number;
}

export interface TicketEffects {
  pauseResolution?: boolean;
  resumeResolution?: boolean;
  completeResolution?: boolean;
  stopSla?: boolean;
  restartResolution?: boolean;
  notifyManager?: boolean;
}

export interface TransitionRule {
  from: TicketStatus[];
  to: TicketStatus;
  /** Any-of permissions. */
  permissions?: string[];
  /** Actor must be the assignee (when no permission alternative matches). */
  actorIsAssignee?: boolean;
  /** Actor must be the requester. */
  actorIsRequester?: boolean;
  requiresReason?: boolean;
  requiresResolution?: boolean;
  requiresPublicComment?: boolean;
  requiresCategory?: boolean;
  effects: TicketEffects;
}

export type TransitionDecision =
  | { ok: true; rule: TransitionRule }
  | { ok: false; code: DenialCode };

export const TICKET_RULES: readonly TransitionRule[] = [
  {
    from: ['NEW'],
    to: 'TRIAGED',
    permissions: ['ticket:triage'],
    requiresCategory: true,
    effects: {},
  },
  {
    from: ['NEW', 'TRIAGED'],
    to: 'ASSIGNED',
    permissions: ['ticket:assign'],
    effects: {},
  },
  {
    from: ['ASSIGNED'],
    to: 'IN_PROGRESS',
    permissions: ['ticket:reassign'],
    actorIsAssignee: true,
    effects: {},
  },
  {
    from: ['IN_PROGRESS', 'ESCALATED', 'REOPENED'],
    to: 'WAITING_FOR_USER',
    actorIsAssignee: true,
    requiresPublicComment: true,
    effects: { pauseResolution: true },
  },
  {
    from: ['WAITING_FOR_USER'],
    to: 'IN_PROGRESS',
    actorIsAssignee: true,
    effects: { resumeResolution: true },
  },
  {
    from: ['IN_PROGRESS'],
    to: 'ESCALATED',
    permissions: ['ticket:reassign'],
    actorIsAssignee: true,
    requiresReason: true,
    effects: { notifyManager: true },
  },
  {
    from: ['ESCALATED'],
    to: 'IN_PROGRESS',
    permissions: ['ticket:reassign'],
    effects: {},
  },
  {
    from: ['IN_PROGRESS', 'ESCALATED'],
    to: 'RESOLVED',
    permissions: ['ticket:resolve'],
    requiresResolution: true,
    effects: { completeResolution: true },
  },
  {
    from: ['RESOLVED'],
    to: 'CLOSED',
    permissions: ['ticket:close'],
    actorIsRequester: true,
    effects: {},
  },
  {
    from: ['RESOLVED'],
    to: 'REOPENED',
    permissions: ['ticket:reopen'],
    actorIsRequester: true,
    requiresReason: true,
    effects: { restartResolution: true },
  },
  {
    from: ['REOPENED'],
    to: 'IN_PROGRESS',
    actorIsAssignee: true,
    effects: {},
  },
  {
    from: ['NEW', 'TRIAGED', 'ASSIGNED'],
    to: 'CANCELLED',
    permissions: ['ticket:cancel'],
    // Requester may cancel only their own NEW ticket (checked below).
    actorIsRequester: true,
    requiresReason: true,
    effects: { stopSla: true },
  },
];

export function canTransition(
  from: TicketStatus,
  to: TicketStatus,
  ctx: TransitionContext,
): TransitionDecision {
  const candidates = TICKET_RULES.filter((rule) => rule.from.includes(from) && rule.to === to);
  if (candidates.length === 0) {
    return { ok: false, code: 'TICKET_INVALID_TRANSITION' };
  }

  for (const rule of candidates) {
    const hasPermission = (rule.permissions ?? []).some((permission) =>
      ctx.permissions.includes(permission),
    );

    if (to === 'REOPENED' && !hasPermission) {
      if (!ctx.isRequester) continue;
      const deadline =
        (ctx.resolvedAt?.getTime() ?? 0) + ctx.reopenWindowDays * 24 * 60 * 60 * 1000;
      if (ctx.now.getTime() > deadline) {
        return { ok: false, code: 'REOPEN_WINDOW_EXPIRED' };
      }
    }

    if (to === 'CANCELLED' && !hasPermission && !(ctx.isRequester && from === 'NEW')) {
      continue;
    }

    if (hasPermission) return { ok: true, rule };
    if (rule.actorIsAssignee && ctx.isAssignee) return { ok: true, rule };
    if (rule.actorIsRequester && ctx.isRequester) return { ok: true, rule };
    if (!rule.permissions?.length && !rule.actorIsAssignee && !rule.actorIsRequester) {
      return { ok: true, rule };
    }
  }
  return { ok: false, code: 'FORBIDDEN' };
}

/** Statuses the actor may move the ticket to right now. */
export function allowedTransitions(
  from: TicketStatus,
  ctx: TransitionContext,
): TicketStatus[] {
  const targets: TicketStatus[] = [
    'TRIAGED',
    'ASSIGNED',
    'IN_PROGRESS',
    'WAITING_FOR_USER',
    'ESCALATED',
    'RESOLVED',
    'REOPENED',
    'CLOSED',
    'CANCELLED',
  ];
  return targets.filter((to) => canTransition(from, to, ctx).ok);
}
