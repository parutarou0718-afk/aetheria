import { globalWorld } from '../worldState';
import { WorldRepository } from './worldRepository';

/**
 * Reset the current world back to a brand-neutral, empty `UNSELECTED` state.
 *
 * This is the SINGLE source of truth for world reset — the Express route
 * delegates to this service so the behavior is testable without spinning up
 * the HTTP server. It clears all authoritative entity collections from both
 * memory and SQLite, and MUST NOT recreate the default fantasy world
 * (`initDefaultWorld()` is never called here).
 */
export class WorldResetService {
  public static async reset(worldId = 'world-snapshot-001'): Promise<{ status: string; world_creation_state: string }> {
    // [P0-2] Reset must NOT recreate the default fantasy world. It clears the
    // current world back to an empty `UNSELECTED` state (both memory and DB).
    globalWorld.initEmptyWorld();
    globalWorld.snapshot.id = worldId;
    await WorldRepository.deleteWorldData(worldId);
    // audit-direct-write: allow reset endpoint to persist the empty snapshot
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await WorldRepository.saveWorldSnapshot(globalWorld.snapshot as any);
    return { status: 'reset_completed', world_creation_state: globalWorld.snapshot.world_creation_state };
  }
}
