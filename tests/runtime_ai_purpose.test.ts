import { beforeEach, describe, expect, it, vi } from 'vitest';

const ai = vi.hoisted(() => ({ isAvailable: vi.fn(), generateJson: vi.fn(), generateText: vi.fn() }));
vi.mock('../src/engine/ai/aiService', () => ({ aiService: ai }));

import { NPCCognitionEngine } from '../src/engine/npcCognition';
import { CausalityEngine } from '../src/engine/causality';
import { globalWorld } from '../src/engine/worldState';
import { bootstrapWithDefaultWorld } from './helpers/worldFixture';

describe('runtime AI request purposes', () => {
  beforeEach(async () => { ai.isAvailable.mockReset(); ai.generateJson.mockReset(); ai.generateText.mockReset(); await bootstrapWithDefaultWorld(); ai.isAvailable.mockReturnValue(true); });
  it('routes NPC dialogue through AIService with SYSTEM_USER and NPC_DIALOGUE', async () => {
    ai.generateJson.mockResolvedValue({ reply: 'Understood.', trustDelta: 0, favorDelta: 0 });
    await NPCCognitionEngine.generateNPCDialogue('npc-elder', 'Hello');
    expect(ai.generateJson).toHaveBeenCalledWith(expect.objectContaining({ userId: 'SYSTEM_USER', worldId: globalWorld.snapshot.id, purpose: 'NPC_DIALOGUE' }), expect.any(String), expect.any(String), expect.any(Object));
  });
  it('routes causality through AIService with SYSTEM_USER and CAUSALITY', async () => {
    ai.generateText.mockResolvedValue('Forecast.');
    await CausalityEngine.generateDeepCausalityEvaluation();
    expect(ai.generateText).toHaveBeenCalledWith(expect.objectContaining({ userId: 'SYSTEM_USER', worldId: globalWorld.snapshot.id, purpose: 'CAUSALITY' }), expect.any(String), expect.any(String), expect.any(Object));
  });
});
