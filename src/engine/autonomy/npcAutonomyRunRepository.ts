// audit-direct-write: allow-file
import { dbManager } from '../persistence/database';
import type { NpcAutonomyRun, NpcAutonomyRunStatus } from './npcAutonomyTypes';

export class NpcAutonomyRunRepository {
  static async claimRun(input: Omit<NpcAutonomyRun, 'id' | 'status' | 'createdAt' | 'updatedAt'>): Promise<NpcAutonomyRun | null> {
    const now = new Date().toISOString(); const run: NpcAutonomyRun = { ...input, id: crypto.randomUUID(), status: 'CLAIMED', createdAt: now, updatedAt: now };
    try { await dbManager.run('INSERT INTO npc_autonomy_runs (id, world_id, npc_id, epoch, trigger_reason, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [run.id, run.worldId, run.npcId, run.epoch, run.triggerReason, run.status, now, now]); return run; } catch { return null; }
  }
  static async updateRun(id: string, status: NpcAutonomyRunStatus, data: Partial<Pick<NpcAutonomyRun, 'intentAction' | 'intentSummary' | 'proposalIds' | 'errorCode'>> = {}): Promise<void> {
    await dbManager.run('UPDATE npc_autonomy_runs SET status = ?, intent_action = COALESCE(?, intent_action), intent_summary = COALESCE(?, intent_summary), proposal_ids_json = COALESCE(?, proposal_ids_json), error_code = COALESCE(?, error_code), updated_at = ? WHERE id = ?', [status, data.intentAction ?? null, data.intentSummary ?? null, data.proposalIds ? JSON.stringify(data.proposalIds) : null, data.errorCode ?? null, new Date().toISOString(), id]);
  }
  static async getRun(worldId: string, npcId: string, epoch: number): Promise<NpcAutonomyRun | null> { const row = await dbManager.get<any>('SELECT * FROM npc_autonomy_runs WHERE world_id = ? AND npc_id = ? AND epoch = ?', [worldId, npcId, epoch]); return row ? this.map(row) : null; }
  static async listRecentRuns(worldId: string, limit: number): Promise<NpcAutonomyRun[]> { return (await dbManager.all<any>('SELECT * FROM npc_autonomy_runs WHERE world_id = ? ORDER BY epoch DESC, created_at DESC LIMIT ?', [worldId, limit])).map(this.map); }
  private static map(row: any): NpcAutonomyRun { return { id: row.id, worldId: row.world_id, npcId: row.npc_id, epoch: row.epoch, triggerReason: row.trigger_reason, status: row.status, intentAction: row.intent_action ?? undefined, intentSummary: row.intent_summary ?? undefined, proposalIds: row.proposal_ids_json ? JSON.parse(row.proposal_ids_json) : undefined, errorCode: row.error_code ?? undefined, createdAt: row.created_at, updatedAt: row.updated_at }; }
}
