import type { TaskStatus } from '@opsdesk/contracts';
import {
  allowedTaskTransitions,
  canTaskTransition,
  type TaskTransitionContext,
} from './task-state-machine';

const ctx: TaskTransitionContext = { permissions: ['workflow:manage'], required: true };

describe('workflow task state machine', () => {
  it('permits exactly the documented transitions for a manager', () => {
    expect(allowedTaskTransitions('PENDING', ctx).sort()).toEqual(
      ['IN_PROGRESS', 'BLOCKED', 'COMPLETED', 'SKIPPED'].sort(),
    );
    expect(allowedTaskTransitions('IN_PROGRESS', ctx).sort()).toEqual(
      ['BLOCKED', 'COMPLETED', 'SKIPPED'].sort(),
    );
    expect(allowedTaskTransitions('BLOCKED', ctx)).toEqual(['IN_PROGRESS']);
    expect(allowedTaskTransitions('COMPLETED', ctx)).toEqual([]);
    expect(allowedTaskTransitions('SKIPPED', ctx)).toEqual([]);
  });

  it('blocks skipping required tasks without workflow:manage', () => {
    expect(
      canTaskTransition('PENDING', 'SKIPPED', { permissions: [], required: true }),
    ).toMatchObject({ ok: false, code: 'FORBIDDEN' });
    expect(
      canTaskTransition('PENDING', 'SKIPPED', { permissions: [], required: false }),
    ).toMatchObject({ ok: true });
  });

  it('marks SKIPPED as requiring a reason', () => {
    const decision = canTaskTransition('PENDING', 'SKIPPED', ctx);
    expect(decision.ok && decision.rule.requiresReason).toBe(true);
  });

  it('rejects transitions from terminal task states', () => {
    for (const from of ['COMPLETED', 'SKIPPED'] as TaskStatus[]) {
      for (const to of ['PENDING', 'IN_PROGRESS', 'BLOCKED', 'COMPLETED', 'SKIPPED'] as TaskStatus[]) {
        expect(canTaskTransition(from, to, ctx).ok).toBe(false);
      }
    }
  });
});
