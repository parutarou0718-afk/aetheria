import { afterEach, describe, expect, it, vi } from 'vitest';
import { requestMutation } from '../src/client/playerApi';

describe('logical player mutation requests', () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it('retains one request id after a transport failure and discards it after a terminal response', async () => {
    const storage = new Map<string, string>();
    Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value), removeItem: (key: string) => storage.delete(key) } });
    const headers: string[] = [];
    vi.spyOn(globalThis, 'fetch')
      .mockImplementationOnce(async (_input, init) => {
        headers.push(new Headers(init?.headers).get('X-Aetheria-Request-Id') ?? '');
        throw new TypeError('connection interrupted');
      })
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
    expect(headers[1]).toBe(headers[0]);
    expect(headers[2]).not.toBe(headers[0]);
  });

  it('restores an unresolved request id from session storage after a module reload', async () => {
    const storage = new Map<string, string>();
    Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value), removeItem: (key: string) => storage.delete(key) } });
    const headers: string[] = [];
    vi.spyOn(globalThis, 'fetch')
      .mockImplementationOnce(async (_input, init) => { headers.push(new Headers(init?.headers).get('X-Aetheria-Request-Id') ?? ''); throw new TypeError('connection interrupted'); })
      .mockImplementationOnce(async (_input, init) => { headers.push(new Headers(init?.headers).get('X-Aetheria-Request-Id') ?? ''); return new Response(JSON.stringify({ newEpoch: 2 }), { status: 200, headers: { 'Content-Type': 'application/json' } }); });
    await expect(requestMutation('/api/v1/player/time/advance', { method: 'POST', body: '{}' })).rejects.toThrow();
    vi.resetModules();
    const { requestMutation: reloadedRequestMutation } = await import('../src/client/playerApi');
    await reloadedRequestMutation('/api/v1/player/time/advance', { method: 'POST', body: '{}' });
    expect(headers[1]).toBe(headers[0]);
  });

  it('keeps an uncertain receipt request id instead of treating it as terminal', async () => {
    const storage = new Map<string, string>();
    Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value), removeItem: (key: string) => storage.delete(key) } });
    const headers: string[] = [];
    vi.spyOn(globalThis, 'fetch')
      .mockImplementationOnce(async (_input, init) => { headers.push(new Headers(init?.headers).get('X-Aetheria-Request-Id') ?? ''); return new Response(JSON.stringify({ code: 'REQUEST_OUTCOME_UNCONFIRMED', error: 'uncertain' }), { status: 503, headers: { 'Content-Type': 'application/json' } }); })
      .mockImplementationOnce(async (_input, init) => { headers.push(new Headers(init?.headers).get('X-Aetheria-Request-Id') ?? ''); return new Response(JSON.stringify({ code: 'REQUEST_OUTCOME_UNKNOWN', error: 'unknown' }), { status: 409, headers: { 'Content-Type': 'application/json' } }); });
    await expect(requestMutation('/api/v1/player/time/advance', { method: 'POST', body: '{}' })).rejects.toMatchObject({ code: 'REQUEST_OUTCOME_UNCONFIRMED' });
    await expect(requestMutation('/api/v1/player/time/advance', { method: 'POST', body: '{}' })).rejects.toMatchObject({ code: 'REQUEST_OUTCOME_UNKNOWN' });
    expect(headers[1]).toBe(headers[0]);
  });

  it('retains an unresolved id through runtime unavailability and a module reload', async () => {
    const storage = new Map<string, string>();
    Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value), removeItem: (key: string) => storage.delete(key) } });
    const headers: string[] = [];
    vi.spyOn(globalThis, 'fetch')
      .mockImplementationOnce(async (_input, init) => { headers.push(new Headers(init?.headers).get('X-Aetheria-Request-Id') ?? ''); return new Response(JSON.stringify({ code: 'REQUEST_OUTCOME_UNCONFIRMED', error: 'uncertain' }), { status: 503, headers: { 'Content-Type': 'application/json' } }); })
      .mockImplementationOnce(async (_input, init) => { headers.push(new Headers(init?.headers).get('X-Aetheria-Request-Id') ?? ''); return new Response(JSON.stringify({ code: 'RUNTIME_NOT_READY', error: 'not ready' }), { status: 503, headers: { 'Content-Type': 'application/json' } }); })
      .mockImplementationOnce(async (_input, init) => { headers.push(new Headers(init?.headers).get('X-Aetheria-Request-Id') ?? ''); return new Response(JSON.stringify({ code: 'REQUEST_OUTCOME_UNKNOWN', error: 'unknown' }), { status: 409, headers: { 'Content-Type': 'application/json' } }); });
    await expect(requestMutation('/api/v1/player/time/advance', { method: 'POST', body: '{}' })).rejects.toMatchObject({ code: 'REQUEST_OUTCOME_UNCONFIRMED' });
    await expect(requestMutation('/api/v1/player/time/advance', { method: 'POST', body: '{}' })).rejects.toMatchObject({ code: 'RUNTIME_NOT_READY' });
    vi.resetModules();
    const { requestMutation: reloadedRequestMutation } = await import('../src/client/playerApi');
    await expect(reloadedRequestMutation('/api/v1/player/time/advance', { method: 'POST', body: '{}' })).rejects.toMatchObject({ code: 'REQUEST_OUTCOME_UNKNOWN' });
    expect(headers[1]).toBe(headers[0]);
    expect(headers[2]).toBe(headers[0]);
  });
});
