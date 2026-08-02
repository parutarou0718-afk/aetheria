import { WorldRepository } from '../world/worldRepository';
import { StateChangeProposal } from '../recorder/changeSchemas';
import {
  ObserverType,
  ObservationType,
  EpistemicStatus,
} from './observedHistoryTypes';
import { DependencyTargetType } from '../dependency/dependencyTypes';

export interface ObserveInput {
  worldId: string;
  observerType: ObserverType;
  observerId: string;

  subjectType: DependencyTargetType;
  subjectId: string;

  observationType: ObservationType;
  observedEpoch: number;

  factPaths?: string[];
  epistemicStatus?: EpistemicStatus;

  sourceEventId?: string;
  sourceTransactionId?: string;
}

export class ObservationService {
  static async observeCharacter(input: ObserveInput): Promise<StateChangeProposal[]> {
    const character = await WorldRepository.getCharacter(input.worldId, input.subjectId);
    if (!character) return [];

    const defaultPaths = [
      'name',
      'title',
      'status',
      'presence_state',
      'location_id',
    ];
    const pathsToRecord = input.factPaths && input.factPaths.length > 0 ? input.factPaths : defaultPaths;

    const proposals: StateChangeProposal[] = [];

    for (const path of pathsToRecord) {
      let val: any = undefined;
      switch (path) {
        case 'name':
          val = character.name;
          break;
        case 'title':
          val = character.title;
          break;
        case 'status':
          val = character.status;
          break;
        case 'presence_state':
          val = character.presence_state;
          break;
        case 'location_id':
          val = character.location_id;
          break;
        default:
          val = (character as any)[path];
      }

      if (val !== undefined) {
        proposals.push({
          id: `obs-${input.observerId}-${input.subjectId}-${path}-${input.observedEpoch}-${Math.random().toString(36).substring(2, 7)}`,
          operation: 'CREATE_OBSERVED_HISTORY',
          entityType: 'OBSERVED_HISTORY',
          effectiveEpoch: input.observedEpoch,
          preconditions: [],
          payload: {
            observerType: input.observerType,
            observerId: input.observerId,
            subjectType: 'CHARACTER',
            subjectId: input.subjectId,
            observationType: input.observationType,
            observedEpoch: input.observedEpoch,
            recordedEpoch: input.observedEpoch,
            factPath: path,
            observedValue: val,
            confidence: 1.0,
            sourceEventId: input.sourceEventId || null,
            sourceTransactionId: input.sourceTransactionId || null,
            visibility: 'PRIVATE',
            immutableHistory: true,
            metadata: {
              epistemic_status: input.epistemicStatus || 'CONFIRMED_FACT',
            },
          },
          source: {
            type: 'SYSTEM',
            id: 'ObservationService',
          },
        });
      }
    }

    return proposals;
  }

  static async observeLocation(input: ObserveInput): Promise<StateChangeProposal[]> {
    const location = await WorldRepository.getLocation(input.worldId, input.subjectId);
    if (!location) return [];

    const defaultPaths = ['name', 'status', 'type', 'description'];
    const pathsToRecord = input.factPaths && input.factPaths.length > 0 ? input.factPaths : defaultPaths;

    const proposals: StateChangeProposal[] = [];

    for (const path of pathsToRecord) {
      const val = (location as any)[path];
      if (val !== undefined) {
        proposals.push({
          id: `obs-${input.observerId}-${input.subjectId}-${path}-${input.observedEpoch}-${Math.random().toString(36).substring(2, 7)}`,
          operation: 'CREATE_OBSERVED_HISTORY',
          entityType: 'OBSERVED_HISTORY',
          effectiveEpoch: input.observedEpoch,
          preconditions: [],
          payload: {
            observerType: input.observerType,
            observerId: input.observerId,
            subjectType: 'LOCATION',
            subjectId: input.subjectId,
            observationType: input.observationType,
            observedEpoch: input.observedEpoch,
            recordedEpoch: input.observedEpoch,
            factPath: path,
            observedValue: val,
            confidence: 1.0,
            sourceEventId: input.sourceEventId || null,
            sourceTransactionId: input.sourceTransactionId || null,
            visibility: 'PRIVATE',
            immutableHistory: true,
            metadata: {
              epistemic_status: input.epistemicStatus || 'CONFIRMED_FACT',
            },
          },
          source: {
            type: 'SYSTEM',
            id: 'ObservationService',
          },
        });
      }
    }

    return proposals;
  }

  static async observeOrganization(input: ObserveInput): Promise<StateChangeProposal[]> {
    const org = await WorldRepository.getOrganization(input.worldId, input.subjectId);
    if (!org) return [];

    const defaultPaths = ['name', 'type', 'leader_id', 'headquarters_id'];
    const pathsToRecord = input.factPaths && input.factPaths.length > 0 ? input.factPaths : defaultPaths;

    const proposals: StateChangeProposal[] = [];

    for (const path of pathsToRecord) {
      let val: any = undefined;
      switch (path) {
        case 'leader_id':
          val = org.leader_id;
          break;
        case 'headquarters_id':
          val = org.headquarters_id;
          break;
        default:
          val = (org as any)[path];
      }

      if (val !== undefined) {
        proposals.push({
          id: `obs-${input.observerId}-${input.subjectId}-${path}-${input.observedEpoch}-${Math.random().toString(36).substring(2, 7)}`,
          operation: 'CREATE_OBSERVED_HISTORY',
          entityType: 'OBSERVED_HISTORY',
          effectiveEpoch: input.observedEpoch,
          preconditions: [],
          payload: {
            observerType: input.observerType,
            observerId: input.observerId,
            subjectType: 'ORGANIZATION',
            subjectId: input.subjectId,
            observationType: input.observationType,
            observedEpoch: input.observedEpoch,
            recordedEpoch: input.observedEpoch,
            factPath: path,
            observedValue: val,
            confidence: 1.0,
            sourceEventId: input.sourceEventId || null,
            sourceTransactionId: input.sourceTransactionId || null,
            visibility: 'PRIVATE',
            immutableHistory: true,
            metadata: {
              epistemic_status: input.epistemicStatus || 'CONFIRMED_FACT',
            },
          },
          source: {
            type: 'SYSTEM',
            id: 'ObservationService',
          },
        });
      }
    }

    return proposals;
  }

  static async observeEvent(input: ObserveInput): Promise<StateChangeProposal[]> {
    const event = await WorldRepository.getEvent(input.worldId, input.subjectId);
    if (!event) return [];

    return [
      {
        id: `obs-${input.observerId}-${input.subjectId}-exists-${input.observedEpoch}-${Math.random().toString(36).substring(2, 7)}`,
        operation: 'CREATE_OBSERVED_HISTORY',
        entityType: 'OBSERVED_HISTORY',
        effectiveEpoch: input.observedEpoch,
        preconditions: [],
        payload: {
          observerType: input.observerType,
          observerId: input.observerId,
          subjectType: 'EVENT',
          subjectId: input.subjectId,
          observationType: input.observationType,
          observedEpoch: input.observedEpoch,
          recordedEpoch: input.observedEpoch,
          factPath: 'exists',
          observedValue: true,
          confidence: 1.0,
          sourceEventId: input.subjectId,
          sourceTransactionId: input.sourceTransactionId || null,
          visibility: 'PRIVATE',
          immutableHistory: true,
          metadata: {
            epistemic_status: input.epistemicStatus || 'CONFIRMED_FACT',
          },
        },
        source: {
          type: 'SYSTEM',
          id: 'ObservationService',
        },
      },
    ];
  }
}
