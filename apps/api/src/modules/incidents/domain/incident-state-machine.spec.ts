import type { IncidentSeverity, IncidentStatus } from '@opsdesk/contracts';
import {
  allowedIncidentTransitions,
  canIncidentTransition,
  type IncidentTransitionContext,
} from './incident-state-machine';

const ALL: IncidentStatus[] = [
  'IDENTIFIED',
  'INVESTIGATING',
  'ESCALATED',
  'MITIGATING',
  'MONITORING',
  'RESOLVED',
  'CLOSED',
];

function ctx(overrides: Partial<IncidentTransitionContext> = {}): IncidentTransitionContext {
  return {
    permissions: ['incident:manage', 'incident:close'],
    severity: 'SEV3',
    postmortemPublished: false,
    ...overrides,
  };
}

const EXPECTED: Record<IncidentStatus, IncidentStatus[]> = {
  IDENTIFIED: ['INVESTIGATING', 'ESCALATED'],
  INVESTIGATING: ['ESCALATED', 'MITIGATING'],
  ESCALATED: ['INVESTIGATING'],
  MITIGATING: ['MONITORING'],
  MONITORING: ['INVESTIGATING', 'RESOLVED'],
  RESOLVED: ['CLOSED'],
  CLOSED: [],
};

describe('incident state machine', () => {
  it('permits exactly the documented transitions for a fully-privileged actor', () => {
    for (const from of ALL) {
      expect(allowedIncidentTransitions(from, ctx()).sort()).toEqual([...EXPECTED[from]].sort());
    }
  });

  it('rejects CLOSED (terminal) unconditionally', () => {
    for (const to of ALL) {
      expect(canIncidentTransition('CLOSED', to, ctx())).toMatchObject({
        ok: false,
        code: 'INCIDENT_INVALID_TRANSITION',
      });
    }
  });

  it('requires incident:manage to advance the lifecycle', () => {
    expect(canIncidentTransition('IDENTIFIED', 'INVESTIGATING', ctx({ permissions: [] }))).toMatchObject({
      ok: false,
      code: 'FORBIDDEN',
    });
    expect(
      canIncidentTransition('MONITORING', 'RESOLVED', ctx({ permissions: ['incident:manage'] })),
    ).toMatchObject({ ok: true });
  });

  it('requires incident:close (not manage) to close', () => {
    expect(canIncidentTransition('RESOLVED', 'CLOSED', ctx({ permissions: ['incident:manage'] }))).toMatchObject({
      ok: false,
      code: 'FORBIDDEN',
    });
    expect(canIncidentTransition('RESOLVED', 'CLOSED', ctx({ permissions: ['incident:close'] }))).toMatchObject({
      ok: true,
    });
  });

  it('requires a published postmortem to close SEV1/SEV2', () => {
    const sev1 = ctx({ severity: 'SEV1' as IncidentSeverity });
    expect(canIncidentTransition('RESOLVED', 'CLOSED', sev1)).toMatchObject({
      ok: false,
      code: 'POSTMORTEM_REQUIRED',
    });
    expect(
      canIncidentTransition('RESOLVED', 'CLOSED', { ...sev1, postmortemPublished: true }),
    ).toMatchObject({ ok: true });
    // SEV3/SEV4 do not require a postmortem.
    expect(canIncidentTransition('RESOLVED', 'CLOSED', ctx())).toMatchObject({ ok: true });
  });

  it('marks RESOLVED as requiring root cause, impact, and mitigation', () => {
    const decision = canIncidentTransition('MONITORING', 'RESOLVED', ctx());
    expect(decision.ok && decision.rule.requiresResolution).toBe(true);
  });

  it('supports the escalation round-trip and monitoring regression', () => {
    expect(canIncidentTransition('IDENTIFIED', 'ESCALATED', ctx())).toMatchObject({ ok: true });
    expect(canIncidentTransition('ESCALATED', 'INVESTIGATING', ctx())).toMatchObject({ ok: true });
    expect(canIncidentTransition('MONITORING', 'INVESTIGATING', ctx())).toMatchObject({ ok: true });
  });
});
