import { SchedulerEngine } from '../../engine/scheduler';
import { CausalityEngine } from '../../engine/causality';

/** One public request advances exactly one authoritative epoch. */
export class PlayerTimeService {
  public async advance(worldId: string): Promise<{ newEpoch: number; visibleSummary?: string }> {
    const result = await SchedulerEngine.processEpochTick(worldId);
    const seedEvents = await CausalityEngine.tickSeeds();
    return { newEpoch: result.epoch, visibleSummary: seedEvents.length ? 'The world continues to change.' : undefined };
  }
}
