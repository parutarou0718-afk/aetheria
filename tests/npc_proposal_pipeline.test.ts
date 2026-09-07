import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const ai = vi.hoisted(() => ({ isAvailable: vi.fn(), generateJson: vi.fn() }));
vi.mock('../src/engine/ai/aiService', () => ({ aiService: ai }));

import { NPCCognitionEngine } from '../src/engine/npcCognition';
import { proposalPipeline } from '../src/engine/proposal/proposalPipeline';
import { globalWorld, setRecorderWriteContext } from '../src/engine/worldState';
import { WorldRepository } from '../src/engine/world/worldRepository';
import { WorldCacheLoader } from '../src/engine/world/worldCacheLoader';
import { bootstrapWithDefaultWorld } from './helpers/worldFixture';
import { QuestRepository } from '../src/engine/quest/questRepository';

function requestContext() {
  return {
    userId: 'SYSTEM_USER', sessionId: 'test-session', worldId: globalWorld.snapshot.id,
    actorId: 'pc-player', channel: 'WEB' as const, mode: 'IN_WORLD_ACTION' as const,
  };
}

describe('NPC proposal authority', () => {
  beforeEach(async () => {
    await bootstrapWithDefaultWorld(`world-npc-proposal-${Date.now()}`);
    ai.isAvailable.mockReturnValue(true);
    ai.generateJson.mockResolvedValue({ reply: 'I remember this.', trustDelta: 2, favorDelta: 3 });
  });

  afterEach(() => vi.restoreAllMocks());

  it('submits memory and relationship changes as one SYSTEM proposal batch', async () => {
    const pipeline = vi.spyOn(proposalPipeline, 'processAndCommit');

    await NPCCognitionEngine.generateNPCDialogue(requestContext(), 'npc-elder', 'Thank you.', 'Player');

    expect(pipeline).toHaveBeenCalledWith(expect.objectContaining({
      worldId: globalWorld.snapshot.id,
      proposals: expect.arrayContaining([
        expect.objectContaining({ operation: 'UPDATE_CHARACTER_MEMORY', authorityLevel: 'SYSTEM' }),
        expect.objectContaining({ operation: 'CHANGE_RELATIONSHIP', authorityLevel: 'SYSTEM' }),
        expect.objectContaining({ operation: 'CREATE_OBSERVED_HISTORY', payload: expect.objectContaining({ factPath: 'dialogue.statement', metadata: expect.objectContaining({ epistemic_status: 'CLAIM' }) }) }),
      ]),
    }));
  });

  it('accepts only an available quest offered by the current NPC in the same atomic batch', async () => {
    const questId = `quest-npc-${crypto.randomUUID()}`;
    await QuestRepository.saveQuest({ id: questId, world_id: globalWorld.snapshot.id, title: 'Reach the Ruins', description: 'Travel there.', status: 'AVAILABLE', giver_character_id: 'npc-elder', assignee_character_id: null, objective: { description: 'Reach the ruins.', targetType: 'CHARACTER', targetId: 'pc-player', expectedCondition: { operator: 'EQUALS', fieldPath: 'location_id', value: 'loc-ruins' } }, dependency_ids: [], created_at_epoch: 1, accepted_at_epoch: null, resolved_at_epoch: null, failure_reason: null });
    ai.generateJson.mockResolvedValue({ reply: 'I accept your help.', trustDelta: 1, favorDelta: 0, questIntent: { action: 'ACCEPT', questId } });
    const result = await NPCCognitionEngine.generateNPCDialogue(requestContext(), 'npc-elder', 'I will go.', 'Player');
    expect(result.actionTriggered).toBe(`QUEST_ACCEPTED:${questId}`);
    expect(await QuestRepository.getQuest(globalWorld.snapshot.id, questId)).toMatchObject({ status: 'ACTIVE', assignee_character_id: 'pc-player' });
  });

  it('does not report relationship changes when the pipeline rejects', async () => {
    vi.spyOn(proposalPipeline, 'processAndCommit').mockResolvedValue({ success: false, accepted: [], rejected: [] });
    const npc = globalWorld.characters.get('npc-elder')!;
    const before = JSON.stringify({ memory: npc.memory, relationships: npc.relationships });

    const result = await NPCCognitionEngine.generateNPCDialogue(requestContext(), 'npc-elder', 'Thank you.', 'Player');

    expect(result.trustDelta).toBe(0);
    expect(result.favorDelta).toBe(0);
    expect(JSON.stringify({ memory: npc.memory, relationships: npc.relationships })).toBe(before);
  });

  it('preserves NPC memory compaction after a proposal writes the sixteenth short-term memory', async () => {
    const npc = globalWorld.characters.get('npc-elder')!;
    setRecorderWriteContext(true);
    try {
      npc.memory.short_term = Array.from({ length: 15 }, (_, index) => ({
        text: `Memory ${index}`,
        importance: index % 5,
        epoch: 1,
      }));
    } finally {
      setRecorderWriteContext(false);
    }
    await WorldRepository.saveCharacter(globalWorld.snapshot.id, npc);

    await NPCCognitionEngine.generateNPCDialogue(requestContext(), 'npc-elder', 'A new memory.', 'Player');

    const updatedNpc = globalWorld.characters.get('npc-elder')!;
    expect(updatedNpc.memory.short_term).toHaveLength(5);
    expect(updatedNpc.memory.compressed).toContain('A new memory.');
  });

  it('persists NPC dialogue memory and relationship changes across a cache reload', async () => {
    await NPCCognitionEngine.generateNPCDialogue(requestContext(), 'npc-elder', 'I will remember this promise.', 'Player');

    const beforeReload = globalWorld.characters.get('npc-elder')!;
    const expectedMemory = beforeReload.memory.short_term.find((memory) => memory.text.includes('I will remember this promise.'));
    const expectedRelationship = beforeReload.relationships.find((relationship) => relationship.target_id === 'pc-player');
    expect(expectedMemory).toBeDefined();
    expect(expectedRelationship).toEqual(expect.objectContaining({ trust: expect.any(Number), favor: expect.any(Number) }));

    await WorldCacheLoader.reload(globalWorld.snapshot.id);

    const reloadedNpc = globalWorld.characters.get('npc-elder')!;
    expect(reloadedNpc.memory.short_term).toContainEqual(expectedMemory);
    expect(reloadedNpc.relationships.find((relationship) => relationship.target_id === 'pc-player')).toEqual(expectedRelationship);
    const observations = await WorldRepository.getObservedHistoryForObserver(globalWorld.snapshot.id, 'CHARACTER', 'npc-elder');
    expect(observations).toEqual(expect.arrayContaining([
      expect.objectContaining({ subject_id: 'pc-player', fact_path: 'name' }),
      expect.objectContaining({ subject_id: 'pc-player', fact_path: 'dialogue.statement', metadata: expect.objectContaining({ epistemic_status: 'CLAIM' }) }),
    ]));
  });

  it('persists distinct dialogue claims made in the same epoch without rolling either dialogue back', async () => {
    await NPCCognitionEngine.generateNPCDialogue(requestContext(), 'npc-elder', 'Statement A.', 'Player');
    await NPCCognitionEngine.generateNPCDialogue(requestContext(), 'npc-elder', 'Statement B.', 'Player');

    const npc = globalWorld.characters.get('npc-elder')!;
    expect(npc.memory.short_term.map((memory) => memory.text)).toEqual(expect.arrayContaining([
      expect.stringContaining('Statement A.'), expect.stringContaining('Statement B.'),
    ]));
    const observations = await WorldRepository.getObservedHistoryForObserver(globalWorld.snapshot.id, 'CHARACTER', 'npc-elder');
    expect(observations.filter((observation) => observation.fact_path === 'dialogue.statement').map((observation) => observation.observed_value))
      .toEqual(expect.arrayContaining(['Statement A.', 'Statement B.']));
  });
});
