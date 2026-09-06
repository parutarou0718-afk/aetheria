import { describe, expect, it } from 'vitest';
import { createStateChangeProposal } from '../src/engine/proposal/proposalFactory';

describe('Proposal v2 factory', () => {
  it('preserves explicitly supplied v2 metadata without inventing authority or causal basis', () => {
    const proposal = createStateChangeProposal({ id: 'p1', operation: 'UPDATE_CHARACTER', entityType: 'CHARACTER', payload: {}, effectiveEpoch: 1, source: { type: 'LLM' }, reason: 'Player attacked.', causalBasis: [{ type: 'PLAYER_ACTION', description: 'attack' }], authorityLevel: 'ACTOR' });
    expect(proposal).toMatchObject({ reason: 'Player attacked.', causalBasis: [{ type: 'PLAYER_ACTION' }], authorityLevel: 'ACTOR', preconditions: [] });
  });
});
