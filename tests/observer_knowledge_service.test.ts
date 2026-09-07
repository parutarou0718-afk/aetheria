import { beforeEach, describe, expect, it } from 'vitest';
import { dbManager } from '../src/engine/persistence/database';
import { ObservedHistoryRepository } from '../src/engine/history/observedHistoryRepository';
import { ObserverKnowledgeService } from '../src/engine/history/observerKnowledgeService';
import { bootstrapWithDefaultWorld } from './helpers/worldFixture';

const worldId = 'observer-knowledge-service';
describe('ObserverKnowledgeService', () => {
  beforeEach(async () => { await dbManager.initialize(); await bootstrapWithDefaultWorld(worldId); });
  const save = (id: string, observerId: string, value: unknown, epoch: number, options: Record<string, unknown> = {}) =>
    ObservedHistoryRepository.saveObservation(worldId, {
      id, world_id: worldId, observer_type: 'CHARACTER', observer_id: observerId, subject_type: 'CHARACTER', subject_id: 'npc-guard',
      observation_type: 'DIRECT_SIGHT', observed_epoch: epoch, recorded_epoch: epoch, fact_path: 'status', observed_value: value,
      confidence: 1, visibility: 'PRIVATE', immutable_history: true, metadata: { epistemic_status: 'CONFIRMED_FACT' }, ...options,
    } as any);

  it('returns only private and public observed knowledge at the requested epoch, deduped to the latest fact', async () => {
    await save('old', 'npc-guard', 'ALIVE', 1);
    await save('latest', 'npc-guard', 'WOUNDED', 2);
    await save('other', 'npc-other', 'SECRET', 2);
    await save('future', 'npc-guard', 'FUTURE', 4);
    await ObservedHistoryRepository.saveObservation(worldId, {
      id: 'public', world_id: worldId, observer_type: 'PUBLIC', observer_id: 'world', subject_type: 'LOCATION', subject_id: 'loc-tavern',
      observation_type: 'PUBLIC_KNOWLEDGE', observed_epoch: 2, recorded_epoch: 2, fact_path: 'status', observed_value: 'ACTIVE', confidence: 1,
      visibility: 'PUBLIC', immutable_history: true, metadata: { epistemic_status: 'CONFIRMED_FACT' },
    });
    const result = await new ObserverKnowledgeService().getKnowledgeSnapshot({ worldId, observerType: 'CHARACTER', observerId: 'npc-guard', atEpoch: 2 });
    expect(result.confirmedFacts).toEqual(expect.arrayContaining([
      expect.objectContaining({ subjectId: 'npc-guard', value: 'WOUNDED' }),
      expect.objectContaining({ subjectId: 'loc-tavern', value: 'ACTIVE' }),
    ]));
    expect(JSON.stringify(result)).not.toContain('SECRET');
    expect(JSON.stringify(result)).not.toContain('FUTURE');
  });
});
