import { globalWorld, setRecorderWriteContext } from '../worldState';
import { WorldRepository } from './worldRepository';
import { dbManager } from '../persistence/database';
import type { WorldSnapshot } from '../../types';
import { worldLifecycleLock } from './worldLifecycleLock';

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
    return worldLifecycleLock.runExclusive(worldId, 'RESET', () => this.resetUnlocked(worldId));
  }

  private static async resetUnlocked(worldId: string): Promise<{ status: string; world_creation_state: string }> {
    const emptySnapshot: WorldSnapshot = {
      id: worldId,
      epoch: 1,
      created_at: new Date().toISOString(),
      world_name: '未定世界 (Undecided World)',
      world_description: '创世尚未开始。等待玩家描绘他们想要的世界的愿景。',
      world_creation_state: 'UNSELECTED',
      seed: 42,
      world_facts_count: 0,
      characters_count: 0,
      organizations_count: 0,
      locations_count: 0,
      active_seeds_count: 0,
      frozen_objects_count: 0,
      completed_epochs: 1,
    };

    // Persist the entire target first. No cache state is published until the
    // database transaction has completed its atomic durable flush.
    await dbManager.transaction(async () => {
      await WorldRepository.deleteWorldData(worldId);
      await WorldRepository.saveWorldSnapshot(emptySnapshot); // audit-direct-write: allow reset lifecycle persistence
    });

    setRecorderWriteContext(true);
    try {
      globalWorld.initEmptyWorld();
      globalWorld.snapshot.id = worldId; // audit-direct-write: allow reset lifecycle publication
    } finally {
      setRecorderWriteContext(false);
    }
    return { status: 'reset_completed', world_creation_state: emptySnapshot.world_creation_state };
  }
}
