import { DependencyRepository } from './dependencyRepository';
import { DependencyEvaluator } from './dependencyEvaluator';
import {
  DependencyEdge,
  DependencySourceType,
  DependencyTargetRef,
  DependencyEvaluationResult,
  DependencyImpact,
} from './dependencyTypes';

export class DependencyGraph {
  static async register(
    worldId: string,
    edge: DependencyEdge
  ): Promise<void> {
    await DependencyRepository.saveDependency(worldId, edge);
  }

  static async evaluateSource(
    worldId: string,
    sourceType: DependencySourceType,
    sourceId: string,
    epoch: number
  ): Promise<DependencyEvaluationResult[]> {
    const edges = await DependencyRepository.getDependenciesForSource(
      worldId,
      sourceType,
      sourceId
    );

    const results: DependencyEvaluationResult[] = [];
    for (const edge of edges) {
      if (edge.status !== 'ACTIVE') continue;

      const res = await DependencyEvaluator.evaluate(worldId, edge);
      results.push(res);

      if (!res.valid) {
        await DependencyRepository.updateDependencyStatus(
          worldId,
          edge.id,
          'INVALIDATED',
          epoch,
          res.reason
        );
      } else {
        await DependencyRepository.updateDependencyStatus(
          worldId,
          edge.id,
          'SATISFIED',
          epoch
        );
      }
    }

    return results;
  }

  static async evaluateTargets(
    worldId: string,
    changedTargets: DependencyTargetRef[],
    epoch: number
  ): Promise<DependencyImpact[]> {
    if (changedTargets.length === 0) return [];

    const activeEdges = await DependencyRepository.getActiveDependenciesForTargets(
      worldId,
      changedTargets
    );

    const impacts: DependencyImpact[] = [];

    for (const edge of activeEdges) {
      const evalRes = await DependencyEvaluator.evaluate(worldId, edge);

      if (!evalRes.valid) {
        await DependencyRepository.updateDependencyStatus(
          worldId,
          edge.id,
          'INVALIDATED',
          epoch,
          evalRes.reason
        );

        impacts.push({
          dependencyId: edge.id,
          sourceType: edge.source_type,
          sourceId: edge.source_id,
          targetType: edge.target_type,
          targetId: edge.target_id,
          failurePolicy: edge.failure_policy,
          reason: evalRes.reason || `Dependency ${edge.id} invalidated on target change`,
          evaluation: evalRes,
        });
      }
    }

    return impacts;
  }

  static async removeSource(
    worldId: string,
    sourceType: DependencySourceType,
    sourceId: string
  ): Promise<void> {
    await DependencyRepository.removeDependenciesForSource(
      worldId,
      sourceType,
      sourceId
    );
  }
}
