import type { WorldRule } from './worldRuleTypes';

const DEFAULT_RULES: Array<Omit<WorldRule, 'worldId'>> = [
  { id: 'builtin/entity-must-exist', type: 'ENTITY_MUST_EXIST', hardness: 'HARD', enabled: true },
  { id: 'builtin/dead-character-cannot-act', type: 'DEAD_CHARACTER_CANNOT_ACT', hardness: 'HARD', enabled: true },
  { id: 'builtin/resource-non-negative', type: 'RESOURCE_NON_NEGATIVE', hardness: 'HARD', enabled: true },
  { id: 'builtin/travel-requires-route', type: 'TRAVEL_REQUIRES_ROUTE', hardness: 'HARD', enabled: true },
  {
    id: 'builtin/immutable-fact-protected',
    type: 'IMMUTABLE_FACT_PROTECTED',
    hardness: 'HARD',
    enabled: true,
    metadata: { protectedModel: 'HiddenTruth.never_changes' },
  },
  { id: 'builtin/location-access-valid', type: 'LOCATION_ACCESS_VALID', hardness: 'HARD', enabled: true },
  { id: 'builtin/history-immutable', type: 'HISTORY_IMMUTABLE', hardness: 'HARD', enabled: true, metadata: { delegatedToRecorder: true } },
];

export function createDefaultWorldRules(worldId: string): WorldRule[] {
  return DEFAULT_RULES.map((rule) => ({ ...rule, worldId }));
}

export function createSoftExceptionTestRule(worldId: string): WorldRule {
  return {
    id: 'test/soft-author-exception',
    worldId,
    type: 'ENTITY_MUST_EXIST',
    hardness: 'SOFT',
    enabled: true,
    exceptionPolicy: { allowed: true, requiredAuthority: 'AUTHOR' },
  };
}
