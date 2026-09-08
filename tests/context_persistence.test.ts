import { beforeEach, describe, expect, it } from 'vitest';
import { dbManager } from '../src/engine/persistence/database';
import { InteractionRepository } from '../src/engine/context/interactionRepository';
import { MemoryEpisodeRepository } from '../src/engine/context/memoryEpisodeRepository';
import { MemoryRetrievalService } from '../src/engine/context/memoryRetrievalService';

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

  it('retrieves an old relevant high-importance episode deterministically', async () => {
    const worldId = `context-memory-${crypto.randomUUID()}`;
    const oldId = `old-merchant-${crypto.randomUUID()}`;
    await dbManager.transaction(async () => {
      await MemoryEpisodeRepository.appendEpisode({ id: oldId, worldId, observerType: 'CHARACTER', observerId: 'npc-a', episodeType: 'DIALOGUE', text: 'The merchant betrayed us at the bridge.', importance: 8, epoch: 2, locationId: 'bridge', participantIds: [], entityIds: ['merchant'], sourceType: 'NPC_DIALOGUE', createdAt: '2020-01-01T00:00:00.000Z' });
      for (let i = 0; i < 110; i++) await MemoryEpisodeRepository.appendEpisode({ id: `weather-${crypto.randomUUID()}`, worldId, observerType: 'CHARACTER', observerId: 'npc-a', episodeType: 'DIALOGUE', text: 'The weather is calm.', importance: 1, epoch: 100 + i, participantIds: [], entityIds: [], sourceType: 'NPC_DIALOGUE', createdAt: `2020-01-02T00:00:${String(i % 60).padStart(2, '0')}.000Z` });
    });
    const selected = await MemoryRetrievalService.retrieve({ worldId, observerType: 'CHARACTER', observerId: 'npc-a', userInput: 'merchant betrayed us', locationId: 'bridge', limit: 3 });
    expect(selected[0]?.id).toBe(oldId);
  });

  it('selects relevant older transcript after current-session turns', async () => {
    const worldId = `context-turns-${crypto.randomUUID()}`;
    const conversationId = 'DM:pc';
    await InteractionRepository.appendTurn({ id: `old-${crypto.randomUUID()}`, worldId, sessionId: 'old', conversationType: 'DM', conversationId, speakerType: 'PLAYER', speakerId: 'pc', content: 'The merchant betrayed us at the bridge.', epoch: 2, outcomeStatus: 'SUCCESS', createdAt: '2020-01-01T00:00:00.000Z' });
    for (let i = 0; i < 14; i++) await InteractionRepository.appendTurn({ id: `new-${crypto.randomUUID()}`, worldId, sessionId: 'new', conversationType: 'DM', conversationId, speakerType: 'PLAYER', speakerId: 'pc', content: `irrelevant weather ${i}`, epoch: 20 + i, outcomeStatus: 'SUCCESS', createdAt: new Date().toISOString() });
    const current = await InteractionRepository.listRecentSessionTurns(worldId, conversationId, 'new', 12);
    const older = await InteractionRepository.listRelevantOlderTurns(worldId, conversationId, 'new', 'What happened with that merchant?', 3);
    expect(current).toHaveLength(12);
    expect(older.map(turn => turn.content)).toContain('The merchant betrayed us at the bridge.');
  });
});
