import { beforeEach, describe, expect, it } from 'vitest';
import { dbManager } from '../src/engine/persistence/database';
import { InteractionRepository } from '../src/engine/context/interactionRepository';
import { MemoryEpisodeRepository } from '../src/engine/context/memoryEpisodeRepository';

describe('context sidecar persistence', () => {
  beforeEach(async () => { await dbManager.initialize(); });
  it('persists isolated interaction turns and append-only memory episodes', async () => {
    const worldId = `context-${crypto.randomUUID()}`;
    await InteractionRepository.appendTurn({ id: `turn-${crypto.randomUUID()}`, worldId, sessionId: 's1', conversationType: 'NPC', conversationId: 'NPC:npc-a:pc', speakerType: 'PLAYER', speakerId: 'pc', counterpartId: 'npc-a', content: 'hello', epoch: 1, outcomeStatus: 'SUCCESS', createdAt: new Date().toISOString() });
    await MemoryEpisodeRepository.appendEpisode({ id: `episode-${crypto.randomUUID()}`, worldId, observerType: 'CHARACTER', observerId: 'npc-a', episodeType: 'DIALOGUE', text: 'hello', importance: 3, epoch: 1, locationId: 'loc-tavern', participantIds: ['npc-a', 'pc'], entityIds: ['npc-a', 'pc'], sourceType: 'NPC_DIALOGUE', sourceId: null, createdAt: new Date().toISOString() });
    expect(await InteractionRepository.listRecentTurns(worldId, 'NPC:npc-a:pc', 10)).toHaveLength(1);
    expect(await InteractionRepository.listRecentTurns(worldId, 'NPC:npc-b:pc', 10)).toHaveLength(0);
    expect(await MemoryEpisodeRepository.getRecentEpisodes(worldId, 'CHARACTER', 'npc-a', 10)).toHaveLength(1);
  });
});
