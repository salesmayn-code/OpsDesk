import type { AssetStatus } from '@opsdesk/contracts';
import {
  allowedAssetTransitions,
  canAssetTransition,
  type AssetTransitionContext,
} from './asset-state-machine';

const ALL: AssetStatus[] = [
  'PROCURED',
  'IN_STOCK',
  'ASSIGNED',
  'IN_REPAIR',
  'LOST',
  'RETIRED',
  'DISPOSED',
];

function ctx(permissions: string[] = ['asset:update', 'asset:assign', 'asset:retire', 'asset:dispose']): AssetTransitionContext {
  return { permissions };
}

const EXPECTED: Record<AssetStatus, AssetStatus[]> = {
  PROCURED: ['IN_STOCK'],
  IN_STOCK: ['ASSIGNED', 'IN_REPAIR', 'LOST', 'RETIRED'],
  ASSIGNED: ['IN_STOCK', 'IN_REPAIR', 'LOST'],
  IN_REPAIR: ['IN_STOCK', 'ASSIGNED', 'LOST', 'RETIRED'],
  LOST: ['IN_STOCK', 'RETIRED'],
  RETIRED: ['DISPOSED'],
  DISPOSED: [],
};

describe('asset state machine', () => {
  it('permits exactly the documented transitions for a fully-privileged actor', () => {
    for (const from of ALL) {
      expect(allowedAssetTransitions(from, ctx()).sort()).toEqual([...EXPECTED[from]].sort());
    }
  });

  it('rejects transitions from DISPOSED (terminal)', () => {
    for (const to of ALL) {
      expect(canAssetTransition('DISPOSED', to, ctx())).toMatchObject({
        ok: false,
        code: 'ASSET_INVALID_TRANSITION',
      });
    }
  });

  it('requires asset:retire for RETIRED and asset:dispose for DISPOSED', () => {
    expect(canAssetTransition('IN_STOCK', 'RETIRED', ctx(['asset:update']))).toMatchObject({
      ok: false,
      code: 'FORBIDDEN',
    });
    expect(canAssetTransition('RETIRED', 'DISPOSED', ctx(['asset:update']))).toMatchObject({
      ok: false,
      code: 'FORBIDDEN',
    });
    expect(canAssetTransition('RETIRED', 'DISPOSED', ctx(['asset:dispose']))).toMatchObject({
      ok: true,
    });
  });

  it('marks assignment closing on return, loss, and repair exit to stock', () => {
    const back = canAssetTransition('ASSIGNED', 'IN_STOCK', ctx());
    expect(back.ok && back.rule.closeAssignment).toBe(true);

    const lost = canAssetTransition('ASSIGNED', 'LOST', ctx());
    expect(lost.ok && lost.rule.closeAssignment).toBe(true);

    const repaired = canAssetTransition('IN_REPAIR', 'IN_STOCK', ctx());
    expect(repaired.ok && repaired.rule.closeAssignment).toBe(true);

    const toRepair = canAssetTransition('ASSIGNED', 'IN_REPAIR', ctx());
    expect(toRepair.ok && toRepair.rule.keepsAssignment).toBe(true);
  });

  it('requires notes for repair and loss transitions', () => {
    const repair = canAssetTransition('IN_STOCK', 'IN_REPAIR', ctx());
    expect(repair.ok && repair.rule.requiresNote).toBe(true);
    const lost = canAssetTransition('IN_STOCK', 'LOST', ctx());
    expect(lost.ok && lost.rule.requiresNote).toBe(true);
    const found = canAssetTransition('LOST', 'IN_STOCK', ctx());
    expect(found.ok && found.rule.requiresNote).toBe(true);
  });

  it('requires a disposal method for DISPOSED', () => {
    const disposed = canAssetTransition('RETIRED', 'DISPOSED', ctx());
    expect(disposed.ok && disposed.rule.requiresDisposalMethod).toBe(true);
  });
});
