import { beforeEach, describe, expect, it } from 'vitest';
import { bootstrapWithDefaultWorld } from './helpers/worldFixture';
import { NpcAutonomyRunRepository } from '../src/engine/autonomy/npcAutonomyRunRepository';
import { MemoryEpisodeRepository } from '../src/engine/context/memoryEpisodeRepository';
import { RuntimeReconciliationService } from '../src/engine/autonomy/runtimeReconciliationService';

describe('RuntimeReconciliationService', () => {
  let worldId: string;
  beforeEach(async () => { worldId = `world-reconcile-${crypto.randomUUID()}`; await bootstrapWithDefaultWorld(worldId); });

  it('proves a stale DECIDED autonomy run committed only from its authoritative ACTION memory', async () => {
    const run = (await NpcAutonomyRunRepository.claimRun({ worldId, npcId: 'npc-elder', epoch: 1, triggerReason: 'DEADLINE' }))!;
    await NpcAutonomyRunRepository.updateRun(run.id, 'DECIDED');
    await MemoryEpisodeRepository.appendEpisode({ id: crypto.randomUUID(), worldId, observerType: 'CHARACTER', observerId: 'npc-elder', episodeType: 'ACTION', text: 'waited', importance: 2, epoch: 1, participantIds: [], entityIds: ['npc-elder'], sourceType: 'NPC_AUTONOMY', sourceId: run.id, createdAt: new Date().toISOString() });
    await RuntimeReconciliationService.reconcileWorld(worldId, 2);
    expect(await NpcAutonomyRunRepository.getRun(worldId, 'npc-elder', 1)).toMatchObject({ status: 'COMMITTED' });
  });

  it('marks stale non-committed autonomy work failed rather than rerunning it', async () => {
    const run = (await NpcAutonomyRunRepository.claimRun({ worldId, npcId: 'npc-elder', epoch: 1, triggerReason: 'DEADLINE' }))!;
    await RuntimeReconciliationService.reconcileWorld(worldId, 2);
    expect(await NpcAutonomyRunRepository.getRun(worldId, 'npc-elder', 1)).toMatchObject({ status: 'FAILED', errorCode: 'RECOVERED_STALE_AUTONOMY_RUN' });
  });
});
