import { beforeEach, describe, expect, it } from 'vitest';
import { bootstrapWithDefaultWorld } from './helpers/worldFixture';
import { globalWorld } from '../src/engine/worldState';
import { WorldRepository } from '../src/engine/world/worldRepository';
import { ContextAssembler } from '../src/engine/context/contextAssembler';
import { InteractionRepository } from '../src/engine/context/interactionRepository';
import { MemoryEpisodeRepository } from '../src/engine/context/memoryEpisodeRepository';

describe('context assembly isolation', () => {
  beforeEach(async () => { await bootstrapWithDefaultWorld(`world-context-${crypto.randomUUID()}`); });

  it('keeps hidden truth and another NPC transcript out of NPC context', async () => {
    const worldId = globalWorld.snapshot.id;
    await WorldRepository.saveHiddenTruth(worldId, { id: 'truth-private', title: 'Secret', layer: 'layer_1_personal_secrets', layer_name: 'Secret', exists: true, true_nature: 'never disclose', revealed: false, revealed_to_ids: [], locked_at_epoch: 1, never_changes: true, evidence_required: [], evidence_collected: [] });
    await InteractionRepository.appendTurn({ id: `turn-${crypto.randomUUID()}`, worldId, sessionId: 's', conversationType: 'NPC', conversationId: 'NPC:npc-other:pc-player', speakerType: 'PLAYER', speakerId: 'pc-player', counterpartId: 'npc-other', content: 'private line for other npc', epoch: 1, outcomeStatus: 'SUCCESS', createdAt: new Date().toISOString() });
    await MemoryEpisodeRepository.appendEpisode({ id: `episode-${crypto.randomUUID()}`, worldId, observerType: 'CHARACTER', observerId: 'npc-other', episodeType: 'DIALOGUE', text: 'private line for other npc', importance: 8, epoch: 1, participantIds: ['npc-other', 'pc-player'], entityIds: ['npc-other', 'pc-player'], sourceType: 'NPC_DIALOGUE', createdAt: new Date().toISOString() });

    const packet = await ContextAssembler.assemble({ worldId, userId: 'u', sessionId: 's', actorId: 'pc-player', npcId: 'npc-elder', purpose: 'NPC_DIALOGUE', currentEpoch: globalWorld.snapshot.epoch, userInput: 'hello' });
    const serialized = JSON.stringify(packet);
    expect(packet.narratorPrivate).toBeUndefined();
    expect(serialized).not.toContain('truth-private');
    expect(serialized).not.toContain('never disclose');
    expect(serialized).not.toContain('private line for other npc');
    expect(packet.actor).toMatchObject({ id: 'npc-elder' });
  });

  it('keeps player knowledge separate while giving the DM bounded narrator-private truth', async () => {
    const worldId = globalWorld.snapshot.id;
    await WorldRepository.saveHiddenTruth(worldId, { id: 'truth-dm', title: 'Guard secret', layer: 'layer_1_personal_secrets', layer_name: 'Secret', exists: true, true_nature: 'guard is dead', true_owner_id: 'npc-elder', revealed: false, revealed_to_ids: [], locked_at_epoch: 1, never_changes: true, evidence_required: [], evidence_collected: [] });
    const packet = await ContextAssembler.assemble({ worldId, userId: 'u', sessionId: 's', actorId: 'pc-player', purpose: 'DM_ACTION', currentEpoch: globalWorld.snapshot.epoch, userInput: 'ask the guard' });
    expect(JSON.stringify(packet.narratorPrivate)).toContain('guard is dead');
    expect(JSON.stringify(packet.observerKnowledge)).not.toContain('guard is dead');
    expect((packet.narratorPrivate as { hiddenTruths: unknown[] }).hiddenTruths).toHaveLength(1);
  });
});
