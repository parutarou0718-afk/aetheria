import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProposalPipeline } from '../src/engine/proposal/proposalPipeline';
import type { ProposalV2 } from '../src/engine/proposal/proposalSchema';
import { WorldRepository } from '../src/engine/world/worldRepository';
import { globalWorld, setRecorderWriteContext } from '../src/engine/worldState';
import { bootstrapWithDefaultWorld } from './helpers/worldFixture';

const worldId = 'world-rule-pipeline-integration';

function proposal(overrides: Partial<ProposalV2> = {}): ProposalV2 {
  return {
    id: `rule-proposal-${Math.random()}`,
    operation: 'MOVE_CHARACTER',
    entityType: 'CHARACTER',
    entityId: 'pc-player',
    payload: { characterId: 'pc-player', targetLocationId: 'loc-dawnfall' },
    effectiveEpoch: 1,
    preconditions: [],
    source: { type: 'PLAYER_ACTION' },
    reason: 'The player attempts to travel through a known route.',
    causalBasis: [{ type: 'PLAYER_ACTION', description: 'Travel request.' }],
    authorityLevel: 'ACTOR',
    ...overrides,
  };
}

function committer() {
  return {
    commit: vi.fn().mockResolvedValue({
      success: true,
      errors: [],
      committedCount: 1,
      appliedProposalIds: [],
      proposalResults: [],
      eventsGenerated: [],
      epoch: 1,
    }),
  };
}

describe('default world rules in the proposal pipeline', () => {
  beforeEach(async () => {
    await bootstrapWithDefaultWorld(worldId);
  });

  it('allows a connected, accessible route and commits only after validation', async () => {
    const target = committer();
    const result = await new ProposalPipeline(target).processAndCommit({ worldId, proposals: [proposal()] });
    expect(result.success).toBe(true);
    expect(target.commit).toHaveBeenCalledOnce();
  });

  it('rejects a missing target entity before Recorder', async () => {
    const target = committer();
    const result = await new ProposalPipeline(target).processAndCommit({
      worldId,
      proposals: [proposal({ operation: 'UPDATE_CHARACTER', entityId: 'missing-character', payload: { characterId: 'missing-character', name: 'Nobody' } })],
    });
    expect(result.rejected).toEqual([expect.objectContaining({ code: 'PROPOSAL_RULE_VIOLATION', ruleType: 'ENTITY_MUST_EXIST' })]);
    expect(target.commit).not.toHaveBeenCalled();
  });

  it('rejects dead actor travel without committing', async () => {
    const player = globalWorld.characters.get('pc-player')!;
    setRecorderWriteContext(true);
    try {
      player.status = 'DEAD';
    } finally {
      setRecorderWriteContext(false);
    }
    await WorldRepository.saveCharacter(worldId, player);

    const target = committer();
    const result = await new ProposalPipeline(target).processAndCommit({ worldId, proposals: [proposal()] });
    expect(result.rejected).toEqual([expect.objectContaining({ ruleType: 'DEAD_CHARACTER_CANNOT_ACT' })]);
    expect(target.commit).not.toHaveBeenCalled();
  });

  it('rejects negative gold without mutating the authoritative character', async () => {
    const player = globalWorld.characters.get('pc-player')!;
    const startingGold = player.resources.gold;
    const target = committer();
    const result = await new ProposalPipeline(target).processAndCommit({
      worldId,
      proposals: [proposal({ operation: 'CHANGE_RESOURCE', payload: { characterId: 'pc-player', goldDelta: -(startingGold + 1) }, authorityLevel: 'SYSTEM' })],
    });
    expect(result.rejected).toEqual([expect.objectContaining({ ruleType: 'RESOURCE_NON_NEGATIVE' })]);
    expect(target.commit).not.toHaveBeenCalled();
    expect((await WorldRepository.getCharacter(worldId, 'pc-player'))?.resources.gold).toBe(startingGold);
  });

  it('rejects travel when the destination has no route from the current location', async () => {
    const destination = { ...globalWorld.locations.get('loc-dawnfall')!, id: 'loc-isolated', name: 'Isolated Place', connected_to: [] };
    setRecorderWriteContext(true);
    try {
      globalWorld.locations.set(destination.id, destination);
    } finally {
      setRecorderWriteContext(false);
    }
    await WorldRepository.saveLocation(worldId, destination);

    const target = committer();
    const result = await new ProposalPipeline(target).processAndCommit({
      worldId,
      proposals: [proposal({ payload: { characterId: 'pc-player', targetLocationId: destination.id } })],
    });
    expect(result.rejected).toEqual([expect.objectContaining({ ruleType: 'TRAVEL_REQUIRES_ROUTE' })]);
    expect(target.commit).not.toHaveBeenCalled();
  });

  it('rejects travel to a blocked destination even when a route exists', async () => {
    const destination = globalWorld.locations.get('loc-dawnfall')!;
    setRecorderWriteContext(true);
    try {
      destination.status = 'BLOCKED';
    } finally {
      setRecorderWriteContext(false);
    }
    await WorldRepository.saveLocation(worldId, destination);

    const target = committer();
    const result = await new ProposalPipeline(target).processAndCommit({ worldId, proposals: [proposal()] });
    expect(result.rejected).toEqual([expect.objectContaining({ ruleType: 'LOCATION_ACCESS_VALID' })]);
    expect(target.commit).not.toHaveBeenCalled();
  });

  it('rejects a resolved heavy gold cost before Recorder when funds are insufficient', async () => {
    const target = committer();
    const result = await new ProposalPipeline(target).processAndCommit({
      worldId,
      proposals: [proposal({
        operation: 'APPLY_SEMANTIC_EFFECT',
        payload: {},
        semanticEffect: { type: 'RESOURCE_COST', magnitude: 'HEAVY', resource: 'GOLD', targetEntityId: 'pc-player' },
      })],
    });
    expect(result.rejected).toEqual([expect.objectContaining({ code: 'PROPOSAL_RULE_VIOLATION', ruleType: 'RESOURCE_NON_NEGATIVE' })]);
    expect(target.commit).not.toHaveBeenCalled();
  });

  it('validates a repository-backed FACT causal reference before committing', async () => {
    const fact = { ...globalWorld.facts.get('fact-1')!, id: `${worldId}-causal-fact` };
    await WorldRepository.saveFact(worldId, fact);
    const target = committer();
    const result = await new ProposalPipeline(target).processAndCommit({
      worldId,
      proposals: [proposal({ causalBasis: [{ type: 'FACT', id: fact.id, description: 'A persisted world fact supports the action.' }] })],
    });
    expect(result.success).toBe(true);
    expect(target.commit).toHaveBeenCalledOnce();
  });
});
