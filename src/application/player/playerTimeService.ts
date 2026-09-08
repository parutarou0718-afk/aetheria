import { SchedulerEngine } from '../../engine/scheduler';
import { CausalityEngine } from '../../engine/causality';

/** One public request advances exactly one authoritative epoch. */
export class PlayerTimeService {
  public async advance(worldId: string): Promise<{ newEpoch: number; visibleSummary?: string; warnings?: string[] }> {
    const result = await SchedulerEngine.processEpochTick(worldId);
    if (!result.committed) throw new Error('EPOCH_COMMIT_FAILED');
    try {
      const seedEvents = await CausalityEngine.tickSeeds();
      return { newEpoch: result.epoch, visibleSummary: seedEvents.length ? 'The world continues to change.' : undefined, warnings: result.warnings.length ? result.warnings : undefined };
    } catch {
      return { newEpoch: result.epoch, visibleSummary: 'Time advanced, but some world processing will continue later.', warnings: [...result.warnings, 'Causality processing was deferred after the epoch committed.'] };
    }
  }
}
