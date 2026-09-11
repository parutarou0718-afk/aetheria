import { describe, expect, it, vi } from 'vitest';

const ai = vi.hoisted(() => ({ generateJson: vi.fn() }));
vi.mock('../src/engine/ai/aiService', () => ({ aiService: ai }));

import { WorldEntityGenerator } from '../src/engine/worldGeneration/worldEntityGenerator';
import { DeterministicIdFactory } from '../src/engine/worldGeneration/deterministicIdFactory';

describe('world entity generation type normalization', () => {
  it('derives only missing PC and NPC types from the constrained genesis id keys', async () => {
    ai.generateJson.mockResolvedValue({
      characters: [
        { idKey: 'pc', name: 'Mara', title: 'Detective', species: 'Human', locationKeyId: 'loc-start', primaryGoal: 'Pay the debt' },
        { idKey: 'npc1', name: 'Ivo', title: 'Dockmaster', species: 'Human', locationKeyId: 'loc-start', primaryGoal: 'Keep the port open' },
      ],
      organizations: [{ name: 'Harbor Office', type: 'GOVERNMENT', description: 'Runs the docks.', headquartersLocationKeyId: 'loc-start', leaderCharacterKeyId: 'npc1', goalDescription: 'Order', projectName: 'Repairs', projectDescription: 'Repair cranes.' }],
      facts: [{ statement: 'Magic is scarce.', category: 'MAGIC' }],
      seeds: [{ type: 'INVESTIGATION', description: 'A missing ledger.', hiddenTruthIndex: 0, opportunityDescription: 'Investigate.', discoveryCondition: 'Ask around.' }],
      genesisEventDescription: 'A fog horn sounds over the harbor.',
    });

    const result = await WorldEntityGenerator.generateEntities(
      { world_id: 'world-entity-types', display_name: 'Port', world_description: 'A steam port city.', power_system: 'Rare magic', cultural_influences: [], naming_conventions: {}, terminology: {}, allowed_concepts: [], forbidden_concepts: [] } as never,
      { locations: [{ id: 'loc-start', name: 'Harbor', type: 'PORT' }], hiddenTruths: [{ id: 'truth-1', title: 'Truth', layer: 'layer_1_personal_secrets' }] } as never,
      new DeterministicIdFactory(42),
    );

    expect(result.characters.map((character) => character.type)).toEqual(['PC', 'NPC']);
  });

  it('retries once when a model response is still structurally invalid after safe normalization', async () => {
    const valid = {
      characters: [
        { idKey: 'pc', type: 'PC', name: 'Mara', title: 'Detective', species: 'Human', locationKeyId: 'loc-start', primaryGoal: 'Pay the debt' },
        { idKey: 'npc1', type: 'NPC', name: 'Ivo', title: 'Dockmaster', species: 'Human', locationKeyId: 'loc-start', primaryGoal: 'Keep the port open' },
      ],
      organizations: [{ name: 'Harbor Office', type: 'GOVERNMENT', description: 'Runs the docks.', headquartersLocationKeyId: 'loc-start', leaderCharacterKeyId: 'npc1', goalDescription: 'Order', projectName: 'Repairs', projectDescription: 'Repair cranes.' }],
      facts: [{ statement: 'Magic is scarce.', category: 'MAGIC' }],
      seeds: [{ type: 'INVESTIGATION', description: 'A missing ledger.', hiddenTruthIndex: 0, opportunityDescription: 'Investigate.', discoveryCondition: 'Ask around.' }],
      genesisEventDescription: 'A fog horn sounds over the harbor.',
    };
    ai.generateJson.mockReset();
    ai.generateJson.mockResolvedValueOnce({ ...valid, characters: [{ ...valid.characters[0], idKey: 'untrusted', type: undefined }, valid.characters[1]] }).mockResolvedValueOnce(valid);

    const result = await WorldEntityGenerator.generateEntities(
      { world_id: 'world-entity-retry', display_name: 'Port', world_description: 'A steam port city.', power_system: 'Rare magic', cultural_influences: [], naming_conventions: {}, terminology: {}, allowed_concepts: [], forbidden_concepts: [] } as never,
      { locations: [{ id: 'loc-start', name: 'Harbor', type: 'PORT' }], hiddenTruths: [{ id: 'truth-1', title: 'Truth', layer: 'layer_1_personal_secrets' }] } as never,
      new DeterministicIdFactory(43),
    );

    expect(result.characters).toHaveLength(2);
    expect(ai.generateJson).toHaveBeenCalledTimes(2);
  });
});
