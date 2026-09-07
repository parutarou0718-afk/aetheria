import { describe, expect, it } from 'vitest';
import { MetaCommandRuntime } from '../src/application/metaCommandRuntime';
import type { GameRequestContext } from '../src/application/gameRequestContext';

const context: GameRequestContext = {
  userId: 'user-1', sessionId: 'session-1', worldId: 'world-1', actorId: 'pc-1', channel: 'WEB', mode: 'META_COMMAND',
};

describe('MetaCommandRuntime', () => {
  it('returns only trusted, read-only status details', async () => {
    const runtime = new MetaCommandRuntime(() => ({ id: 'world-1', epoch: 7 }));

    await expect(runtime.processCommand(context, '/status')).resolves.toEqual({
      command: 'status',
      message: 'World status is available.',
      details: { worldId: 'world-1', epoch: 7, actorId: 'pc-1', mode: 'META_COMMAND' },
    });
  });

  it('rejects unknown commands without falling back to AI', async () => {
    const runtime = new MetaCommandRuntime(() => ({ id: 'world-1', epoch: 7 }));

    await expect(runtime.processCommand(context, '/rewrite-world')).resolves.toEqual({
      code: 'META_COMMAND_UNSUPPORTED',
      command: 'rewrite-world',
      message: 'This meta command is not supported.',
    });
  });

  it('requires the trusted meta mode', async () => {
    const runtime = new MetaCommandRuntime(() => ({ id: 'world-1', epoch: 7 }));

    await expect(runtime.processCommand({ ...context, mode: 'IN_WORLD_ACTION' }, '/status')).resolves.toEqual({
      code: 'META_MODE_REQUIRED',
      message: 'Meta commands require META_COMMAND mode.',
    });
  });
});
