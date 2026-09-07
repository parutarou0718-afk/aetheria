import { beforeEach, describe, expect, it } from 'vitest';
import { StateFieldDiffProjector } from '../src/engine/history/stateFieldDiffProjector';
import type { ProposalV2 } from '../src/engine/proposal/proposalSchema';
import { WorldRepository } from '../src/engine/world/worldRepository';
import { bootstrapWithDefaultWorld } from './helpers/worldFixture';

const worldId = 'state-field-diff-projector';

function proposal(overrides: Partial<ProposalV2>): ProposalV2 {
  return {
    id: `diff-${Math.random()}`,
    operation: 'UPDATE_CHARACTER',
    entityType: 'CHARACTER',
    entityId: 'pc-player',
    payload: {},
    effectiveEpoch: 2,
    preconditions: [],
    source: { type: 'SYSTEM' },
    reason: 'Project a canonical state diff.',
    causalBasis: [{ type: 'SYSTEM_EVENT', description: 'Project a state transition.' }],
    authorityLevel: 'SYSTEM',
    ...overrides,
  };
}

describe('StateFieldDiffProjector', () => {
  beforeEach(async () => {
    await bootstrapWithDefaultWorld(worldId);
  });

  it('projects MOVE_CHARACTER to canonical location_id', async () => {
    const before = (await WorldRepository.getCharacter(worldId, 'pc-player'))!.location_id;
    const result = await new StateFieldDiffProjector().project(worldId, proposal({
      operation: 'MOVE_CHARACTER', payload: { characterId: 'pc-player', targetLocationId: 'loc-dawnfall' },
    }));

    expect(result).toEqual({
      supported: true,
      diffs: [expect.objectContaining({ fieldPath: 'location_id', beforeValue: before, afterValue: 'loc-dawnfall' })],
    });
  });

  it('projects HP and MP deltas using Recorder clamp semantics', async () => {
    const character = (await WorldRepository.getCharacter(worldId, 'pc-player'))!;
    const result = await new StateFieldDiffProjector().project(worldId, proposal({
      operation: 'UPDATE_CHARACTER_ATTRIBUTES', payload: { characterId: 'pc-player', hpDelta: -15, mpDelta: 9999 },
    }));

    expect(result.diffs).toEqual(expect.arrayContaining([
      expect.objectContaining({ fieldPath: 'attributes.hp', beforeValue: character.attributes.hp, afterValue: character.attributes.hp - 15 }),
      expect.objectContaining({ fieldPath: 'attributes.mp', beforeValue: character.attributes.mp, afterValue: character.attributes.max_mp }),
    ]));
  });

  it('projects CHANGE_RESOURCE gold to canonical resources.gold', async () => {
    const before = (await WorldRepository.getCharacter(worldId, 'pc-player'))!.resources.gold;
    const result = await new StateFieldDiffProjector().project(worldId, proposal({
      operation: 'CHANGE_RESOURCE', payload: { characterId: 'pc-player', goldDelta: -50 },
    }));

    expect(result.diffs).toEqual([
      expect.objectContaining({ fieldPath: 'resources.gold', beforeValue: before, afterValue: before - 50 }),
    ]);
  });

  it('projects UPDATE_LOCATION status to its canonical field', async () => {
    const before = (await WorldRepository.getLocation(worldId, 'loc-tavern'))!.status;
    const result = await new StateFieldDiffProjector().project(worldId, proposal({
      operation: 'UPDATE_LOCATION', entityType: 'LOCATION', entityId: 'loc-tavern', payload: { locationId: 'loc-tavern', status: 'DESTROYED' },
    }));

    expect(result.diffs).toEqual([
      expect.objectContaining({ fieldPath: 'status', beforeValue: before, afterValue: 'DESTROYED' }),
    ]);
  });

  it('leaves unsupported operations outside the history projection surface', async () => {
    await expect(new StateFieldDiffProjector().project(worldId, proposal({
      operation: 'REGISTER_WAKE_SIGNAL', entityType: 'EVENT', entityId: 'event-1', payload: {},
    }))).resolves.toEqual({ supported: false, diffs: [] });
  });
});
