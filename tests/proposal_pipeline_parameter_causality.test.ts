import { describe, expect, it, vi } from 'vitest';
import { ProposalPipeline, type RuleValidator } from '../src/engine/proposal/proposalPipeline';
import type { ProposalV2 } from '../src/engine/proposal/proposalSchema';

const semantic = (overrides: Partial<ProposalV2> = {}): ProposalV2 => ({
  id: 'semantic-pipeline', operation: 'APPLY_SEMANTIC_EFFECT', entityType: 'CHARACTER', entityId: 'pc-player', payload: {}, effectiveEpoch: 1, preconditions: [], source: { type: 'SYSTEM' }, reason: 'Resolve damage.', causalBasis: [{ type: 'SYSTEM_EVENT', description: 'A deterministic system effect occurred.' }], authorityLevel: 'SYSTEM', semanticEffect: { type: 'DAMAGE', magnitude: 'MEDIUM', resource: 'HP', targetEntityId: 'pc-player' }, ...overrides,
});
const target = () => ({ commit: vi.fn().mockResolvedValue({ success: true, errors: [], committedCount: 1, appliedProposalIds: [], proposalResults: [], eventsGenerated: [], epoch: 1 }) });
const causal = (valid = true) => ({ validate: vi.fn().mockResolvedValue(valid ? { valid: true, violations: [] } : { valid: false, violations: [{ basisType: 'FACT', basisId: 'missing', reason: 'NOT_FOUND', message: 'Missing.' }] }) });
const rules: RuleValidator = { validate: vi.fn().mockResolvedValue({ valid: true, violations: [] }) };

describe('ProposalPipeline parameter and causal order', () => {
  it('passes the resolved proposal to WorldRule and Recorder once', async () => {
    const committer = target();
    const result = await new ProposalPipeline(committer, rules, causal()).processAndCommit({ worldId: 'world-1', proposals: [semantic()] });
    expect(result.success).toBe(true);
    expect(rules.validate).toHaveBeenCalledWith(expect.objectContaining({ proposal: expect.objectContaining({ operation: 'UPDATE_CHARACTER_ATTRIBUTES', payload: expect.objectContaining({ hpDelta: -15 }) }) }));
    expect(committer.commit).toHaveBeenCalledWith('world-1', [expect.objectContaining({ operation: 'UPDATE_CHARACTER_ATTRIBUTES', payload: expect.objectContaining({ hpDelta: -15 }) })]);
  });

  it('stops before parameter resolution, rules, and Recorder when causal validation fails', async () => {
    const committer = target();
    const ruleValidator: RuleValidator = { validate: vi.fn() };
    const result = await new ProposalPipeline(committer, ruleValidator, causal(false)).processAndCommit({ worldId: 'world-1', proposals: [semantic()] });
    expect(result.rejected).toEqual([expect.objectContaining({ code: 'PROPOSAL_CAUSAL_BASIS_INVALID', reason: 'NOT_FOUND' })]);
    expect(ruleValidator.validate).not.toHaveBeenCalled();
    expect(committer.commit).not.toHaveBeenCalled();
  });

  it('rejects an unsupported parameter effect before WorldRule and Recorder', async () => {
    const committer = target();
    const ruleValidator: RuleValidator = { validate: vi.fn() };
    const result = await new ProposalPipeline(committer, ruleValidator, causal()).processAndCommit({ worldId: 'world-1', proposals: [semantic({ semanticEffect: { type: 'DAMAGE', magnitude: 'LIGHT', resource: 'GOLD', targetEntityId: 'pc-player' } })] });
    expect(result.rejected).toEqual([expect.objectContaining({ code: 'PROPOSAL_PARAMETER_RESOLUTION_FAILED' })]);
    expect(ruleValidator.validate).not.toHaveBeenCalled();
    expect(committer.commit).not.toHaveBeenCalled();
  });

  it('rejects an entire batch when a later proposal has an invalid causal reference', async () => {
    const committer = target();
    const selectiveCausal = {
      validate: vi.fn(async ({ proposal }: { proposal: ProposalV2 }) => proposal.id === 'bad-causal'
        ? { valid: false, violations: [{ basisType: 'FACT', basisId: 'missing', reason: 'NOT_FOUND' as const, message: 'Missing.' }] }
        : { valid: true, violations: [] }),
    };
    const result = await new ProposalPipeline(committer, rules, selectiveCausal).processAndCommit({
      worldId: 'world-1',
      proposals: [semantic({ id: 'valid-semantic' }), semantic({ id: 'bad-causal' })],
    });
    expect(result).toMatchObject({ success: false, accepted: [], rejected: [expect.objectContaining({ code: 'PROPOSAL_CAUSAL_BASIS_INVALID' })] });
    expect(committer.commit).not.toHaveBeenCalled();
  });
});
