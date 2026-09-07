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

  /**
   * Validates the accepted batch in order against a local, read-only shadow.
   * Nothing is written until Recorder receives the whole accepted batch.
   */
  async validateBatch(input: { worldId: string; proposals: ProposalV2[] }): Promise<{ valid: boolean; conflicts: HistoryConflict[] }> {
    const shadow = new Map<string, unknown>();
    const allDiffs = [];
    for (const proposal of input.proposals) {
      if (proposal.operation === 'CREATE_OBSERVED_HISTORY') continue;
      const projection = await this.projector.project(input.worldId, proposal, shadow);
      if (projection.supported) allDiffs.push(...projection.diffs);
    }
    // A batch is one atomic state transition. Validate the final projected value
    // for each canonical field, not an intermediate step Recorder never exposes.
    const finalDiffs = new Map<string, typeof allDiffs[number]>();
    for (const diff of allDiffs) finalDiffs.set(`${diff.entityType}:${diff.entityId}:${diff.fieldPath}`, diff);
    const conflicts = await HistoryConflictDetector.detectConflicts(input.worldId, [...finalDiffs.values()]);
    return { valid: conflicts.length === 0, conflicts };
  }

  static async validateProposalAgainstObservedHistory(worldId: string, proposal: ProposalV2): Promise<{ valid: boolean; conflicts: HistoryConflict[] }> {
    return new ObservedHistoryValidator().validate({ worldId, proposal });
  }
}
