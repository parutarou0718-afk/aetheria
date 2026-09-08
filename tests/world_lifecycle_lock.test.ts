import { describe, expect, it } from 'vitest';
import { WorldLifecycleLock } from '../src/engine/world/worldLifecycleLock';

describe('WorldLifecycleLock', () => {
  it('rejects a competing reset/genesis lifecycle owner for the same world', async () => {
    const lock = new WorldLifecycleLock();
    let release!: () => void;
    const held = new Promise<void>((resolve) => { release = resolve; });
    const active = lock.runExclusive('world-1', 'GENESIS', async () => { await held; });
    await new Promise((resolve) => setImmediate(resolve));
    await expect(lock.runExclusive('world-1', 'RESET', async () => undefined)).rejects.toMatchObject({ code: 'WORLD_LIFECYCLE_IN_PROGRESS' });
    release();
    await active;
  });
});
