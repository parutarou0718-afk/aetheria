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
      response,
    });
    expect(runtime.processPlayerAction).toHaveBeenCalledWith(context, 'Open the door.');
  });

  it.each(['WORLD_AUTHORING', 'META_COMMAND'] as const)('rejects %s without invoking the DM runtime', async (mode) => {
    const runtime = { processPlayerAction: vi.fn() };
    const service = new GameApplicationService(runtime);

    await expect(service.handleInput({ context: { ...context, mode }, text: 'Do something.' })).resolves.toEqual({
      status: 'NOT_IMPLEMENTED',
      message: `${mode} is not implemented.`,
    });
    expect(runtime.processPlayerAction).not.toHaveBeenCalled();
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
