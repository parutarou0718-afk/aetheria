import { createStateChangeProposal } from '../proposal/proposalFactory';
import { proposalPipeline, type ProposalPipelineResult } from '../proposal/proposalPipeline';
import { QuestRepository } from './questRepository';
import { QuestService } from './questService';
import { QuestConditionEvaluator } from './questConditionEvaluator';

/** Post-commit, read-only objective evaluation. Quest state changes still go through the Pipeline. */
export class QuestProgressService {
  static async processCommittedChanges(input: { worldId: string; epoch: number; changedTargets: unknown[] }): Promise<ProposalPipelineResult | null> {
    if (input.changedTargets.length === 0) return null;
    const active = await QuestRepository.listActive(input.worldId);
    const proposals = [];
    for (const quest of active) {
      if (await QuestConditionEvaluator.evaluate({ worldId: input.worldId, quest })) {
        proposals.push(createStateChangeProposal({
          id: `prop-complete-quest-${quest.id}-${input.epoch}`,
          operation: 'COMPLETE_QUEST', entityType: 'QUEST', entityId: quest.id, payload: {},
          effectiveEpoch: input.epoch, source: { type: 'SYSTEM', id: 'QuestProgressService' },
          reason: 'The quest objective is satisfied by authoritative world state.',
          causalBasis: [{ type: 'SYSTEM_EVENT', description: 'Committed world changes satisfied the active quest objective.' }],
          authorityLevel: 'SYSTEM',
        }), ...(await QuestService.buildDependencyCleanupProposals({ worldId: input.worldId, quest, epoch: input.epoch })));
      }
    }
    return proposals.length ? proposalPipeline.processAndCommit({ worldId: input.worldId, proposals }) : null;
  }
}
