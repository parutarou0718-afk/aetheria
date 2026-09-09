import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AetheriaServerHandle } from '../server';

describe('embedded Aetheria server', () => {
  let handle: AetheriaServerHandle | undefined;
  let databaseDirectory: string | undefined;

  afterEach(async () => {
    await handle?.close();
    handle = undefined;
    vi.resetModules();
    if (databaseDirectory) fs.rmSync(databaseDirectory, { recursive: true, force: true });
    databaseDirectory = undefined;
    delete process.env.DATABASE_PATH;
  });

  it('binds to loopback on an ephemeral port and closes cleanly', async () => {
    databaseDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'aetheria-embedded-server-'));
    process.env.DATABASE_PATH = path.join(databaseDirectory, 'aetheria.db');
    const { startAetheriaServer } = await import('../server');
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
