import { describe, expect, it, vi } from 'vitest';
import { WorldRuleValidator, type WorldRuleStateReader } from '../src/engine/constraints/rules/worldRuleValidator';
import type { WorldRuleRepository } from '../src/engine/constraints/rules/worldRuleRepository';
import { createDefaultWorldRules, createSoftExceptionTestRule } from '../src/engine/constraints/rules/worldRuleCatalog';
import type { ProposalV2 } from '../src/engine/proposal/proposalSchema';

const worldId = 'world-rule-validator';
const proposal = (overrides: Partial<ProposalV2> = {}): ProposalV2 => ({
  id: 'proposal-1', operation: 'MOVE_CHARACTER', entityType: 'CHARACTER', entityId: 'pc-1',
  payload: { characterId: 'pc-1', targetLocationId: 'loc-2' }, effectiveEpoch: 1, preconditions: [],
  source: { type: 'PLAYER_ACTION' }, reason: 'Travel.', causalBasis: [{ type: 'PLAYER_ACTION', description: 'Travel.' }], authorityLevel: 'ACTOR',
  ...overrides,
});

const stateReader = (overrides: Partial<WorldRuleStateReader> = {}): WorldRuleStateReader => ({
  getCharacter: vi.fn().mockResolvedValue({ id: 'pc-1', status: 'ALIVE', location_id: 'loc-1', resources: { gold: 20 } }),
  getLocation: vi.fn().mockResolvedValue({ id: 'loc-2', status: 'ACTIVE' }),
  getFact: vi.fn().mockResolvedValue(null),
  getTruth: vi.fn().mockResolvedValue({ id: 'truth-1', never_changes: true }),
  entityExists: vi.fn().mockResolvedValue(true),
  hasRoute: vi.fn().mockResolvedValue(true),
  ...overrides,
});

const repository = (rules = createDefaultWorldRules(worldId)): WorldRuleRepository => ({ getEnabledRules: vi.fn().mockResolvedValue(rules) });

describe('WorldRuleValidator', () => {
  it('rejects an update of a missing entity', async () => {
    const validator = new WorldRuleValidator(repository(), stateReader({ entityExists: vi.fn().mockResolvedValue(false) }));
    const result = await validator.validate({ worldId, proposal: proposal({ operation: 'UPDATE_CHARACTER' }) });
    expect(result).toMatchObject({ valid: false, violations: [expect.objectContaining({ ruleType: 'ENTITY_MUST_EXIST' })] });
  });

  it('does not apply existence checking to create operations', async () => {
    const validator = new WorldRuleValidator(repository(), stateReader({ entityExists: vi.fn().mockResolvedValue(false) }));
    await expect(validator.validate({ worldId, proposal: proposal({ operation: 'CREATE_CHARACTER' }) })).resolves.toMatchObject({ valid: true });
  });

  it.each(['MOVE_CHARACTER', 'CHANGE_RESOURCE'] as const)('rejects a dead ACTOR attempting %s', async (operation) => {
    const validator = new WorldRuleValidator(repository(), stateReader({ getCharacter: vi.fn().mockResolvedValue({ id: 'pc-1', status: 'DEAD', location_id: 'loc-1', resources: { gold: 20 } }) }));
    const result = await validator.validate({ worldId, proposal: proposal({ operation, payload: operation === 'CHANGE_RESOURCE' ? { characterId: 'pc-1', goldDelta: 1 } : { characterId: 'pc-1', targetLocationId: 'loc-2' } }) });
    expect(result.violations).toEqual(expect.arrayContaining([expect.objectContaining({ ruleType: 'DEAD_CHARACTER_CANNOT_ACT' })]));
  });

  it('allows SYSTEM maintenance of a dead character when no other rule is violated', async () => {
    const validator = new WorldRuleValidator(repository(), stateReader({ getCharacter: vi.fn().mockResolvedValue({ id: 'pc-1', status: 'DEAD', location_id: 'loc-1', resources: { gold: 20 } }) }));
    await expect(validator.validate({ worldId, proposal: proposal({ operation: 'CHANGE_RESOURCE', authorityLevel: 'SYSTEM', payload: { characterId: 'pc-1', goldDelta: 1 } }) })).resolves.toMatchObject({ valid: true });
  });

  it('rejects a gold delta that would make gold negative', async () => {
    const validator = new WorldRuleValidator(repository(), stateReader());
    const result = await validator.validate({ worldId, proposal: proposal({ operation: 'CHANGE_RESOURCE', payload: { characterId: 'pc-1', goldDelta: -30 } }) });
    expect(result.violations).toEqual(expect.arrayContaining([expect.objectContaining({ ruleType: 'RESOURCE_NON_NEGATIVE' })]));
  });

  it.each([
    ['no route', stateReader({ hasRoute: vi.fn().mockResolvedValue(false) }), 'TRAVEL_REQUIRES_ROUTE'],
    ['blocked destination', stateReader({ getLocation: vi.fn().mockResolvedValue({ id: 'loc-2', status: 'BLOCKED' }) }), 'LOCATION_ACCESS_VALID'],
  ] as const)('rejects travel with %s', async (_name, reader, ruleType) => {
    const result = await new WorldRuleValidator(repository(), reader).validate({ worldId, proposal: proposal() });
    expect(result.violations).toEqual(expect.arrayContaining([expect.objectContaining({ ruleType })]));
  });

  it('protects an immutable hidden truth from ordinary authority but allows AUTHOR', async () => {
    const reader = stateReader({ entityExists: vi.fn().mockResolvedValue(true) });
    const validator = new WorldRuleValidator(repository(), reader);
    await expect(validator.validate({ worldId, proposal: proposal({ operation: 'REVEAL_TRUTH', entityType: 'TRUTH', entityId: 'truth-1', payload: { truthId: 'truth-1', true_nature: 'changed' } }) })).resolves.toMatchObject({ valid: false, violations: [expect.objectContaining({ ruleType: 'IMMUTABLE_FACT_PROTECTED' })] });
    await expect(validator.validate({ worldId, proposal: proposal({ operation: 'REVEAL_TRUTH', entityType: 'TRUTH', entityId: 'truth-1', authorityLevel: 'AUTHOR', payload: { truthId: 'truth-1', true_nature: 'changed' } }) })).resolves.toMatchObject({ valid: true });
  });

  it('enforces SOFT rules unless the required exception authority is present', async () => {
    const rules = [createSoftExceptionTestRule(worldId)];
    const validator = new WorldRuleValidator(repository(rules), stateReader({ entityExists: vi.fn().mockResolvedValue(false) }));
    for (const authorityLevel of ['ACTOR', 'SYSTEM'] as const) {
      await expect(validator.validate({ worldId, proposal: proposal({ authorityLevel, operation: 'UPDATE_CHARACTER' }) })).resolves.toMatchObject({ valid: false });
    }
    for (const authorityLevel of ['AUTHOR', 'ADMIN'] as const) {
      await expect(validator.validate({ worldId, proposal: proposal({ authorityLevel, operation: 'UPDATE_CHARACTER' }) })).resolves.toMatchObject({ valid: true });
    }
  });
});
