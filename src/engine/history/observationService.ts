import { WorldRepository } from '../world/worldRepository';
import { createStateChangeProposal } from '../proposal/proposalFactory';
import type { ProposalV2 } from '../proposal/proposalSchema';
import type { DependencyTargetType } from '../dependency/dependencyTypes';
import type { EpistemicStatus, ObserverType, ObservationType } from './observedHistoryTypes';

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

export interface DialogueStatementInput {
  worldId: string;
  observerType: ObserverType;
  observerId: string;
  speakerId: string;
  statement: string;
  observedEpoch: number;
}

/** Creates strict, system-owned observation proposals. It never writes state itself. */
export class ObservationService {
  static createObservationProposal(input: ObserveInput & { factPath: string; observedValue: unknown }): ProposalV2 {
    const sourceEvent = input.sourceEventId
      ? { type: 'EVENT' as const, id: input.sourceEventId, description: 'Witnessed event.' }
      : { type: 'SYSTEM_EVENT' as const, description: 'System recorded an observation.' };
    return createStateChangeProposal({
      id: `obs-${input.observerId}-${input.subjectId}-${input.factPath}-${input.observedEpoch}-${Math.random().toString(36).slice(2, 8)}`,
      operation: 'CREATE_OBSERVED_HISTORY', entityType: 'OBSERVED_HISTORY',
      effectiveEpoch: input.observedEpoch, preconditions: [],
      payload: {
        observerType: input.observerType, observerId: input.observerId,
        subjectType: input.subjectType, subjectId: input.subjectId,
        observationType: input.observationType, observedEpoch: input.observedEpoch,
        recordedEpoch: input.observedEpoch, factPath: input.factPath, observedValue: input.observedValue,
        confidence: 1, sourceEventId: input.sourceEventId ?? null,
        sourceTransactionId: input.sourceTransactionId ?? null, visibility: 'PRIVATE', immutableHistory: true,
        metadata: { epistemic_status: input.epistemicStatus ?? 'CONFIRMED_FACT' },
      },
      source: { type: 'SYSTEM', id: 'ObservationService' },
      reason: 'Record an observer-owned fact without changing canonical world truth.',
      causalBasis: [sourceEvent], authorityLevel: 'SYSTEM',
    });
  }

  static async observeCharacter(input: ObserveInput): Promise<ProposalV2[]> {
    const character = await WorldRepository.getCharacter(input.worldId, input.subjectId);
    if (!character) return [];
    return this.fromObject(input, character, input.factPaths ?? ['name', 'title', 'status', 'presence_state', 'location_id']);
  }

  static async observeLocation(input: ObserveInput): Promise<ProposalV2[]> {
    const location = await WorldRepository.getLocation(input.worldId, input.subjectId);
    if (!location) return [];
    return this.fromObject(input, location, input.factPaths ?? ['name', 'status', 'type', 'description']);
  }

  static async observeOrganization(input: ObserveInput): Promise<ProposalV2[]> {
    const organization = await WorldRepository.getOrganization(input.worldId, input.subjectId);
    if (!organization) return [];
    return this.fromObject(input, organization, input.factPaths ?? ['name', 'type', 'leader_id', 'headquarters_id']);
  }

  static async observeEvent(input: ObserveInput): Promise<ProposalV2[]> {
    const event = await WorldRepository.getEvent(input.worldId, input.subjectId);
    return event ? [this.createObservationProposal({ ...input, factPath: 'exists', observedValue: true, sourceEventId: input.subjectId })] : [];
  }

  static observeDialogueStatement(input: DialogueStatementInput): ProposalV2 {
    return createStateChangeProposal({
      id: `dialogue-${input.observerId}-${input.speakerId}-${input.observedEpoch}-${Math.random().toString(36).slice(2, 8)}`,
      operation: 'CREATE_OBSERVED_HISTORY', entityType: 'OBSERVED_HISTORY', effectiveEpoch: input.observedEpoch,
      preconditions: [], source: { type: 'SYSTEM', id: 'ObservationService' }, authorityLevel: 'SYSTEM',
      reason: 'Record a dialogue statement as an observer claim.',
      causalBasis: [{ type: 'PLAYER_ACTION', description: 'A participant made a dialogue statement.' }],
      payload: {
        observerType: input.observerType, observerId: input.observerId,
        subjectType: 'CHARACTER', subjectId: input.speakerId,
        observationType: 'DIALOGUE_STATEMENT', observedEpoch: input.observedEpoch,
        recordedEpoch: input.observedEpoch, factPath: 'dialogue.statement', observedValue: input.statement,
        confidence: 1, visibility: 'PRIVATE', immutableHistory: true,
        metadata: { epistemic_status: 'CLAIM' },
      },
    });
  }

  private static fromObject(input: ObserveInput, subject: object, paths: string[]): ProposalV2[] {
    return paths.flatMap((factPath) => {
      const observedValue = this.readOwnPath(subject, factPath);
      return observedValue === undefined ? [] : [this.createObservationProposal({ ...input, factPath, observedValue })];
    });
  }

  private static readOwnPath(subject: object, path: string): unknown {
    let current: unknown = subject;
    for (const segment of path.split('.')) {
      if (!current || typeof current !== 'object' || !Object.prototype.hasOwnProperty.call(current, segment)) return undefined;
      current = (current as Record<string, unknown>)[segment];
    }
    return current;
  }
}
