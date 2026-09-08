import { beforeEach, describe, expect, it } from 'vitest';
import { bootstrapWithDefaultWorld } from './helpers/worldFixture';
import { PlayerRequestRunRepository } from '../src/application/player/playerRequestRunRepository';

describe('PlayerRequestRunRepository', () => {
  let worldId: string;

  beforeEach(async () => {
    worldId = `world-request-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    await bootstrapWithDefaultWorld(worldId);
  });

  it('claims once, replays a terminal safe response, and never auto-replays an unknown outcome', async () => {
    const input = { worldId, sessionId: 'session-1', requestId: crypto.randomUUID(), actionKey: 'DM_ACTION' };
    expect(await PlayerRequestRunRepository.claim(input)).toMatchObject({ kind: 'CLAIMED' });
    expect(await PlayerRequestRunRepository.claim(input)).toMatchObject({ kind: 'IN_PROGRESS' });

    await PlayerRequestRunRepository.complete(input, { httpStatus: 200, response: { narration: 'safe' } });
    expect(await PlayerRequestRunRepository.claim(input)).toMatchObject({ kind: 'REPLAY', httpStatus: 200, response: { narration: 'safe' } });

    const unknown = { ...input, requestId: crypto.randomUUID() };
    expect(await PlayerRequestRunRepository.claim(unknown)).toMatchObject({ kind: 'CLAIMED' });
    await PlayerRequestRunRepository.markInProgressUnknown();
    expect(await PlayerRequestRunRepository.claim(unknown)).toMatchObject({ kind: 'UNKNOWN' });
  });
});
