import type { ProposalV2 } from '../proposal/proposalSchema';
import type { CapabilityRequirement } from './capabilityTypes';
export class CapabilityPolicy {
  static requirementsFor(proposal: ProposalV2): CapabilityRequirement[] {
    if (proposal.authorityLevel !== 'ACTOR' || !proposal.actorId) return [];
    const active: CapabilityRequirement[] = [{ type: 'ACTIVE_CHARACTER' }];
    if (proposal.operation === 'APPLY_SEMANTIC_EFFECT' || Boolean(proposal.semanticEffect)) {
      const effect = proposal.semanticEffect;
      if (effect?.type === 'DAMAGE' || effect?.type === 'RECOVERY') return [...active, { type: 'PRESENCE', required: 'AT_LOCATION' }, { type: 'SAME_LOCATION', targetCharacterId: effect.targetEntityId ?? proposal.entityId ?? '' }];
      if (effect?.type === 'RESOURCE_COST' || effect?.type === 'RESOURCE_GAIN') {
        const targetId = effect.targetEntityId ?? proposal.entityId ?? proposal.actorId;
        const requirements: CapabilityRequirement[] = [...active, { type: 'SAME_LOCATION', targetCharacterId: targetId }];
        const delta = effect.resource === 'MP' ? Number(proposal.payload.mpDelta ?? 0) : effect.resource === 'GOLD' ? Number(proposal.payload.goldDelta ?? 0) : Number(proposal.payload.hpDelta ?? 0);
        if (effect.type === 'RESOURCE_COST' && delta < 0) requirements.push({ type: 'RESOURCE_MIN', resource: effect.resource as 'HP' | 'MP' | 'GOLD', minimum: -delta });
        return requirements;
      }
    }
    if (proposal.operation === 'CHANGE_RELATIONSHIP') return [...active, { type: 'SAME_LOCATION', targetCharacterId: proposal.entityId ?? '' }];
    if (proposal.operation === 'MOVE_CHARACTER' || proposal.operation === 'CREATE_WORLD_TRANSACTION' || proposal.operation === 'SET_CHARACTER_ACTION' || proposal.operation === 'ACCEPT_QUEST') return active;
    return [];
  }
}
