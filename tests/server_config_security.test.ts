import express from 'express';
import type { Server } from 'node:http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { registerConfigRoutes } from '../server';

let server: Server | undefined;

async function startConfigServer(): Promise<string> {
  const app = express();
  app.use(express.json());
  registerConfigRoutes(app);

  server = await new Promise<Server>((resolve) => {
    const listeningServer = app.listen(0, '127.0.0.1', () => resolve(listeningServer));
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Expected a TCP address.');
  return `http://127.0.0.1:${address.port}`;
}

describe('HTTP LLM configuration secret safety', () => {
  afterEach(async () => {
    await new Promise<void>((resolve, reject) => {
      if (!server) return resolve();
      server.close((error) => error ? reject(error) : resolve());
      server = undefined;
    });
  });

  it('GET config exposes only public AI availability', async () => {
    const baseUrl = await startConfigServer();

    const response = await fetch(`${baseUrl}/api/v1/config`);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ aiAvailable: expect.any(Boolean) });
  });

  it('does not expose a runtime configuration write endpoint', async () => {
    const baseUrl = await startConfigServer();
    const response = await fetch(`${baseUrl}/api/v1/config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider: 'openai-compatible',
        model: 'test-model',
        baseUrl: 'https://example.test/v1',
        apiKey: 'another-secret-test-key',
      }),
    });
    expect(response.status).toBe(404);
  });
});
