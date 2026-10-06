import type { AssetStatus } from '@opsdesk/contracts';

/**
 * Pure asset lifecycle state machine (TRD §6.2). No Nest/Prisma imports.
 * DB constraint `assets_assignee_status_ck` requires clearing the assignee when
 * moving back to IN_STOCK; `closeAssignment` marks exactly those rules.
 */

export type AssetDenialCode = 'ASSET_INVALID_TRANSITION' | 'FORBIDDEN';

export interface AssetTransitionContext {
  permissions: readonly string[];
}

export interface AssetRule {
  from: AssetStatus[];
  to: AssetStatus;
  permissions: string[];
  requiresNote?: boolean;
  requiresDisposalMethod?: boolean;
  /** Close any active assignment as part of this transition. */
  closeAssignment?: boolean;
  /** Allowed with an active assignment kept (IN_REPAIR keeps custody). */
  keepsAssignment?: boolean;
}

export type AssetDecision = { ok: true; rule: AssetRule } | { ok: false; code: AssetDenialCode };

export const ASSET_RULES: readonly AssetRule[] = [
  { from: ['PROCURED'], to: 'IN_STOCK', permissions: ['asset:update'] },
  { from: ['IN_STOCK'], to: 'ASSIGNED', permissions: ['asset:assign'] },
  { from: ['ASSIGNED'], to: 'IN_STOCK', permissions: ['asset:assign'], closeAssignment: true },
  { from: ['IN_STOCK'], to: 'IN_REPAIR', permissions: ['asset:update'], requiresNote: true },
  {
    from: ['ASSIGNED'],
    to: 'IN_REPAIR',
    permissions: ['asset:update'],
    requiresNote: true,
    keepsAssignment: true,
  },
  {
    from: ['IN_REPAIR'],
    to: 'IN_STOCK',
    permissions: ['asset:update'],
    requiresNote: true,
    closeAssignment: true,
  },
  { from: ['IN_REPAIR'], to: 'ASSIGNED', permissions: ['asset:assign'], requiresNote: true },
  {
    from: ['IN_STOCK', 'ASSIGNED', 'IN_REPAIR'],
    to: 'LOST',
    permissions: ['asset:update'],
    requiresNote: true,
    closeAssignment: true,
  },
  { from: ['LOST'], to: 'IN_STOCK', permissions: ['asset:update'], requiresNote: true },
  { from: ['IN_STOCK', 'IN_REPAIR', 'LOST'], to: 'RETIRED', permissions: ['asset:retire'] },
  {
    from: ['RETIRED'],
    to: 'DISPOSED',
    permissions: ['asset:dispose'],
    requiresDisposalMethod: true,
  },
];

export function canAssetTransition(
  from: AssetStatus,
  to: AssetStatus,
  ctx: AssetTransitionContext,
): AssetDecision {
  const rule = ASSET_RULES.find((entry) => entry.from.includes(from) && entry.to === to);
  if (!rule) return { ok: false, code: 'ASSET_INVALID_TRANSITION' };
  const allowed = rule.permissions.some((permission) => ctx.permissions.includes(permission));
  return allowed ? { ok: true, rule } : { ok: false, code: 'FORBIDDEN' };
}

export function allowedAssetTransitions(
  from: AssetStatus,
  ctx: AssetTransitionContext,
): AssetStatus[] {
  const targets: AssetStatus[] = [
    'PROCURED',
    'IN_STOCK',
    'ASSIGNED',
    'IN_REPAIR',
    'LOST',
    'RETIRED',
    'DISPOSED',
  ];
  return targets.filter((to) => canAssetTransition(from, to, ctx).ok);
}
