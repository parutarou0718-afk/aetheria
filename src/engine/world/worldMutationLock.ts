/**
 * Serializes validation through durable commit for one world. It deliberately
 * starts after AI/context work, so slow model calls never hold world truth.
 */
export class WorldMutationLock {
  private readonly queues = new Map<string, Promise<void>>();

  async runExclusive<T>(worldId: string, operation: () => Promise<T>): Promise<T> {
    const previous = this.queues.get(worldId) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => { release = resolve; });
    this.queues.set(worldId, current);
    await previous;
    try {
      return await operation();
    } finally {
      release();
      if (this.queues.get(worldId) === current) this.queues.delete(worldId);
    }
  }
}

export const worldMutationLock = new WorldMutationLock();
