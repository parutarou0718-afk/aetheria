import { ObservedHistoryRepository } from './observedHistoryRepository';
import { StateChangeProposal } from '../recorder/changeSchemas';
import { HistoryConflict } from './observedHistoryTypes';
import { DependencyTargetType } from '../dependency/dependencyTypes';

export class HistoryConflictDetector {
  static async detectConflicts(
    worldId: string,
    proposal: StateChangeProposal,
    beforeState?: Record<string, any>,
    afterState?: Record<string, any>
  ): Promise<HistoryConflict[]> {
    const conflicts: HistoryConflict[] = [];

    // Map proposal entityType to DependencyTargetType
    let subjectType: DependencyTargetType | null = null;
    switch (proposal.entityType) {
      case 'CHARACTER':
        subjectType = 'CHARACTER';
        break;
      case 'LOCATION':
        subjectType = 'LOCATION';
        break;
      case 'ORGANIZATION':
        subjectType = 'ORGANIZATION';
        break;
      case 'LOCATION_EDGE':
        subjectType = 'LOCATION_EDGE';
        break;
      case 'WORLD_FACT':
        subjectType = 'WORLD_FACT';
        break;
      case 'HIDDEN_TRUTH':
        subjectType = 'HIDDEN_TRUTH';
        break;
      case 'SEED':
        subjectType = 'SEED';
        break;
      case 'TRANSACTION':
      case 'WORLD_TRANSACTION':
        subjectType = 'TRANSACTION';
        break;
      default:
        subjectType = null;
    }

    const subjectId = proposal.entityId || proposal.payload?.entityId || proposal.payload?.characterId || proposal.payload?.locationId;
    if (!subjectType || !subjectId) {
      return conflicts;
    }

    // Fetch existing observed history for this subject
    const observations = await ObservedHistoryRepository.getObservationsForSubject(
      worldId,
      subjectType,
      subjectId
    );

    if (observations.length === 0) {
      return conflicts;
    }

    // Check each field changed in proposal payload
    for (const [key, value] of Object.entries(proposal.payload || {})) {
      if (key === 'id' || key === 'worldId' || key === 'entityId') continue;

      const matchingObserved = observations.filter((obs) => obs.fact_path === key);

      for (const obs of matchingObserved) {
        // Forbidden rule: Effective epoch of proposal is strictly earlier than observed_epoch,
        // and claims the before value at that past time was different from what was observed or contradicts observation.
        if (proposal.effectiveEpoch < obs.observed_epoch) {
          const beforeVal = beforeState ? beforeState[key] : undefined;
          if (
            beforeVal !== undefined &&
            JSON.stringify(beforeVal) !== JSON.stringify(obs.observed_value)
          ) {
            conflicts.push({
              observationId: obs.id,
              subjectType: obs.subject_type,
              subjectId: obs.subject_id,
              factPath: obs.fact_path,
              observedEpoch: obs.observed_epoch,
              observedValue: obs.observed_value,
              proposedEffectiveEpoch: proposal.effectiveEpoch,
              proposedBeforeValue: beforeVal,
              proposedAfterValue: value,
              reason: `Retroactive proposal at epoch ${proposal.effectiveEpoch} contradicts observed history record [${obs.id}] recorded at epoch ${obs.observed_epoch} for field [${key}]`,
            });
          }
        }
      }
    }

    return conflicts;
  }
}
