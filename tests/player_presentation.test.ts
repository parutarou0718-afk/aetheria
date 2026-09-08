import { beforeEach, describe, expect, it } from 'vitest';
import { PlayerPresentationService } from '../src/application/player/playerPresentationService';
import { bootstrapWithDefaultWorld } from './helpers/worldFixture';
import { globalWorld, setRecorderWriteContext } from '../src/engine/worldState';

describe('PlayerPresentationService', () => {
  const worldId = 'player-presentation-world';
  const actorId = 'pc-player';

  beforeEach(async () => {
    await bootstrapWithDefaultWorld(worldId);
    setRecorderWriteContext(true);
    try {
      globalWorld.snapshot.world_creation_state = 'CREATED';
      const npc = globalWorld.characters.get('npc-elder')!;
      npc.goal.primary = 'PRIVATE_GOAL';
      npc.fear = 'PRIVATE_FEAR';
      npc.inventory = [{ item_id: 'private-item', name: 'PRIVATE_ITEM', quantity: 1, type: 'SECRET' }];
      npc.memory.compressed = 'PRIVATE_MEMORY';
      globalWorld.hiddenTruths.set('player-private-truth', {
        id: 'player-private-truth', title: 'PRIVATE_TRUTH', layer: 'layer_1_personal_secrets', layer_name: 'Secret', exists: true,
        true_nature: 'SUPER_SECRET', revealed: false, revealed_to_ids: [], locked_at_epoch: 1, never_changes: true,
        evidence_required: [], evidence_collected: [],
      });
    } finally { setRecorderWriteContext(false); }
  });

  it('projects a ready player world without private NPC or hidden-truth state', async () => {
    const result = await new PlayerPresentationService().getBootstrap({ worldId, actorId, aiAvailable: true });
    const serialized = JSON.stringify(result);

    expect(result.phase).toBe('READY');
    if (result.phase !== 'READY') throw new Error('Expected a ready player view.');
    expect(result.player.id).toBe(actorId);
    expect(result.player.capability.actionState).toBe('AVAILABLE');
    expect(result.visibleNpcs.every((npc) => npc.id !== 'npc-elder' || !('goal' in npc))).toBe(true);
    expect(result.travelOptions.every((option) => !('edgeId' in option))).toBe(true);
    expect(serialized).not.toContain('PRIVATE_GOAL');
    expect(serialized).not.toContain('PRIVATE_FEAR');
    expect(serialized).not.toContain('PRIVATE_ITEM');
    expect(serialized).not.toContain('PRIVATE_MEMORY');
    expect(serialized).not.toContain('SUPER_SECRET');
    expect(serialized).not.toContain('hiddenTruth');
  });

  it('returns NEEDS_GENESIS rather than a perpetual loading shape when no created world exists', async () => {
    setRecorderWriteContext(true);
    try {
      globalWorld.snapshot.world_creation_state = 'UNSELECTED';
      globalWorld.characters.clear();
    } finally { setRecorderWriteContext(false); }

    const result = await new PlayerPresentationService().getBootstrap({ worldId, actorId, aiAvailable: false });

    expect(result).toEqual(expect.objectContaining({ phase: 'NEEDS_GENESIS', aiAvailable: false }));
    expect('player' in result).toBe(false);
  });
});
