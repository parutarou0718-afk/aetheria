import { ObservedHistoryRepository } from './observedHistoryRepository';
import type { HistoryConflict, StateFieldDiff } from './observedHistoryTypes';

export class HistoryConflictDetector {
  static async detectConflicts(
    worldId: string,
    diffs: StateFieldDiff[],
  ): Promise<HistoryConflict[]> {
    const conflicts: HistoryConflict[] = [];

    for (const diff of diffs) {
      const observations = await ObservedHistoryRepository.getObservationsForSubject(worldId, diff.entityType as any, diff.entityId);
      for (const obs of observations) {
        if (!obs.immutable_history || obs.metadata?.epistemic_status !== 'CONFIRMED_FACT'
          || obs.fact_path !== diff.fieldPath || diff.effectiveEpoch >= obs.observed_epoch
          || JSON.stringify(diff.afterValue) === JSON.stringify(obs.observed_value)) continue;
        conflicts.push({
          proposalId: diff.proposalId,
          observationId: obs.id, subjectType: obs.subject_type, subjectId: obs.subject_id,
          factPath: obs.fact_path, observedEpoch: obs.observed_epoch, observedValue: obs.observed_value,
          proposedEffectiveEpoch: diff.effectiveEpoch, proposedBeforeValue: diff.beforeValue,
          proposedAfterValue: diff.afterValue,
          reason: `Proposal ${diff.proposalId} retroactively contradicts confirmed observation ${obs.id}.`,
        });
      }
    }

    return conflicts;
  }
}
