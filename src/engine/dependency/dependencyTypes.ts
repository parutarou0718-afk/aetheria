export type DependencySourceType =
  | 'TRANSACTION'
  | 'SEED'
  | 'ORGANIZATION_PROJECT'
  | 'CHARACTER_GOAL'
  | 'SCHEDULED_CHECKPOINT'
  | 'WORLD_COMMITMENT';

export type DependencyTargetType =
  | 'CHARACTER'
  | 'LOCATION'
  | 'ORGANIZATION'
  | 'SEED'
  | 'WORLD_FACT'
  | 'HIDDEN_TRUTH'
  | 'LOCATION_EDGE'
  | 'TRANSACTION'
  | 'EVENT';

export type DependencyType =
  | 'ENTITY_EXISTS'
  | 'ENTITY_STATUS'
  | 'LOCATION_STATUS'
  | 'LOCATION_ACCESSIBLE'
  | 'EDGE_OPEN'
  | 'ACTOR_ALIVE'
  | 'ACTOR_AT_LOCATION'
  | 'ORGANIZATION_EXISTS'
  | 'ORGANIZATION_CONTROL'
  | 'SEED_ACTIVE'
  | 'TRANSACTION_ACTIVE'
  | 'FACT_EQUALS'
  | 'FACT_IN'
  | 'TRUTH_EXISTS'
  | 'CUSTOM_CONDITION';

export type DependencyStatus =
  | 'ACTIVE'
  | 'SATISFIED'
  | 'INVALIDATED'
  | 'SUSPENDED'
  | 'REMOVED';

export type DependencyFailurePolicy =
  | 'FAIL_SOURCE'
  | 'INVALIDATE_SOURCE'
  | 'PAUSE_SOURCE'
  | 'DELAY_SOURCE'
  | 'WAKE_SOURCE'
  | 'REPLAN_SOURCE'
  | 'IGNORE';

export interface DependencyCondition {
  operator:
    | 'EQUALS'
    | 'NOT_EQUALS'
    | 'IN'
    | 'NOT_IN'
    | 'EXISTS'
    | 'NOT_EXISTS'
    | 'GREATER_THAN'
    | 'GREATER_THAN_OR_EQUAL'
    | 'LESS_THAN'
    | 'LESS_THAN_OR_EQUAL'
    | 'CONTAINS';

  fieldPath?: string;
  value?: unknown;
}

export interface DependencyEdge {
  id: string;
  world_id: string;

  source_type: DependencySourceType;
  source_id: string;

  dependency_type: DependencyType;

  target_type: DependencyTargetType;
  target_id: string;

  expected_condition: DependencyCondition;

  status: DependencyStatus;
  failure_policy: DependencyFailurePolicy;

  priority?: number;

  created_at_epoch: number;
  last_evaluated_epoch?: number | null;
  invalidated_at_epoch?: number | null;
  invalidation_reason?: string | null;

  metadata?: Record<string, unknown>;
}

export interface DependencyEvaluationResult {
  dependencyId: string;
  valid: boolean;

  actualValue: unknown;
  expectedCondition: DependencyCondition;

  reason?: string;
}

export interface DependencyImpact {
  dependencyId: string;

  sourceType: DependencySourceType;
  sourceId: string;

  targetType: DependencyTargetType;
  targetId: string;

  failurePolicy: DependencyFailurePolicy;

  reason: string;

  evaluation: DependencyEvaluationResult;
}

export interface DependencyTargetRef {
  targetType: DependencyTargetType;
  targetId: string;
  changedFieldPaths: string[];
}

export interface CausalPropagationContext {
  propagationId: string;
  depth: number;
  visitedSources: string[];
  visitedDependencies: string[];
}

export interface DependencyPropagationResult {
  propagationId: string;
  evaluatedDependencies: number;
  invalidatedDependencies: number;
  affectedSources: string[];
  committedProposalCount: number;
  warnings: string[];
}
