import type { IncidentSeverity, IncidentStatus } from '@opsdesk/contracts';

/**
 * Pure incident lifecycle state machine (TRD §6.3). No Nest/Prisma imports.
 * BR-5: severity changes need `incident:manage`; closing needs `incident:close`.
 */

export type IncidentDenialCode =
  | 'INCIDENT_INVALID_TRANSITION'
  | 'FORBIDDEN'
  | 'POSTMORTEM_REQUIRED';

export interface IncidentTransitionContext {
  permissions: readonly string[];
  severity: IncidentSeverity;
  postmortemPublished: boolean;
}

export interface IncidentRule {
  from: IncidentStatus[];
  to: IncidentStatus;
  permissions: string[];
  /** RESOLVED requires root cause, impact, and mitigation. */
  requiresResolution?: boolean;
  /** Closing these severities requires a PUBLISHED postmortem (INC-5). */
  requiresPublishedPostmortemFor?: IncidentSeverity[];
}

export type IncidentDecision =
  | { ok: true; rule: IncidentRule }
  | { ok: false; code: IncidentDenialCode };

export const INCIDENT_RULES: readonly IncidentRule[] = [
  { from: ['IDENTIFIED'], to: 'INVESTIGATING', permissions: ['incident:manage'] },
  { from: ['IDENTIFIED', 'INVESTIGATING'], to: 'ESCALATED', permissions: ['incident:manage'] },
  { from: ['ESCALATED'], to: 'INVESTIGATING', permissions: ['incident:manage'] },
  { from: ['INVESTIGATING'], to: 'MITIGATING', permissions: ['incident:manage'] },
  { from: ['MITIGATING'], to: 'MONITORING', permissions: ['incident:manage'] },
  // Regression: monitoring can fall back to investigating.
  { from: ['MONITORING'], to: 'INVESTIGATING', permissions: ['incident:manage'] },
  {
    from: ['MONITORING'],
    to: 'RESOLVED',
    permissions: ['incident:manage'],
    requiresResolution: true,
  },
  {
    from: ['RESOLVED'],
    to: 'CLOSED',
    permissions: ['incident:close'],
    requiresPublishedPostmortemFor: ['SEV1', 'SEV2'],
  },
];

export function canIncidentTransition(
  from: IncidentStatus,
  to: IncidentStatus,
  ctx: IncidentTransitionContext,
): IncidentDecision {
  const rule = INCIDENT_RULES.find((entry) => entry.from.includes(from) && entry.to === to);
  if (!rule) return { ok: false, code: 'INCIDENT_INVALID_TRANSITION' };
  if (!rule.permissions.some((permission) => ctx.permissions.includes(permission))) {
    return { ok: false, code: 'FORBIDDEN' };
  }
  if (
    rule.requiresPublishedPostmortemFor?.includes(ctx.severity) &&
    !ctx.postmortemPublished
  ) {
    return { ok: false, code: 'POSTMORTEM_REQUIRED' };
  }
  return { ok: true, rule };
}

export function allowedIncidentTransitions(
  from: IncidentStatus,
  ctx: IncidentTransitionContext,
): IncidentStatus[] {
  const targets: IncidentStatus[] = [
    'IDENTIFIED',
    'INVESTIGATING',
    'ESCALATED',
    'MITIGATING',
    'MONITORING',
    'RESOLVED',
    'CLOSED',
  ];
  return targets.filter((to) => canIncidentTransition(from, to, ctx).ok);
}
