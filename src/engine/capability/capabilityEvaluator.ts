import { WorldRepository } from '../world/worldRepository';
import { CapabilitySnapshotService } from './capabilitySnapshot';
import type { CapabilityAssessment, CapabilityFailure, CapabilityRequirement } from './capabilityTypes';
export class CapabilityEvaluator {
  async evaluate(input: { worldId: string; actorId: string; requirement: CapabilityRequirement }): Promise<CapabilityAssessment> {
    const actor = await WorldRepository.getCharacter(input.worldId, input.actorId);
    if (!actor) return { eligible: false, failures: [{ code: 'ACTOR_NOT_ACTIVE', requirementType: input.requirement.type, targetId: input.actorId }] };
    return this.evaluateRequirement(input.worldId, CapabilitySnapshotService.fromCharacter(actor), input.requirement);
  }
  private async evaluateRequirement(worldId: string, snapshot: ReturnType<typeof CapabilitySnapshotService.fromCharacter>, requirement: CapabilityRequirement): Promise<CapabilityAssessment> {
    const fail = (failure: CapabilityFailure): CapabilityAssessment => ({ eligible: false, failures: [failure] });
    if (requirement.type === 'ACTIVE_CHARACTER') return snapshot.actionState === 'AVAILABLE' ? { eligible: true, failures: [] } : fail({ code: 'ACTOR_NOT_ACTIVE', requirementType: requirement.type });
    if (requirement.type === 'ATTRIBUTE_MIN') return snapshot.attributes[requirement.attribute] >= requirement.minimum ? { eligible: true, failures: [] } : fail({ code: 'ATTRIBUTE_TOO_LOW', requirementType: requirement.type, key: requirement.attribute });
    if (requirement.type === 'SKILL_MIN') return (snapshot.skills.find(skill => skill.name.toLowerCase() === requirement.skill.toLowerCase())?.level ?? 0) >= requirement.minimum ? { eligible: true, failures: [] } : fail({ code: 'SKILL_TOO_LOW', requirementType: requirement.type, key: requirement.skill });
    if (requirement.type === 'HAS_ITEM') return snapshot.usableItems.some(item => (!requirement.itemId || item.itemId === requirement.itemId) && (!requirement.itemType || item.type === requirement.itemType) && item.quantity >= requirement.minimumQuantity) ? { eligible: true, failures: [] } : fail({ code: 'ITEM_MISSING', requirementType: requirement.type, key: requirement.itemId ?? requirement.itemType });
    if (requirement.type === 'RESOURCE_MIN') return snapshot.resources[requirement.resource.toLowerCase() as 'hp'|'mp'|'gold'] >= requirement.minimum ? { eligible: true, failures: [] } : fail({ code: 'RESOURCE_INSUFFICIENT', requirementType: requirement.type, key: requirement.resource });
    if (requirement.type === 'PRESENCE') return snapshot.actionState === 'AVAILABLE' ? { eligible: true, failures: [] } : fail({ code: 'PRESENCE_INVALID', requirementType: requirement.type });
    if (requirement.type === 'SAME_LOCATION') { const target = await WorldRepository.getCharacter(worldId, requirement.targetCharacterId); if (!target) return fail({ code: 'TARGET_NOT_FOUND', requirementType: requirement.type, targetId: requirement.targetCharacterId }); return target.location_id === snapshot.locationId && target.presence_state === 'AT_LOCATION' && snapshot.actionState === 'AVAILABLE' ? { eligible: true, failures: [] } : fail({ code: 'TARGET_NOT_COLOCATED', requirementType: requirement.type, targetId: requirement.targetCharacterId }); }
    const child = await Promise.all(requirement.requirements.map(childRequirement => this.evaluateRequirement(worldId, snapshot, childRequirement)));
    if (requirement.type === 'ALL') return { eligible: child.every(result => result.eligible), failures: child.flatMap(result => result.failures) };
    const pass = child.some(result => result.eligible); return { eligible: pass, failures: pass ? [] : child.flatMap(result => result.failures) };
  }
}
