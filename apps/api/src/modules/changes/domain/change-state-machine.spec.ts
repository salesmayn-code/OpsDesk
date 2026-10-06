import type { ChangeStatus } from '@opsdesk/contracts';
import {
  allowedChangeTransitions,
  canChangeTransition,
  type ChangeTransitionContext,
} from './change-state-machine';

const ALL: ChangeStatus[] = [
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

function ctx(overrides: Partial<ChangeTransitionContext> = {}): ChangeTransitionContext {
  return {
    permissions: ['change:create', 'change:view', 'change:update', 'change:approve', 'change:implement'],
    isRequester: false,
    isOwner: true,
    isStandard: false,
    plansFilled: true,
    scheduleInFuture: true,
    isEmergency: false,
    requiredApprovalsMet: true,
    hasRejected: false,
    now: new Date('2026-10-05T10:00:00Z'),
    // 5 minutes ahead: future for submit, inside the 15-minute implementation window.
    scheduledStart: new Date('2026-10-05T10:05:00Z'),
    ...overrides,
  };
}

const EXPECTED: Record<ChangeStatus, ChangeStatus[]> = {
  DRAFT: ['SUBMITTED', 'CANCELLED'],
  SUBMITTED: ['UNDER_REVIEW', 'CANCELLED'],
  UNDER_REVIEW: ['APPROVED', 'REJECTED', 'DRAFT', 'CANCELLED'],
  APPROVED: ['SCHEDULED', 'CANCELLED'],
  REJECTED: [],
  SCHEDULED: ['IMPLEMENTING', 'CANCELLED'],
  IMPLEMENTING: ['VALIDATING', 'FAILED'],
  VALIDATING: ['COMPLETED', 'FAILED'],
  COMPLETED: ['CLOSED'],
  FAILED: ['ROLLED_BACK'],
  ROLLED_BACK: ['CLOSED'],
  CLOSED: [],
  CANCELLED: [],
};

describe('change state machine', () => {
  it('permits exactly the documented transitions for a fully-privileged owner', () => {
    for (const from of ALL) {
      expect(allowedChangeTransitions(from, ctx()).sort()).toEqual([...EXPECTED[from]].sort());
    }
  });

  it('requires plans and a future schedule to submit (except emergency)', () => {
    expect(canChangeTransition('DRAFT', 'SUBMITTED', ctx({ plansFilled: false }))).toMatchObject({
      ok: false,
      code: 'PLANS_REQUIRED',
    });
    expect(
      canChangeTransition('DRAFT', 'SUBMITTED', ctx({ scheduleInFuture: false })),
    ).toMatchObject({ ok: false, code: 'VALIDATION_FAILED' });
    expect(
      canChangeTransition(
        'DRAFT',
        'SUBMITTED',
        ctx({ scheduleInFuture: false, isEmergency: true }),
      ),
    ).toMatchObject({ ok: true });
  });

  it('only lets STANDARD changes auto-approve from SUBMITTED', () => {
    expect(canChangeTransition('SUBMITTED', 'APPROVED', ctx({ isStandard: true }))).toMatchObject({
      ok: true,
    });
    expect(canChangeTransition('SUBMITTED', 'APPROVED', ctx({ isStandard: false }))).toMatchObject({
      ok: false,
      code: 'CHANGE_NOT_APPROVED',
    });
  });

  it('requires the approval threshold before APPROVED', () => {
    expect(
      canChangeTransition('UNDER_REVIEW', 'APPROVED', ctx({ requiredApprovalsMet: false })),
    ).toMatchObject({ ok: false, code: 'CHANGE_NOT_APPROVED' });
    expect(
      canChangeTransition('UNDER_REVIEW', 'APPROVED', ctx({ requiredApprovalsMet: true })),
    ).toMatchObject({ ok: true });
  });

  it('opens the implementation window 15 minutes before the scheduled start', () => {
    const scheduledStart = new Date('2026-10-05T10:10:00Z');
    expect(
      canChangeTransition(
        'SCHEDULED',
        'IMPLEMENTING',
        ctx({ scheduledStart, now: new Date('2026-10-05T10:00:00Z') }),
      ),
    ).toMatchObject({ ok: true });
    expect(
      canChangeTransition(
        'SCHEDULED',
        'IMPLEMENTING',
        ctx({ scheduledStart, now: new Date('2026-10-05T09:30:00Z') }),
      ),
    ).toMatchObject({ ok: false, code: 'WINDOW_NOT_OPEN' });
  });

  it('requires notes for completion, failure, and rollback', () => {
    for (const [from, to] of [
      ['VALIDATING', 'COMPLETED'],
      ['IMPLEMENTING', 'FAILED'],
      ['FAILED', 'ROLLED_BACK'],
    ] as [ChangeStatus, ChangeStatus][]) {
      const decision = canChangeTransition(from, to, ctx());
      expect(decision.ok && decision.rule.requiresNote).toBe(true);
    }
  });

  it('lets the requester cancel before implementation', () => {
    const requester = ctx({ permissions: [], isRequester: true, isOwner: false });
    expect(canChangeTransition('DRAFT', 'CANCELLED', requester)).toMatchObject({ ok: true });
    expect(canChangeTransition('SCHEDULED', 'CANCELLED', requester)).toMatchObject({ ok: true });
    expect(canChangeTransition('IMPLEMENTING', 'CANCELLED', requester)).toMatchObject({
      ok: false,
      code: 'CHANGE_INVALID_TRANSITION',
    });
  });

  it('rejects transitions from terminal states', () => {
    for (const from of ['REJECTED', 'CLOSED', 'CANCELLED'] as ChangeStatus[]) {
      for (const to of ALL) {
        expect(canChangeTransition(from, to, ctx()).ok).toBe(false);
      }
    }
  });
});
