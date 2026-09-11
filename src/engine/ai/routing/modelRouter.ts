import type { AiPurpose, AiTier } from '../aiTypes';
export interface ModelRoute { model: string; tier: AiTier; maxOutputTokens?: number; }
export class ModelRouter { constructor(private readonly models: Partial<Record<AiTier, string>> = { STANDARD: 'standard-model', ADVANCED: 'advanced-model', DEEP: 'deep-model' }) {} route(purpose: AiPurpose, requested?: AiTier): ModelRoute { const tier = requested ?? (purpose === 'WORLD_GENESIS' || purpose === 'WORLD_PROFILE' || purpose === 'WORLD_SKELETON' || purpose === 'WORLD_ENTITY_GENERATION' || purpose === 'CAUSALITY' ? 'ADVANCED' : 'STANDARD'); const model = this.models[tier]; if (!model) throw new Error('No model configured for tier.'); return { tier, model }; } }

/**
 * Deployment owns concrete model names. Until a multi-model routing policy is
 * configured, one legal upstream model serves each product tier deterministically.
 */
export function createModelRouterFromEnvironment(env: NodeJS.ProcessEnv = process.env): ModelRouter {
  const firstModel = Object.keys(env)
    .filter((key) => /^AETHERIA_UPSTREAM_\d+_MODELS$/.test(key))
    .sort()
    .flatMap((key) => (env[key] ?? '').split(',').map((value) => value.trim()).filter(Boolean))[0];
  return firstModel
    ? new ModelRouter({ STANDARD: firstModel, ADVANCED: firstModel, DEEP: firstModel })
    : new ModelRouter();
}
