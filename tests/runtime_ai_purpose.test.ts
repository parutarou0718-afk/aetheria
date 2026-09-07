import { beforeEach, describe, expect, it, vi } from 'vitest';

const ai = vi.hoisted(() => ({ isAvailable: vi.fn(), generateJson: vi.fn(), generateText: vi.fn() }));
vi.mock('../src/engine/ai/aiService', () => ({ aiService: ai }));

import { NPCCognitionEngine } from '../src/engine/npcCognition';
import { DMEngine } from '../src/engine/dmEngine';
import { CausalityEngine } from '../src/engine/causality';
import { globalWorld } from '../src/engine/worldState';
import { bootstrapWithDefaultWorld } from './helpers/worldFixture';
import type { GameRequestContext } from '../src/application/gameRequestContext';

describe('runtime AI request purposes', () => {
  beforeEach(async () => { ai.isAvailable.mockReset(); ai.generateJson.mockReset(); ai.generateText.mockReset(); await bootstrapWithDefaultWorld(); ai.isAvailable.mockReturnValue(true); });
  const requestContext = (): GameRequestContext => ({
    userId: 'account-77',
    sessionId: 'session-77',
    worldId: globalWorld.snapshot.id,
    actorId: 'pc-player',
    channel: 'WEB',
    mode: 'IN_WORLD_ACTION',
  });

  it('routes NPC dialogue through AIService with caller identity and NPC_DIALOGUE', async () => {
    ai.generateJson.mockResolvedValue({ reply: 'Understood.', trustDelta: 0, favorDelta: 0 });
    const context = requestContext();
    await NPCCognitionEngine.generateNPCDialogue(context, 'npc-elder', 'Hello');
    expect(ai.generateJson).toHaveBeenCalledWith(expect.objectContaining({ userId: context.userId, worldId: context.worldId, purpose: 'NPC_DIALOGUE' }), expect.any(String), expect.any(String), expect.any(Object));
  });
  it('routes DM actions through AIService with caller identity and DM_ACTION', async () => {
    ai.generateJson.mockResolvedValue({ dmNarration: 'The path is clear.', advanceEpoch: false });
    const context = requestContext();
    await DMEngine.processPlayerAction(context, 'Inspect the path.');
    expect(ai.generateJson).toHaveBeenCalledWith(expect.objectContaining({ userId: context.userId, worldId: context.worldId, purpose: 'DM_ACTION' }), expect.any(String), expect.any(String), expect.any(Object));
  });
  it('routes causality through AIService with SYSTEM_USER and CAUSALITY', async () => {
    ai.generateText.mockResolvedValue('Forecast.');
    await CausalityEngine.generateDeepCausalityEvaluation();
    expect(ai.generateText).toHaveBeenCalledWith(expect.objectContaining({ userId: 'SYSTEM_USER', worldId: globalWorld.snapshot.id, purpose: 'CAUSALITY' }), expect.any(String), expect.any(String), expect.any(Object));
  });
});
