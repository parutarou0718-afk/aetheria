import type { Character } from '../../types';
import { NpcAutonomyEligibility } from './npcAutonomyEligibility';
import { NpcMobilityService } from './npcMobilityService';
import type { NpcAutonomousIntent } from './npcAutonomyIntent';
import type { NpcMobilityOption } from './npcAutonomyTypes';

export class NpcAutonomyIntentValidator {
  static async validate(input: { worldId: string; npc: Character | null; epoch: number; intent: NpcAutonomousIntent; expectedOriginLocationId?: string | null }): Promise<{ valid: boolean; code?: string; mobilityOption?: NpcMobilityOption }> {
    if (!NpcAutonomyEligibility.isEligible(input.npc, input.epoch)) return { valid: false, code: 'NPC_NOT_ELIGIBLE' };
    if (input.intent.action === 'MOVE') {
      if (!input.expectedOriginLocationId || input.npc?.location_id !== input.expectedOriginLocationId) return { valid: false, code: 'NPC_ORIGIN_STALE' };
      const destinationLocationId = input.intent.destinationLocationId;
      const options = await NpcMobilityService.getOptions(input.worldId, input.npc!);
      const mobilityOption = options.find(option => option.locationId === destinationLocationId);
      if (!mobilityOption) return { valid: false, code: 'NPC_DESTINATION_UNAVAILABLE' };
      return { valid: true, mobilityOption };
    }
    return { valid: true };
  }
}
