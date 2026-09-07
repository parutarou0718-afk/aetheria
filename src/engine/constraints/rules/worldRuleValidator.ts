import type { AuthorityLevel } from '../authority/authorityTypes';
import { AUTHORITY_RANK } from '../authority/authorityTypes';
import type { ProposalV2 } from '../../proposal/proposalSchema';
import type { WorldRuleRepository } from './worldRuleRepository';
import type { WorldRule, WorldRuleViolation } from './worldRuleTypes';

export interface WorldRuleStateReader {
  getCharacter(worldId: string, characterId: string): Promise<{ id: string; status?: string; location_id?: string; resources?: { gold?: number } } | null>;
  getLocation(worldId: string, locationId: string): Promise<{ id: string; status?: string } | null>;
  getFact(worldId: string, factId: string): Promise<unknown | null>;
  getTruth?(worldId: string, truthId: string): Promise<{ id: string; never_changes?: boolean } | null>;
  entityExists(worldId: string, entityType: string, entityId: string): Promise<boolean>;
  hasRoute(worldId: string, originLocationId: string, destinationLocationId: string): Promise<boolean>;
}

export interface RuleValidationContext { worldId: string; proposal: ProposalV2; }
export interface RuleValidationResult { valid: boolean; violations: WorldRuleViolation[]; }

const CREATE_OPERATIONS = new Set(['CREATE_CHARACTER', 'CREATE_LOCATION', 'CREATE_EVENT', 'CREATE_ENTITY', 'CREATE_SEED', 'CREATE_TRANSACTION', 'CREATE_WORLD_TRANSACTION', 'CREATE_SCHEDULED_CHECKPOINT', 'CREATE_OBSERVED_HISTORY', 'ADD_FACT', 'CREATE_DEPENDENCY']);
const EXISTING_ENTITY_OPERATIONS = new Set(['UPDATE_CHARACTER', 'UPDATE_CHARACTER_ATTRIBUTES', 'MOVE_CHARACTER', 'CHANGE_RESOURCE', 'CHANGE_RELATIONSHIP', 'UPDATE_CHARACTER_KNOWLEDGE', 'UPDATE_CHARACTER_MEMORY', 'SET_CHARACTER_ACTION', 'UPDATE_LOCATION', 'UPDATE_SEED', 'UPDATE_ORGANIZATION', 'REVEAL_TRUTH', 'UPDATE_TRANSACTION', 'UPDATE_WORLD_TRANSACTION', 'UPDATE_SCHEDULED_CHECKPOINT', 'SET_CHARACTER_PRESENCE', 'COMPLETE_TRANSACTION', 'FAIL_TRANSACTION', 'CANCEL_TRANSACTION', 'INVALIDATE_TRANSACTION', 'PAUSE_TRANSACTION']);
const DEAD_ACTOR_OPERATIONS = new Set(['MOVE_CHARACTER', 'UPDATE_CHARACTER_ATTRIBUTES', 'CHANGE_RESOURCE', 'CHANGE_RELATIONSHIP']);

export class WorldRuleValidator {
  public constructor(private readonly rules: WorldRuleRepository, private readonly state: WorldRuleStateReader) {}

  public async validate(context: RuleValidationContext): Promise<RuleValidationResult> {
    const rules = await this.rules.getEnabledRules(context.worldId);
    const violations: WorldRuleViolation[] = [];
    for (const rule of rules) {
      const violation = await this.validateRule(rule, context);
      if (violation && !this.exceptionAllowed(rule, context.proposal.authorityLevel)) violations.push(violation);
    }
    return { valid: violations.length === 0, violations };
  }

  private exceptionAllowed(rule: WorldRule, authority: AuthorityLevel): boolean {
    if (rule.hardness === 'HARD' || !rule.exceptionPolicy?.allowed || !rule.exceptionPolicy.requiredAuthority) return false;
    return AUTHORITY_RANK[authority] >= AUTHORITY_RANK[rule.exceptionPolicy.requiredAuthority];
  }

