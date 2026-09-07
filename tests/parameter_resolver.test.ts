import { describe, expect, it } from 'vitest';
import { ParameterResolver } from '../src/engine/constraints/parameters/parameterResolver';
import type { ProposalV2 } from '../src/engine/proposal/proposalSchema';

const proposal = (semanticEffect: Partial<ProposalV2['semanticEffect']>): ProposalV2 => ({
  id: 'semantic-effect-1', operation: 'APPLY_SEMANTIC_EFFECT', entityType: 'CHARACTER', entityId: 'pc-player',
  payload: {}, effectiveEpoch: 1, preconditions: [], source: { type: 'LLM' }, reason: 'Resolve a semantic effect.',
  causalBasis: [{ type: 'PLAYER_ACTION', description: 'A player action occurred.' }], authorityLevel: 'ACTOR',
  semanticEffect: semanticEffect as ProposalV2['semanticEffect'],
});

describe('ParameterResolver', () => {
  it.each([
    ['LIGHT', -5], ['MEDIUM', -15], ['HEAVY', -30],
  ] as const)('resolves %s HP DAMAGE to %i hpDelta', (magnitude, hpDelta) => {
    const result = new ParameterResolver().resolve(proposal({ type: 'DAMAGE', magnitude, resource: 'HP', targetEntityId: 'pc-player' }));
    expect(result).toMatchObject({ success: true, proposal: { operation: 'UPDATE_CHARACTER_ATTRIBUTES', payload: { characterId: 'pc-player', hpDelta } } });
  });

  it.each([
    [{ type: 'RECOVERY', magnitude: 'MEDIUM', resource: 'HP', targetEntityId: 'pc-player' }, 'UPDATE_CHARACTER_ATTRIBUTES', { hpDelta: 15 }],
    [{ type: 'RESOURCE_COST', magnitude: 'LIGHT', resource: 'MP', targetEntityId: 'pc-player' }, 'UPDATE_CHARACTER_ATTRIBUTES', { mpDelta: -5 }],
    [{ type: 'RESOURCE_GAIN', magnitude: 'HEAVY', resource: 'MP', targetEntityId: 'pc-player' }, 'UPDATE_CHARACTER_ATTRIBUTES', { mpDelta: 30 }],
    [{ type: 'RESOURCE_COST', magnitude: 'MEDIUM', resource: 'GOLD', targetEntityId: 'pc-player' }, 'CHANGE_RESOURCE', { goldDelta: -50 }],
    [{ type: 'RESOURCE_GAIN', magnitude: 'HEAVY', resource: 'GOLD', targetEntityId: 'pc-player' }, 'CHANGE_RESOURCE', { goldDelta: 200 }],
  ] as const)('resolves supported semantic effects', (semanticEffect, operation, payload) => {
    const result = new ParameterResolver().resolve(proposal(semanticEffect));
    expect(result).toMatchObject({ success: true, proposal: { operation, payload: expect.objectContaining(payload) } });
  });

  it('rejects unsupported semantic combinations without modifying the input proposal', () => {
    const original = proposal({ type: 'DAMAGE', magnitude: 'LIGHT', resource: 'GOLD', targetEntityId: 'pc-player' });
    const snapshot = structuredClone(original);
    const result = new ParameterResolver().resolve(original);
    expect(result).toMatchObject({ success: false, rejection: { code: 'PARAMETER_EFFECT_UNSUPPORTED' } });
    expect(original).toEqual(snapshot);
  });

  it('passes direct numeric proposals through unchanged and never leaves APPLY_SEMANTIC_EFFECT unresolved', () => {
    const direct = { ...proposal({ type: 'DAMAGE', magnitude: 'LIGHT', resource: 'HP', targetEntityId: 'pc-player' }), operation: 'CHANGE_RESOURCE' as const, payload: { characterId: 'pc-player', goldDelta: 1 } };
    expect(new ParameterResolver().resolve(direct)).toMatchObject({ success: true, proposal: direct });
    const missing = { ...proposal({}) };
    expect(new ParameterResolver().resolve(missing)).toMatchObject({ success: false, rejection: { code: 'PARAMETER_EFFECT_UNSUPPORTED' } });
  });

  it('preserves runtime-owned actor identity while resolving the separate target entity', () => {
    const input = {
      ...proposal({ type: 'DAMAGE', magnitude: 'MEDIUM', resource: 'HP', targetEntityId: 'npc-elder' }),
      actorId: 'pc-player',
      entityId: 'npc-elder',
    } as ProposalV2;

    const result = new ParameterResolver().resolve(input);

    expect(result).toMatchObject({
      success: true,
      proposal: {
        actorId: 'pc-player', entityId: 'npc-elder', operation: 'UPDATE_CHARACTER_ATTRIBUTES',
        payload: { characterId: 'npc-elder', hpDelta: -15 },
      },
    });
  });
});
