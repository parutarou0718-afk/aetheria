import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const ai = vi.hoisted(() => ({
  isAvailable: vi.fn(),
  generateJson: vi.fn(),
}));

vi.mock('../src/engine/ai/aiService', () => ({ aiService: ai }));

import { DMEngine } from '../src/engine/dmEngine';
import { globalWorld } from '../src/engine/worldState';
import { recorder } from '../src/engine/recorder/recorder';
import { proposalPipeline } from '../src/engine/proposal/proposalPipeline';
import { WorldRepository } from '../src/engine/world/worldRepository';
import { bootstrapWithDefaultWorld } from './helpers/worldFixture';

function requestContext() {
  return {
    userId: 'SYSTEM_USER', sessionId: 'test-session', worldId: globalWorld.snapshot.id,
    actorId: 'pc-player', channel: 'WEB' as const, mode: 'IN_WORLD_ACTION' as const,
  };
}

describe('DM LLM integration', () => {
  let worldSequence = 0;

  beforeEach(async () => {
    ai.isAvailable.mockReset();
    ai.generateJson.mockReset();
    worldSequence += 1;
    await bootstrapWithDefaultWorld(`world-dm-llm-${Date.now()}-${worldSequence}`);
  });

  afterEach(() => {
    vi.restoreAllMocks();
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

    const response = await DMEngine.processPlayerAction(requestContext(), 'Look upward.');

    expect(ai.generateJson).toHaveBeenCalledWith(expect.objectContaining({ userId: 'SYSTEM_USER', worldId: expect.any(String), purpose: 'DM_ACTION' }), expect.any(String), expect.any(String), expect.any(Object));
    expect(response.dmNarration).toBe('The stars answer.');
  });

  it('does not report an epoch advance when DM action resolution fails', async () => {
    ai.isAvailable.mockReturnValue(true);
    ai.generateJson.mockRejectedValue(new Error('upstream unavailable'));

    const response = await DMEngine.processPlayerAction(requestContext(), 'Look upward.');

    expect(response.stateUpdatesSummary).toEqual([
      'Action resolution failed; no DM-generated state change was committed.',
    ]);
  });

  it('commits player outcomes as ACTOR and DM travel execution as SYSTEM in one batch', async () => {
    ai.isAvailable.mockReturnValue(true);
    ai.generateJson.mockResolvedValue({
      dmNarration: 'You set out for the ruins.',
      characterUpdate: null,
      newLocation: null,
      targetLocationId: 'loc-ruins',
      hpDelta: 0,
      mpDelta: 0,
      goldDelta: 0,
      npcAffinityDelta: null,
      collectedEvidence: null,
      advanceEpoch: false,
    });
    const commitSpy = vi.spyOn(recorder, 'commit');

    await DMEngine.processPlayerAction(requestContext(), 'Travel to the ruins.');

    expect(commitSpy).toHaveBeenCalledOnce();
    const [, proposals] = commitSpy.mock.calls[0];
    expect(proposals.some((proposal) => proposal.source.type === 'LLM' && proposal.authorityLevel === 'ACTOR')).toBe(true);
    expect(proposals.filter((proposal) => proposal.source.type === 'TIMELINE')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ authorityLevel: 'SYSTEM' }),
      ])
    );
    const transactionProposal = proposals.find((proposal) => proposal.operation === 'CREATE_WORLD_TRANSACTION');
    const transactionId = (transactionProposal?.payload.transaction as { id: string } | undefined)?.id;
    expect(transactionId).toEqual(expect.any(String));
    const transaction = await WorldRepository.getWorldTransaction(globalWorld.snapshot.id, transactionId!);
    expect(transaction).not.toBeNull();
    const checkpoints = await WorldRepository.getCheckpointsForTransaction(globalWorld.snapshot.id, transactionId!);
    expect(checkpoints.length).toBeGreaterThan(0);
  });

  it('stops action resolution without advancing epoch when the proposal pipeline rejects', async () => {
    ai.isAvailable.mockReturnValue(true);
    ai.generateJson.mockResolvedValue({
      dmNarration: 'This must not be reported as committed.',
      characterUpdate: null,
      newLocation: null,
      targetLocationId: null,
      hpDelta: 0,
      mpDelta: 0,
      goldDelta: 0,
      npcAffinityDelta: null,
      collectedEvidence: null,
      advanceEpoch: true,
    });
    vi.spyOn(proposalPipeline, 'processAndCommit').mockResolvedValue({
      success: false,
      accepted: [],
      rejected: [{ proposalId: 'p', code: 'PROPOSAL_BATCH_REJECTED', message: 'rejected for test' }],
    });
    const epochBefore = globalWorld.snapshot.epoch;

    const response = await DMEngine.processPlayerAction(requestContext(), 'Try an action.');

    expect(response.stateUpdatesSummary).toEqual([
      'Action resolution failed; no DM-generated state change was committed.',
    ]);
    expect(response.epoch).toBe(epochBefore);
    expect(globalWorld.snapshot.epoch).toBe(epochBefore);
  });

  it('uses neutral legal narration when a world rule rejects the DM proposal batch', async () => {
    ai.isAvailable.mockReturnValue(true);
    ai.generateJson.mockResolvedValue({ dmNarration: 'The dead traveler walks away.', advanceEpoch: true });
    vi.spyOn(proposalPipeline, 'processAndCommit').mockResolvedValue({
      success: false,
      accepted: [],
      rejected: [{ proposalId: 'p', code: 'PROPOSAL_RULE_VIOLATION', ruleType: 'DEAD_CHARACTER_CANNOT_ACT', message: 'A dead character cannot perform this action.' }],
    });

    const response = await DMEngine.processPlayerAction(requestContext(), 'Make the dead traveler leave.');

    expect(response.dmNarration).toBe('The attempted action cannot produce that outcome under the current world constraints.');
    expect(response.stateUpdatesSummary).toEqual(['Action resolution failed; no DM-generated state change was committed.']);
    expect(response.epoch).toBe(1);
  });

  it('submits LLM gameplay changes as semantic effects rather than numeric deltas', async () => {
    ai.isAvailable.mockReturnValue(true);
    ai.generateJson.mockResolvedValue({
      dmNarration: 'The blow lands.', effects: [{ type: 'DAMAGE', magnitude: 'MEDIUM', resource: 'HP', targetEntityId: 'npc-elder', actorId: 'forged-llm-actor' }],
      hpDelta: -999, mpDelta: -999, goldDelta: -999, advanceEpoch: false,
    });
    const processSpy = vi.spyOn(proposalPipeline, 'processAndCommit').mockResolvedValue({ success: true, accepted: [], rejected: [] });

    await DMEngine.processPlayerAction(requestContext(), 'Strike the target.');

    const [input] = processSpy.mock.calls[0] ?? [];
    expect(input?.proposals).toEqual(expect.arrayContaining([
      expect.objectContaining({ operation: 'APPLY_SEMANTIC_EFFECT', actorId: 'pc-player', entityId: 'npc-elder', semanticEffect: expect.objectContaining({ type: 'DAMAGE', magnitude: 'MEDIUM', resource: 'HP', targetEntityId: 'npc-elder' }) }),
    ]));
    expect(JSON.stringify(input?.proposals)).not.toContain('-999');
    expect(JSON.stringify(input?.proposals)).not.toContain('forged-llm-actor');
  });

  it('resolves DM MEDIUM DAMAGE through the real pipeline before Recorder', async () => {
    ai.isAvailable.mockReturnValue(true);
    ai.generateJson.mockResolvedValue({
      dmNarration: 'The blow lands.', effects: [{ type: 'DAMAGE', magnitude: 'MEDIUM', resource: 'HP', targetEntityId: 'pc-player' }], advanceEpoch: false,
    });
    const commitSpy = vi.spyOn(recorder, 'commit');

    await DMEngine.processPlayerAction(requestContext(), 'Strike the target.');

    expect(commitSpy).toHaveBeenCalledWith(expect.any(String), expect.arrayContaining([
      expect.objectContaining({ operation: 'UPDATE_CHARACTER_ATTRIBUTES', payload: expect.objectContaining({ hpDelta: -15 }) }),
    ]));
  });

  it('makes exactly one sanitized repair attempt after a repairable rule rejection', async () => {
    ai.isAvailable.mockReturnValue(true);
    ai.generateJson
      .mockResolvedValueOnce({ dmNarration: 'The dead traveler leaves.', effects: [], advanceEpoch: false })
      .mockResolvedValueOnce({ dmNarration: 'The traveler remains still.', effects: [], advanceEpoch: false, authorityLevel: 'ADMIN', actorId: 'forged' });
    vi.spyOn(proposalPipeline, 'processAndCommit')
      .mockResolvedValueOnce({ success: false, accepted: [], rejected: [{ proposalId: 'p', code: 'PROPOSAL_RULE_VIOLATION', ruleType: 'DEAD_CHARACTER_CANNOT_ACT', hardness: 'HARD', message: 'A dead character cannot act.' }] })
      .mockResolvedValueOnce({ success: true, accepted: [], rejected: [] });

    const response = await DMEngine.processPlayerAction(requestContext(), 'Make the dead traveler leave.');

    expect(ai.generateJson).toHaveBeenCalledTimes(2);
    expect(response.dmNarration).toBe('The traveler remains still.');
    expect(response.resolutionMeta).toEqual({ repairAttempted: true, repairSucceeded: true });
  });

  it('does not repair an authority rejection', async () => {
    ai.isAvailable.mockReturnValue(true);
    ai.generateJson.mockResolvedValue({ dmNarration: 'No authority.', effects: [], advanceEpoch: false });
    vi.spyOn(proposalPipeline, 'processAndCommit').mockResolvedValue({
      success: false, accepted: [], rejected: [{ proposalId: 'p', code: 'PROPOSAL_AUTHORITY_INSUFFICIENT', message: 'Requires AUTHOR.' }],
    });

    await DMEngine.processPlayerAction(requestContext(), 'Do it.');
    expect(ai.generateJson).toHaveBeenCalledTimes(1);
  });
});
