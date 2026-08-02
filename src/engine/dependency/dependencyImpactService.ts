import { DependencyGraph } from './dependencyGraph';
import { DependencyProposalBuilder } from './dependencyProposalBuilder';
import {
  DependencyTargetRef,
  CausalPropagationContext,
  DependencyPropagationResult,
} from './dependencyTypes';
import { recorder } from '../recorder/recorder';

export const MAX_PROPAGATION_DEPTH = 8;

export class DependencyImpactService {
  static async processCommittedChanges(input: {
    worldId: string;
    epoch: number;
    changedTargets: DependencyTargetRef[];
    context?: CausalPropagationContext;
  }): Promise<DependencyPropagationResult> {
    const { worldId, epoch, changedTargets } = input;

    const ctx: CausalPropagationContext = input.context || {
      propagationId: `prop-ctx-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      depth: 0,
      visitedSources: [],
      visitedDependencies: [],
    };

    const warnings: string[] = [];

    if (ctx.depth >= MAX_PROPAGATION_DEPTH) {
      warnings.push(`Causal propagation reached maximum depth (${MAX_PROPAGATION_DEPTH}). Stopping recursion.`);
      return {
        propagationId: ctx.propagationId,
        evaluatedDependencies: 0,
        invalidatedDependencies: 0,
        affectedSources: [],
        committedProposalCount: 0,
        warnings,
      };
    }

    if (changedTargets.length === 0) {
      return {
        propagationId: ctx.propagationId,
        evaluatedDependencies: 0,
        invalidatedDependencies: 0,
        affectedSources: [],
        committedProposalCount: 0,
        warnings,
      };
    }

    // Evaluate target dependencies
    const impacts = await DependencyGraph.evaluateTargets(worldId, changedTargets, epoch);

    if (impacts.length === 0) {
      return {
        propagationId: ctx.propagationId,
        evaluatedDependencies: 0,
        invalidatedDependencies: 0,
        affectedSources: [],
        committedProposalCount: 0,
        warnings,
      };
    }

    // Filter out already visited sources to prevent infinite cycles
    const validImpacts = impacts.filter((imp) => {
      const srcKey = `${imp.sourceType}:${imp.sourceId}:${imp.dependencyId}`;
      if (ctx.visitedDependencies.includes(imp.dependencyId) || ctx.visitedSources.includes(srcKey)) {
        warnings.push(`Cycle detected for dependency [${imp.dependencyId}] or source [${imp.sourceType}:${imp.sourceId}]. Skipping.`);
        return false;
      }
      ctx.visitedDependencies.push(imp.dependencyId);
      ctx.visitedSources.push(srcKey);
      return true;
    });

    if (validImpacts.length === 0) {
      return {
        propagationId: ctx.propagationId,
        evaluatedDependencies: impacts.length,
        invalidatedDependencies: 0,
        affectedSources: [],
        committedProposalCount: 0,
        warnings,
      };
    }

    // Build proposals from impacts
    const proposals = await DependencyProposalBuilder.buildImpactProposals(
      worldId,
      validImpacts,
      epoch
    );

    if (proposals.length === 0) {
      return {
        propagationId: ctx.propagationId,
        evaluatedDependencies: impacts.length,
        invalidatedDependencies: validImpacts.length,
        affectedSources: Array.from(new Set(validImpacts.map((i) => `${i.sourceType}:${i.sourceId}`))),
        committedProposalCount: 0,
        warnings,
      };
    }

    // Commit proposals via Recorder
    const commitRes = await recorder.commit(worldId, proposals);

    let nextCommittedCount = commitRes.committedCount;

    // Recurse for secondary impacts if proposals produced changedTargets
    if (commitRes.success && commitRes.changedTargets && commitRes.changedTargets.length > 0) {
      const nextCtx: CausalPropagationContext = {
        ...ctx,
        depth: ctx.depth + 1,
      };

      const secondaryRes = await this.processCommittedChanges({
        worldId,
        epoch,
        changedTargets: commitRes.changedTargets as DependencyTargetRef[],
        context: nextCtx,
      });

      nextCommittedCount += secondaryRes.committedProposalCount;
      warnings.push(...secondaryRes.warnings);
    }

    return {
      propagationId: ctx.propagationId,
      evaluatedDependencies: impacts.length,
      invalidatedDependencies: validImpacts.length,
      affectedSources: Array.from(new Set(validImpacts.map((i) => `${i.sourceType}:${i.sourceId}`))),
      committedProposalCount: nextCommittedCount,
      warnings,
    };
  }
}
