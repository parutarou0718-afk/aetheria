import { recorder } from '../recorder/recorder';
import { StateChangeProposal, CommitResult } from '../recorder/changeSchemas';
import { DependencyImpactService } from '../dependency/dependencyImpactService';
import { DependencyTargetRef, CausalPropagationContext } from '../dependency/dependencyTypes';

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
    const commitResult = await recorder.commit(worldId, proposals);

    let evaluatedDependencies = 0;
    let invalidatedDependencies = 0;
    let affectedSources: string[] = [];
    let propagationWarnings: string[] = [];

    if (commitResult.success && commitResult.changedTargets && commitResult.changedTargets.length > 0) {
      const propRes = await DependencyImpactService.processCommittedChanges({
        worldId,
        epoch: commitResult.epoch,
        changedTargets: commitResult.changedTargets as DependencyTargetRef[],
        context,
      });

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
