import type { CommitResult } from '../recorder/changeSchemas';
import { recorder } from '../recorder/recorder';
import { PreconditionEvaluator } from '../recorder/validators';
import { AuthorityValidator } from '../constraints/authority/authorityValidator';
import { DefaultWorldRuleRepository } from '../constraints/rules/worldRuleRepository';
import { WorldRepositoryRuleStateReader } from '../constraints/rules/worldRepositoryRuleStateReader';
import { WorldRuleValidator } from '../constraints/rules/worldRuleValidator';
import type { WorldRuleViolation } from '../constraints/rules/worldRuleTypes';
import { CausalBasisValidator } from '../constraints/causality/causalBasisValidator';
import { WorldRepositoryCausalBasisStateReader } from '../constraints/causality/causalBasisStateReader';
import type { CausalBasisViolation } from '../constraints/causality/causalBasisTypes';
import { ParameterResolver } from '../constraints/parameters/parameterResolver';
import { ObservedHistoryValidator } from '../history/observedHistoryValidator';
import type { HistoryConflict } from '../history/observedHistoryTypes';
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
    | 'PROPOSAL_CAUSAL_BASIS_INVALID'
    | 'PROPOSAL_PARAMETER_RESOLUTION_FAILED'
    | 'PROPOSAL_RULE_VIOLATION'
    | 'PROPOSAL_HISTORY_CONFLICT'
    | 'PROPOSAL_PRECONDITION_FAILED'
    | 'PROPOSAL_BATCH_REJECTED';
  message: string;
  ruleId?: string;
  ruleType?: WorldRuleViolation['ruleType'];
  hardness?: WorldRuleViolation['hardness'];
  basisType?: string;
  basisId?: string;
  reason?: CausalBasisViolation['reason'];
  observationId?: string;
  subjectType?: string;
  subjectId?: string;
  factPath?: string;
  observedEpoch?: number;
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
export interface CausalValidator { validate(input: { worldId: string; proposal: ProposalV2 }): Promise<{ valid: boolean; violations: CausalBasisViolation[] }>; }
export interface HistoryValidator { validate(input: { worldId: string; proposal: ProposalV2 }): Promise<{ valid: boolean; conflicts: HistoryConflict[] }>; }

const defaultRuleValidator = new WorldRuleValidator(
  new DefaultWorldRuleRepository(),
  new WorldRepositoryRuleStateReader(),
);
const defaultCausalValidator = new CausalBasisValidator(new WorldRepositoryCausalBasisStateReader());

export class ProposalPipeline {
  constructor(
    private readonly recorderCommitter: RecorderCommitter = recorder,
    private readonly ruleValidator: RuleValidator = defaultRuleValidator,
    private readonly causalValidator: CausalValidator = defaultCausalValidator,
    private readonly parameterResolver = new ParameterResolver(),
    private readonly historyValidator: HistoryValidator = new ObservedHistoryValidator(),
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

      const causalResult = await this.causalValidator.validate({ worldId: input.worldId, proposal: parsed.data });
      if (!causalResult.valid) {
        for (const violation of causalResult.violations) rejected.push({ proposalId: proposal.id, code: 'PROPOSAL_CAUSAL_BASIS_INVALID', message: violation.message, basisType: violation.basisType, basisId: violation.basisId, reason: violation.reason });
        continue;
      }

      const resolution = this.parameterResolver.resolve(parsed.data);
      if (resolution.success === false) {
        rejected.push({ proposalId: proposal.id, code: 'PROPOSAL_PARAMETER_RESOLUTION_FAILED', message: resolution.rejection.message });
        continue;
      }
      const resolvedProposal = resolution.proposal;

      const ruleResult = await this.ruleValidator.validate({ worldId: input.worldId, proposal: resolvedProposal });
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

      if (resolvedProposal.preconditions.length > 0) {
        const preconditionCheck = await PreconditionEvaluator.evaluatePreconditions(
          input.worldId,
          resolvedProposal.preconditions
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

      const historyResult = await this.historyValidator.validate({ worldId: input.worldId, proposal: resolvedProposal });
      if (!historyResult.valid) {
        for (const conflict of historyResult.conflicts) {
          rejected.push({
            proposalId: proposal.id,
            code: 'PROPOSAL_HISTORY_CONFLICT',
            message: conflict.reason,
            observationId: conflict.observationId,
            subjectType: conflict.subjectType,
            subjectId: conflict.subjectId,
            factPath: conflict.factPath,
            observedEpoch: conflict.observedEpoch,
          });
        }
        continue;
      }

      accepted.push(resolvedProposal);
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
