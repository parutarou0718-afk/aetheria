import { DependencyTargetType } from '../dependency/dependencyTypes';

export type ObserverType =
  | 'PLAYER'
  | 'CHARACTER'
  | 'PARTY'
  | 'PUBLIC';

export type ObservationType =
  | 'DIRECT_SIGHT'
  | 'DIRECT_INTERACTION'
  | 'DIALOGUE_STATEMENT'
  | 'DOCUMENT'
  | 'EVENT_WITNESS'
  | 'SYSTEM_CONFIRMED'
  | 'PUBLIC_KNOWLEDGE';

export type EpistemicStatus =
  | 'CONFIRMED_FACT'
  | 'CLAIM'
  | 'RUMOR'
  | 'INFERENCE';

export interface ObservedHistoryRecord {
  id: string;
  world_id: string;

  observer_type: ObserverType;
  observer_id: string;

  subject_type: DependencyTargetType;
  subject_id: string;

  observation_type: ObservationType;

  observed_epoch: number;
  recorded_epoch: number;

  fact_path: string;
  observed_value: unknown;

  confidence: number;

  source_event_id?: string | null;
  source_transaction_id?: string | null;

  visibility:
    | 'PRIVATE'
    | 'PARTY'
    | 'PUBLIC';

  immutable_history: boolean;

  metadata?: {
    epistemic_status?: EpistemicStatus;
    corrects_observation_id?: string;
    correction_reason?: string;
    [key: string]: unknown;
  };
}

export interface HistoryConflict {
  observationId: string;

  subjectType: DependencyTargetType;
  subjectId: string;

  factPath: string;

  observedEpoch: number;
  observedValue: unknown;

  proposedEffectiveEpoch: number;
  proposedBeforeValue: unknown;
  proposedAfterValue: unknown;

  reason: string;
}

export interface StateFieldDiff {
  entityType: string;
  entityId: string;

  fieldPath: string;

  beforeValue: unknown;
  afterValue: unknown;

  effectiveEpoch: number;
  proposalId: string;
}
