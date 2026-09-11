import { describe, expect, it, vi } from 'vitest';

const ai = vi.hoisted(() => ({ generateJson: vi.fn() }));
vi.mock('../src/engine/ai/aiService', () => ({ aiService: ai }));

import { WorldProfileGenerator } from '../src/engine/worldGeneration/worldProfileGenerator';
import { DeterministicIdFactory } from '../src/engine/worldGeneration/deterministicIdFactory';

describe('world generation timeout policy', () => {
  it('gives a structured profile generation enough time to complete', async () => {
    ai.generateJson.mockResolvedValue({ displayName: 'Sky Islands', worldDescription: 'A world of floating islands connected by airships and ancient sky ruins.' });

    await WorldProfileGenerator.generateProfileAndAxioms({
      worldId: 'world-timeout-policy',
      userVision: 'A world of floating islands connected by airships and ancient sky ruins.',
      generationSeed: 42,
    }, new DeterministicIdFactory(42));

    expect(ai.generateJson).toHaveBeenCalledWith(
      expect.objectContaining({ purpose: 'WORLD_PROFILE' }),
      expect.any(String),
      expect.any(String),
      expect.objectContaining({ timeoutMs: 120000 }),
    );
  });
});