  private async validateRule(rule: WorldRule, context: RuleValidationContext): Promise<WorldRuleViolation | null> {
    const { proposal, worldId } = context;
    switch (rule.type) {
      case 'ENTITY_MUST_EXIST': {
        if (CREATE_OPERATIONS.has(proposal.operation) || !EXISTING_ENTITY_OPERATIONS.has(proposal.operation)) return null;
        const entityId = this.entityId(proposal);
        if (!entityId || await this.state.entityExists(worldId, proposal.entityType, entityId)) return null;
        return this.violation(rule, 'ENTITY_NOT_FOUND', `The target ${proposal.entityType} does not exist.`);
      }
      case 'DEAD_CHARACTER_CANNOT_ACT': {
        if (proposal.authorityLevel !== 'ACTOR' || !DEAD_ACTOR_OPERATIONS.has(proposal.operation)) return null;
        // New proposals carry the acting character separately from the entity
        // they affect. Preserve the legacy target-based behavior when older
        // proposals have no actor identity.
        const characterId = proposal.actorId ?? this.entityId(proposal);
        if (!characterId) return null;
        const character = await this.state.getCharacter(worldId, characterId);
        return character?.status === 'DEAD' ? this.violation(rule, 'DEAD_CHARACTER_CANNOT_ACT', 'A dead character cannot perform this action.') : null;
      }
      case 'RESOURCE_NON_NEGATIVE': {
        if (proposal.operation !== 'CHANGE_RESOURCE') return null;
        const characterId = this.entityId(proposal);
        const goldDelta = Number(proposal.payload.goldDelta ?? 0);
        if (!characterId || !Number.isFinite(goldDelta) || goldDelta >= 0) return null;
        const character = await this.state.getCharacter(worldId, characterId);
        return (character?.resources?.gold ?? 0) + goldDelta < 0
          ? this.violation(rule, 'RESOURCE_WOULD_BE_NEGATIVE', 'This action would make gold negative.')
          : null;
      }
      case 'TRAVEL_REQUIRES_ROUTE': {
        if (proposal.operation !== 'MOVE_CHARACTER') return null;
        const characterId = this.entityId(proposal);
        const destinationId = String(proposal.payload.targetLocationId ?? proposal.payload.locationId ?? '');
        if (!characterId || !destinationId) return null;
        const character = await this.state.getCharacter(worldId, characterId);
        if (!character?.location_id) return this.violation(rule, 'TRAVEL_ROUTE_INVALID', 'The traveler has no valid origin location.');
        return await this.state.hasRoute(worldId, character.location_id, destinationId)
          ? null : this.violation(rule, 'TRAVEL_ROUTE_INVALID', 'No valid route exists to the destination.');
      }
      case 'LOCATION_ACCESS_VALID': {
        if (proposal.operation !== 'MOVE_CHARACTER') return null;
        const destinationId = String(proposal.payload.targetLocationId ?? proposal.payload.locationId ?? '');
        if (!destinationId) return null;
        const location = await this.state.getLocation(worldId, destinationId);
        return !location || ['DESTROYED', 'BLOCKED', 'INACCESSIBLE'].includes(location.status ?? '')
          ? this.violation(rule, 'LOCATION_ACCESS_INVALID', 'The destination is not accessible.') : null;
      }
      case 'IMMUTABLE_FACT_PROTECTED': {
        if (proposal.operation !== 'REVEAL_TRUTH' || ['AUTHOR', 'ADMIN'].includes(proposal.authorityLevel)) return null;
        const truthId = this.entityId(proposal);
        if (!truthId || !this.state.getTruth) return null;
        const truth = await this.state.getTruth(worldId, truthId);
        const overwritesImmutableValue = truth?.never_changes && [
          'true_nature',
          'true_owner_id',
          'true_goal',
          'locked_at_epoch',
          'never_changes',
          'exists',
        ].some((key) => proposal.payload[key] !== undefined);
        return overwritesImmutableValue ? this.violation(rule, 'IMMUTABLE_FACT_PROTECTED', 'An immutable world truth cannot be overwritten.') : null;
      }
      case 'HISTORY_IMMUTABLE':
        return null;
      default:
        return null;
    }
  }

  private entityId(proposal: ProposalV2): string | undefined {
    return proposal.entityId || (typeof proposal.payload.characterId === 'string' ? proposal.payload.characterId : undefined) || (typeof proposal.payload.truthId === 'string' ? proposal.payload.truthId : undefined);
  }

  private violation(rule: WorldRule, code: string, message: string): WorldRuleViolation {
    return { ruleId: rule.id, ruleType: rule.type, hardness: rule.hardness, code, message };
  }
}
