import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bootstrapWithDefaultWorld } from './helpers/worldFixture';
import { SchedulerEngine } from '../src/engine/scheduler';
import { WakeSignalRepository } from '../src/engine/scheduler/wakeSignalRepository';
import { GlobalTimeline } from '../src/engine/timeline/globalTimeline';

describe('scheduler committed epoch boundary', () => {
  beforeEach(() => { vi.restoreAllMocks(); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('keeps the committed epoch when wake cleanup or timeline sidecars fail', async () => {
    const worldId = `world-scheduler-boundary-${crypto.randomUUID()}`;
    await bootstrapWithDefaultWorld(worldId);
    vi.spyOn(WakeSignalRepository, 'markConsumed').mockRejectedValueOnce(new Error('wake cleanup'));
    vi.spyOn(GlobalTimeline, 'processUntil').mockRejectedValueOnce(new Error('timeline'));
    const result = await SchedulerEngine.processEpochTick(worldId);
    expect(result.epoch).toBe(2);
    expect(result.warnings.join(' ')).toContain('Wake cleanup');
    expect(result.warnings.join(' ')).toContain('Timeline processing');
  });
});
