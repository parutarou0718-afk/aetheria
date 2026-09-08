import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PlayerTimeService } from '../src/application/player/playerTimeService';
import { SchedulerEngine } from '../src/engine/scheduler';
import { CausalityEngine } from '../src/engine/causality';

describe('player time commit boundary', () => {
  beforeEach(() => { vi.restoreAllMocks(); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('reports the committed epoch when causality processing fails afterwards', async () => {
    vi.spyOn(SchedulerEngine, 'processEpochTick').mockResolvedValue({ committed: true, epoch: 42, woken_entities: [], events_generated: 0, catchup_performed: 0, warnings: [] });
    vi.spyOn(CausalityEngine, 'tickSeeds').mockRejectedValue(new Error('sidecar failure'));
    await expect(new PlayerTimeService().advance('world-time-boundary')).resolves.toMatchObject({ newEpoch: 42, warnings: [expect.stringContaining('deferred')] });
  });
});
