import type { DependencyCondition, DependencyTargetType } from '../dependency/dependencyTypes';

export type QuestStatus = 'AVAILABLE' | 'ACTIVE' | 'COMPLETED' | 'FAILED' | 'INVALIDATED';
export interface QuestObjective { description: string; targetType: DependencyTargetType; targetId: string; expectedCondition: DependencyCondition; }
export interface Quest {
  id: string; world_id: string; title: string; description: string; status: QuestStatus;
  giver_character_id?: string | null; assignee_character_id?: string | null;
  objective: QuestObjective; dependency_ids: string[]; created_at_epoch: number;
  accepted_at_epoch?: number | null; resolved_at_epoch?: number | null; failure_reason?: string | null;
}
