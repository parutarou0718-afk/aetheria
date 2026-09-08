import { describe, expect, it, vi } from 'vitest';
import { ProposalPipeline, type CausalValidator, type RuleValidator } from '../src/engine/proposal/proposalPipeline';
import { PreconditionEvaluator } from '../src/engine/recorder/validators';

const proposal: any = { id: 'p1', operation: 'UPDATE_CHARACTER', entityType: 'CHARACTER', payload: {}, effectiveEpoch: 1, preconditions: [], source: { type: 'SYSTEM' }, reason: 'r', causalBasis: [{ type: 'SYSTEM_EVENT', description: 'Pipeline test fixture.' }], authorityLevel: 'SYSTEM' };
const rules: RuleValidator = { validate: vi.fn().mockResolvedValue({ valid: true, violations: [] }) };
const causal: CausalValidator = { validate: vi.fn().mockResolvedValue({ valid: true, violations: [] }) };
describe('ProposalPipeline', () => {
  it('serializes validation-to-commit for concurrent invocations of the same world', async () => {
    let releaseFirstCommit!: () => void;
    const firstCommitStarted = new Promise<void>((resolve) => { releaseFirstCommit = resolve; });
    let allowFirstCommit!: () => void;
    const holdFirstCommit = new Promise<void>((resolve) => { allowFirstCommit = resolve; });
    const commit = vi.fn(async () => {
      if (commit.mock.calls.length === 1) {
        releaseFirstCommit();
        await holdFirstCommit;
      }
      return { success: true, errors: [] };
    });
    const pipeline = new ProposalPipeline({ commit } as any, rules, causal);

    const first = pipeline.processAndCommit({ worldId: 'serialized-world', proposals: [{ ...proposal, id: 'first' }] });
    await firstCommitStarted;
    const second = pipeline.processAndCommit({ worldId: 'serialized-world', proposals: [{ ...proposal, id: 'second' }] });
    await new Promise((resolve) => setImmediate(resolve));
    expect(commit).toHaveBeenCalledTimes(1);

    allowFirstCommit();
    await Promise.all([first, second]);
    expect(commit).toHaveBeenCalledTimes(2);
  });

  it('exposes processAndCommit as the runtime pipeline entry point', async () => {
    const commit = vi.fn().mockResolvedValue({ success: true });
    const pipeline = new ProposalPipeline({ commit } as any, rules, causal);

    await expect(pipeline.processAndCommit({ worldId: 'world', proposals: [proposal] })).resolves.toMatchObject({ success: true });
    expect(commit).toHaveBeenCalledOnce();
  });

  it('commits a valid batch once and rejects an invalid batch without calling Recorder', async () => {
    const commit = vi.fn().mockResolvedValue({ success: true });
    const pipeline = new ProposalPipeline({ commit } as any, rules, causal);
    await expect(pipeline.commit({ worldId: 'world', proposals: [proposal] })).resolves.toMatchObject({ success: true });
    expect(commit).toHaveBeenCalledOnce();
    commit.mockClear();
    const result = await pipeline.commit({ worldId: 'world', proposals: [{ ...proposal, reason: '' }, proposal] });
    expect(result.success).toBe(false);
    expect(commit).not.toHaveBeenCalled();
  });

  it('rejects a failed precondition before calling Recorder', async () => {
    const commit = vi.fn();
    const pipeline = new ProposalPipeline({ commit } as any, rules, causal);
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
