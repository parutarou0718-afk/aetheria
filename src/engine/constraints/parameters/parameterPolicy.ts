import type { ResolvableResource, SemanticEffectType, SemanticMagnitude } from './parameterTypes';

type MagnitudePolicy = Record<SemanticMagnitude, number>;
type ParameterPolicy = Partial<Record<ResolvableResource, Partial<Record<SemanticEffectType, MagnitudePolicy>>>>;

const SCALE: MagnitudePolicy = { LIGHT: 5, MEDIUM: 15, HEAVY: 30 };
const GOLD_SCALE: MagnitudePolicy = { LIGHT: 10, MEDIUM: 50, HEAVY: 200 };

export const DEFAULT_PARAMETER_POLICY: ParameterPolicy = {
  HP: { DAMAGE: SCALE, RECOVERY: SCALE },
  MP: { RESOURCE_COST: SCALE, RESOURCE_GAIN: SCALE },
  GOLD: { RESOURCE_COST: GOLD_SCALE, RESOURCE_GAIN: GOLD_SCALE },
};
