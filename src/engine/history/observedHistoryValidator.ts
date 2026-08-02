import { StateChangeProposal } from '../recorder/changeSchemas';
import { HistoryConflictDetector } from './historyConflictDetector';
import { HistoryConflict } from './observedHistoryTypes';

export class ObservedHistoryValidator {
  static async validateProposalAgainstObservedHistory(
    worldId: string,
    proposal: StateChangeProposal,
    beforeState?: Record<string, any>
  ): Promise<{
    valid: boolean;
    conflicts: HistoryConflict[];
  }> {
    const conflicts = await HistoryConflictDetector.detectConflicts(
      worldId,
      proposal,
      beforeState
    );

    return {
      valid: conflicts.length === 0,
      conflicts,
    };
  }
}
