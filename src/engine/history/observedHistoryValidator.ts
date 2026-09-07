import type { ProposalV2 } from '../proposal/proposalSchema';
import { HistoryConflictDetector } from './historyConflictDetector';
import { StateFieldDiffProjector } from './stateFieldDiffProjector';
import { HistoryConflict } from './observedHistoryTypes';

export class ObservedHistoryValidator {
  constructor(private readonly projector = new StateFieldDiffProjector()) {}

  async validate(input: { worldId: string; proposal: ProposalV2 }): Promise<{ valid: boolean; conflicts: HistoryConflict[] }> {
    // Observation writes are append-only records, not canonical world-state changes.
    if (input.proposal.operation === 'CREATE_OBSERVED_HISTORY') return { valid: true, conflicts: [] };
    const projection = await this.projector.project(input.worldId, input.proposal);
    if (!projection.supported || projection.diffs.length === 0) return { valid: true, conflicts: [] };
    const conflicts = await HistoryConflictDetector.detectConflicts(input.worldId, projection.diffs);

    return {
      valid: conflicts.length === 0,
      conflicts,
    };
  }

  static async validateProposalAgainstObservedHistory(worldId: string, proposal: ProposalV2): Promise<{ valid: boolean; conflicts: HistoryConflict[] }> {
    return new ObservedHistoryValidator().validate({ worldId, proposal });
  }
}
