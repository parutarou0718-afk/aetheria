import { dbManager } from '../persistence/database';
import type { WakeSignal } from '../../types';

export interface PersistentWakeSignal {
  id: string;
  worldId: string;
  entityId: string;
  entityType: WakeSignal['entity_type'];
  reason: WakeSignal['reason'];
  signalEpoch: number;
  weight: number;
  status: 'PENDING' | 'CONSUMED';
}

export class WakeSignalRepository {
  static async enqueue(input: Omit<PersistentWakeSignal, 'id' | 'status'>): Promise<void> {
    const now = new Date().toISOString();
    await dbManager.run(
      `INSERT INTO scheduler_wake_signals (id, world_id, entity_id, entity_type, reason, signal_epoch, weight, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?)
       ON CONFLICT(world_id, entity_id) DO UPDATE SET
         entity_type = excluded.entity_type,
         reason = excluded.reason,
         signal_epoch = excluded.signal_epoch,
         weight = excluded.weight,
         status = 'PENDING',
         updated_at = excluded.updated_at`,
      [crypto.randomUUID(), input.worldId, input.entityId, input.entityType, input.reason, input.signalEpoch, input.weight, now, now],
    );
  }

  static async listPendingOrdered(worldId: string): Promise<PersistentWakeSignal[]> {
    const rows = await dbManager.all<any>(
      "SELECT * FROM scheduler_wake_signals WHERE world_id = ? AND status = 'PENDING' ORDER BY weight ASC, signal_epoch ASC, id ASC",
      [worldId],
    );
    return rows.map(this.map);
  }

  static async markConsumed(worldId: string, entityIds: string[]): Promise<void> {
    if (entityIds.length === 0) return;
    const placeholders = entityIds.map(() => '?').join(', ');
    await dbManager.run(
      `UPDATE scheduler_wake_signals SET status = 'CONSUMED', updated_at = ? WHERE world_id = ? AND entity_id IN (${placeholders}) AND status = 'PENDING'`,
      [new Date().toISOString(), worldId, ...entityIds],
    );
  }

  static async countPending(worldId: string): Promise<number> {
    const row = await dbManager.get<{ count: number }>("SELECT COUNT(*) AS count FROM scheduler_wake_signals WHERE world_id = ? AND status = 'PENDING'", [worldId]);
    return row?.count ?? 0;
  }

  private static map(row: any): PersistentWakeSignal {
    return { id: row.id, worldId: row.world_id, entityId: row.entity_id, entityType: row.entity_type, reason: row.reason, signalEpoch: row.signal_epoch, weight: row.weight, status: row.status };
  }
}
