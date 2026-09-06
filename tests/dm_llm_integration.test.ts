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

describe('DM LLM integration', () => {
  beforeEach(async () => {
    ai.isAvailable.mockReset();
    ai.generateJson.mockReset();
    await bootstrapWithDefaultWorld();
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

    await DMEngine.processPlayerAction('Travel to the ruins.');

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

    const response = await DMEngine.processPlayerAction('Try an action.');

    expect(response.stateUpdatesSummary).toEqual([
      'Action resolution failed; no DM-generated state change was committed.',
    ]);
    expect(response.epoch).toBe(epochBefore);
    expect(globalWorld.snapshot.epoch).toBe(epochBefore);
  });
});
