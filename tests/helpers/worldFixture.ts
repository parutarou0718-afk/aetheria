/**
 * Test Fixture Helper — explicit legacy default-world seeding.
 *
 * Production bootstrap now initializes an EMPTY `UNSELECTED` world and never
 * calls `initDefaultWorld()`. Many existing suites still assert on the legacy
 * default entities (pc-player, loc-tavern, org-crow, seed-caravan-01, ...).
 *
 * Those suites must call `bootstrapWithDefaultWorld()` here EXPLICITLY to seed
 * the fixture world. This is the ONLY sanctioned production-independent way to
 * reach the legacy default world in tests — through the deprecated
 * `initDefaultWorld()` fixture, never through any production startup path.
 */
import { WorldBootstrap } from '../../src/engine/world/worldBootstrap';
import { globalWorld, setRecorderWriteContext } from '../../src/engine/worldState';
import { WorldRepository } from '../../src/engine/world/worldRepository';
import { dbManager } from '../../src/engine/persistence/database';

export async function bootstrapWithDefaultWorld(worldId = 'world-snapshot-001'): Promise<void> {
  await dbFixtureBootstrap(worldId);
}

async function dbFixtureBootstrap(worldId: string): Promise<void> {
  await import('../../src/engine/persistence/database').then(({ dbManager }) => dbManager.initialize());

  // Explicit legacy default-world fixture seeding (deprecated method, test-only).
  setRecorderWriteContext(true);
  try {
    globalWorld.initDefaultWorld();
    globalWorld.snapshot.id = worldId;
  } finally {
    setRecorderWriteContext(false);
  }
  await saveAll(worldId);
}

async function saveAll(worldId: string): Promise<void> {
  await dbManager.transaction(async () => {
  await WorldRepository.saveWorldSnapshot(globalWorld.snapshot);
  for (const loc of globalWorld.locations.values()) {
    await WorldRepository.saveLocation(worldId, loc);
    for (const connId of loc.connected_to) {
      await WorldRepository.saveLocationEdge(worldId, {
        id: `edge-${loc.id}-${connId}`,
        world_id: worldId,
        from_location_id: loc.id,
        to_location_id: connId,
        distance: 1.0,
        travel_cost: 1.0,
        travel_time_epochs: 1,
        status: 'OPEN',
      });
    }
  }
  for (const char of globalWorld.characters.values()) {
    await WorldRepository.saveCharacter(worldId, char);
  }
  for (const org of globalWorld.organizations.values()) {
    await WorldRepository.saveOrganization(worldId, org);
  }
  for (const fact of globalWorld.facts.values()) {
    await WorldRepository.saveFact(worldId, fact);
  }
  for (const truth of globalWorld.hiddenTruths.values()) {
    await WorldRepository.saveHiddenTruth(worldId, truth);
  }
  for (const seed of globalWorld.seeds.values()) {
    await WorldRepository.saveSeed(worldId, seed);
  }
  for (const evt of globalWorld.events) {
    await WorldRepository.saveEvent(worldId, evt);
  }
  });
}

export { WorldBootstrap };
