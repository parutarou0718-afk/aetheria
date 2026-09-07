import { DependencyGraph } from './dependencyGraph';
import { DependencyProposalBuilder } from './dependencyProposalBuilder';
import {
  DependencyTargetRef,
  CausalPropagationContext,
  DependencyPropagationResult,
} from './dependencyTypes';
import { createStateChangeProposal } from '../proposal/proposalFactory';
import { proposalPipeline } from '../proposal/proposalPipeline';
import { QuestRepository } from '../quest/questRepository';
import { QuestService } from '../quest/questService';

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

    const questImpacts = validImpacts.filter((impact) => impact.sourceType === 'QUEST');
    const nonQuestImpacts = validImpacts.filter((impact) => impact.sourceType !== 'QUEST');
    // Non-QUEST semantics stay unchanged. QUEST impacts are grouped and made
    // atomic with their dependency status writes and terminal transition.
    const proposals = await DependencyProposalBuilder.buildImpactProposals(
      worldId,
      nonQuestImpacts,
      epoch
    );
    const nonQuestCommittedInvalidations = nonQuestImpacts.length;
    const questInvalidationProposalIds = new Set<string>();
    const byQuest = new Map<string, typeof questImpacts>();
    for (const impact of questImpacts) byQuest.set(impact.sourceId, [...(byQuest.get(impact.sourceId) ?? []), impact]);
    for (const [questId, impactsForQuest] of byQuest) {
      const quest = await QuestRepository.getQuest(worldId, questId);
      if (!quest) continue;
      if (['COMPLETED', 'FAILED', 'INVALIDATED'].includes(quest.status)) {
        // Legacy terminal quests can retain ACTIVE dependencies from older
        // runtime versions. Clean those in this batch, but never reopen or
        // re-transition the terminal quest.
        proposals.push(...(await QuestService.buildDependencyCleanupProposals({ worldId, quest, epoch })));
        continue;
      }
      const failedIds = new Set(impactsForQuest.map((impact) => impact.dependencyId));
      for (const impact of impactsForQuest) {
        const proposalId = `prop-invalidate-quest-dependency-${impact.dependencyId}-${epoch}`;
        questInvalidationProposalIds.add(proposalId);
        proposals.push(createStateChangeProposal({
          id: proposalId,
          operation: 'UPDATE_DEPENDENCY', entityType: 'DEPENDENCY', entityId: impact.dependencyId,
          payload: { dependencyId: impact.dependencyId, status: 'INVALIDATED', invalidatedAtEpoch: epoch, invalidationReason: impact.reason },
          effectiveEpoch: epoch, preconditions: [], source: { type: 'SYSTEM', id: 'DependencyImpactService' },
          reason: 'Record a failed quest dependency with its terminal transition.',
          causalBasis: [{ type: 'SYSTEM_EVENT', description: 'A committed world change invalidated this quest dependency.' }], authorityLevel: 'SYSTEM',
        }));
      }
      const operation = quest.status === 'AVAILABLE' || impactsForQuest.some((impact) => impact.failurePolicy === 'INVALIDATE_SOURCE') && !impactsForQuest.some((impact) => impact.failurePolicy === 'FAIL_SOURCE')
        ? 'INVALIDATE_QUEST' : 'FAIL_QUEST';
      // ACTIVE quest precedence is deterministic: any FAIL_SOURCE wins;
      // otherwise INVALIDATE_SOURCE wins. AVAILABLE always invalidates.
      proposals.push(createStateChangeProposal({
        id: `prop-${operation.toLowerCase()}-${questId}-${epoch}`, operation, entityType: 'QUEST', entityId: questId,
        payload: { questId, reason: impactsForQuest.map((impact) => impact.reason).join(' ') }, effectiveEpoch: epoch, preconditions: [],
        source: { type: 'SYSTEM', id: 'DependencyImpactService' }, reason: 'Transition a quest after an invalid dependency.',
        causalBasis: [{ type: 'SYSTEM_EVENT', description: 'Quest dependency failure requires a terminal transition.' }], authorityLevel: 'SYSTEM',
      }), ...(await QuestService.buildDependencyCleanupProposals({ worldId, quest, epoch, excludedDependencyIds: [...failedIds] })));
    }

    if (proposals.length === 0) {
      return {
        propagationId: ctx.propagationId,
        evaluatedDependencies: impacts.length,
        invalidatedDependencies: 0,
        affectedSources: Array.from(new Set(validImpacts.map((i) => `${i.sourceType}:${i.sourceId}`))),
        committedProposalCount: 0,
        warnings,
      };
    }

    // Preserve the dependency batch as one system-authorized pipeline request.
    const pipelineResult = await proposalPipeline.processAndCommit({
      worldId,
      proposals: proposals.map((proposal) => createStateChangeProposal({
        ...proposal,
        reason: 'Apply a dependency impact after committed world changes.',
        causalBasis: [{
          type: 'SYSTEM_EVENT',
          id: ctx.propagationId,
          description: 'Dependency propagation was triggered by committed changes.',
        }],
        authorityLevel: 'SYSTEM',
      })),
    });
    const commitRes = pipelineResult.commitResult;

    let nextCommittedCount = commitRes?.committedCount ?? 0;
    if (!commitRes?.success) warnings.push(`Dependency impact batch rejected: ${pipelineResult.rejected.map((rejection) => rejection.code).join(', ') || 'unknown rejection'}.`);

    // Recurse for secondary impacts if proposals produced changedTargets
    if (commitRes?.success && commitRes.changedTargets && commitRes.changedTargets.length > 0) {
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

    const committedQuestInvalidations = commitRes?.success
      ? Array.from(questInvalidationProposalIds).filter((proposalId) => commitRes.appliedProposalIds.includes(proposalId)).length
      : 0;
    return {
      propagationId: ctx.propagationId,
      evaluatedDependencies: impacts.length,
      invalidatedDependencies: nonQuestCommittedInvalidations + committedQuestInvalidations,
      affectedSources: Array.from(new Set(validImpacts.map((i) => `${i.sourceType}:${i.sourceId}`))),
      committedProposalCount: nextCommittedCount,
      warnings,
    };
  }
}
