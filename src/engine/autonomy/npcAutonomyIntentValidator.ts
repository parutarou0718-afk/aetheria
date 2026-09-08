import type { Character } from '../../types';
import { NpcAutonomyEligibility } from './npcAutonomyEligibility';
import { NpcMobilityService } from './npcMobilityService';
import type { NpcAutonomousIntent } from './npcAutonomyIntent';

export class NpcAutonomyIntentValidator {
  static async validate(input: { worldId: string; npc: Character | null; epoch: number; intent: NpcAutonomousIntent }): Promise<{ valid: boolean; code?: string }> {
    if (!NpcAutonomyEligibility.isEligible(input.npc, input.epoch)) return { valid: false, code: 'NPC_NOT_ELIGIBLE' };
    if (input.intent.action === 'MOVE') {
      const destinationLocationId = input.intent.destinationLocationId;
      const options = await NpcMobilityService.getOptions(input.worldId, input.npc!);
      if (!options.some(option => option.locationId === destinationLocationId)) return { valid: false, code: 'NPC_DESTINATION_UNAVAILABLE' };
    }
    return { valid: true };
  }
}
