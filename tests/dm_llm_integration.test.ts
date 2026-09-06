import { beforeEach, describe, expect, it, vi } from 'vitest';

const ai = vi.hoisted(() => ({
  isAvailable: vi.fn(),
  generateJson: vi.fn(),
}));

vi.mock('../src/engine/ai/aiService', () => ({ aiService: ai }));

import { DMEngine } from '../src/engine/dmEngine';
import { bootstrapWithDefaultWorld } from './helpers/worldFixture';

describe('DM LLM integration', () => {
  beforeEach(async () => {
    ai.isAvailable.mockReset();
    ai.generateJson.mockReset();
    await bootstrapWithDefaultWorld();
  });

  it('uses the unified JSON client for structured DM responses', async () => {
    ai.isAvailable.mockReturnValue(true);
    ai.generateJson.mockResolvedValue({
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

    expect(ai.generateJson).toHaveBeenCalledWith(expect.objectContaining({ userId: 'SYSTEM_USER', worldId: expect.any(String), purpose: 'DM_ACTION' }), expect.any(String), expect.any(String), expect.any(Object));
    expect(response.dmNarration).toBe('The stars answer.');
  });

  it('does not report an epoch advance when DM action resolution fails', async () => {
    ai.isAvailable.mockReturnValue(true);
    ai.generateJson.mockRejectedValue(new Error('upstream unavailable'));

    const response = await DMEngine.processPlayerAction('Look upward.');

    expect(response.stateUpdatesSummary).toEqual([
      'Action resolution failed; no DM-generated state change was committed.',
    ]);
  });
});
