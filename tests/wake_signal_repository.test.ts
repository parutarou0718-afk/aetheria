import { beforeEach, describe, expect, it } from 'vitest';
import { bootstrapWithDefaultWorld } from './helpers/worldFixture';
import { WakeSignalRepository } from '../src/engine/scheduler/wakeSignalRepository';

describe('WakeSignalRepository', () => {
  let worldId: string;

  beforeEach(async () => {
    worldId = `world-wake-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    await bootstrapWithDefaultWorld(worldId);
  });

  it('keeps one durable pending wake per entity and consumes only after a successful owner action', async () => {
    await WakeSignalRepository.enqueue({ worldId, entityId: 'npc-elder', entityType: 'CHARACTER', reason: 'PERIODIC_REFRESH', signalEpoch: 1, weight: 7 });
    await WakeSignalRepository.enqueue({ worldId, entityId: 'npc-elder', entityType: 'CHARACTER', reason: 'DEADLINE', signalEpoch: 2, weight: 2 });

    const pending = await WakeSignalRepository.listPendingOrdered(worldId);
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({ entityId: 'npc-elder', reason: 'DEADLINE', signalEpoch: 2, status: 'PENDING' });

    await WakeSignalRepository.markConsumed(worldId, ['npc-elder']);
    expect(await WakeSignalRepository.countPending(worldId)).toBe(0);
  });
});
