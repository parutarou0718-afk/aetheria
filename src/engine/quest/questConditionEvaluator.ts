import { DependencyEvaluator } from '../dependency/dependencyEvaluator';
import type { Quest } from './questTypes';

/** Resolves the one MVP objective exclusively against authoritative repositories. */
export class QuestConditionEvaluator {
  static async evaluate(input: { worldId: string; quest: Quest }): Promise<boolean> {
    if (input.quest.objective.targetType === 'EVENT') return false;
    const result = await DependencyEvaluator.evaluate(input.worldId, {
      id: `quest-objective:${input.quest.id}`,
      world_id: input.worldId,
      source_type: 'QUEST',
      source_id: input.quest.id,
      dependency_type: 'CUSTOM_CONDITION',
      target_type: input.quest.objective.targetType,
      target_id: input.quest.objective.targetId,
      expected_condition: input.quest.objective.expectedCondition,
      status: 'ACTIVE',
      failure_policy: 'IGNORE',
      created_at_epoch: input.quest.created_at_epoch,
    });
    return result.valid;
  }
}
