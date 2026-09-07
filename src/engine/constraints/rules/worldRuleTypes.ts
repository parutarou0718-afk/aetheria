import type { AuthorityLevel } from '../authority/authorityTypes';

export type RuleHardness = 'HARD' | 'SOFT';

export type WorldRuleType =
  | 'ENTITY_MUST_EXIST'
  | 'DEAD_CHARACTER_CANNOT_ACT'
  | 'RESOURCE_NON_NEGATIVE'
  | 'TRAVEL_REQUIRES_ROUTE'
  | 'IMMUTABLE_FACT_PROTECTED'
  | 'LOCATION_ACCESS_VALID'
  | 'HISTORY_IMMUTABLE';

export interface WorldRule {
  id: string;
  worldId: string;
  type: WorldRuleType;
  hardness: RuleHardness;
  enabled: boolean;
  scope?: { entityType?: string; entityId?: string };
  minimumAuthority?: AuthorityLevel;
  exceptionPolicy?: { allowed: boolean; requiredAuthority?: AuthorityLevel };
  metadata?: Record<string, unknown>;
}

export interface WorldRuleViolation {
  ruleId: string;
  ruleType: WorldRuleType;
  hardness: RuleHardness;
  code: string;
  message: string;
}
