import { beforeEach, describe, expect, it } from 'vitest';
import { ProposalPipeline } from '../src/engine/proposal/proposalPipeline';
import type { ProposalV2 } from '../src/engine/proposal/proposalSchema';
import { recorder } from '../src/engine/recorder/recorder';
import type { StateChangeProposal } from '../src/engine/recorder/changeSchemas';
import { WorldRepository } from '../src/engine/world/worldRepository';
import { globalWorld, setRecorderWriteContext } from '../src/engine/worldState';
import { bootstrapWithDefaultWorld } from './helpers/worldFixture';

const worldId = 'world-rule-closure';
const immutableTruthId = 'truth-old-lo';

function proposal(overrides: Partial<ProposalV2> = {}): ProposalV2 {
  return {
    id: `closure-${Math.random()}`,
    operation: 'MOVE_CHARACTER',
    entityType: 'CHARACTER',
    entityId: 'pc-player',
    payload: { characterId: 'pc-player', targetLocationId: 'loc-dawnfall' },
    effectiveEpoch: 1,
    preconditions: [],
    source: { type: 'PLAYER_ACTION' },
    reason: 'Exercise a world-rule closure path.',
    causalBasis: [{ type: 'PLAYER_ACTION', description: 'Closure regression.' }],
    authorityLevel: 'ACTOR',
    ...overrides,
  };
}

async function markPlayerDead(): Promise<void> {
  const player = globalWorld.characters.get('pc-player')!;
  setRecorderWriteContext(true);
  try {
    player.status = 'DEAD';
  } finally {
    setRecorderWriteContext(false);
  }
  await WorldRepository.saveCharacter(worldId, player);
}

describe('world rule closure authority alignment', () => {
  beforeEach(async () => {
    await bootstrapWithDefaultWorld(worldId);
  });

  it('rejects a dead ACTOR action through the real pipeline without moving the character', async () => {
    await markPlayerDead();
    const result = await new ProposalPipeline().processAndCommit({ worldId, proposals: [proposal()] });
    expect(result).toMatchObject({ success: false, rejected: [expect.objectContaining({ code: 'PROPOSAL_RULE_VIOLATION', ruleType: 'DEAD_CHARACTER_CANNOT_ACT' })] });
    expect((await WorldRepository.getCharacter(worldId, 'pc-player'))?.location_id).toBe('loc-tavern');
  });

  it('allows SYSTEM maintenance for a dead character through the real Recorder', async () => {
    await markPlayerDead();
    const startingGold = (await WorldRepository.getCharacter(worldId, 'pc-player'))!.resources.gold;
    const result = await new ProposalPipeline().processAndCommit({
      worldId,
      proposals: [proposal({
        operation: 'CHANGE_RESOURCE',
        payload: { characterId: 'pc-player', goldDelta: 1 },
        source: { type: 'SYSTEM' },
        authorityLevel: 'SYSTEM',
        causalBasis: [{ type: 'SYSTEM_EVENT', description: 'Apply maintenance adjustment.' }],
      })],
    });
    expect(result.success).toBe(true);
    expect((await WorldRepository.getCharacter(worldId, 'pc-player'))?.resources.gold).toBe(startingGold + 1);
  });

  it.each([
    ['true_nature', { true_nature: 'Changed nature' }],
    ['never_changes', { never_changes: false }],
    ['locked_at_epoch', { locked_at_epoch: 999 }],
  ])('returns a structured rule violation for ACTOR immutable truth %s changes', async (_field, immutablePayload) => {
    const result = await new ProposalPipeline().processAndCommit({
      worldId,
      proposals: [proposal({
        operation: 'REVEAL_TRUTH',
        entityType: 'HIDDEN_TRUTH',
        entityId: immutableTruthId,
        payload: { truthId: immutableTruthId, ...immutablePayload },
      })],
    });
    expect(result).toMatchObject({ success: false, rejected: [expect.objectContaining({ code: 'PROPOSAL_RULE_VIOLATION', ruleType: 'IMMUTABLE_FACT_PROTECTED' })] });
  });

  it('allows AUTHOR to override an immutable truth through the real Recorder', async () => {
    const result = await new ProposalPipeline().processAndCommit({
      worldId,
      proposals: [proposal({
        operation: 'REVEAL_TRUTH',
        entityType: 'HIDDEN_TRUTH',
        entityId: immutableTruthId,
        payload: { truthId: immutableTruthId, true_nature: 'Author-confirmed revision' },
        source: { type: 'SYSTEM' },
        authorityLevel: 'AUTHOR',
        causalBasis: [{ type: 'RULE', description: 'Author override of immutable truth.' }],
      })],
    });
    expect(result.success).toBe(true);
    expect((await WorldRepository.getHiddenTruth(worldId, immutableTruthId))?.true_nature).toBe('Author-confirmed revision');
  });

  it('keeps direct legacy Recorder mutations without authority conservative', async () => {
    await markPlayerDead();
    const deadLegacy: StateChangeProposal = {
      id: 'legacy-dead-move', operation: 'MOVE_CHARACTER', entityType: 'CHARACTER', entityId: 'pc-player',
      payload: { characterId: 'pc-player', targetLocationId: 'loc-dawnfall' }, effectiveEpoch: 1, preconditions: [], source: { type: 'SYSTEM' },
    };
    const immutableLegacy: StateChangeProposal = {
      id: 'legacy-immutable-truth', operation: 'REVEAL_TRUTH', entityType: 'HIDDEN_TRUTH', entityId: immutableTruthId,
      payload: { truthId: immutableTruthId, true_nature: 'Untrusted legacy change' }, effectiveEpoch: 1, preconditions: [], source: { type: 'SYSTEM' },
    };
    await expect(recorder.commit(worldId, [deadLegacy])).resolves.toMatchObject({ success: false });
    await expect(recorder.commit(worldId, [immutableLegacy])).resolves.toMatchObject({ success: false });
  });
});
