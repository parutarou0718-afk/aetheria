import { afterEach, describe, expect, it } from 'vitest';
import type { AetheriaServerHandle } from '../server';
import { startAetheriaServer } from '../server';

describe('embedded Aetheria server', () => {
  let handle: AetheriaServerHandle | undefined;

  afterEach(async () => { await handle?.close(); handle = undefined; });

  it('binds to loopback on an ephemeral port and closes cleanly', async () => {
    handle = await startAetheriaServer({ host: '127.0.0.1', port: 0, bootstrap: true, includeFrontend: false });
    expect(handle.origin).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
    expect(handle.port).toBeGreaterThan(0);
    expect((await fetch(`${handle.origin}/health/live`)).status).toBe(200);
    expect((await fetch(`${handle.origin}/api/v1/player/bootstrap`)).status).toBe(200);
    await handle.close();
    await expect(fetch(`${handle.origin}/health/live`)).rejects.toThrow();
    handle = undefined;
  });
});
