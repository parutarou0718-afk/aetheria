import type { ProposalV2 } from '../../proposal/proposalSchema';

export type SemanticEffectType = 'DAMAGE' | 'RECOVERY' | 'RESOURCE_COST' | 'RESOURCE_GAIN';
export type SemanticMagnitude = 'LIGHT' | 'MEDIUM' | 'HEAVY';
export type ResolvableResource = 'HP' | 'MP' | 'GOLD';

export interface ResolvableSemanticEffect {
  type: SemanticEffectType;
  magnitude: SemanticMagnitude;
  resource: ResolvableResource;
  targetEntityId: string;
}

export interface ParameterResolutionRejection {
  code: 'PARAMETER_EFFECT_UNSUPPORTED';
  message: string;
}

export type ParameterResolutionResult =
  | { success: true; proposal: ProposalV2 }
  | { success: false; rejection: ParameterResolutionRejection };
