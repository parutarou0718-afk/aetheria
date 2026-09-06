import { describe, expect, it, vi } from 'vitest';
import { ProposalPipeline } from '../src/engine/proposal/proposalPipeline';

const proposal: any = { id: 'p1', operation: 'UPDATE_CHARACTER', entityType: 'CHARACTER', payload: {}, effectiveEpoch: 1, preconditions: [], source: { type: 'LLM' }, reason: 'r', causalBasis: [{ type: 'PLAYER_ACTION' }], authorityLevel: 'ACTOR' };
describe('ProposalPipeline', () => {
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
});
