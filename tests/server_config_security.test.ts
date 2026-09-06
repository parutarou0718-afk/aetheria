import express from 'express';
import type { Server } from 'node:http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { registerConfigRoutes } from '../server';

const envKeys = ['LLM_PROVIDER', 'LLM_API_KEY', 'LLM_BASE_URL', 'LLM_MODEL'] as const;
const originalEnv = new Map<string, string | undefined>();
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
  beforeEach(() => {
    for (const key of envKeys) originalEnv.set(key, process.env[key]);
  });

  afterEach(async () => {
    await new Promise<void>((resolve, reject) => {
      if (!server) return resolve();
      server.close((error) => error ? reject(error) : resolve());
      server = undefined;
    });
    for (const key of envKeys) {
      const original = originalEnv.get(key);
      if (original === undefined) delete process.env[key];
      else process.env[key] = original;
    }
    originalEnv.clear();
  });

  it('GET config never returns a configured API key', async () => {
    process.env.LLM_API_KEY = 'super-secret-test-key';
    const baseUrl = await startConfigServer();

    const response = await fetch(`${baseUrl}/api/v1/config`);
    const body = await response.json();
    const serialized = JSON.stringify(body);

    expect(response.status).toBe(200);
    expect(body.hasApiKey).toBe(true);
    expect(body).not.toHaveProperty('apiKey');
    expect(serialized).not.toContain('super-secret-test-key');
  });

  it('POST config stores a supplied key without returning it', async () => {
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
    const body = await response.json();
    const serialized = JSON.stringify(body);

    expect(response.status).toBe(200);
    expect(process.env.LLM_API_KEY).toBe('another-secret-test-key');
    expect(body.config.hasApiKey).toBe(true);
    expect(body.config).not.toHaveProperty('apiKey');
    expect(serialized).not.toContain('another-secret-test-key');
  });
});
