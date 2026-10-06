/**
 * Deterministic SLA policy selection (TRD §7.1).
 * Score = +4 category match +2 type match +1 priority match; tie -> lowest sortOrder.
 * No match -> org default policy.
 */

export interface PolicySelectionCandidate {
  id: string;
  priority: string | null;
  ticketType: string | null;
  categoryId: string | null;
  sortOrder: number;
  isDefault: boolean;
}

export interface PolicySelectionInput {
  priority: string;
  ticketType: string;
  categoryId: string | null;
}

export class NoSlaPolicyError extends Error {
  constructor() {
    super('No active SLA policy matches this ticket and no default policy is configured.');
    this.name = 'NoSlaPolicyError';
  }
}

export function scorePolicies(
  input: PolicySelectionInput,
  candidates: PolicySelectionCandidate[],
): { policy: PolicySelectionCandidate; score: number } | null {
  const matches = candidates
    .filter((candidate) => candidate.priority === input.priority)
    .filter((candidate) => candidate.ticketType === null || candidate.ticketType === input.ticketType)
    .filter((candidate) => candidate.categoryId === null || candidate.categoryId === input.categoryId)
    .map((candidate) => {
      let score = 1; // priority match
      if (candidate.ticketType === input.ticketType) score += 2;
      if (candidate.categoryId !== null && candidate.categoryId === input.categoryId) score += 4;
      return { policy: candidate, score };
    })
    .sort((a, b) => b.score - a.score || a.policy.sortOrder - b.policy.sortOrder);

  return matches[0] ?? null;
}

export function selectPolicy(
  input: PolicySelectionInput,
  candidates: PolicySelectionCandidate[],
): { policy: PolicySelectionCandidate; score: number } {
  const scored = scorePolicies(input, candidates);
  if (scored) return scored;

  const fallback = candidates
    .filter((candidate) => candidate.isDefault)
    .sort((a, b) => a.sortOrder - b.sortOrder)[0];
  if (!fallback) throw new NoSlaPolicyError();
  return { policy: fallback, score: 0 };
}
