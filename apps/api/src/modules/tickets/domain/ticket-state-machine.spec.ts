import type { TicketStatus } from '@opsdesk/contracts';
import {
  allowedTransitions,
  canTransition,
  type TransitionContext,
} from './ticket-state-machine';

const ALL_STATUSES: TicketStatus[] = [
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
];

const AGENT_PERMISSIONS = [
  'ticket:triage',
  'ticket:assign',
  'ticket:reassign',
  'ticket:resolve',
  'ticket:close',
  'ticket:reopen',
  'ticket:cancel',
  'ticket:comment_internal',
];

function context(overrides: Partial<TransitionContext> = {}): TransitionContext {
  return {
    actorId: 'agent-1',
    permissions: AGENT_PERMISSIONS,
    isRequester: false,
    isAssignee: false,
    now: new Date('2026-10-05T10:00:00Z'),
    resolvedAt: null,
    reopenWindowDays: 7,
    ...overrides,
  };
}

/** Full from → to matrix with an agent who has every ticket permission and IS the assignee. */
const EXPECTED_ALLOWED: Record<TicketStatus, TicketStatus[]> = {
  NEW: ['TRIAGED', 'ASSIGNED', 'CANCELLED'],
  TRIAGED: ['ASSIGNED', 'CANCELLED'],
  ASSIGNED: ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['WAITING_FOR_USER', 'ESCALATED', 'RESOLVED'],
  WAITING_FOR_USER: ['IN_PROGRESS'],
  ESCALATED: ['IN_PROGRESS', 'WAITING_FOR_USER', 'RESOLVED'],
  RESOLVED: ['CLOSED', 'REOPENED'],
  REOPENED: ['IN_PROGRESS', 'WAITING_FOR_USER'],
  CLOSED: [],
  CANCELLED: [],
};

describe('ticket state machine', () => {
  it('permits exactly the documented from -> to pairs for a fully-privileged assignee', () => {
    for (const from of ALL_STATUSES) {
      const allowed = allowedTransitions(from, context({ isAssignee: true }));
      expect(allowed.sort()).toEqual([...EXPECTED_ALLOWED[from]].sort());
    }
  });

  it('rejects all undocumented from -> to pairs with TICKET_INVALID_TRANSITION', () => {
    for (const from of ALL_STATUSES) {
      for (const to of ALL_STATUSES) {
        if (EXPECTED_ALLOWED[from].includes(to)) continue;
        const decision = canTransition(from, to, context({ isAssignee: true }));
        expect(decision.ok).toBe(false);
        if (!decision.ok) {
          // Escalated/assignee-only failures produce FORBIDDEN rather than invalid transitions.
          expect(['TICKET_INVALID_TRANSITION', 'FORBIDDEN']).toContain(decision.code);
        }
      }
    }
  });

  it('denies terminal statuses unconditionally', () => {
    for (const from of ['CLOSED', 'CANCELLED'] as TicketStatus[]) {
      for (const to of ALL_STATUSES) {
        const decision = canTransition(from, to, context({ isAssignee: true }));
        expect(decision.ok).toBe(false);
      }
    }
  });

  it('requires assignment permission for NEW -> ASSIGNED', () => {
    const decision = canTransition('NEW', 'ASSIGNED', context({ permissions: [] }));
    expect(decision).toMatchObject({ ok: false, code: 'FORBIDDEN' });
  });

  it('lets only the assignee move WAITING_FOR_USER -> IN_PROGRESS', () => {
    expect(
      canTransition(
        'WAITING_FOR_USER',
        'IN_PROGRESS',
        context({ permissions: ['ticket:reassign'], isAssignee: false }),
      ),
    ).toMatchObject({ ok: false, code: 'FORBIDDEN' });
    expect(
      canTransition('WAITING_FOR_USER', 'IN_PROGRESS', context({ permissions: [], isAssignee: true })),
    ).toMatchObject({ ok: true });
  });

  it('marks pause/resume/complete/stop effects on the right transitions', () => {
    const pause = canTransition(
      'IN_PROGRESS',
      'WAITING_FOR_USER',
      context({ isAssignee: true }),
    );
    expect(pause.ok && pause.rule.effects.pauseResolution).toBe(true);

    const resume = canTransition('WAITING_FOR_USER', 'IN_PROGRESS', context({ isAssignee: true }));
    expect(resume.ok && resume.rule.effects.resumeResolution).toBe(true);

    const resolve = canTransition('IN_PROGRESS', 'RESOLVED', context({}));
    expect(resolve.ok && resolve.rule.effects.completeResolution).toBe(true);

    const cancel = canTransition('NEW', 'CANCELLED', context({ permissions: ['ticket:cancel'] }));
    expect(cancel.ok && cancel.rule.effects.stopSla).toBe(true);

    const reopen = canTransition('RESOLVED', 'REOPENED', context({}));
    expect(reopen.ok && reopen.rule.effects.restartResolution).toBe(true);
  });

  it('requires a reason for reopen and cancel', () => {
    const reopen = canTransition('RESOLVED', 'REOPENED', context({}));
    expect(reopen.ok && reopen.rule.requiresReason).toBe(true);
    const cancel = canTransition('TRIAGED', 'CANCELLED', context({}));
    expect(cancel.ok && cancel.rule.requiresReason).toBe(true);
  });

  it('requires resolution data for RESOLVED', () => {
    const decision = canTransition('IN_PROGRESS', 'RESOLVED', context({}));
    expect(decision.ok && decision.rule.requiresResolution).toBe(true);
  });

  it('enforces the reopen window for requesters without ticket:reopen', () => {
    const ctx = context({
      permissions: [],
      isRequester: true,
      resolvedAt: new Date('2026-09-20T10:00:00Z'), // > 7 days before now
    });
    expect(canTransition('RESOLVED', 'REOPENED', ctx)).toMatchObject({
      ok: false,
      code: 'REOPEN_WINDOW_EXPIRED',
    });

    const withinWindow = context({
      permissions: [],
      isRequester: true,
      resolvedAt: new Date('2026-10-02T10:00:00Z'),
    });
    expect(canTransition('RESOLVED', 'REOPENED', withinWindow)).toMatchObject({ ok: true });
  });

  it('allows requesters to close their resolved ticket without permission', () => {
    const ctx = context({ permissions: [], isRequester: true });
    expect(canTransition('RESOLVED', 'CLOSED', ctx)).toMatchObject({ ok: true });
  });

  it('lets requesters cancel only NEW tickets', () => {
    const requester = context({ permissions: [], isRequester: true });
    expect(canTransition('NEW', 'CANCELLED', requester)).toMatchObject({ ok: true });
    expect(canTransition('TRIAGED', 'CANCELLED', requester)).toMatchObject({
      ok: false,
      code: 'FORBIDDEN',
    });
  });

  it('does not allow employees to resolve or escalate', () => {
    const employee = context({ permissions: [], isRequester: true });
    expect(canTransition('IN_PROGRESS', 'RESOLVED', employee)).toMatchObject({ ok: false });
    expect(canTransition('IN_PROGRESS', 'ESCALATED', employee)).toMatchObject({ ok: false });
  });
});
