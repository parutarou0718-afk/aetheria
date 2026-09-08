import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProposalPipeline } from '../src/engine/proposal/proposalPipeline';
import type { ProposalV2 } from '../src/engine/proposal/proposalSchema';
import { recorder } from '../src/engine/recorder/recorder';
import { WorldRepository } from '../src/engine/world/worldRepository';
import { globalWorld, setRecorderWriteContext } from '../src/engine/worldState';
import { bootstrapWithDefaultWorld } from './helpers/worldFixture';

const worldId = 'semantic-actor-identity';

function semanticDamage(actorId: string, targetEntityId: string): ProposalV2 {
  return {
    id: `semantic-damage-${actorId}-${targetEntityId}-${Date.now()}`,
    operation: 'APPLY_SEMANTIC_EFFECT',
    entityType: 'CHARACTER',
    entityId: targetEntityId,
    actorId,
    payload: {},
    effectiveEpoch: 1,
    preconditions: [],
    source: { type: 'LLM' },
    reason: 'Resolve a player action into a semantic effect.',
    causalBasis: [{ type: 'PLAYER_ACTION', description: 'A player action occurred.' }],
    authorityLevel: 'ACTOR',
    semanticEffect: { type: 'DAMAGE', magnitude: 'MEDIUM', resource: 'HP', targetEntityId },
  };
}

async function setStatus(characterId: string, status: 'ALIVE' | 'DEAD'): Promise<void> {
  const character = globalWorld.characters.get(characterId)!;
  setRecorderWriteContext(true);
  try {
    character.status = status;
  } finally {
    setRecorderWriteContext(false);
  }
  await WorldRepository.saveCharacter(worldId, character);
}

async function colocate(characterId: string): Promise<void> {
  const character = globalWorld.characters.get(characterId)!;
  setRecorderWriteContext(true);
  try {
    character.location_id = 'loc-tavern';
    character.presence_state = 'AT_LOCATION';
  } finally {
    setRecorderWriteContext(false);
  }
  await WorldRepository.saveCharacter(worldId, character);
}

describe('semantic actor identity', () => {
  beforeEach(async () => {
    await bootstrapWithDefaultWorld(worldId);
  });

  it('rejects a dead actor damaging a living target before Recorder commits', async () => {
    await setStatus('pc-player', 'DEAD');
    const commitSpy = vi.spyOn(recorder, 'commit');

    const result = await new ProposalPipeline().processAndCommit({
      worldId,
      proposals: [semanticDamage('pc-player', 'npc-elder')],
    });

    expect(result.success).toBe(false);
    expect(result.rejected).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'PROPOSAL_CAPABILITY_VIOLATION', capabilityReason: 'ACTOR_NOT_ACTIVE' })]));
    expect(commitSpy).not.toHaveBeenCalled();
  });

  it('does not reject an alive actor solely because the semantic effect target is dead', async () => {
    await colocate('npc-elder');
    await setStatus('npc-elder', 'DEAD');
    const before = (await WorldRepository.getCharacter(worldId, 'npc-elder'))!.attributes.hp;

    const result = await new ProposalPipeline().processAndCommit({
      worldId,
      proposals: [semanticDamage('pc-player', 'npc-elder')],
    });

    expect(result.success).toBe(true);
    expect((await WorldRepository.getCharacter(worldId, 'npc-elder'))!.attributes.hp).toBe(before - 15);
  });

  it('preserves an alive actor separately from a living target and applies policy damage to the target', async () => {
    await colocate('npc-elder');
    const before = (await WorldRepository.getCharacter(worldId, 'npc-elder'))!.attributes.hp;

    const result = await new ProposalPipeline().processAndCommit({
      worldId,
      proposals: [semanticDamage('pc-player', 'npc-elder')],
    });

    expect(result).toMatchObject({
      success: true,
      accepted: [expect.objectContaining({
        operation: 'UPDATE_CHARACTER_ATTRIBUTES', entityId: 'npc-elder', actorId: 'pc-player',
        payload: expect.objectContaining({ characterId: 'npc-elder', hpDelta: -15 }),
      })],
    });
    expect((await WorldRepository.getCharacter(worldId, 'npc-elder'))!.attributes.hp).toBe(before - 15);
  });

  it('rejects legacy mechanical ACTOR proposals without an actorId', async () => {
    await setStatus('pc-player', 'DEAD');
    const result = await new ProposalPipeline().processAndCommit({
      worldId,
      proposals: [{
        id: 'legacy-dead-move', operation: 'MOVE_CHARACTER', entityType: 'CHARACTER', entityId: 'pc-player',
        payload: { characterId: 'pc-player', targetLocationId: 'loc-dawnfall' }, effectiveEpoch: 1,
        preconditions: [], source: { type: 'PLAYER_ACTION' }, reason: 'Legacy movement action.',
        causalBasis: [{ type: 'PLAYER_ACTION', description: 'A player action occurred.' }], authorityLevel: 'ACTOR',
      }],
    });

    expect(result).toMatchObject({
      success: false,
      rejected: [expect.objectContaining({ code: 'PROPOSAL_CAPABILITY_VIOLATION', capabilityReason: 'ACTOR_ID_REQUIRED' })],
    });
  });
});
