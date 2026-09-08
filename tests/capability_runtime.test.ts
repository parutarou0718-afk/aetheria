import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CapabilityEvaluator } from '../src/engine/capability/capabilityEvaluator';
import { CapabilitySnapshotService } from '../src/engine/capability/capabilitySnapshot';
import { ProposalPipeline } from '../src/engine/proposal/proposalPipeline';
import type { ProposalV2 } from '../src/engine/proposal/proposalSchema';
import { WorldRepository } from '../src/engine/world/worldRepository';
import { globalWorld, setRecorderWriteContext } from '../src/engine/worldState';
import { bootstrapWithDefaultWorld } from './helpers/worldFixture';

const worldId = 'capability-runtime';

function base(overrides: Partial<ProposalV2> = {}): ProposalV2 {
  return {
    id: `cap-${crypto.randomUUID()}`,
    operation: 'UPDATE_CHARACTER', entityType: 'CHARACTER', entityId: 'pc-player', actorId: 'pc-player',
    payload: { name: 'Renamed' }, effectiveEpoch: 1, preconditions: [], source: { type: 'PLAYER_ACTION' },
    reason: 'The player makes a legal request.', causalBasis: [{ type: 'PLAYER_ACTION', description: 'A player action occurred.' }], authorityLevel: 'ACTOR',
    ...overrides,
  };
}

describe('capability runtime', () => {
  beforeEach(async () => { await bootstrapWithDefaultWorld(worldId); });

  it('derives a bounded deterministic snapshot and evaluates nested requirements without mutating state', async () => {
    const actor = (await WorldRepository.getCharacter(worldId, 'pc-player'))!;
    actor.skills = { Sword: 4, Alchemy: 8, Broken: Number.NaN };
    await WorldRepository.saveCharacter(worldId, actor);
    const snapshot = CapabilitySnapshotService.fromCharacter(actor);
    expect(snapshot).toMatchObject({ characterId: 'pc-player', actionState: 'AVAILABLE' });
    expect(snapshot.usableItems).toEqual(expect.arrayContaining([expect.objectContaining({ itemId: 'item-potion' })]));
    expect(snapshot.skills).toEqual([{ name: 'Alchemy', level: 8 }, { name: 'Sword', level: 4 }]);
    const assessment = await new CapabilityEvaluator().evaluate({ worldId, actorId: 'pc-player', requirement: { type: 'ALL', requirements: [{ type: 'ATTRIBUTE_MIN', attribute: 'strength', minimum: 10 }, { type: 'ANY', requirements: [{ type: 'SKILL_MIN', skill: 'alchemy', minimum: 8 }, { type: 'HAS_ITEM', itemId: 'missing', minimumQuantity: 1 }] }] } });
    expect(assessment).toEqual({ eligible: true, failures: [] });
    expect((await WorldRepository.getCharacter(worldId, 'pc-player'))!.attributes.strength).toBe(10);
  });

  it('rejects ACTOR state-forging and raw numeric mutations before Recorder', async () => {
    const committer = { commit: vi.fn() };
    const pipeline = new ProposalPipeline(committer as any, { validate: vi.fn().mockResolvedValue({ valid: true, violations: [] }) }, { validate: vi.fn().mockResolvedValue({ valid: true, violations: [] }) });
    const forged = await pipeline.processAndCommit({ worldId, proposals: [base({ payload: { attributes: { strength: 999 } } })] });
    expect(forged.rejected).toEqual([expect.objectContaining({ code: 'PROPOSAL_CAPABILITY_VIOLATION', capabilityReason: 'ACTOR_STATE_MUTATION_FORBIDDEN' })]);
    const numeric = await pipeline.processAndCommit({ worldId, proposals: [base({ operation: 'UPDATE_CHARACTER_ATTRIBUTES', payload: { characterId: 'pc-player', hpDelta: -1 } })] });
    expect(numeric.rejected).toEqual([expect.objectContaining({ code: 'PROPOSAL_CAPABILITY_VIOLATION', capabilityReason: 'DIRECT_NUMERIC_MUTATION_FORBIDDEN' })]);
    expect(committer.commit).not.toHaveBeenCalled();
  });

  it('enforces producer requirements even for a trusted authority', async () => {
    const committer = { commit: vi.fn() };
    const result = await new ProposalPipeline(committer as any, { validate: vi.fn().mockResolvedValue({ valid: true, violations: [] }) }, { validate: vi.fn().mockResolvedValue({ valid: true, violations: [] }) }).processAndCommit({ worldId, proposals: [base({ authorityLevel: 'SYSTEM', capabilityRequirements: [{ type: 'ATTRIBUTE_MIN', attribute: 'strength', minimum: 99 }] })] });
    expect(result.rejected).toEqual([expect.objectContaining({ code: 'PROPOSAL_CAPABILITY_VIOLATION', capabilityReason: 'ATTRIBUTE_TOO_LOW' })]);
    expect(committer.commit).not.toHaveBeenCalled();
  });

  it('keeps the capability check ahead of WorldRule and preserves batch atomicity', async () => {
    const committer = { commit: vi.fn() };
    const rules = { validate: vi.fn().mockResolvedValue({ valid: true, violations: [] }) };
    const valid = base();
    const invalid = base({ payload: { inventory: [] } });
    const result = await new ProposalPipeline(committer as any, rules, { validate: vi.fn().mockResolvedValue({ valid: true, violations: [] }) }).processAndCommit({ worldId, proposals: [valid, invalid] });
    expect(result.success).toBe(false);
    expect(rules.validate).toHaveBeenCalledTimes(1);
    expect(committer.commit).not.toHaveBeenCalled();
  });

  it('rejects an unavailable actor semantic effect before a target mutation', async () => {
    const actor = globalWorld.characters.get('pc-player')!;
    setRecorderWriteContext(true);
    try { actor.status = 'DEAD'; } finally { setRecorderWriteContext(false); }
    await WorldRepository.saveCharacter(worldId, actor);
    const committer = { commit: vi.fn() };
    const result = await new ProposalPipeline(committer as any).processAndCommit({ worldId, proposals: [base({ operation: 'APPLY_SEMANTIC_EFFECT', entityId: 'pc-player', payload: {}, semanticEffect: { type: 'DAMAGE', magnitude: 'LIGHT', resource: 'HP', targetEntityId: 'pc-player' } })] });
    expect(result.rejected).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'PROPOSAL_CAPABILITY_VIOLATION', capabilityReason: 'ACTOR_NOT_ACTIVE' })]));
    expect(committer.commit).not.toHaveBeenCalled();
  });
});
