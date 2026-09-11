import { describe, expect, it } from 'vitest';
import { createModelRouterFromEnvironment } from '../src/engine/ai/routing/modelRouter';

describe('server-owned model routing', () => {
  it('uses one configured upstream model for every internal tier', () => {
    const router = createModelRouterFromEnvironment({ AETHERIA_UPSTREAM_1_MODELS: 'deepseek-v4-flash' });
    expect(router.route('NPC_DIALOGUE').model).toBe('deepseek-v4-flash');
    expect(router.route('WORLD_GENESIS').model).toBe('deepseek-v4-flash');
  });
});
