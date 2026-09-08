import { afterEach, describe, expect, it, vi } from 'vitest';
import { requestMutation } from '../src/client/playerApi';

describe('logical player mutation requests', () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it('retains one request id after a transport failure and discards it after a terminal response', async () => {
    const storage = new Map<string, string>();
    Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value) } });
    const headers: string[] = [];
    vi.spyOn(globalThis, 'fetch')
      .mockRejectedValueOnce(new TypeError('connection interrupted'))
      .mockImplementationOnce(async (_input, init) => {
        headers.push(new Headers(init?.headers).get('X-Aetheria-Request-Id') ?? '');
        return new Response(JSON.stringify({ newEpoch: 2 }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      })
      .mockImplementationOnce(async (_input, init) => {
        headers.push(new Headers(init?.headers).get('X-Aetheria-Request-Id') ?? '');
        return new Response(JSON.stringify({ newEpoch: 3 }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      });

    await expect(requestMutation('/api/v1/player/time/advance', { method: 'POST', body: '{}' })).rejects.toThrow('connection interrupted');
    await requestMutation('/api/v1/player/time/advance', { method: 'POST', body: '{}' });
    await requestMutation('/api/v1/player/time/advance', { method: 'POST', body: '{}' });
    expect(headers[0]).toMatch(/^[0-9a-f-]{36}$/i);
    expect(headers[1]).not.toBe(headers[0]);
  });
});
