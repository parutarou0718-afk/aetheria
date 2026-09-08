import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CapabilityEvaluator } from '../src/engine/capability/capabilityEvaluator';
import { CapabilitySnapshotService } from '../src/engine/capability/capabilitySnapshot';
import { CapabilityValidator } from '../src/engine/capability/capabilityValidator';
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
    const committer = { commit: vi.fn().mockResolvedValue({ success: true, errors: [], committedCount: 1, appliedProposalIds: [], proposalResults: [], eventsGenerated: [], epoch: 1 }) };
    const pipeline = new ProposalPipeline(committer as any, { validate: vi.fn().mockResolvedValue({ valid: true, violations: [] }) }, { validate: vi.fn().mockResolvedValue({ valid: true, violations: [] }) });
    const forged = await pipeline.processAndCommit({ worldId, proposals: [base({ payload: { attributes: { strength: 999 } } })] });
    expect(forged.rejected).toEqual([expect.objectContaining({ code: 'PROPOSAL_CAPABILITY_VIOLATION', capabilityReason: 'ACTOR_STATE_MUTATION_FORBIDDEN' })]);
    const numeric = await pipeline.processAndCommit({ worldId, proposals: [base({ operation: 'UPDATE_CHARACTER_ATTRIBUTES', payload: { characterId: 'pc-player', hpDelta: -1 } })] });
    expect(numeric.rejected).toEqual([expect.objectContaining({ code: 'PROPOSAL_CAPABILITY_VIOLATION', capabilityReason: 'DIRECT_NUMERIC_MUTATION_FORBIDDEN' })]);
    expect(committer.commit).not.toHaveBeenCalled();
  });

  it('requires a trusted actorId for mechanical ACTOR proposals instead of inferring a target actor', async () => {
    const target = (await WorldRepository.getCharacter(worldId, 'npc-elder'))!;
    const before = target.attributes.hp;
    const committer = { commit: vi.fn().mockResolvedValue({ success: true, errors: [], committedCount: 1, appliedProposalIds: [], proposalResults: [], eventsGenerated: [], epoch: 1 }) };
    const result = await new ProposalPipeline(committer as any).processAndCommit({ worldId, proposals: [base({
      operation: 'APPLY_SEMANTIC_EFFECT', actorId: undefined, entityId: 'npc-elder', payload: {},
      semanticEffect: { type: 'DAMAGE', magnitude: 'LIGHT', resource: 'HP', targetEntityId: 'npc-elder' },
    })] });
    expect(result.rejected).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'PROPOSAL_CAPABILITY_VIOLATION', capabilityReason: 'ACTOR_ID_REQUIRED' })]));
    expect(committer.commit).not.toHaveBeenCalled();
    expect((await WorldRepository.getCharacter(worldId, 'npc-elder'))!.attributes.hp).toBe(before);
  });

  it('does not let a caller forge semantic provenance on raw numeric changes', async () => {
    const actor = (await WorldRepository.getCharacter(worldId, 'pc-player'))!;
    const committer = { commit: vi.fn().mockResolvedValue({ success: true, errors: [], committedCount: 1, appliedProposalIds: [], proposalResults: [], eventsGenerated: [], epoch: 1 }) };
    const pipeline = new ProposalPipeline(committer as any);
    const gold = await pipeline.processAndCommit({ worldId, proposals: [base({ operation: 'CHANGE_RESOURCE', payload: { characterId: 'pc-player', goldDelta: 999999 }, semanticEffect: { type: 'RESOURCE_GAIN', magnitude: 'LIGHT', resource: 'GOLD', targetEntityId: 'pc-player' } })] });
    const hp = await pipeline.processAndCommit({ worldId, proposals: [base({ operation: 'UPDATE_CHARACTER_ATTRIBUTES', payload: { characterId: 'pc-player', hpDelta: 999999 }, semanticEffect: { type: 'RECOVERY', magnitude: 'LIGHT', resource: 'HP', targetEntityId: 'pc-player' } })] });
    expect(gold.rejected).toEqual([expect.objectContaining({ code: 'PROPOSAL_CAPABILITY_VIOLATION', capabilityReason: 'DIRECT_NUMERIC_MUTATION_FORBIDDEN' })]);
    expect(hp.rejected).toEqual([expect.objectContaining({ code: 'PROPOSAL_CAPABILITY_VIOLATION', capabilityReason: 'DIRECT_NUMERIC_MUTATION_FORBIDDEN' })]);
    expect((await WorldRepository.getCharacter(worldId, 'pc-player'))!).toMatchObject({ resources: { gold: actor.resources.gold }, attributes: { hp: actor.attributes.hp } });
  });

  it('accepts only ParameterResolver-produced semantic resource and recovery amounts', async () => {
    const actor = (await WorldRepository.getCharacter(worldId, 'pc-player'))!;
    const result = await new ProposalPipeline().processAndCommit({ worldId, proposals: [
      base({ operation: 'APPLY_SEMANTIC_EFFECT', payload: { goldDelta: 999999 }, semanticEffect: { type: 'RESOURCE_GAIN', magnitude: 'LIGHT', resource: 'GOLD', targetEntityId: 'pc-player' } }),
      base({ operation: 'APPLY_SEMANTIC_EFFECT', payload: { hpDelta: 999999 }, semanticEffect: { type: 'RECOVERY', magnitude: 'LIGHT', resource: 'HP', targetEntityId: 'pc-player' } }),
    ] });
    expect(result.success).toBe(true);
    expect(result.accepted).toEqual(expect.arrayContaining([
      expect.objectContaining({ operation: 'CHANGE_RESOURCE', payload: { characterId: 'pc-player', goldDelta: 10 } }),
      expect.objectContaining({ operation: 'UPDATE_CHARACTER_ATTRIBUTES', payload: { characterId: 'pc-player', hpDelta: 5 } }),
    ]));
    expect((await WorldRepository.getCharacter(worldId, 'pc-player'))!).toMatchObject({ resources: { gold: actor.resources.gold + 10 }, attributes: { hp: actor.attributes.hp } });
  });

  it('rejects an ACTOR semantic MP cost that exceeds the actor resource before Recorder', async () => {
    const actor = globalWorld.characters.get('pc-player')!;
    setRecorderWriteContext(true);
    try { actor.attributes.mp = 10; } finally { setRecorderWriteContext(false); }
    await WorldRepository.saveCharacter(worldId, actor);
    const committer = { commit: vi.fn() };
    const result = await new ProposalPipeline(committer as any).processAndCommit({ worldId, proposals: [base({
      operation: 'APPLY_SEMANTIC_EFFECT', payload: {},
      semanticEffect: { type: 'RESOURCE_COST', magnitude: 'HEAVY', resource: 'MP', targetEntityId: 'pc-player' },
    })] });
    expect(result.rejected).toEqual([expect.objectContaining({ code: 'PROPOSAL_CAPABILITY_VIOLATION', capabilityReason: 'RESOURCE_INSUFFICIENT' })]);
    expect(committer.commit).not.toHaveBeenCalled();
  });

  it('keeps a SYSTEM environmental semantic effect legal without an actorId', async () => {
    const actor = globalWorld.characters.get('pc-player')!;
    setRecorderWriteContext(true);
    try { actor.attributes.hp = 50; } finally { setRecorderWriteContext(false); }
    await WorldRepository.saveCharacter(worldId, actor);
    const result = await new ProposalPipeline().processAndCommit({ worldId, proposals: [base({
      authorityLevel: 'SYSTEM', source: { type: 'SYSTEM' }, actorId: undefined,
      causalBasis: [{ type: 'SYSTEM_EVENT', description: 'A deterministic environmental recovery occurs.' }],
      operation: 'APPLY_SEMANTIC_EFFECT', payload: {},
      semanticEffect: { type: 'RECOVERY', magnitude: 'LIGHT', resource: 'HP', targetEntityId: 'pc-player' },
    })] });
    expect(result.success).toBe(true);
    expect((await WorldRepository.getCharacter(worldId, 'pc-player'))!.attributes.hp).toBe(55);
  });

  it('allows ACTOR name/title edits only on the trusted actor', async () => {
    const own = await new ProposalPipeline().processAndCommit({ worldId, proposals: [base({ payload: { name: 'Self rename' } })] });
    const other = await new ProposalPipeline().processAndCommit({ worldId, proposals: [base({ entityId: 'npc-elder', payload: { name: 'Forged rename' } })] });
    expect(own.success).toBe(true);
    expect(other.rejected).toEqual([expect.objectContaining({ code: 'PROPOSAL_CAPABILITY_VIOLATION', capabilityReason: 'ACTOR_STATE_MUTATION_FORBIDDEN' })]);
  });

  it('treats an ineligible empty assessment as a failure', async () => {
    const evaluator = { evaluate: vi.fn().mockResolvedValue({ eligible: false, failures: [] }) };
    const result = await new (CapabilityValidator as any)(evaluator).validate({ worldId, proposal: base({ capabilityRequirements: [{ type: 'ACTIVE_CHARACTER' }] }) });
    expect(result.valid).toBe(false);
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
