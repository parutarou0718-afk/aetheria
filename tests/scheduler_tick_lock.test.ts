import { describe, expect, it } from 'vitest';
import { bootstrapWithDefaultWorld } from './helpers/worldFixture';
import { SchedulerEngine } from '../src/engine/scheduler';
import { globalWorld } from '../src/engine/worldState';

describe('Scheduler tick lock', () => {
  it('serializes concurrent tick callers into distinct committed epochs', async () => {
    const worldId = `world-tick-lock-${crypto.randomUUID()}`;
    await bootstrapWithDefaultWorld(worldId);
    const [first, second] = await Promise.all([
      SchedulerEngine.processEpochTick(worldId),
      SchedulerEngine.processEpochTick(worldId),
    ]);
    expect([first.epoch, second.epoch].sort()).toEqual([2, 3]);
    expect(globalWorld.snapshot.epoch).toBe(3);
  });
});
