import { dbManager } from '../persistence/database';
import type { Quest, QuestStatus } from './questTypes';

export class QuestRepository {
  static async saveQuest(quest: Quest): Promise<void> {
    await dbManager.run(`INSERT INTO quests (id, world_id, title, description, status, giver_character_id, assignee_character_id, objective_json, dependency_ids_json, created_at_epoch, accepted_at_epoch, resolved_at_epoch, failure_reason) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET status=excluded.status, assignee_character_id=excluded.assignee_character_id, accepted_at_epoch=excluded.accepted_at_epoch, resolved_at_epoch=excluded.resolved_at_epoch, failure_reason=excluded.failure_reason, dependency_ids_json=excluded.dependency_ids_json`, [quest.id, quest.world_id, quest.title, quest.description, quest.status, quest.giver_character_id ?? null, quest.assignee_character_id ?? null, JSON.stringify(quest.objective), JSON.stringify(quest.dependency_ids), quest.created_at_epoch, quest.accepted_at_epoch ?? null, quest.resolved_at_epoch ?? null, quest.failure_reason ?? null]);
  }
  static async getQuest(worldId: string, id: string): Promise<Quest | null> { const row = await dbManager.get<any>('SELECT * FROM quests WHERE world_id = ? AND id = ?', [worldId, id]); return row ? this.map(row) : null; }
  static async listQuests(worldId: string): Promise<Quest[]> { return (await dbManager.all<any>('SELECT * FROM quests WHERE world_id = ?', [worldId])).map(this.map); }
  static async listAvailableByGiver(worldId: string, giverId: string): Promise<Quest[]> { return (await dbManager.all<any>('SELECT * FROM quests WHERE world_id = ? AND giver_character_id = ? AND status = ?', [worldId, giverId, 'AVAILABLE'])).map(this.map); }
  static async listActiveByAssignee(worldId: string, assigneeId: string): Promise<Quest[]> { return (await dbManager.all<any>('SELECT * FROM quests WHERE world_id = ? AND assignee_character_id = ? AND status = ?', [worldId, assigneeId, 'ACTIVE'])).map(this.map); }
  static async listActive(worldId: string): Promise<Quest[]> { return (await dbManager.all<any>('SELECT * FROM quests WHERE world_id = ? AND status = ?', [worldId, 'ACTIVE'])).map(this.map); }
  private static map(row: any): Quest { return { id: row.id, world_id: row.world_id, title: row.title, description: row.description, status: row.status as QuestStatus, giver_character_id: row.giver_character_id, assignee_character_id: row.assignee_character_id, objective: JSON.parse(row.objective_json), dependency_ids: JSON.parse(row.dependency_ids_json || '[]'), created_at_epoch: row.created_at_epoch, accepted_at_epoch: row.accepted_at_epoch, resolved_at_epoch: row.resolved_at_epoch, failure_reason: row.failure_reason }; }
}
