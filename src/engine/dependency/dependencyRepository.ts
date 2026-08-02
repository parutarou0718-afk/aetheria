import { dbManager } from '../persistence/database';
import {
  DependencyEdge,
  DependencySourceType,
  DependencyTargetType,
  DependencyStatus,
} from './dependencyTypes';

export class DependencyRepository {
  private static mapRowToDependency(row: any): DependencyEdge {
    return {
      id: row.id,
      world_id: row.world_id,
      source_type: row.source_type as DependencySourceType,
      source_id: row.source_id,
      dependency_type: row.dependency_type as any,
      target_type: row.target_type as DependencyTargetType,
      target_id: row.target_id,
      expected_condition: row.expected_condition_json
        ? JSON.parse(row.expected_condition_json)
        : row.condition_json
        ? JSON.parse(row.condition_json)
        : { operator: 'EXISTS' },
      status: (row.status || 'ACTIVE') as DependencyStatus,
      failure_policy: row.failure_policy || 'FAIL_SOURCE',
      priority: row.priority || 0,
      created_at_epoch: row.created_at_epoch || 1,
      last_evaluated_epoch: row.last_evaluated_epoch || null,
      invalidated_at_epoch: row.invalidated_at_epoch || null,
      invalidation_reason: row.invalidation_reason || null,
      metadata: row.metadata_json ? JSON.parse(row.metadata_json) : undefined,
    };
  }

  static async saveDependency(
    worldId: string,
    edge: DependencyEdge
  ): Promise<void> {
    const sql = `
      INSERT INTO dependency_edges (
        id, world_id, source_type, source_id, dependency_type,
        target_type, target_id, expected_condition_json, status,
        failure_policy, priority, created_at_epoch, last_evaluated_epoch,
        invalidated_at_epoch, invalidation_reason, metadata_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id)
      DO UPDATE SET
        world_id = excluded.world_id,
        source_type = excluded.source_type,
        source_id = excluded.source_id,
        dependency_type = excluded.dependency_type,
        target_type = excluded.target_type,
        target_id = excluded.target_id,
        expected_condition_json = excluded.expected_condition_json,
        status = excluded.status,
        failure_policy = excluded.failure_policy,
        priority = excluded.priority,
        last_evaluated_epoch = excluded.last_evaluated_epoch,
        invalidated_at_epoch = excluded.invalidated_at_epoch,
        invalidation_reason = excluded.invalidation_reason,
        metadata_json = excluded.metadata_json
    `;

    await dbManager.run(sql, [
      edge.id,
      worldId,
      edge.source_type,
      edge.source_id,
      edge.dependency_type,
      edge.target_type,
      edge.target_id,
      JSON.stringify(edge.expected_condition),
      edge.status,
      edge.failure_policy,
      edge.priority ?? 0,
      edge.created_at_epoch,
      edge.last_evaluated_epoch ?? null,
      edge.invalidated_at_epoch ?? null,
      edge.invalidation_reason ?? null,
      edge.metadata ? JSON.stringify(edge.metadata) : null,
    ]);
  }

  static async getDependency(
    worldId: string,
    dependencyId: string
  ): Promise<DependencyEdge | null> {
    const row = await dbManager.get(
      'SELECT * FROM dependency_edges WHERE world_id = ? AND id = ?',
      [worldId, dependencyId]
    );
    if (!row) return null;
    return this.mapRowToDependency(row);
  }

  static async getDependenciesForSource(
    worldId: string,
    sourceType: DependencySourceType,
    sourceId: string
  ): Promise<DependencyEdge[]> {
    const rows = await dbManager.all(
      `SELECT * FROM dependency_edges 
       WHERE world_id = ? AND source_type = ? AND source_id = ? AND status != 'REMOVED'
       ORDER BY priority DESC`,
      [worldId, sourceType, sourceId]
    );
    return rows.map(this.mapRowToDependency);
  }

  static async getDependenciesForTarget(
    worldId: string,
    targetType: DependencyTargetType,
    targetId: string
  ): Promise<DependencyEdge[]> {
    const rows = await dbManager.all(
      `SELECT * FROM dependency_edges 
       WHERE world_id = ? AND target_type = ? AND target_id = ? AND status != 'REMOVED'
       ORDER BY priority DESC`,
      [worldId, targetType, targetId]
    );
    return rows.map(this.mapRowToDependency);
  }

  static async getActiveDependenciesForTargets(
    worldId: string,
    targets: Array<{ targetType: DependencyTargetType; targetId: string }>
  ): Promise<DependencyEdge[]> {
    if (targets.length === 0) return [];

    const conditions = targets
      .map(() => '(target_type = ? AND target_id = ?)')
      .join(' OR ');

    const params: any[] = [worldId];
    for (const t of targets) {
      params.push(t.targetType, t.targetId);
    }

    const rows = await dbManager.all(
      `SELECT * FROM dependency_edges
       WHERE world_id = ? AND status = 'ACTIVE' AND (${conditions})
       ORDER BY priority DESC`,
      params
    );

    return rows.map(this.mapRowToDependency);
  }

  static async updateDependencyStatus(
    worldId: string,
    dependencyId: string,
    status: DependencyStatus,
    epoch: number,
    reason?: string
  ): Promise<void> {
    await dbManager.run(
      `UPDATE dependency_edges
       SET status = ?,
           last_evaluated_epoch = ?,
           invalidated_at_epoch = CASE WHEN ? = 'INVALIDATED' THEN ? ELSE invalidated_at_epoch END,
           invalidation_reason = CASE WHEN ? IS NOT NULL THEN ? ELSE invalidation_reason END
       WHERE world_id = ? AND id = ?`,
      [status, epoch, status, epoch, reason || null, reason || null, worldId, dependencyId]
    );
  }

  static async removeDependenciesForSource(
    worldId: string,
    sourceType: DependencySourceType,
    sourceId: string
  ): Promise<void> {
    await dbManager.run(
      `UPDATE dependency_edges
       SET status = 'REMOVED'
       WHERE world_id = ? AND source_type = ? AND source_id = ?`,
      [worldId, sourceType, sourceId]
    );
  }
}
