import { dbManager } from '../persistence/database';
import {
  ObservedHistoryRecord,
  ObserverType,
} from './observedHistoryTypes';
import { DependencyTargetType } from '../dependency/dependencyTypes';

export class ObservedHistoryRepository {
  private static mapRowToObservation(row: any): ObservedHistoryRecord {
    return {
      id: row.id,
      world_id: row.world_id,
      observer_type: row.observer_type as ObserverType,
      observer_id: row.observer_id,
      subject_type: row.subject_type as DependencyTargetType,
      subject_id: row.subject_id,
      observation_type: row.observation_type as any,
      observed_epoch: row.observed_epoch,
      recorded_epoch: row.recorded_epoch,
      fact_path: row.fact_path,
      observed_value: row.observed_value_json ? JSON.parse(row.observed_value_json) : null,
      confidence: row.confidence ?? 1.0,
      source_event_id: row.source_event_id,
      source_transaction_id: row.source_transaction_id,
      visibility: row.visibility || 'PRIVATE',
      immutable_history: Boolean(row.immutable_history),
      metadata: row.metadata_json ? JSON.parse(row.metadata_json) : undefined,
    };
  }

  static async saveObservation(
    worldId: string,
    observation: ObservedHistoryRecord
  ): Promise<void> {
    const sql = `
      INSERT INTO observed_history (
        id, world_id, observer_type, observer_id, subject_type, subject_id,
        observation_type, observed_epoch, recorded_epoch, fact_path,
        observed_value_json, confidence, source_event_id, source_transaction_id,
        visibility, immutable_history, metadata_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id)
      DO UPDATE SET
        world_id = excluded.world_id,
        observer_type = excluded.observer_type,
        observer_id = excluded.observer_id,
        subject_type = excluded.subject_type,
        subject_id = excluded.subject_id,
        observation_type = excluded.observation_type,
        observed_epoch = excluded.observed_epoch,
        fact_path = excluded.fact_path,
        observed_value_json = excluded.observed_value_json,
        recorded_epoch = excluded.recorded_epoch,
        confidence = excluded.confidence,
        source_event_id = excluded.source_event_id,
        source_transaction_id = excluded.source_transaction_id,
        visibility = excluded.visibility,
        metadata_json = excluded.metadata_json
    `;

    await dbManager.run(sql, [
      observation.id,
      worldId,
      observation.observer_type,
      observation.observer_id,
      observation.subject_type,
      observation.subject_id,
      observation.observation_type,
      observation.observed_epoch,
      observation.recorded_epoch,
      observation.fact_path,
      JSON.stringify(observation.observed_value),
      observation.confidence,
      observation.source_event_id || null,
      observation.source_transaction_id || null,
      observation.visibility,
      observation.immutable_history ? 1 : 0,
      observation.metadata ? JSON.stringify(observation.metadata) : null,
    ]);
  }

  static async getObservation(
    worldId: string,
    observationId: string
  ): Promise<ObservedHistoryRecord | null> {
    const row = await dbManager.get(
      'SELECT * FROM observed_history WHERE world_id = ? AND id = ?',
      [worldId, observationId]
    );
    if (!row) return null;
    return this.mapRowToObservation(row);
  }

  static async getObservationsForSubject(
    worldId: string,
    subjectType: DependencyTargetType,
    subjectId: string,
    options?: {
      beforeEpoch?: number;
      afterEpoch?: number;
      observerId?: string;
    }
  ): Promise<ObservedHistoryRecord[]> {
    let sql = `SELECT * FROM observed_history WHERE world_id = ? AND subject_type = ? AND subject_id = ?`;
    const params: any[] = [worldId, subjectType, subjectId];

    if (options?.beforeEpoch !== undefined) {
      sql += ` AND observed_epoch <= ?`;
      params.push(options.beforeEpoch);
    }
    if (options?.afterEpoch !== undefined) {
      sql += ` AND observed_epoch >= ?`;
      params.push(options.afterEpoch);
    }
    if (options?.observerId !== undefined) {
      sql += ` AND observer_id = ?`;
      params.push(options.observerId);
    }

    sql += ` ORDER BY observed_epoch ASC`;
    const rows = await dbManager.all(sql, params);
    return rows.map(this.mapRowToObservation);
  }

  static async getObservationsForObserver(
    worldId: string,
    observerType: ObserverType,
    observerId: string
  ): Promise<ObservedHistoryRecord[]> {
    const rows = await dbManager.all(
      `SELECT * FROM observed_history 
       WHERE world_id = ? AND observer_type = ? AND observer_id = ?
       ORDER BY observed_epoch ASC`,
      [worldId, observerType, observerId]
    );
    return rows.map(this.mapRowToObservation);
  }

  static async findConflictingObservations(
    worldId: string,
    subjectType: DependencyTargetType,
    subjectId: string,
    factPath: string,
    proposedEffectiveEpoch: number,
    proposedBeforeValue: unknown
  ): Promise<ObservedHistoryRecord[]> {
    // A conflict occurs if there exists an observation recorded at/after proposedEffectiveEpoch
    // where observed_epoch >= proposedEffectiveEpoch OR observed_epoch <= proposedEffectiveEpoch
    // and the observed_value contradicts the proposed before/after value at that epoch.
    // Specifically: If an observation exists at observed_epoch >= proposedEffectiveEpoch where
    // fact_path matches, but the observation asserts the fact was different at that epoch than what
    // a retroactive change prior to observed_epoch would produce.
    const rows = await dbManager.all(
      `SELECT * FROM observed_history
       WHERE world_id = ? AND subject_type = ? AND subject_id = ? AND fact_path = ?
         AND observed_epoch >= ?`,
      [worldId, subjectType, subjectId, factPath, proposedEffectiveEpoch]
    );

    const records = rows.map(this.mapRowToObservation);

    // Filter to those that conflict
    return records.filter((rec) => {
      // If proposed change has an effectiveEpoch earlier than or equal to observed_epoch,
      // and the observed value contradicts proposed values or asserts fact was ACTIVE when proposal claims DESTROYED earlier.
      return JSON.stringify(rec.observed_value) !== JSON.stringify(proposedBeforeValue);
    });
  }
}
