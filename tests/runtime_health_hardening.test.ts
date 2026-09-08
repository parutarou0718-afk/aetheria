import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bootstrapWithDefaultWorld } from './helpers/worldFixture';
import { recorder } from '../src/engine/recorder/recorder';
import { CachePublisher } from '../src/engine/recorder/cachePublisher';
import { WorldCacheLoader } from '../src/engine/world/worldCacheLoader';
import { runtimeHealth } from '../src/engine/runtime/runtimeHealthService';

describe('runtime health degradation', () => {
  let worldId: string;
  beforeEach(async () => { worldId = `world-health-${crypto.randomUUID()}`; await bootstrapWithDefaultWorld(worldId); runtimeHealth.markDatabaseHealthy(); runtimeHealth.markBootstrapHealthy(); runtimeHealth.markCacheSynchronized(); });
  afterEach(() => { vi.restoreAllMocks(); runtimeHealth.markCacheSynchronized(); });

  it('preserves a durable commit but marks the runtime not ready when cache publish and reload both fail', async () => {
    vi.spyOn(CachePublisher, 'publish').mockImplementation(() => { throw new Error('publish failed'); });
    vi.spyOn(WorldCacheLoader, 'reload').mockRejectedValue(new Error('reload failed'));
    const result = await recorder.commit(worldId, [{ id: crypto.randomUUID(), operation: 'CHANGE_RESOURCE', entityType: 'CHARACTER', entityId: 'pc-player', payload: { characterId: 'pc-player', goldDelta: 1 }, effectiveEpoch: 1, preconditions: [], source: { type: 'SYSTEM' } }]);
    expect(result).toMatchObject({ success: true, cacheOutOfSync: true });
    expect(runtimeHealth.isReady()).toBe(false);
  });
});
