import { beforeEach, describe, expect, it } from 'vitest';
import { dbManager } from '../src/engine/persistence/database';
import { ObservationService } from '../src/engine/history/observationService';
import { bootstrapWithDefaultWorld } from './helpers/worldFixture';

const worldId = 'observation-service';
describe('ObservationService', () => {
  beforeEach(async () => { await dbManager.initialize(); await bootstrapWithDefaultWorld(worldId); });
  it('creates strict v2, system-owned proposals and reads approved dot paths safely', async () => {
    const proposals = await ObservationService.observeCharacter({
      worldId, observerType: 'CHARACTER', observerId: 'npc-elder', subjectType: 'CHARACTER', subjectId: 'pc-player',
      observationType: 'DIRECT_INTERACTION', observedEpoch: 1, factPaths: ['attributes.hp', 'resources.gold', 'constructor.prototype'],
    });
    expect(proposals).toEqual(expect.arrayContaining([
      expect.objectContaining({ operation: 'CREATE_OBSERVED_HISTORY', authorityLevel: 'SYSTEM', reason: expect.any(String), causalBasis: expect.any(Array), payload: expect.objectContaining({ factPath: 'attributes.hp' }) }),
      expect.objectContaining({ payload: expect.objectContaining({ factPath: 'resources.gold' }) }),
    ]));
    expect(proposals.some((proposal) => proposal.payload.factPath === 'constructor.prototype')).toBe(false);
  });

  it('marks dialogue statements as claims rather than confirmed world truth', () => {
    const proposal = ObservationService.observeDialogueStatement({
      worldId, observerType: 'CHARACTER', observerId: 'npc-elder', speakerId: 'pc-player', statement: 'Trust me.', observedEpoch: 1,
    });
    expect(proposal.payload).toMatchObject({ factPath: 'dialogue.statement', observationType: 'DIALOGUE_STATEMENT', metadata: { epistemic_status: 'CLAIM' } });
  });
});
