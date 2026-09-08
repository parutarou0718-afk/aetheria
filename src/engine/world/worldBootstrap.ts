import { dbManager } from '../persistence/database';
import { WorldRepository } from './worldRepository';
import { globalWorld, setRecorderWriteContext } from '../worldState';
import { PlayerRequestRunRepository } from '../../application/player/playerRequestRunRepository';
import { RuntimeReconciliationService } from '../autonomy/runtimeReconciliationService';

export class WorldBootstrapIntegrityError extends Error {
  public readonly code = 'WORLD_BOOTSTRAP_INTEGRITY_ERROR';

  constructor(message: string) {
    super(message);
    this.name = 'WorldBootstrapIntegrityError';
  }
}

export class WorldBootstrap {
  public static async bootstrap(worldId = 'world-snapshot-001'): Promise<void> {
    await dbManager.initialize();
    await PlayerRequestRunRepository.markInProgressUnknown();

    const existingSnapshot = await WorldRepository.getWorldSnapshot(worldId);
    const chars = existingSnapshot ? await WorldRepository.getAllCharacters(worldId) : [];

    if (!existingSnapshot) {
      console.log(`[WorldBootstrap] No persistent world or empty characters found for ${worldId}. Initializing an EMPTY awaiting-genesis world (UNSELECTED)...`);
      setRecorderWriteContext(true);
      try {
        globalWorld.initEmptyWorld();
        globalWorld.snapshot.id = worldId;
      } finally {
        setRecorderWriteContext(false);
      }
      await this.saveAllToDatabase(worldId);
      console.log(`[WorldBootstrap] Empty world ${worldId} initialized and persisted to SQLite. world_creation_state=UNSELECTED.`);
    } else if (existingSnapshot.world_creation_state === 'UNSELECTED') {
      await this.loadFromDatabase(worldId);
      setRecorderWriteContext(true);
      try {
        globalWorld.snapshot.id = worldId;
      } finally {
        setRecorderWriteContext(false);
      }
      await RuntimeReconciliationService.reconcileWorld(worldId, globalWorld.snapshot.epoch);
    } else {
      const playerCharacter = chars.find((character) => character.type === 'PC');
      if (!playerCharacter) {
        throw new WorldBootstrapIntegrityError(`Persisted CREATED world ${worldId} has no player character.`);
      }
      console.log(`[WorldBootstrap] Loading persistent world ${worldId} (Epoch ${existingSnapshot.epoch}) from SQLite...`);
      await this.loadFromDatabase(worldId);
      setRecorderWriteContext(true);
      try {
        globalWorld.snapshot.id = worldId;
      } finally {
        setRecorderWriteContext(false);
      }
      await RuntimeReconciliationService.reconcileWorld(worldId, globalWorld.snapshot.epoch);
      console.log(`[WorldBootstrap] Successfully restored world state from SQLite! (${globalWorld.characters.size} characters, ${globalWorld.locations.size} locations, ${globalWorld.organizations.size} organizations)`);
    }
  }

  public static async loadFromDatabase(worldId = 'world-snapshot-001'): Promise<void> {
    const snapshot = await WorldRepository.getWorldSnapshot(worldId);
    if (!snapshot) return;

    setRecorderWriteContext(true);
    try {
      globalWorld.snapshot = snapshot;

      const chars = await WorldRepository.getAllCharacters(worldId);
      globalWorld.characters.clear();
      chars.forEach((c) => globalWorld.characters.set(c.id, c));

      const locs = await WorldRepository.getAllLocations(worldId);
      globalWorld.locations.clear();
      locs.forEach((l) => globalWorld.locations.set(l.id, l));

      const edges = await WorldRepository.getAllLocationEdges(worldId);
      if (edges.length === 0) {
        for (const loc of locs) {
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
      }

      const orgs = await WorldRepository.getAllOrganizations(worldId);
      globalWorld.organizations.clear();
      orgs.forEach((o) => globalWorld.organizations.set(o.id, o));

      const facts = await WorldRepository.getAllFacts(worldId);
      globalWorld.facts.clear();
      facts.forEach((f) => globalWorld.facts.set(f.id, f));

      const truths = await WorldRepository.getAllHiddenTruths(worldId);
      globalWorld.hiddenTruths.clear();
      truths.forEach((t) => globalWorld.hiddenTruths.set(t.id, t));

      const seeds = await WorldRepository.getAllSeeds(worldId);
      globalWorld.seeds.clear();
      seeds.forEach((s) => globalWorld.seeds.set(s.id, s));

      const events = await WorldRepository.getRecentEvents(worldId, 100);
      globalWorld.events = events;

      globalWorld.updateStats();
    } finally {
      setRecorderWriteContext(false);
    }
  }

  public static async saveAllToDatabase(worldId = 'world-snapshot-001'): Promise<void> {
    globalWorld.updateStats();
    await WorldRepository.saveWorldSnapshot(globalWorld.snapshot);

    for (const char of globalWorld.characters.values()) {
      await WorldRepository.saveCharacter(worldId, char);
    }

    for (const loc of globalWorld.locations.values()) {
      await WorldRepository.saveLocation(worldId, loc);
      for (const connId of loc.connected_to) {
        const edgeId = `edge-${loc.id}-${connId}`;
        await WorldRepository.saveLocationEdge(worldId, {
          id: edgeId,
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
  }
}
