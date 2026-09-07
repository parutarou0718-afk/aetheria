import { beforeEach, describe, expect, it } from 'vitest';
import { QuestRepository } from '../src/engine/quest/questRepository';
import { bootstrapWithDefaultWorld } from './helpers/worldFixture';
import type { Quest } from '../src/engine/quest/questTypes';

const worldId = 'quest-repository-world';
const quest = (): Quest => ({ id: 'quest-reach-ruins', world_id: worldId, title: 'Reach the Ruins', description: 'Travel to the ruins.', status: 'AVAILABLE', giver_character_id: 'npc-elder', assignee_character_id: null, objective: { description: 'Reach the ruins.', targetType: 'CHARACTER', targetId: 'pc-player', expectedCondition: { fieldPath: 'location_id', operator: 'EQUALS', value: 'loc-ruins' } }, dependency_ids: [], created_at_epoch: 1, accepted_at_epoch: null, resolved_at_epoch: null, failure_reason: null });

describe('QuestRepository', () => {
  beforeEach(async () => { await bootstrapWithDefaultWorld(worldId); });
  it('persists and reloads a quest without exposing another world', async () => {
    await QuestRepository.saveQuest(quest());
    expect(await QuestRepository.getQuest(worldId, 'quest-reach-ruins')).toEqual(quest());
    expect(await QuestRepository.getQuest('other-world', 'quest-reach-ruins')).toBeNull();
  });
});
