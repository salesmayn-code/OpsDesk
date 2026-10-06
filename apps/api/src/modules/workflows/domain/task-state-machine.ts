import type { TaskStatus } from '@opsdesk/contracts';

/** Pure workflow-task state machine (TRD §6.5). */
export type TaskDenialCode =
  | 'WORKFLOW_INVALID_TRANSITION'
  | 'FORBIDDEN'
  | 'TASK_SKIP_REASON_REQUIRED';

export interface TaskTransitionContext {
  permissions: readonly string[];
  required: boolean;
}

export interface TaskRule {
  from: TaskStatus[];
  to: TaskStatus;
  requiresReason?: boolean;
}

export const TASK_RULES: readonly TaskRule[] = [
  { from: ['PENDING'], to: 'IN_PROGRESS' },
  { from: ['PENDING', 'IN_PROGRESS'], to: 'BLOCKED' },
  { from: ['BLOCKED'], to: 'IN_PROGRESS' },
  { from: ['PENDING', 'IN_PROGRESS'], to: 'COMPLETED' },
  { from: ['PENDING', 'IN_PROGRESS'], to: 'SKIPPED', requiresReason: true },
];

export type TaskDecision = { ok: true; rule: TaskRule } | { ok: false; code: TaskDenialCode };

export function canTaskTransition(
  from: TaskStatus,
  to: TaskStatus,
  ctx: TaskTransitionContext,
): TaskDecision {
  const rule = TASK_RULES.find((entry) => entry.from.includes(from) && entry.to === to);
  if (!rule) return { ok: false, code: 'WORKFLOW_INVALID_TRANSITION' };
  if (to === 'SKIPPED' && ctx.required && !ctx.permissions.includes('workflow:manage')) {
    return { ok: false, code: 'FORBIDDEN' };
  }
  return { ok: true, rule };
}

export function allowedTaskTransitions(
  from: TaskStatus,
  ctx: TaskTransitionContext,
): TaskStatus[] {
  const targets: TaskStatus[] = ['PENDING', 'IN_PROGRESS', 'BLOCKED', 'COMPLETED', 'SKIPPED'];
  return targets.filter((to) => canTaskTransition(from, to, ctx).ok);
}
