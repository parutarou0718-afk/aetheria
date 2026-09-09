import express from 'express';
import type { Server } from 'node:http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { registerPlayerRoutes } from '../src/server/routes/playerRoutes';
import { bootstrapWithDefaultWorld } from './helpers/worldFixture';
import { InteractionRepository } from '../src/engine/context/interactionRepository';
import { runtimeHealth } from '../src/engine/runtime/runtimeHealthService';
import { PlayerRequestRunRepository } from '../src/application/player/playerRequestRunRepository';
import { globalWorld } from '../src/engine/worldState';

let server: Server | undefined;
let baseUrl = '';
let worldId = '';

beforeEach(async () => {
  worldId = `player-routes-${crypto.randomUUID()}`;
  await bootstrapWithDefaultWorld(worldId);
  runtimeHealth.markDatabaseHealthy();
  runtimeHealth.markBootstrapHealthy();
  runtimeHealth.markCacheSynchronized();
  const app = express();
  app.use(express.json());
  registerPlayerRoutes(app);
  server = await new Promise<Server>((resolve) => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Expected TCP address.');
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterEach(async () => {
  vi.restoreAllMocks();
  await new Promise<void>((resolve, reject) => server?.close((error) => error ? reject(error) : resolve()) ?? resolve());
  server = undefined;
});

describe('player HTTP boundary', () => {
  it('returns a safe bootstrap projection and ignores forged identity headers', async () => {
    const response = await fetch(`${baseUrl}/api/v1/player/bootstrap`, { headers: { 'X-Aetheria-Session-Id': 'client-session', 'X-Actor-Id': 'npc-elder' } });
    const body = await response.json();
    const serialized = JSON.stringify(body);
    expect(response.status).toBe(200);
    expect(body.phase).toBe('READY');
    expect(body.player.id).toBe('pc-player');
    expect(serialized).not.toContain('hiddenTruth');
    expect(serialized).not.toContain('goal');
  });

  it('keeps NPC dialogue histories scoped to their exact conversation', async () => {
    await InteractionRepository.appendTurn({ id: `npc-a-turn-${crypto.randomUUID()}`, worldId, sessionId: 'old', conversationType: 'NPC', conversationId: 'NPC:npc-elder:pc-player', speakerType: 'NPC', speakerId: 'npc-elder', counterpartId: 'pc-player', content: 'elder answer', epoch: 1, outcomeStatus: 'SUCCESS', createdAt: new Date().toISOString() });
    await InteractionRepository.appendTurn({ id: `npc-b-turn-${crypto.randomUUID()}`, worldId, sessionId: 'old', conversationType: 'NPC', conversationId: 'NPC:npc-innkeeper:pc-player', speakerType: 'NPC', speakerId: 'npc-innkeeper', counterpartId: 'pc-player', content: 'innkeeper secret', epoch: 1, outcomeStatus: 'SUCCESS', createdAt: new Date().toISOString() });

    const response = await fetch(`${baseUrl}/api/v1/player/npcs/npc-elder/dialogue-history`);
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(JSON.stringify(body)).toContain('elder answer');
    expect(JSON.stringify(body)).not.toContain('innkeeper secret');
  });

  it('rejects player travel to a location that is not a current direct player option', async () => {
    const response = await fetch(`${baseUrl}/api/v1/player/travel`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Aetheria-Request-Id': crypto.randomUUID() }, body: JSON.stringify({ destinationLocationId: 'loc-ruins' }) });
    const body = await response.json();
    expect(response.status).toBe(400);
    expect(body.code).toBe('TRAVEL_NOT_AVAILABLE');
  });

  it('uses the server-owned player identity and a constrained direct route for travel', async () => {
    const bootstrap = await (await fetch(`${baseUrl}/api/v1/player/bootstrap`)).json();
    const destinationLocationId = bootstrap.travelOptions[0]?.locationId;
    expect(destinationLocationId).toEqual(expect.any(String));
    const response = await fetch(`${baseUrl}/api/v1/player/travel`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Actor-Id': 'npc-elder', 'X-Aetheria-Request-Id': crypto.randomUUID() }, body: JSON.stringify({ destinationLocationId }) });
    const body = await response.json();
    expect(body.status).toBe('ok');
    expect(body.expectedEndEpoch).toBeGreaterThan(1);
  });

  it('rejects profile payloads that try to edit mechanics instead of name or title', async () => {
    const response = await fetch(`${baseUrl}/api/v1/player/profile`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Aetheria-Request-Id': crypto.randomUUID() }, body: JSON.stringify({ name: 'Traveler', gold: 999999, location: 'loc-secret' }) });
    const body = await response.json();
    expect(response.status).toBe(400);
    expect(body.code).toBe('ACTION_REJECTED');
  });

  it('replays a completed player mutation without executing travel twice', async () => {
    const bootstrap = await (await fetch(`${baseUrl}/api/v1/player/bootstrap`)).json();
    const destinationLocationId = bootstrap.travelOptions[0]?.locationId;
    const requestId = crypto.randomUUID();
    const options = { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Aetheria-Request-Id': requestId }, body: JSON.stringify({ destinationLocationId }) };
    const first = await fetch(`${baseUrl}/api/v1/player/travel`, options);
    const second = await fetch(`${baseUrl}/api/v1/player/travel`, options);
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(second.headers.get('x-aetheria-replayed')).toBe('true');
  });

  it('replays a lost logical time-advance response with the same request id exactly once', async () => {
    const requestId = crypto.randomUUID();
    const options = { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Aetheria-Request-Id': requestId }, body: '{}' };
    // The first response represents a connection that reached the server but
    // whose response was lost before the browser could trust it.
    const first = await fetch(`${baseUrl}/api/v1/player/time/advance`, options);
    expect(first.status).toBe(200);
    expect(globalThis.fetch).toBeDefined();
    const afterFirst = (await first.json()).newEpoch;
    const retry = await fetch(`${baseUrl}/api/v1/player/time/advance`, options);
    expect(retry.status).toBe(200);
    expect(retry.headers.get('x-aetheria-replayed')).toBe('true');
    expect((await retry.json()).newEpoch).toBe(afterFirst);
  });

  it('keeps a committed time advance explicit and unresolved when receipt finalization fails', async () => {
    const requestId = crypto.randomUUID();
    vi.spyOn(PlayerRequestRunRepository, 'complete').mockRejectedValueOnce(new Error('receipt store unavailable'));
    const options = { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Aetheria-Request-Id': requestId }, body: '{}' };
    const first = await fetch(`${baseUrl}/api/v1/player/time/advance`, options);
    const firstBody = await first.json();
    expect(first.status).toBe(503);
    expect(firstBody.code).toBe('REQUEST_OUTCOME_UNCONFIRMED');
    expect(globalWorld.snapshot.epoch).toBe(2);
    const retry = await fetch(`${baseUrl}/api/v1/player/time/advance`, options);
    expect(retry.status).toBe(503);
    expect(globalWorld.snapshot.epoch).toBe(2);
  });
});
