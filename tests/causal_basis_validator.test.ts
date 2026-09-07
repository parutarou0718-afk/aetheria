import { describe, expect, it, vi } from 'vitest';
import { CausalBasisValidator, type CausalBasisStateReader } from '../src/engine/constraints/causality/causalBasisValidator';
import type { ProposalV2 } from '../src/engine/proposal/proposalSchema';

const proposal = (causalBasis: ReadonlyArray<ProposalV2['causalBasis'][number]>): ProposalV2 => ({
  id: 'causal-1', operation: 'CHANGE_RESOURCE', entityType: 'CHARACTER', entityId: 'pc-player', payload: { characterId: 'pc-player', goldDelta: 1 }, effectiveEpoch: 5, preconditions: [], source: { type: 'SYSTEM' }, reason: 'Apply a causally supported change.', causalBasis: [...causalBasis], authorityLevel: 'SYSTEM',
});
const reader = (overrides: Partial<CausalBasisStateReader> = {}): CausalBasisStateReader => ({
  factExists: vi.fn().mockResolvedValue(true), eventEpoch: vi.fn().mockResolvedValue(4), entityExists: vi.fn().mockResolvedValue(true), ruleExists: vi.fn().mockResolvedValue(true), ...overrides,
});

describe('CausalBasisValidator', () => {
  it('accepts existing FACT, past EVENT, ENTITY_STATE, and RULE references', async () => {
    const result = await new CausalBasisValidator(reader()).validate({ worldId: 'world-1', proposal: proposal([
      { type: 'FACT', id: 'fact-1' }, { type: 'EVENT', id: 'event-1' }, { type: 'ENTITY_STATE', id: 'pc-player', entityType: 'CHARACTER' }, { type: 'RULE', id: 'builtin/resource-non-negative' },
    ]) });
    expect(result).toEqual({ valid: true, violations: [] });
  });

  it.each([
    ['FACT', [{ type: 'FACT', id: 'missing' }], reader({ factExists: vi.fn().mockResolvedValue(false) }), 'NOT_FOUND'],
    ['EVENT', [{ type: 'EVENT', id: 'future' }], reader({ eventEpoch: vi.fn().mockResolvedValue(6) }), 'FROM_FUTURE'],
    ['ENTITY_STATE', [{ type: 'ENTITY_STATE', id: 'missing', entityType: 'CHARACTER' }], reader({ entityExists: vi.fn().mockResolvedValue(false) }), 'NOT_FOUND'],
    ['RULE', [{ type: 'RULE', id: 'missing-rule' }], reader({ ruleExists: vi.fn().mockResolvedValue(false) }), 'NOT_FOUND'],
  ] as const)('rejects invalid %s references', async (_type, basis, state, reason) => {
    const result = await new CausalBasisValidator(state).validate({ worldId: 'world-1', proposal: proposal(basis) });
    expect(result).toMatchObject({ valid: false, violations: [expect.objectContaining({ reason })] });
  });

  it('keeps PLAYER_ACTION and SYSTEM_EVENT description-only bases compatible', async () => {
    await expect(new CausalBasisValidator(reader()).validate({ worldId: 'world-1', proposal: proposal([
      { type: 'PLAYER_ACTION', description: 'The player chose to act.' }, { type: 'SYSTEM_EVENT', description: 'A scheduled event reached its trigger.' },
    ]) })).resolves.toEqual({ valid: true, violations: [] });
  });
});
