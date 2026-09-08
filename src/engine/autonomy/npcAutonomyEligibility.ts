import type { Character } from '../../types';
import { CapabilitySnapshotService } from '../capability/capabilitySnapshot';

export class NpcAutonomyEligibility {
  static isEligible(character: Character | null | undefined, epoch: number): boolean {
    if (!character || character.type !== 'NPC' || character.frozen || character.current_transaction_id) return false;
    if (CapabilitySnapshotService.fromCharacter(character).actionState !== 'AVAILABLE') return false;
    const action = character.current_action;
    return !action || action.estimated_end_epoch <= epoch || action.type === 'WAIT' || action.type === 'NONE';
  }
}
