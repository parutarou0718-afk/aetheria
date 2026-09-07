import { describe, expect, it } from 'vitest';
import { createDefaultWorldRules, createSoftExceptionTestRule } from '../src/engine/constraints/rules/worldRuleCatalog';
import { DefaultWorldRuleRepository } from '../src/engine/constraints/rules/worldRuleRepository';

describe('default WorldRule catalog', () => {
  it('derives seven enabled, stable rules for each world', async () => {
    const worldId = 'world-rules-catalog';
    const rules = createDefaultWorldRules(worldId);

    expect(rules).toHaveLength(7);
    expect(rules).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'builtin/entity-must-exist', worldId, type: 'ENTITY_MUST_EXIST', hardness: 'HARD', enabled: true }),
      expect.objectContaining({ id: 'builtin/dead-character-cannot-act', worldId, type: 'DEAD_CHARACTER_CANNOT_ACT', hardness: 'HARD', enabled: true }),
      expect.objectContaining({ id: 'builtin/resource-non-negative', worldId, type: 'RESOURCE_NON_NEGATIVE', hardness: 'HARD', enabled: true }),
      expect.objectContaining({ id: 'builtin/travel-requires-route', worldId, type: 'TRAVEL_REQUIRES_ROUTE', hardness: 'HARD', enabled: true }),
      expect.objectContaining({ id: 'builtin/immutable-fact-protected', worldId, type: 'IMMUTABLE_FACT_PROTECTED', hardness: 'HARD', enabled: true }),
      expect.objectContaining({ id: 'builtin/location-access-valid', worldId, type: 'LOCATION_ACCESS_VALID', hardness: 'HARD', enabled: true }),
      expect.objectContaining({ id: 'builtin/history-immutable', worldId, type: 'HISTORY_IMMUTABLE', hardness: 'HARD', enabled: true }),
    ]));
    await expect(new DefaultWorldRuleRepository().getEnabledRules(worldId)).resolves.toEqual(rules);
  });

  it('defines a SOFT rule fixture that requires AUTHOR authority for an exception', () => {
    expect(createSoftExceptionTestRule('world-rules-catalog')).toMatchObject({
      hardness: 'SOFT',
      enabled: true,
      exceptionPolicy: { allowed: true, requiredAuthority: 'AUTHOR' },
    });
  });
});
