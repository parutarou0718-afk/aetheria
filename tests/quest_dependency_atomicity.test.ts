import { beforeEach, describe, expect, it, vi } from 'vitest';
import { dbManager } from '../src/engine/persistence/database';
import { DependencyRepository } from '../src/engine/dependency/dependencyRepository';
import { DependencyGraph } from '../src/engine/dependency/dependencyGraph';
import { WorldRepository } from '../src/engine/world/worldRepository';
import { bootstrapWithDefaultWorld } from './helpers/worldFixture';
import { QuestRepository } from '../src/engine/quest/questRepository';
import { DependencyImpactService } from '../src/engine/dependency/dependencyImpactService';
import { proposalPipeline } from '../src/engine/proposal/proposalPipeline';

describe('QUEST dependency atomic lifecycle', () => {
  let worldId: string;
  beforeEach(async () => {
    worldId = `quest-atomic-${crypto.randomUUID()}`;
    await dbManager.initialize();
    await bootstrapWithDefaultWorld(worldId);
  });

  async function createImpactedQuest(status: 'ACTIVE' | 'AVAILABLE', policy: 'FAIL_SOURCE' | 'INVALIDATE_SOURCE') {
    const questId = `quest-${crypto.randomUUID()}`;
    const dependencyId = `dep-${crypto.randomUUID()}`;
    await QuestRepository.saveQuest({ id: questId, world_id: worldId, title: 'Reach ruins', description: 'Reach ruins.', status, giver_character_id: 'npc-elder', assignee_character_id: status === 'ACTIVE' ? 'pc-player' : null, objective: { description: 'Reach ruins.', targetType: 'CHARACTER', targetId: 'pc-player', expectedCondition: { operator: 'EQUALS', fieldPath: 'location_id', value: 'loc-ruins' } }, dependency_ids: [dependencyId], created_at_epoch: 1, accepted_at_epoch: status === 'ACTIVE' ? 1 : null, resolved_at_epoch: null, failure_reason: null });
    await DependencyRepository.saveDependency(worldId, { id: dependencyId, world_id: worldId, source_type: 'QUEST', source_id: questId, dependency_type: 'LOCATION_STATUS', target_type: 'LOCATION', target_id: 'loc-ruins', expected_condition: { operator: 'NOT_IN', fieldPath: 'status', value: ['DESTROYED'] }, status: 'ACTIVE', failure_policy: policy, created_at_epoch: 1 });
    return { questId, dependencyId };
  }

  it('does not persistently invalidate a QUEST dependency during evaluation before its terminal batch commits', async () => {
    const dependency = {
      id: `dep-${crypto.randomUUID()}`, world_id: worldId, source_type: 'QUEST' as const, source_id: 'quest-pending',
      dependency_type: 'LOCATION_STATUS' as const, target_type: 'LOCATION' as const, target_id: 'loc-ruins',
      expected_condition: { operator: 'NOT_IN' as const, fieldPath: 'status', value: ['DESTROYED'] },
      status: 'ACTIVE' as const, failure_policy: 'INVALIDATE_SOURCE' as const, created_at_epoch: 1,
    };
    await DependencyRepository.saveDependency(worldId, dependency);
    const ruins = await WorldRepository.getLocation(worldId, 'loc-ruins');
    if (!ruins) throw new Error('fixture ruins missing');
    ruins.status = 'DESTROYED';
    await WorldRepository.saveLocation(worldId, ruins);

    const impacts = await DependencyGraph.evaluateTargets(worldId, [{ targetType: 'LOCATION', targetId: 'loc-ruins', changedFieldPaths: ['status'] }], 2);
    expect(impacts).toHaveLength(1);
    expect(await DependencyRepository.getDependency(worldId, dependency.id)).toMatchObject({ status: 'ACTIVE' });
  });

  it('atomically invalidates an available quest and all of its dependencies', async () => {
    const questId = `quest-${crypto.randomUUID()}`;
    const failedId = `dep-failed-${crypto.randomUUID()}`;
    const remainingId = `dep-remaining-${crypto.randomUUID()}`;
    await QuestRepository.saveQuest({ id: questId, world_id: worldId, title: 'Reach ruins', description: 'Reach ruins.', status: 'AVAILABLE', giver_character_id: 'npc-elder', assignee_character_id: null, objective: { description: 'Reach ruins.', targetType: 'CHARACTER', targetId: 'pc-player', expectedCondition: { operator: 'EQUALS', fieldPath: 'location_id', value: 'loc-ruins' } }, dependency_ids: [failedId, remainingId], created_at_epoch: 1, accepted_at_epoch: null, resolved_at_epoch: null, failure_reason: null });
    await DependencyRepository.saveDependency(worldId, { id: failedId, world_id: worldId, source_type: 'QUEST', source_id: questId, dependency_type: 'LOCATION_STATUS', target_type: 'LOCATION', target_id: 'loc-ruins', expected_condition: { operator: 'NOT_IN', fieldPath: 'status', value: ['DESTROYED'] }, status: 'ACTIVE', failure_policy: 'FAIL_SOURCE', created_at_epoch: 1 });
    await DependencyRepository.saveDependency(worldId, { id: remainingId, world_id: worldId, source_type: 'QUEST', source_id: questId, dependency_type: 'ACTOR_ALIVE', target_type: 'CHARACTER', target_id: 'pc-player', expected_condition: { operator: 'NOT_EQUALS', fieldPath: 'status', value: 'DEAD' }, status: 'ACTIVE', failure_policy: 'INVALIDATE_SOURCE', created_at_epoch: 1 });
    const ruins = await WorldRepository.getLocation(worldId, 'loc-ruins');
    if (!ruins) throw new Error('fixture ruins missing');
    ruins.status = 'DESTROYED';
    await WorldRepository.saveLocation(worldId, ruins);
    const result = await DependencyImpactService.processCommittedChanges({ worldId, epoch: 2, changedTargets: [{ targetType: 'LOCATION', targetId: 'loc-ruins', changedFieldPaths: ['status'] }] });
    expect(result.committedProposalCount).toBeGreaterThan(0);
    expect(await QuestRepository.getQuest(worldId, questId)).toMatchObject({ status: 'INVALIDATED' });
    expect(await DependencyRepository.getDependency(worldId, failedId)).toMatchObject({ status: 'INVALIDATED' });
    expect(await DependencyRepository.getDependency(worldId, remainingId)).toMatchObject({ status: 'REMOVED' });
  });

  it('fails an active quest for FAIL_SOURCE and invalidates it for INVALIDATE_SOURCE', async () => {
    const fail = await createImpactedQuest('ACTIVE', 'FAIL_SOURCE');
    const invalidate = await createImpactedQuest('ACTIVE', 'INVALIDATE_SOURCE');
    const ruins = await WorldRepository.getLocation(worldId, 'loc-ruins');
    if (!ruins) throw new Error('fixture ruins missing');
    ruins.status = 'DESTROYED';
    await WorldRepository.saveLocation(worldId, ruins);
    const result = await DependencyImpactService.processCommittedChanges({ worldId, epoch: 2, changedTargets: [{ targetType: 'LOCATION', targetId: 'loc-ruins', changedFieldPaths: ['status'] }] });
    expect(result.invalidatedDependencies).toBe(2);
    expect(await QuestRepository.getQuest(worldId, fail.questId)).toMatchObject({ status: 'FAILED' });
    expect(await QuestRepository.getQuest(worldId, invalidate.questId)).toMatchObject({ status: 'INVALIDATED' });
  });

  it('keeps Quest and dependency unchanged when the atomic terminal batch is rejected', async () => {
    const item = await createImpactedQuest('ACTIVE', 'FAIL_SOURCE');
    const ruins = await WorldRepository.getLocation(worldId, 'loc-ruins');
    if (!ruins) throw new Error('fixture ruins missing');
    ruins.status = 'DESTROYED';
    await WorldRepository.saveLocation(worldId, ruins);
    const spy = vi.spyOn(proposalPipeline, 'processAndCommit').mockResolvedValue({ success: false, accepted: [], rejected: [{ proposalId: 'terminal', code: 'PROPOSAL_BATCH_REJECTED', message: 'rejected' }] });
    const rejected = await DependencyImpactService.processCommittedChanges({ worldId, epoch: 2, changedTargets: [{ targetType: 'LOCATION', targetId: 'loc-ruins', changedFieldPaths: ['status'] }] });
    expect(rejected.invalidatedDependencies).toBe(0);
    expect(rejected.warnings.join(' ')).toContain('PROPOSAL_BATCH_REJECTED');
    expect(await QuestRepository.getQuest(worldId, item.questId)).toMatchObject({ status: 'ACTIVE' });
    expect(await DependencyRepository.getDependency(worldId, item.dependencyId)).toMatchObject({ status: 'ACTIVE' });
    spy.mockRestore();
    const retried = await DependencyImpactService.processCommittedChanges({ worldId, epoch: 3, changedTargets: [{ targetType: 'LOCATION', targetId: 'loc-ruins', changedFieldPaths: ['status'] }] });
    expect(retried.invalidatedDependencies).toBe(1);
    expect(await QuestRepository.getQuest(worldId, item.questId)).toMatchObject({ status: 'FAILED' });
  });
});
