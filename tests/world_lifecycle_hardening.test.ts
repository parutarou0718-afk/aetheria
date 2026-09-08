import { beforeEach, describe, expect, it } from 'vitest';
import { bootstrapWithDefaultWorld } from './helpers/worldFixture';
import { WorldBootstrap } from '../src/engine/world/worldBootstrap';
import { WorldRepository } from '../src/engine/world/worldRepository';
import { WorldResetService } from '../src/engine/world/worldResetService';
import { dbManager } from '../src/engine/persistence/database';
import { globalWorld } from '../src/engine/worldState';

describe('world lifecycle durability boundaries', () => {
  let worldId: string;

  beforeEach(async () => {
    worldId = `world-lifecycle-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    await bootstrapWithDefaultWorld(worldId);
  });

  it('fails closed instead of replacing a CREATED snapshot with no PC', async () => {
    const snapshot = (await WorldRepository.getWorldSnapshot(worldId))!;
    await WorldRepository.deleteWorldData(worldId);
    await WorldRepository.saveWorldSnapshot({ ...snapshot, id: worldId, world_creation_state: 'CREATED' });
    const beforeName = globalWorld.snapshot.world_name;

    await expect(WorldBootstrap.bootstrap(worldId)).rejects.toMatchObject({ code: 'WORLD_BOOTSTRAP_INTEGRITY_ERROR' });
    expect((await WorldRepository.getWorldSnapshot(worldId))?.world_creation_state).toBe('CREATED');
    expect(globalWorld.snapshot.world_name).toBe(beforeName);
  });

  it('keeps the published world unchanged when reset persistence fails', async () => {
    const beforeName = globalWorld.snapshot.world_name;
    const beforeCharacterCount = globalWorld.characters.size;
    dbManager.setPersistenceFaultForTest(new Error('simulated reset persistence failure'));

    await expect(WorldResetService.reset(worldId)).rejects.toMatchObject({ code: 'DATABASE_DURABILITY_FAILED' });
    expect(globalWorld.snapshot.world_name).toBe(beforeName);
    expect(globalWorld.characters.size).toBe(beforeCharacterCount);
    expect((await WorldRepository.getWorldSnapshot(worldId))?.world_creation_state).toBe('CREATED');
  });
});
