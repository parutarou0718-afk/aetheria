import { createStateChangeProposal } from '../proposal/proposalFactory';
import type { DependencyEdge } from '../dependency/dependencyTypes';
import { QuestSchema } from './questSchemas';
import { QuestRepository } from './questRepository';
import { toQuestPublicView, type QuestPublicView } from './questPublicView';
import type { Quest } from './questTypes';
import { DependencyRepository } from '../dependency/dependencyRepository';

export class QuestService {
  static async getQuest(worldId: string, id: string): Promise<Quest | null> { return QuestRepository.getQuest(worldId, id); }
  static async listAvailableForNpc(worldId: string, npcId: string): Promise<QuestPublicView[]> { return (await QuestRepository.listAvailableByGiver(worldId, npcId)).map(toQuestPublicView); }
  static async listActiveForPlayer(worldId: string, playerId: string): Promise<QuestPublicView[]> { return (await QuestRepository.listActiveByAssignee(worldId, playerId)).map(toQuestPublicView); }
  static buildCreateQuestBatch(quest: Quest, dependencies: DependencyEdge[]) {
    const parsed = QuestSchema.parse(quest);
    if (dependencies.some((edge) => edge.source_type !== 'QUEST' || edge.source_id !== parsed.id) || new Set(dependencies.map((edge) => edge.id)).size !== dependencies.length || JSON.stringify(parsed.dependency_ids.slice().sort()) !== JSON.stringify(dependencies.map((edge) => edge.id).sort())) throw new Error('Quest dependency ids must exactly match one-time QUEST dependency definitions.');
    const base = { effectiveEpoch: parsed.created_at_epoch, preconditions: [], source: { type: 'SYSTEM' as const, id: 'QuestService' }, reason: 'Create an authoritative quest definition.', causalBasis: [{ type: 'SYSTEM_EVENT' as const, description: 'Quest is initialized by an approved system definition.' }], authorityLevel: 'SYSTEM' as const };
    return [createStateChangeProposal({ ...base, id: `prop-create-quest-${parsed.id}`, operation: 'CREATE_QUEST', entityType: 'QUEST', entityId: parsed.id, payload: { quest: parsed } }), ...dependencies.map((dependency) => createStateChangeProposal({ ...base, id: `prop-create-quest-dependency-${dependency.id}`, operation: 'CREATE_DEPENDENCY', entityType: 'DEPENDENCY', entityId: dependency.id, payload: { dependency } }))];
  }
  static buildAcceptQuestProposal(input: { worldId: string; questId: string; actorId: string; epoch: number }) {
    return createStateChangeProposal({ id: `prop-accept-quest-${input.questId}-${input.epoch}`, operation: 'ACCEPT_QUEST', entityType: 'QUEST', entityId: input.questId, actorId: input.actorId, payload: { assigneeCharacterId: input.actorId }, effectiveEpoch: input.epoch, preconditions: [], source: { type: 'PLAYER_ACTION', id: input.actorId }, reason: 'Player accepted the offered quest.', causalBasis: [{ type: 'PLAYER_ACTION', id: input.actorId, description: 'Player accepted the quest offer.' }], authorityLevel: 'ACTOR' });
  }

  static async buildDependencyCleanupProposals(input: { worldId: string; quest: Quest; epoch: number; excludedDependencyIds?: string[] }) {
    const excluded = new Set(input.excludedDependencyIds ?? []);
    const dependencies = await DependencyRepository.getDependenciesForSource(input.worldId, 'QUEST', input.quest.id);
    return dependencies.filter((dependency) => dependency.status === 'ACTIVE' && !excluded.has(dependency.id)).map((dependency) => createStateChangeProposal({
      id: `prop-remove-quest-dependency-${dependency.id}-${input.epoch}`,
      operation: 'UPDATE_DEPENDENCY', entityType: 'DEPENDENCY', entityId: dependency.id,
      payload: { dependencyId: dependency.id, status: 'REMOVED', invalidationReason: `Quest ${input.quest.id} reached a terminal state.` },
      effectiveEpoch: input.epoch, preconditions: [], source: { type: 'SYSTEM', id: 'QuestService' },
      reason: 'Deactivate a dependency belonging to a terminal quest.',
      causalBasis: [{ type: 'SYSTEM_EVENT', description: 'Quest terminal transition deactivates remaining dependencies.' }], authorityLevel: 'SYSTEM',
    }));
  }
}
