import type { ProposalV2 } from '../proposal/proposalSchema';
import { CapabilityEvaluator } from './capabilityEvaluator';
import { CapabilityPolicy } from './capabilityPolicy';
import type { CapabilityFailure } from './capabilityTypes';
export interface CapabilityViolation extends CapabilityFailure { actorId?: string; targetId?: string; }
export class CapabilityValidator {
  constructor(private readonly evaluator = new CapabilityEvaluator()) {}
  async validate(input: { worldId: string; proposal: ProposalV2; originatedFromSemanticResolution?: boolean }): Promise<{ valid: boolean; violations: CapabilityViolation[] }> {
    const actorId = input.proposal.actorId;
    if (input.proposal.authorityLevel === 'ACTOR' && CapabilityPolicy.isMechanicalActorOperation(input.proposal) && !actorId) {
      return { valid: false, violations: [{ code: 'ACTOR_ID_REQUIRED', requirementType: input.proposal.operation }] };
    }
    const directMutation = this.validateActorMutation(input.proposal, input.originatedFromSemanticResolution === true);
    if (directMutation) return { valid: false, violations: [{ ...directMutation, actorId }] };
    const requirements = [...CapabilityPolicy.requirementsFor(input.proposal), ...(input.proposal.capabilityRequirements ?? [])];
    if (requirements.length === 0) return { valid: true, violations: [] };
    if (!actorId) return { valid: false, violations: [{ code: 'ACTOR_NOT_ACTIVE', requirementType: requirements[0].type }] };
    const outcomes = await Promise.all(requirements.map(requirement => this.evaluator.evaluate({ worldId: input.worldId, actorId, requirement })));
    const violations = outcomes.flatMap((result, index) => result.eligible
      ? []
      : result.failures.length > 0
        ? result.failures
        : [{ code: 'CAPABILITY_REQUIREMENT_UNMET' as const, requirementType: requirements[index].type }]
    ).map(failure => ({ ...failure, actorId, targetId: failure.targetId }));
    return { valid: outcomes.every(result => result.eligible), violations };
  }

  private validateActorMutation(proposal: ProposalV2, originatedFromSemanticResolution: boolean): CapabilityFailure | undefined {
    if (proposal.authorityLevel !== 'ACTOR') return undefined;
    if (proposal.operation === 'UPDATE_CHARACTER') {
      const forbidden = Object.keys(proposal.payload).find((key) => !['id', 'characterId', 'name', 'title'].includes(key));
      if (forbidden) return { code: 'ACTOR_STATE_MUTATION_FORBIDDEN', requirementType: 'ACTOR_CHARACTER_UPDATE', key: forbidden };
      const targetId = proposal.entityId ?? String(proposal.payload.characterId ?? proposal.payload.id ?? '');
      if (targetId !== proposal.actorId) return { code: 'ACTOR_STATE_MUTATION_FORBIDDEN', requirementType: 'ACTOR_CHARACTER_UPDATE', targetId };
    }
    if ((proposal.operation === 'UPDATE_CHARACTER_ATTRIBUTES' || proposal.operation === 'CHANGE_RESOURCE') && !originatedFromSemanticResolution) {
      return { code: 'DIRECT_NUMERIC_MUTATION_FORBIDDEN', requirementType: 'SEMANTIC_EFFECT_PROVENANCE' };
    }
    if (proposal.semanticEffect && (proposal.semanticEffect.type === 'RESOURCE_COST' || proposal.semanticEffect.type === 'RESOURCE_GAIN')) {
      const targetId = proposal.semanticEffect.targetEntityId ?? proposal.entityId;
      if (proposal.actorId && targetId && targetId !== proposal.actorId) return { code: 'TARGET_NOT_COLOCATED', requirementType: 'RESOURCE_TARGET_SELF', targetId };
    }
    return undefined;
  }
}
