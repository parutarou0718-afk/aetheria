import { aiService } from '../ai/aiService';
import type { GameRequestContext } from '../../application/gameRequestContext';
import { parseDmResolutionIntent, type DmResolutionIntent } from './dmResolutionIntent';

export type RepairableProposalRejectionCode = 'PROPOSAL_RULE_VIOLATION' | 'PROPOSAL_PARAMETER_RESOLUTION_FAILED' | 'PROPOSAL_PRECONDITION_FAILED' | 'PROPOSAL_HISTORY_CONFLICT';
export interface ProposalRepairFeedback {
  proposalId: string;
  code: RepairableProposalRejectionCode;
  ruleType?: string;
  hardness?: string;
  failedConditionSummary?: string;
  subjectType?: string;
  subjectId?: string;
  factPath?: string;
  observedEpoch?: number;
}

interface RepairAi { generateJson(context: { userId: string; worldId: string; purpose: 'PROPOSAL_REPAIR' }, system: string, user: string, options?: { timeoutMs?: number }): Promise<unknown>; }
type PipelineRejection = { proposalId: string; code: string; ruleType?: string; hardness?: string; message: string; subjectType?: string; subjectId?: string; factPath?: string; observedEpoch?: number };

const repairable = new Set<RepairableProposalRejectionCode>(['PROPOSAL_RULE_VIOLATION', 'PROPOSAL_PARAMETER_RESOLUTION_FAILED', 'PROPOSAL_PRECONDITION_FAILED', 'PROPOSAL_HISTORY_CONFLICT']);

export class DmRepairService {
  public constructor(private readonly ai: RepairAi = aiService as RepairAi) {}

  public canRepair(rejected: PipelineRejection[]): boolean {
    return rejected.length > 0 && rejected.every((rejection) => repairable.has(rejection.code as RepairableProposalRejectionCode));
  }

  public sanitize(rejected: PipelineRejection[]): ProposalRepairFeedback[] {
    return rejected.filter((rejection): rejection is PipelineRejection & { code: RepairableProposalRejectionCode } => repairable.has(rejection.code as RepairableProposalRejectionCode)).map((rejection) => ({
      proposalId: rejection.proposalId,
      code: rejection.code,
      ruleType: rejection.ruleType,
      hardness: rejection.hardness,
      failedConditionSummary: rejection.code === 'PROPOSAL_HISTORY_CONFLICT'
        ? 'The proposed change would contradict established history.'
        : this.neutralSummary(rejection.message),
      subjectType: rejection.subjectType,
      subjectId: rejection.subjectId,
      factPath: rejection.factPath,
      observedEpoch: rejection.observedEpoch,
    }));
  }

  public async repair(context: GameRequestContext, playerActionText: string, rejected: PipelineRejection[]): Promise<DmResolutionIntent> {
    const feedback = this.sanitize(rejected);
    const prompt = `The previous proposed state resolution was rejected by deterministic world constraints. You may make one corrective proposal. Preserve the player's original intent where legal. Do not change actor identity, authority, rules, confirmed history, permissions, or routes. Do not directly assign numeric HP, MP, or GOLD deltas. If it cannot be achieved legally, return a narration and no state-changing effects. Sanitized feedback: ${JSON.stringify(feedback)}`;
    return parseDmResolutionIntent(await this.ai.generateJson({ userId: context.userId, worldId: context.worldId, purpose: 'PROPOSAL_REPAIR' }, prompt, `Original player action: ${playerActionText}`, { timeoutMs: 60000 }));
  }

  private neutralSummary(message: string): string { return message.replace(/[\r\n]+/g, ' ').slice(0, 240); }
}
