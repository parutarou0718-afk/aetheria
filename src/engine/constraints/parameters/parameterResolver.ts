import type { ProposalV2 } from '../../proposal/proposalSchema';
import { DEFAULT_PARAMETER_POLICY } from './parameterPolicy';
import type { ParameterResolutionResult, ResolvableSemanticEffect, ResolvableResource, SemanticEffectType, SemanticMagnitude } from './parameterTypes';

const effectTypes = new Set<SemanticEffectType>(['DAMAGE', 'RECOVERY', 'RESOURCE_COST', 'RESOURCE_GAIN']);
const magnitudes = new Set<SemanticMagnitude>(['LIGHT', 'MEDIUM', 'HEAVY']);
const resources = new Set<ResolvableResource>(['HP', 'MP', 'GOLD']);

export class ParameterResolver {
  public resolve(proposal: ProposalV2): ParameterResolutionResult {
    if (proposal.operation !== 'APPLY_SEMANTIC_EFFECT') return { success: true, proposal };
    const effect = this.parse(proposal.semanticEffect);
    if (!effect) return this.reject('APPLY_SEMANTIC_EFFECT requires a supported semantic effect.');
    const amount = DEFAULT_PARAMETER_POLICY[effect.resource]?.[effect.type]?.[effect.magnitude];
    if (amount === undefined) return this.reject(`Unsupported semantic effect: ${effect.type} on ${effect.resource}.`);

    const positive = effect.type === 'RECOVERY' || effect.type === 'RESOURCE_GAIN';
    const delta = positive ? amount : -amount;
    const payload = effect.resource === 'HP'
      ? { characterId: effect.targetEntityId, hpDelta: delta }
      : effect.resource === 'MP'
        ? { characterId: effect.targetEntityId, mpDelta: delta }
        : { characterId: effect.targetEntityId, goldDelta: delta };
    return {
      success: true,
      proposal: {
        ...proposal,
        operation: effect.resource === 'GOLD' ? 'CHANGE_RESOURCE' : 'UPDATE_CHARACTER_ATTRIBUTES',
        entityType: 'CHARACTER',
        entityId: effect.targetEntityId,
        payload,
      },
    };
  }

  private parse(effect: ProposalV2['semanticEffect']): ResolvableSemanticEffect | null {
    if (!effect || !effectTypes.has(effect.type as SemanticEffectType) || !magnitudes.has(effect.magnitude as SemanticMagnitude) || !resources.has(effect.resource as ResolvableResource) || !effect.targetEntityId) return null;
    return effect as ResolvableSemanticEffect;
  }

  private reject(message: string): ParameterResolutionResult {
    return { success: false, rejection: { code: 'PARAMETER_EFFECT_UNSUPPORTED', message } };
  }
}
