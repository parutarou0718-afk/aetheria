import { z } from 'zod';
import { Event } from '../../types';

export const StateChangeOperationEnum = z.enum([
  'CREATE_CHARACTER',
  'UPDATE_CHARACTER',
  'UPDATE_CHARACTER_ATTRIBUTES',
  'MOVE_CHARACTER',
  'CHANGE_RESOURCE',
  'CHANGE_RELATIONSHIP',
  'UPDATE_CHARACTER_KNOWLEDGE',
  'UPDATE_CHARACTER_MEMORY',
  'SET_CHARACTER_ACTION',
  'CREATE_LOCATION',
  'UPDATE_LOCATION',
  'CONNECT_LOCATIONS',
  'UPDATE_ORGANIZATION',
  'CREATE_SEED',
  'UPDATE_SEED',
  'SET_ENTITY_SIMULATION_STATE',
  'ADVANCE_WORLD_EPOCH',
  'CREATE_EVENT',
  'COLLECT_EVIDENCE',
  'REVEAL_TRUTH',
  'CREATE_ENTITY',
  'UPDATE_TRANSACTION',
  'CREATE_TRANSACTION',
  'ADD_FACT',
  'CREATE_WORLD_TRANSACTION',
  'UPDATE_WORLD_TRANSACTION',
  'CREATE_SCHEDULED_CHECKPOINT',
  'UPDATE_SCHEDULED_CHECKPOINT',
  'SET_CHARACTER_PRESENCE',
  'COMPLETE_TRANSACTION',
  'FAIL_TRANSACTION',
  'CANCEL_TRANSACTION',
  'CREATE_DEPENDENCY',
  'UPDATE_DEPENDENCY',
  'REMOVE_DEPENDENCY',
  'CREATE_OBSERVED_HISTORY',
  'UPDATE_SEED_DEPENDENCIES',
  'UPDATE_PROJECT_DEPENDENCIES',
  'REGISTER_WAKE_SIGNAL',
  'INVALIDATE_TRANSACTION',
  'PAUSE_TRANSACTION',
  'APPLY_SEMANTIC_EFFECT',
  'CREATE_QUEST',
  'ACCEPT_QUEST',
  'COMPLETE_QUEST',
  'FAIL_QUEST',
  'INVALIDATE_QUEST',
]);

export type StateChangeOperation = z.infer<typeof StateChangeOperationEnum>;

export const WorldConditionSchema = z.object({
  subjectType: z.enum(['CHARACTER', 'LOCATION', 'ORGANIZATION', 'SEED', 'TRANSACTION', 'FACT', 'TRUTH']),
  subjectId: z.string(),
  field: z.string(),
  operator: z.enum(['EQ', 'NEQ', 'GT', 'GTE', 'LT', 'LTE', 'IN', 'EXISTS']),
  value: z.any(),
});

export type WorldCondition = z.infer<typeof WorldConditionSchema>;

// Payload schemas for operations
export const UpdateCharacterAttributesPayloadSchema = z.object({
  characterId: z.string().optional(),
  hpDelta: z.number().optional(),
  mpDelta: z.number().optional(),
  setHp: z.number().optional(),
  setMp: z.number().optional(),
});

export const ChangeRelationshipPayloadSchema = z.object({
  sourceCharacterId: z.string(),
  targetCharacterId: z.string(),
  trustDelta: z.number().optional(),
  fearDelta: z.number().optional(),
  favorDelta: z.number().optional(),
  relationshipType: z.string().optional(),
});

export const ConnectLocationsPayloadSchema = z.object({
  locationIdA: z.string(),
  locationIdB: z.string(),
});

export const AdvanceWorldEpochPayloadSchema = z.object({
  advanceBy: z.number().int().min(1).optional().default(1),
});

export const SetEntitySimulationStatePayloadSchema = z.object({
  entityType: z.enum(['CHARACTER', 'LOCATION', 'ORGANIZATION']),
  entityId: z.string(),
  frozen: z.boolean().optional(),
  simulationLevel: z.number().optional(),
  lastSimulatedEpoch: z.number().optional(),
});

export const UpdateCharacterKnowledgePayloadSchema = z.object({
  characterId: z.string(),
  knownFact: z.string().optional(),
  knownCharacter: z.string().optional(),
  knownLocation: z.string().optional(),
});

export const UpdateCharacterMemoryPayloadSchema = z.object({
  characterId: z.string(),
  memoryItem: z.object({
    text: z.string(),
    importance: z.number().optional().default(1),
    epoch: z.number().optional(),
  }),
});

export const AuthorityLevelSchema = z.enum([
  'NARRATIVE',
  'ACTOR',
  'SYSTEM',
  'AUTHOR',
  'ADMIN',
]);

export const CausalBasisSchema = z.object({
  type: z.enum(['FACT', 'EVENT', 'ENTITY_STATE', 'RULE', 'PLAYER_ACTION', 'SYSTEM_EVENT']),
  id: z.string().optional(),
  description: z.string().optional(),
  entityType: z.string().optional(),
});

export const SemanticEffectSchema = z.object({
  type: z.string(),
  magnitude: z.string().optional(),
  target: z.string().optional(),
  resource: z.string().optional(),
  targetEntityId: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const StateChangeProposalSchema = z.object({
  id: z.string(),
  operation: StateChangeOperationEnum,
  entityType: z.string(),
  entityId: z.string().optional(),
  // Provenance only: the actor that initiated an action is distinct from the
  // entity the proposal mutates. Recorder must never treat this as a target.
  actorId: z.string().optional(),
  payload: z.record(z.string(), z.any()),
  effectiveEpoch: z.number().int().min(1),
  preconditions: z.array(WorldConditionSchema).optional().default([]),
  source: z.object({
    type: z.enum(['PLAYER_ACTION', 'DM_ACTION', 'LLM', 'SCHEDULER', 'SIMULATION', 'SYSTEM', 'WORLD_BOOTSTRAP', 'TIMELINE']),
    id: z.string().optional(),
  }),
  // Legacy producers may omit v2 metadata while they are migrated. The
  // ProposalPipeline applies the strict v2 contract before Recorder receives
  // ordinary runtime proposals.
  reason: z.string().min(1).optional(),
  causalBasis: z.array(CausalBasisSchema).min(1).optional(),
  authorityLevel: AuthorityLevelSchema.optional(),
  semanticEffect: SemanticEffectSchema.optional(),
  confidence: z.number().min(0).max(1).optional(),
});

export type StateChangeProposal = z.infer<typeof StateChangeProposalSchema>;

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  proposals: StateChangeProposal[];
}

export interface ProposalExecutionResult {
  proposalId: string;
  operation: StateChangeOperation;
  status: 'APPLIED' | 'REJECTED';
  errorCode?: string;
  errorMessage?: string;
}

export interface CommitResult {
  success: boolean;
  committedCount: number;
  appliedProposalIds: string[];
  proposalResults: ProposalExecutionResult[];
  errors: string[];
  warnings?: string[];
  eventsGenerated: Event[];
  epoch: number;
  cacheRecovered?: boolean;
  cacheOutOfSync?: boolean;
  changedTargets?: Array<{
    targetType: string;
    targetId: string;
    changedFieldPaths: string[];
  }>;
}
