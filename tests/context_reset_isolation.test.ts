import { describe, expect, it } from 'vitest';
import { bootstrapWithDefaultWorld } from './helpers/worldFixture';
import { WorldRepository } from '../src/engine/world/worldRepository';
import { QuestRepository } from '../src/engine/quest/questRepository';
import { InteractionRepository } from '../src/engine/context/interactionRepository';
import { MemoryEpisodeRepository } from '../src/engine/context/memoryEpisodeRepository';

describe('world reset context isolation', () => {
  it('removes quest and context sidecars before the same world id is recreated', async () => {
    const worldId = `reset-context-${crypto.randomUUID()}`;
    await bootstrapWithDefaultWorld(worldId);
    await QuestRepository.saveQuest({ id: `quest-${crypto.randomUUID()}`, world_id: worldId, title: 'Old quest', description: 'old', status: 'AVAILABLE', giver_character_id: 'npc-elder', assignee_character_id: null, objective: { description: 'old', targetType: 'CHARACTER', targetId: 'pc-player', expectedCondition: { operator: 'EQUALS', fieldPath: 'status', value: 'ALIVE' } }, dependency_ids: [], created_at_epoch: 1, accepted_at_epoch: null, resolved_at_epoch: null, failure_reason: null });
    await InteractionRepository.appendTurn({ id: `turn-${crypto.randomUUID()}`, worldId, sessionId: 's', conversationType: 'DM', conversationId: 'DM:pc-player', speakerType: 'PLAYER', speakerId: 'pc-player', content: 'old transcript', epoch: 1, outcomeStatus: 'SUCCESS', createdAt: new Date().toISOString() });
    await MemoryEpisodeRepository.appendEpisode({ id: `episode-${crypto.randomUUID()}`, worldId, observerType: 'PLAYER', observerId: 'pc-player', episodeType: 'DIALOGUE', text: 'old memory', importance: 5, epoch: 1, participantIds: [], entityIds: [], sourceType: 'TEST', createdAt: new Date().toISOString() });

    await WorldRepository.deleteWorldData(worldId);
    await bootstrapWithDefaultWorld(worldId);

    expect(await QuestRepository.listActiveByAssignee(worldId, 'pc-player')).toEqual([]);
    expect(await QuestRepository.listAvailableByGiver(worldId, 'npc-elder')).toEqual([]);
    expect(await InteractionRepository.listRecentTurns(worldId, 'DM:pc-player', 20)).toEqual([]);
    expect(await MemoryEpisodeRepository.getRecentEpisodes(worldId, 'PLAYER', 'pc-player', 20)).toEqual([]);
  });
});
