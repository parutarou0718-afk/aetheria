import type { CommitResult } from '../recorder/changeSchemas';
import { DependencyImpactService } from '../dependency/dependencyImpactService';
import { QuestProgressService } from '../quest/questProgressService';
import type { DependencyTargetRef, CausalPropagationContext } from '../dependency/dependencyTypes';

/** Ordered best-effort reactions after an authoritative commit; never rolls it back. */
export class WorldReactionService {
  static async processCommittedChanges(input: { worldId: string; commitResult: CommitResult; context?: CausalPropagationContext }): Promise<{ warnings: string[]; evaluatedDependencies: number; invalidatedDependencies: number; affectedSources: string[] }> {
    const warnings: string[] = [];
    let evaluatedDependencies = 0;
    let invalidatedDependencies = 0;
    let affectedSources: string[] = [];
    const changedTargets = input.commitResult.changedTargets ?? [];
    if (!input.commitResult.success || changedTargets.length === 0) return { warnings, evaluatedDependencies, invalidatedDependencies, affectedSources };
    try {
      const dependency = await DependencyImpactService.processCommittedChanges({ worldId: input.worldId, epoch: input.commitResult.epoch, changedTargets: changedTargets as DependencyTargetRef[], context: input.context });
      evaluatedDependencies = dependency.evaluatedDependencies;
      invalidatedDependencies = dependency.invalidatedDependencies;
      affectedSources = dependency.affectedSources;
      warnings.push(...dependency.warnings);
    } catch (error) {
      warnings.push(`Dependency reaction failed: ${error instanceof Error ? error.message : String(error)}`);
    }
    try {
      await QuestProgressService.processCommittedChanges({ worldId: input.worldId, epoch: input.commitResult.epoch, changedTargets });
    } catch (error) {
      warnings.push(`Quest progress reaction failed: ${error instanceof Error ? error.message : String(error)}`);
    }
    return { warnings, evaluatedDependencies, invalidatedDependencies, affectedSources };
  }
}
