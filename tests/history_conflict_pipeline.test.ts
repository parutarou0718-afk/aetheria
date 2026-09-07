import { beforeEach, describe, expect, it, vi } from 'vitest';
import { dbManager } from '../src/engine/persistence/database';
import { ObservedHistoryRepository } from '../src/engine/history/observedHistoryRepository';
import { ObservedHistoryValidator } from '../src/engine/history/observedHistoryValidator';
import { ProposalPipeline } from '../src/engine/proposal/proposalPipeline';
import { bootstrapWithDefaultWorld } from './helpers/worldFixture';

const rules = { validate: vi.fn().mockResolvedValue({ valid: true, violations: [] }) };
const causal = { validate: vi.fn().mockResolvedValue({ valid: true, violations: [] }) };
let worldId: string;
const proposal = (overrides: Record<string, unknown> = {}) => ({
  id: `proposal-${Math.random()}`, operation: 'UPDATE_CHARACTER' as const, entityType: 'CHARACTER', entityId: 'npc-elder',
  payload: { status: 'DEAD' }, effectiveEpoch: 1, preconditions: [], source: { type: 'SYSTEM' as const },
  reason: 'Apply a state change.', causalBasis: [{ type: 'SYSTEM_EVENT' as const, description: 'Test event.' }], authorityLevel: 'SYSTEM' as const,
  ...overrides,
});

describe('Observed history pipeline gate', () => {
  beforeEach(async () => {
    worldId = `history-conflict-pipeline-${Date.now()}-${Math.random()}`;
    await dbManager.initialize();
    await bootstrapWithDefaultWorld(worldId);
  });

  async function observe(status: 'CONFIRMED_FACT' | 'RUMOR' | 'CLAIM' = 'CONFIRMED_FACT') {
    await ObservedHistoryRepository.saveObservation(worldId, {
      id: `observation-${status}`, world_id: worldId, observer_type: 'CHARACTER', observer_id: 'pc-player',
      subject_type: 'CHARACTER', subject_id: 'npc-elder', observation_type: 'DIRECT_SIGHT',
      observed_epoch: 2, recorded_epoch: 2, fact_path: 'status', observed_value: 'ALIVE', confidence: 1,
      visibility: 'PRIVATE', immutable_history: true, metadata: { epistemic_status: status },
    });
  }

  it('rejects an earlier contradictory canonical diff before Recorder', async () => {
    await observe();
    const commit = vi.fn();
    const result = await new ProposalPipeline({ commit } as any, rules, causal, undefined, new ObservedHistoryValidator())
      .processAndCommit({ worldId, proposals: [proposal()] });
    expect(result.rejected).toEqual([expect.objectContaining({ code: 'PROPOSAL_HISTORY_CONFLICT', observationId: 'observation-CONFIRMED_FACT', factPath: 'status' })]);
    expect(commit).not.toHaveBeenCalled();
  });

  it('allows a compatible historical value, later change, and non-confirmed knowledge', async () => {
    await observe();
    const validator = new ObservedHistoryValidator();
    await expect(validator.validate({ worldId, proposal: proposal({ payload: { status: 'ALIVE' } }) })).resolves.toMatchObject({ valid: true });
    await expect(validator.validate({ worldId, proposal: proposal({ effectiveEpoch: 3 }) })).resolves.toMatchObject({ valid: true });
    await ObservedHistoryRepository.saveObservation(worldId, {
      id: 'rumor', world_id: worldId, observer_type: 'CHARACTER', observer_id: 'npc-guard', subject_type: 'CHARACTER', subject_id: 'pc-player',
      observation_type: 'DIALOGUE_STATEMENT', observed_epoch: 2, recorded_epoch: 2, fact_path: 'status', observed_value: 'ALIVE', confidence: 0.3,
      visibility: 'PRIVATE', immutable_history: true, metadata: { epistemic_status: 'RUMOR' },
    });
    await expect(validator.validate({ worldId, proposal: proposal({ entityId: 'pc-player' }) })).resolves.toMatchObject({ valid: true });
  });
});
