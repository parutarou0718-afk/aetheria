export type WorldLifecycleOperation = 'GENESIS' | 'RESET';

export class WorldLifecycleInProgressError extends Error {
  public readonly code = 'WORLD_LIFECYCLE_IN_PROGRESS';
  constructor(worldId: string, operation: WorldLifecycleOperation) {
    super(`World lifecycle operation ${operation} is already in progress for ${worldId}.`);
    this.name = 'WorldLifecycleInProgressError';
  }
}

/** Lifecycle ownership deliberately fails competing reset/genesis requests. */
export class WorldLifecycleLock {
  private readonly active = new Set<string>();

  async runExclusive<T>(worldId: string, operation: WorldLifecycleOperation, callback: () => Promise<T>): Promise<T> {
    if (this.active.has(worldId)) throw new WorldLifecycleInProgressError(worldId, operation);
    this.active.add(worldId);
    try { return await callback(); }
    finally { this.active.delete(worldId); }
  }
}

export const worldLifecycleLock = new WorldLifecycleLock();
