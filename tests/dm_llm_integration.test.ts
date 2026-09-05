import { beforeEach, describe, expect, it, vi } from 'vitest';

const llm = vi.hoisted(() => ({
  hasLlmApiKey: vi.fn(),
  generateJson: vi.fn(),
}));

vi.mock('../src/engine/llm/llmClient', () => llm);

import { DMEngine } from '../src/engine/dmEngine';
import { bootstrapWithDefaultWorld } from './helpers/worldFixture';

describe('DM LLM integration', () => {
  beforeEach(async () => {
    llm.hasLlmApiKey.mockReset();
    llm.generateJson.mockReset();
    await bootstrapWithDefaultWorld();
  });

  it('uses the unified JSON client for structured DM responses', async () => {
    llm.hasLlmApiKey.mockReturnValue(true);
    llm.generateJson.mockResolvedValue({
      dmNarration: 'The stars answer.',
      diceRoll: null,
      characterUpdate: null,
      newLocation: null,
      targetLocationId: null,
      hpDelta: 0,
      mpDelta: 0,
      goldDelta: 0,
      npcAffinityDelta: null,
      collectedEvidence: null,
      advanceEpoch: false,
    });

    const response = await DMEngine.processPlayerAction('Look upward.');

    expect(llm.generateJson).toHaveBeenCalledOnce();
    expect(response.dmNarration).toBe('The stars answer.');
  });

  it('does not report an epoch advance when DM action resolution fails', async () => {
    llm.hasLlmApiKey.mockReturnValue(true);
    llm.generateJson.mockRejectedValue(new Error('upstream unavailable'));

    const response = await DMEngine.processPlayerAction('Look upward.');

    expect(response.stateUpdatesSummary).toEqual([
      'Action resolution failed; no DM-generated state change was committed.',
    ]);
  });
});
