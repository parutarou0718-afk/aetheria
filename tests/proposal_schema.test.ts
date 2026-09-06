import { describe, expect, it } from 'vitest';
import { ProposalSchema } from '../src/engine/proposal/proposalSchema';
import { StateChangeProposalSchema } from '../src/engine/recorder/changeSchemas';

const valid = { id: 'p1', operation: 'UPDATE_CHARACTER', entityType: 'CHARACTER', entityId: 'pc', payload: {}, effectiveEpoch: 1, preconditions: [], source: { type: 'LLM', id: 'dm' }, reason: 'Player acted.', causalBasis: [{ type: 'PLAYER_ACTION', id: 'a1' }], authorityLevel: 'ACTOR', confidence: 0.8 };
describe('Proposal v2 schema', () => {
  it('accepts v2 metadata and rejects missing or invalid fields', () => {
    expect(ProposalSchema.safeParse(valid).success).toBe(true);
    expect(ProposalSchema.safeParse({ ...valid, reason: undefined }).success).toBe(false);
    expect(ProposalSchema.safeParse({ ...valid, authorityLevel: 'ROOT' }).success).toBe(false);
    expect(ProposalSchema.safeParse({ ...valid, confidence: 1.1 }).success).toBe(false);
    expect(ProposalSchema.safeParse({ ...valid, causalBasis: [{ type: 'BAD' }] }).success).toBe(false);
  });

  it('preserves v2 metadata on the backward-compatible StateChangeProposal schema', () => {
    const parsed = StateChangeProposalSchema.parse(valid);
    expect(parsed).toMatchObject({
      reason: 'Player acted.',
      causalBasis: [{ type: 'PLAYER_ACTION', id: 'a1' }],
      authorityLevel: 'ACTOR',
      confidence: 0.8,
    });
  });
});
