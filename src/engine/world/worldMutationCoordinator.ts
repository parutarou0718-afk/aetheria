import { StateChangeProposal, CommitResult } from '../recorder/changeSchemas';
import { CausalPropagationContext } from '../dependency/dependencyTypes';
import { WorldReactionService } from './worldReactionService';
import { createStateChangeProposal } from '../proposal/proposalFactory';
import { proposalPipeline } from '../proposal/proposalPipeline';

export interface CoordinatedCommitResult {
  commitResult: CommitResult;
  evaluatedDependencies: number;
  invalidatedDependencies: number;
  affectedSources: string[];
  propagationWarnings: string[];
}

export class WorldMutationCoordinator {
  static async commitWithCausalPropagation(
    worldId: string,
    proposals: StateChangeProposal[],
    epoch?: number,
    context?: CausalPropagationContext
  ): Promise<CommitResult> {
    const result = await this.commit(worldId, proposals, epoch, context);
    return result.commitResult;
  }

  static async commit(
    worldId: string,
    proposals: StateChangeProposal[],
    epoch?: number,
    context?: CausalPropagationContext
  ): Promise<CoordinatedCommitResult> {
    const pipelineResult = await proposalPipeline.processAndCommit({
      worldId,
      proposals: proposals.map((proposal) => createStateChangeProposal({
        ...proposal,
        reason: 'Execute approved timeline or scheduler transaction.',
        causalBasis: [{
          type: 'SYSTEM_EVENT',
          id: proposal.entityId || proposal.id,
          description: 'Approved system transaction reached its execution point.',
        }],
        authorityLevel: 'SYSTEM',
      })),
    });
    const commitResult = pipelineResult.commitResult ?? {
      success: false,
      committedCount: 0,
      appliedProposalIds: [],
      proposalResults: [],
      errors: pipelineResult.rejected.map((rejection) => rejection.message),
      eventsGenerated: [],
      epoch: epoch ?? 0,
    };

    let evaluatedDependencies = 0;
    let invalidatedDependencies = 0;
    let affectedSources: string[] = [];
    let propagationWarnings: string[] = [];

    if (commitResult.success && commitResult.changedTargets && commitResult.changedTargets.length > 0) {
      const propRes = await WorldReactionService.processCommittedChanges({ worldId, commitResult, context });

      evaluatedDependencies = propRes.evaluatedDependencies;
      invalidatedDependencies = propRes.invalidatedDependencies;
      affectedSources = propRes.affectedSources;
      propagationWarnings = propRes.warnings;
    }

    return {
      commitResult,
      evaluatedDependencies,
      invalidatedDependencies,
      affectedSources,
      propagationWarnings,
    };
  }
}
