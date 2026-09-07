import type { Quest, QuestStatus } from './questTypes';
export interface QuestPublicView { id: string; title: string; description: string; status: QuestStatus; giverCharacterId?: string; objectiveDescription: string; }
export function toQuestPublicView(quest: Quest): QuestPublicView {
  return { id: quest.id, title: quest.title, description: quest.description, status: quest.status, ...(quest.giver_character_id ? { giverCharacterId: quest.giver_character_id } : {}), objectiveDescription: quest.objective.description };
}
