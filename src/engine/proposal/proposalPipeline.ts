import type { CommitResult } from '../recorder/changeSchemas';
import { recorder } from '../recorder/recorder';
import { PreconditionEvaluator } from '../recorder/validators';
import { AuthorityValidator } from '../constraints/authority/authorityValidator';
import { DefaultWorldRuleRepository } from '../constraints/rules/worldRuleRepository';
import { WorldRepositoryRuleStateReader } from '../constraints/rules/worldRepositoryRuleStateReader';
import { WorldRuleValidator } from '../constraints/rules/worldRuleValidator';
import type { WorldRuleViolation } from '../constraints/rules/worldRuleTypes';
import { ProposalSchema, type ProposalV2 } from './proposalSchema';

export interface ProposalPipelineInput {
  worldId: string;
  proposals: ProposalV2[];
}

export interface ProposalRejection {
  proposalId: string;
  code:
    | 'PROPOSAL_SCHEMA_INVALID'
    | 'PROPOSAL_AUTHORITY_INSUFFICIENT'
    | 'PROPOSAL_RULE_VIOLATION'
    | 'PROPOSAL_PRECONDITION_FAILED'
    | 'PROPOSAL_BATCH_REJECTED';
  message: string;
  ruleId?: string;
  ruleType?: WorldRuleViolation['ruleType'];
  hardness?: WorldRuleViolation['hardness'];
}

export interface ProposalPipelineResult {
  success: boolean;
  accepted: ProposalV2[];
  rejected: ProposalRejection[];
  commitResult?: CommitResult;
}

interface RecorderCommitter {
  commit(worldId: string, proposals: ProposalV2[]): Promise<CommitResult>;
}

export interface RuleValidator {
  validate(input: { worldId: string; proposal: ProposalV2 }): Promise<{ valid: boolean; violations: WorldRuleViolation[] }>;
}

const defaultRuleValidator = new WorldRuleValidator(
  new DefaultWorldRuleRepository(),
  new WorldRepositoryRuleStateReader(),
);

export class ProposalPipeline {
  constructor(
    private readonly recorderCommitter: RecorderCommitter = recorder,
    private readonly ruleValidator: RuleValidator = defaultRuleValidator,
  ) {}

  async processAndCommit(input: ProposalPipelineInput): Promise<ProposalPipelineResult> {
    const rejected: ProposalRejection[] = [];
    const accepted: ProposalV2[] = [];

    for (const proposal of input.proposals) {
      const parsed = ProposalSchema.safeParse(proposal);
      if (!parsed.success) {
        rejected.push({ proposalId: proposal.id, code: 'PROPOSAL_SCHEMA_INVALID', message: parsed.error.message });
        continue;
      }

      const authority = AuthorityValidator.validate(parsed.data);
      if (!authority.valid) {
        rejected.push({
          proposalId: proposal.id,
          code: 'PROPOSAL_AUTHORITY_INSUFFICIENT',
          message: `Requires ${authority.requiredAuthority}.`,
        });
        continue;
      }

      const ruleResult = await this.ruleValidator.validate({ worldId: input.worldId, proposal: parsed.data });
      if (!ruleResult.valid) {
        for (const violation of ruleResult.violations) {
          rejected.push({
            proposalId: proposal.id,
            code: 'PROPOSAL_RULE_VIOLATION',
            message: violation.message,
            ruleId: violation.ruleId,
            ruleType: violation.ruleType,
            hardness: violation.hardness,
          });
        }
        continue;
      }

      if (parsed.data.preconditions.length > 0) {
        const preconditionCheck = await PreconditionEvaluator.evaluatePreconditions(
          input.worldId,
          parsed.data.preconditions
        );
        if (!preconditionCheck.passed) {
          rejected.push({
            proposalId: proposal.id,
            code: 'PROPOSAL_PRECONDITION_FAILED',
            message: preconditionCheck.failedConditions.join('; '),
          });
          continue;
        }
      }

      accepted.push(parsed.data);
    }

    if (rejected.length > 0) {
      return { success: false, accepted: [], rejected };
    }

    // Recorder remains the single owner of world-state precondition and invariant validation.
    const commitResult = await this.recorderCommitter.commit(input.worldId, accepted);
    const errors = commitResult.errors ?? [];
    return {
      success: commitResult.success,
      accepted: commitResult.success ? accepted : [],
      rejected: commitResult.success
        ? []
        : accepted.map((proposal) => ({
            proposalId: proposal.id,
            code: 'PROPOSAL_BATCH_REJECTED' as const,
            message: errors.join('; '),
          })),
      commitResult,
    };
  }

  async commit(input: ProposalPipelineInput): Promise<ProposalPipelineResult> {
    return this.processAndCommit(input);
  }
}

export const proposalPipeline = new ProposalPipeline();
