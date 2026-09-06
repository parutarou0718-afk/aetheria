import express from 'express';
import type { Server } from 'node:http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { registerCharacterActionRoutes } from '../server';
import { globalWorld } from '../src/engine/worldState';
import { recorder } from '../src/engine/recorder/recorder';
import { bootstrapWithDefaultWorld } from './helpers/worldFixture';

let server: Server | undefined;

describe('character action API proposal pipeline', () => {
  beforeEach(async () => {
    await bootstrapWithDefaultWorld('world-rest-action');
  });

  afterEach(async () => {
    await new Promise<void>((resolve, reject) => {
      if (!server) return resolve();
      server.close((error) => error ? reject(error) : resolve());
      server = undefined;
    });
  });

  it('commits a REST action through the active world proposal pipeline', async () => {
    const app = express();
    app.use(express.json());
    registerCharacterActionRoutes(app);
    server = await new Promise<Server>((resolve) => {
      const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
    });
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Expected TCP address');
    const commitSpy = vi.spyOn(recorder, 'commit');

    const response = await fetch(`http://127.0.0.1:${address.port}/api/v1/characters/pc-player/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action_type: 'REST' }),
    });

    expect(response.status).toBe(200);
    expect(commitSpy).toHaveBeenCalledWith(
      'world-rest-action',
      expect.arrayContaining([
        expect.objectContaining({
          authorityLevel: 'ACTOR',
          causalBasis: expect.arrayContaining([expect.objectContaining({ type: 'PLAYER_ACTION' })]),
        }),
      ])
    );
  });
});
