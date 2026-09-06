import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { dbManager } from '../src/engine/persistence/database';
import { recorder } from '../src/engine/recorder/recorder';
import { TransactionService } from '../src/engine/timeline/transactionService';
import { bootstrapWithDefaultWorld } from './helpers/worldFixture';

describe('timeline transaction proposal pipeline integration', () => {
  let worldId: string;

  beforeEach(async () => {
    worldId = `world-proposal-pipeline-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    await dbManager.initialize();
    await bootstrapWithDefaultWorld(worldId);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('commits a timeline transaction batch once with complete proposal v2 metadata', async () => {
    const commitSpy = vi.spyOn(recorder, 'commit');

    const travel = await TransactionService.planTravel({
      worldId,
      actorId: 'pc-player',
      destinationLocationId: 'loc-ruins',
      startEpoch: 1,
    });

    expect(commitSpy).toHaveBeenCalledOnce();
    const [committedWorldId, proposals] = commitSpy.mock.calls[0];
    expect(committedWorldId).toBe(worldId);
    expect(proposals).toHaveLength(travel.checkpoints.length + 4);
    for (const proposal of proposals) {
      expect(proposal).toMatchObject({
        reason: 'Execute approved timeline or scheduler transaction.',
        authorityLevel: 'SYSTEM',
        causalBasis: [{ type: 'SYSTEM_EVENT' }],
      });
    }
  });
});
