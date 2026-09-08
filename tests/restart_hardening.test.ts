import { describe, expect, it } from 'vitest';
import { bootstrapWithDefaultWorld } from './helpers/worldFixture';
import { proposalPipeline } from '../src/engine/proposal/proposalPipeline';
import { createStateChangeProposal } from '../src/engine/proposal/proposalFactory';
import { MemoryEpisodeRepository } from '../src/engine/context/memoryEpisodeRepository';
import { WakeSignalRepository } from '../src/engine/scheduler/wakeSignalRepository';
import { dbManager } from '../src/engine/persistence/database';
import { WorldBootstrap } from '../src/engine/world/worldBootstrap';
import { globalWorld, setRecorderWriteContext } from '../src/engine/worldState';

describe('restart durability', () => {
  it('restores authoritative state, memory, and pending wake signals after a clean database lifecycle restart', async () => {
    const worldId = `world-restart-${crypto.randomUUID()}`;
    await bootstrapWithDefaultWorld(worldId);
    const before = globalWorld.characters.get('pc-player')!.resources.gold;
    const result = await proposalPipeline.processAndCommit({ worldId, proposals: [createStateChangeProposal({ id: crypto.randomUUID(), operation: 'CHANGE_RESOURCE', entityType: 'CHARACTER', entityId: 'pc-player', actorId: 'pc-player', payload: { characterId: 'pc-player', goldDelta: 10 }, effectiveEpoch: 1, preconditions: [], source: { type: 'SYSTEM' }, reason: 'Restart fixture.', causalBasis: [{ type: 'SYSTEM_EVENT', description: 'Restart fixture.' }], authorityLevel: 'SYSTEM' })] });
    expect(result.success).toBe(true);
    await MemoryEpisodeRepository.appendEpisode({ id: crypto.randomUUID(), worldId, observerType: 'CHARACTER', observerId: 'npc-elder', episodeType: 'ACTION', text: 'A durable restart memory.', importance: 3, epoch: 1, participantIds: [], entityIds: ['npc-elder'], sourceType: 'SYSTEM', createdAt: new Date().toISOString() });
    await WakeSignalRepository.enqueue({ worldId, entityId: 'npc-elder', entityType: 'CHARACTER', reason: 'DEADLINE', signalEpoch: 1, weight: 2 });

    await dbManager.close();
    setRecorderWriteContext(true);
    try { globalWorld.initEmptyWorld(); } finally { setRecorderWriteContext(false); }
    await WorldBootstrap.bootstrap(worldId);

    expect(globalWorld.snapshot.id).toBe(worldId);
    expect(globalWorld.characters.get('pc-player')?.resources.gold).toBe(before + 10);
    expect((await MemoryEpisodeRepository.getRecentEpisodes(worldId, 'CHARACTER', 'npc-elder', 10)).map((episode) => episode.text)).toContain('A durable restart memory.');
    expect(await WakeSignalRepository.countPending(worldId)).toBe(1);
  });
});
