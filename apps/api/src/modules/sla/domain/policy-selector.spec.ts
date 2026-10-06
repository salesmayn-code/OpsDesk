import { NoSlaPolicyError, scorePolicies, selectPolicy, type PolicySelectionCandidate } from './policy-selector';

const base: PolicySelectionCandidate = {
  id: 'p',
  priority: 'HIGH',
  ticketType: null,
  categoryId: null,
  sortOrder: 0,
  isDefault: false,
};

describe('SLA policy selector', () => {
  it('requires the priority to match', () => {
    expect(scorePolicies({ priority: 'LOW', ticketType: 'INCIDENT', categoryId: null }, [base])).toBeNull();
  });

  it('scores category > type > priority', () => {
    const byPriority: PolicySelectionCandidate = { ...base, id: 'priority-only' };
    const byType: PolicySelectionCandidate = { ...base, id: 'type', ticketType: 'INCIDENT' };
    const byCategory: PolicySelectionCandidate = { ...base, id: 'category', categoryId: 'cat-1' };

    const result = scorePolicies(
      { priority: 'HIGH', ticketType: 'INCIDENT', categoryId: 'cat-1' },
      [byPriority, byType, byCategory],
    );
    expect(result?.policy.id).toBe('category');
    expect(result?.score).toBe(5); // +1 priority, +4 category (type wildcard)
  });

  it('breaks score ties with the lowest sortOrder', () => {
    const later: PolicySelectionCandidate = { ...base, id: 'later', sortOrder: 5 };
    const earlier: PolicySelectionCandidate = { ...base, id: 'earlier', sortOrder: 1 };
    const result = scorePolicies(
      { priority: 'HIGH', ticketType: 'INCIDENT', categoryId: null },
      [later, earlier],
    );
    expect(result?.policy.id).toBe('earlier');
  });

  it('uses the default policy when nothing matches', () => {
    const fallback: PolicySelectionCandidate = { ...base, id: 'fallback', priority: 'LOW', isDefault: true };
    const result = selectPolicy(
      { priority: 'CRITICAL', ticketType: 'INCIDENT', categoryId: null },
      [fallback],
    );
    expect(result.policy.id).toBe('fallback');
    expect(result.score).toBe(0);
  });

  it('throws when no policy matches and no default exists', () => {
    expect(() =>
      selectPolicy({ priority: 'CRITICAL', ticketType: 'INCIDENT', categoryId: null }, [base]),
    ).toThrow(NoSlaPolicyError);
  });
});
