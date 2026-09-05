import { beforeEach, describe, expect, it, vi } from 'vitest';

const recorder = vi.hoisted(() => ({
  commit: vi.fn(),
}));

vi.mock('../src/engine/recorder/recorder', () => ({ recorder }));

import { CausalityEngine } from '../src/engine/causality';
import { NPCCognitionEngine } from '../src/engine/npcCognition';
import { globalWorld, setRecorderWriteContext } from '../src/engine/worldState';

describe('Stage 0 baseline regressions', () => {
  beforeEach(() => {
    delete process.env.LLM_API_KEY;
    recorder.commit.mockReset();
    recorder.commit.mockResolvedValue({ eventsGenerated: [] });

    setRecorderWriteContext(true);
    try {
      globalWorld.initEmptyWorld();
      globalWorld.snapshot.id = 'world-custom-regression';
      globalWorld.snapshot.world_name = 'Aurora Reach';
      globalWorld.locations.set('loc-custom', {
        id: 'loc-custom', name: 'Glass Harbor', type: 'TOWN', description: 'A quiet harbor.',
      } as any);
      globalWorld.characters.set('npc-custom', {
        id: 'npc-custom', type: 'NPC', name: 'Mira', title: 'Cartographer', species: 'Human', age: 32,
        location_id: 'loc-custom', status: 'ALIVE', goal: { primary: 'map the coast', secondary: [] },
        fear: 'storms', personality: ['calm'], skills: {}, relationships: [],
        memory: { short_term: [{ text: 'The tide is rising.', importance: 2, epoch: 1 }], compressed: '', important_events: [] },
      } as any);
      globalWorld.seeds.set('seed-custom', {
        id: 'seed-custom', type: 'DISCOVERY', status: 'IN_PROGRESS', progress: 0,
        visible_layer: { actor_ids: [], description: 'A beacon flickers.', location_id: 'loc-custom' },
      } as any);
    } finally {
      setRecorderWriteContext(false);
    }
  });

  it('keeps NPC fallback world-neutral and contextual', async () => {
    setRecorderWriteContext(true);
    let result;
    try {
      result = await NPCCognitionEngine.generateNPCDialogue('npc-custom', 'What do you remember?', 'Ari');
    } finally {
      setRecorderWriteContext(false);
    }

    expect(result.reply).toContain('Mira');
    expect(result.reply).toContain('Glass Harbor');
    expect(result.reply).not.toMatch(/铁冠城|黑鸦商会|圣光守卫团|古矿坑/);
  });

  it('commits causality proposals to the active world id', async () => {
    await CausalityEngine.tickSeeds();

    expect(recorder.commit).toHaveBeenCalledWith('world-custom-regression', expect.any(Array));
  });

  it('builds a causality fallback from active world state only', async () => {
    const result = await CausalityEngine.generateDeepCausalityEvaluation();

    expect(result).toContain('Aurora Reach');
    expect(result).not.toMatch(/铁冠城|黑鸦商会|圣光守卫团|古矿坑/);
  });
});
