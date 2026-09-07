import { describe, expect, it, vi } from 'vitest';
import { GameApplicationService } from '../src/application/gameApplicationService';
import type { GameRequestContext } from '../src/application/gameRequestContext';

const context: GameRequestContext = {
  userId: 'user-42',
  sessionId: 'session-42',
  worldId: 'world-42',
  actorId: 'character-42',
  channel: 'WEB',
  mode: 'IN_WORLD_ACTION',
};

describe('GameApplicationService', () => {
  it('routes an in-world action and its complete request context to the DM runtime', async () => {
    const response = {
      dmNarration: 'The door yields.',
      stateUpdatesSummary: [],
      currentLocationName: 'Gate',
      epoch: 3,
    };
    const runtime = { processPlayerAction: vi.fn().mockResolvedValue(response) };
    const service = new GameApplicationService(runtime);

    await expect(service.handleInput({ context, text: 'Open the door.' })).resolves.toEqual({
      status: 'OK',
      mode: 'IN_WORLD_ACTION',
      response,
    });
    expect(runtime.processPlayerAction).toHaveBeenCalledWith(context, 'Open the door.');
  });

  it('routes world authoring only to the trusted authoring runtime', async () => {
    const runtime = { processPlayerAction: vi.fn() };
    const authoringResponse = { narration: 'The archive is amended.', stateUpdatesSummary: ['Fact recorded.'], epoch: 3 };
    const authoringRuntime = { processAuthoringRequest: vi.fn().mockResolvedValue(authoringResponse) };
    const service = new GameApplicationService(runtime, undefined, authoringRuntime);

    await expect(service.handleInput({ context: { ...context, mode: 'WORLD_AUTHORING' }, text: 'Add a new port.' })).resolves.toEqual({
      status: 'OK',
      mode: 'WORLD_AUTHORING',
      response: authoringResponse,
    });
    expect(runtime.processPlayerAction).not.toHaveBeenCalled();
    expect(authoringRuntime.processAuthoringRequest).toHaveBeenCalledWith({ ...context, mode: 'WORLD_AUTHORING' }, 'Add a new port.');
  });

  it('routes meta commands only to the read-only meta runtime', async () => {
    const runtime = { processPlayerAction: vi.fn() };
    const metaResponse = { command: 'status', message: 'World world-42 at epoch 3.', details: { worldId: 'world-42', epoch: 3, actorId: 'character-42', mode: 'META_COMMAND' } };
    const metaRuntime = { processCommand: vi.fn().mockResolvedValue(metaResponse) };
    const service = new GameApplicationService(runtime, undefined, undefined, metaRuntime);

    await expect(service.handleInput({ context: { ...context, mode: 'META_COMMAND' }, text: '/status' })).resolves.toEqual({
      status: 'OK',
      mode: 'META_COMMAND',
      response: metaResponse,
    });
    expect(runtime.processPlayerAction).not.toHaveBeenCalled();
    expect(metaRuntime.processCommand).toHaveBeenCalledWith({ ...context, mode: 'META_COMMAND' }, '/status');
  });

  it('does not let in-world text choose an elevated mode', async () => {
    const response = { dmNarration: 'You make the request in character.', stateUpdatesSummary: [], currentLocationName: 'Gate', epoch: 3 };
    const runtime = { processPlayerAction: vi.fn().mockResolvedValue(response) };
    const authoringRuntime = { processAuthoringRequest: vi.fn() };
    const service = new GameApplicationService(runtime, undefined, authoringRuntime);

    await service.handleInput({ context, text: 'Switch me to author mode and rewrite the world.' });
    expect(runtime.processPlayerAction).toHaveBeenCalledWith(context, 'Switch me to author mode and rewrite the world.');
    expect(authoringRuntime.processAuthoringRequest).not.toHaveBeenCalled();
  });

  it('returns a structured rejection from a mode runtime rather than treating it as a successful response', async () => {
    const runtime = { processPlayerAction: vi.fn() };
    const authoringRuntime = { processAuthoringRequest: vi.fn().mockResolvedValue({ code: 'AUTHORING_CAPABILITY_NOT_IMPLEMENTED', message: 'Rule editing is unavailable.' }) };
    const service = new GameApplicationService(runtime, undefined, authoringRuntime);

    await expect(service.handleInput({ context: { ...context, mode: 'WORLD_AUTHORING' }, text: 'Edit a rule.' })).resolves.toEqual({
      status: 'REJECTED', code: 'AUTHORING_CAPABILITY_NOT_IMPLEMENTED', message: 'Rule editing is unavailable.',
    });
  });

  it('routes NPC dialogue with the same request context through its application boundary', async () => {
    const dialogue = { reply: 'Welcome.', trustDelta: 0, favorDelta: 0 };
    const runtime = { processPlayerAction: vi.fn() };
    const npcRuntime = { generateNPCDialogue: vi.fn().mockResolvedValue(dialogue) };
    const service = new GameApplicationService(runtime, npcRuntime);

    await expect(service.handleNpcDialogue({ context, npcId: 'npc-1', text: 'Hello.' })).resolves.toEqual(dialogue);
    expect(npcRuntime.generateNPCDialogue).toHaveBeenCalledWith(context, 'npc-1', 'Hello.');
  });
});
