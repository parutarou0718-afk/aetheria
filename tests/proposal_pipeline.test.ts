import { describe, expect, it, vi } from 'vitest';
import { ProposalPipeline } from '../src/engine/proposal/proposalPipeline';
import { PreconditionEvaluator } from '../src/engine/recorder/validators';

const proposal: any = { id: 'p1', operation: 'UPDATE_CHARACTER', entityType: 'CHARACTER', payload: {}, effectiveEpoch: 1, preconditions: [], source: { type: 'LLM' }, reason: 'r', causalBasis: [{ type: 'PLAYER_ACTION' }], authorityLevel: 'ACTOR' };
describe('ProposalPipeline', () => {
  it('exposes processAndCommit as the runtime pipeline entry point', async () => {
    const commit = vi.fn().mockResolvedValue({ success: true });
    const pipeline = new ProposalPipeline({ commit } as any);

    await expect(pipeline.processAndCommit({ worldId: 'world', proposals: [proposal] })).resolves.toMatchObject({ success: true });
    expect(commit).toHaveBeenCalledOnce();
  });

  it('commits a valid batch once and rejects an invalid batch without calling Recorder', async () => {
    const commit = vi.fn().mockResolvedValue({ success: true });
    const pipeline = new ProposalPipeline({ commit } as any);
    await expect(pipeline.commit({ worldId: 'world', proposals: [proposal] })).resolves.toMatchObject({ success: true });
    expect(commit).toHaveBeenCalledOnce();
    commit.mockClear();
    const result = await pipeline.commit({ worldId: 'world', proposals: [{ ...proposal, reason: '' }, proposal] });
    expect(result.success).toBe(false);
    expect(commit).not.toHaveBeenCalled();
  });

  it('rejects a failed precondition before calling Recorder', async () => {
    const commit = vi.fn();
    const pipeline = new ProposalPipeline({ commit } as any);
    const evaluate = vi.spyOn(PreconditionEvaluator, 'evaluatePreconditions').mockResolvedValue({
      passed: false,
      failedConditions: ['CHARACTER:pc.status expected ALIVE'],
    });

    const result = await pipeline.processAndCommit({
      worldId: 'world',
      proposals: [{
        ...proposal,
        preconditions: [{ subjectType: 'CHARACTER', subjectId: 'pc', field: 'status', operator: 'EQ', value: 'ALIVE' }],
      }],
    });

    expect(result.rejected[0]?.code).toBe('PROPOSAL_PRECONDITION_FAILED');
    expect(commit).not.toHaveBeenCalled();
    evaluate.mockRestore();
  });
});
