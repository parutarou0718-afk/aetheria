import { describe, expect, it, vi } from 'vitest';
import { ProposalPipeline, type RuleValidator } from '../src/engine/proposal/proposalPipeline';
import { PreconditionEvaluator } from '../src/engine/recorder/validators';
import type { ProposalV2 } from '../src/engine/proposal/proposalSchema';

const proposal = (overrides: Partial<ProposalV2> = {}): ProposalV2 => ({
  id: 'proposal-rule-pipeline', operation: 'CHANGE_RESOURCE', entityType: 'CHARACTER', entityId: 'pc-player',
  payload: { characterId: 'pc-player', goldDelta: 1 }, effectiveEpoch: 1, preconditions: [], source: { type: 'PLAYER_ACTION' },
  reason: 'Apply a deterministic resource update.', causalBasis: [{ type: 'SYSTEM_EVENT', description: 'A deterministic system update occurred.' }], authorityLevel: 'SYSTEM', ...overrides,
});

const committer = () => ({ commit: vi.fn().mockResolvedValue({ success: true, errors: [], committedCount: 1, appliedProposalIds: [], proposalResults: [], eventsGenerated: [], epoch: 1 }) });
const validRules: RuleValidator = { validate: vi.fn().mockResolvedValue({ valid: true, violations: [] }) };
const rejectedRules: RuleValidator = { validate: vi.fn().mockResolvedValue({ valid: false, violations: [{ ruleId: 'rule-gold', ruleType: 'RESOURCE_NON_NEGATIVE', hardness: 'HARD', code: 'RESOURCE_WOULD_BE_NEGATIVE', message: 'Gold cannot be negative.' }] }) };

describe('ProposalPipeline world rule ordering', () => {
  it('does not call rules for schema-invalid proposals', async () => {
    const rules: RuleValidator = { validate: vi.fn() };
    const result = await new ProposalPipeline(committer(), rules).processAndCommit({ worldId: 'world-1', proposals: [{ ...proposal(), reason: '' }] });
    expect(result.rejected[0].code).toBe('PROPOSAL_SCHEMA_INVALID');
    expect(rules.validate).not.toHaveBeenCalled();
  });

  it('does not call rules for authority-invalid proposals', async () => {
    const rules: RuleValidator = { validate: vi.fn() };
    const result = await new ProposalPipeline(committer(), rules).processAndCommit({ worldId: 'world-1', proposals: [proposal({ operation: 'ADVANCE_WORLD_EPOCH', authorityLevel: 'ACTOR', payload: { advanceBy: 1 } })] });
    expect(result.rejected[0].code).toBe('PROPOSAL_AUTHORITY_INSUFFICIENT');
    expect(rules.validate).not.toHaveBeenCalled();
  });

  it('rejects a rule violation before preconditions and Recorder', async () => {
    const target = committer();
    const preconditions = vi.spyOn(PreconditionEvaluator, 'evaluatePreconditions');
    const result = await new ProposalPipeline(target, rejectedRules).processAndCommit({ worldId: 'world-1', proposals: [proposal({ preconditions: [{ subjectType: 'CHARACTER', subjectId: 'pc-player', field: 'status', operator: 'EQ', value: 'ALIVE' }] })] });
    expect(result).toMatchObject({ success: false, rejected: [expect.objectContaining({ code: 'PROPOSAL_RULE_VIOLATION', ruleType: 'RESOURCE_NON_NEGATIVE' })] });
    expect(preconditions).not.toHaveBeenCalled();
    expect(target.commit).not.toHaveBeenCalled();
    preconditions.mockRestore();
  });

  it('preserves batch atomicity when one proposal violates a rule', async () => {
    const target = committer();
    const selectiveRules: RuleValidator = { validate: vi.fn(async ({ proposal: current }) => current.id === 'bad' ? { valid: false, violations: [{ ruleId: 'rule-gold', ruleType: 'RESOURCE_NON_NEGATIVE' as const, hardness: 'HARD' as const, code: 'RESOURCE_WOULD_BE_NEGATIVE', message: 'Gold cannot be negative.' }] } : { valid: true, violations: [] }) };
    const result = await new ProposalPipeline(target, selectiveRules).processAndCommit({ worldId: 'world-1', proposals: [proposal({ id: 'good' }), proposal({ id: 'bad' })] });
    expect(result.success).toBe(false);
    expect(target.commit).not.toHaveBeenCalled();
  });

  it('commits exactly once only after all validation layers pass', async () => {
    const target = committer();
    const result = await new ProposalPipeline(target, validRules).processAndCommit({ worldId: 'world-1', proposals: [proposal()] });
    expect(result.success).toBe(true);
    expect(validRules.validate).toHaveBeenCalledOnce();
    expect(target.commit).toHaveBeenCalledOnce();
  });
});
