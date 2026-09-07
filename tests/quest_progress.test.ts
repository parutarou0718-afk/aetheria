import { beforeEach, describe, expect, it } from 'vitest';
import { dbManager } from '../src/engine/persistence/database';
import { QuestRepository } from '../src/engine/quest/questRepository';
import { QuestConditionEvaluator } from '../src/engine/quest/questConditionEvaluator';
import { QuestProgressService } from '../src/engine/quest/questProgressService';
import { WorldRepository } from '../src/engine/world/worldRepository';
import { bootstrapWithDefaultWorld } from './helpers/worldFixture';
import type { Quest } from '../src/engine/quest/questTypes';
import { DependencyRepository } from '../src/engine/dependency/dependencyRepository';

describe('quest objective evaluation and progress', () => {
  let worldId: string;
  let quest: Quest;
  beforeEach(async () => {
    worldId = `quest-progress-${crypto.randomUUID()}`;
    await dbManager.initialize();
    await bootstrapWithDefaultWorld(worldId);
    quest = { id: `quest-${crypto.randomUUID()}`, world_id: worldId, title: 'Reach the Ruins', description: 'Arrive at the ruins.', status: 'ACTIVE', giver_character_id: 'npc-elder', assignee_character_id: 'pc-player', objective: { description: 'Reach the ruins.', targetType: 'CHARACTER', targetId: 'pc-player', expectedCondition: { operator: 'EQUALS', fieldPath: 'location_id', value: 'loc-ruins' } }, dependency_ids: [], created_at_epoch: 1, accepted_at_epoch: 1, resolved_at_epoch: null, failure_reason: null };
    await QuestRepository.saveQuest(quest);
    await DependencyRepository.saveDependency(worldId, { id: `dep-progress-${quest.id}`, world_id: worldId, source_type: 'QUEST', source_id: quest.id, dependency_type: 'ACTOR_ALIVE', target_type: 'CHARACTER', target_id: 'pc-player', expected_condition: { operator: 'NOT_EQUALS', fieldPath: 'status', value: 'DEAD' }, status: 'ACTIVE', failure_policy: 'INVALIDATE_SOURCE', created_at_epoch: 1 });
    quest.dependency_ids = [`dep-progress-${quest.id}`];
    await QuestRepository.saveQuest(quest);
  });
  it('uses authoritative location state and completes only after the objective becomes true', async () => {
    expect(await QuestConditionEvaluator.evaluate({ worldId, quest })).toBe(false);
    expect(await QuestProgressService.processCommittedChanges({ worldId, epoch: 1, changedTargets: [{ targetType: 'CHARACTER', targetId: 'pc-player', changedFieldPaths: ['location_id'] }] })).toBeNull();
    const player = await WorldRepository.getCharacter(worldId, 'pc-player');
    if (!player) throw new Error('fixture player missing');
    player.location_id = 'loc-ruins';
    await WorldRepository.saveCharacter(worldId, player);
    const completion = await QuestProgressService.processCommittedChanges({ worldId, epoch: 2, changedTargets: [{ targetType: 'CHARACTER', targetId: 'pc-player', changedFieldPaths: ['location_id'] }] });
    expect(completion?.success).toBe(true);
    expect(await QuestRepository.getQuest(worldId, quest.id)).toMatchObject({ status: 'COMPLETED', resolved_at_epoch: 2 });
    expect(await DependencyRepository.getDependency(worldId, `dep-progress-${quest.id}`)).toMatchObject({ status: 'REMOVED' });
  });
});
