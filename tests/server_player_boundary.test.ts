import type { Server } from 'node:http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../server';
import { bootstrapWithDefaultWorld } from './helpers/worldFixture';

let server: Server | undefined;
let baseUrl = '';
const originalGate = process.env.AETHERIA_DEV_INSPECTOR;

async function startActualServer(): Promise<void> {
  const app = await createApp({ bootstrap: false, includeFrontend: false });
  server = await new Promise<Server>((resolve) => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Expected TCP address.');
  baseUrl = `http://127.0.0.1:${address.port}`;
}

beforeEach(async () => {
  await bootstrapWithDefaultWorld(`player-boundary-${crypto.randomUUID()}`);
});

afterEach(async () => {
  await new Promise<void>((resolve, reject) => server?.close((error) => error ? reject(error) : resolve()) ?? resolve());
  server = undefined;
  if (originalGate === undefined) delete process.env.AETHERIA_DEV_INSPECTOR;
  else process.env.AETHERIA_DEV_INSPECTOR = originalGate;
});

describe('actual server player boundary', () => {
  it('keeps player routes available while developer routes are unreachable in normal player mode', async () => {
    process.env.AETHERIA_DEV_INSPECTOR = 'false';
    await startActualServer();
    expect((await fetch(`${baseUrl}/api/v1/player/bootstrap`)).status).toBe(200);
    for (const path of ['/api/v1/truths', '/api/v1/characters/npc-elder', '/api/v1/admin/stats', '/api/v1/persistence/changelog']) {
      expect((await fetch(`${baseUrl}${path}`)).status, path).toBe(404);
    }
    for (const path of ['/api/v1/admin/epoch/tick', '/api/v1/truths/reveal', '/api/v1/timeline/plan-travel', '/api/v1/world/genesis']) {
      expect((await fetch(`${baseUrl}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status, path).toBe(404);
    }
  });

  it('registers developer inspection routes only when the server-owned development gate is true', async () => {
    process.env.AETHERIA_DEV_INSPECTOR = 'true';
    await startActualServer();
    expect((await fetch(`${baseUrl}/api/v1/truths`)).status).toBe(200);
    expect((await fetch(`${baseUrl}/api/v1/admin/stats`)).status).toBe(200);
  });
});
