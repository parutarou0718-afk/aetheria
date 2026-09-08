import { MemoryEpisodeRepository } from '../context/memoryEpisodeRepository';
import { NpcAutonomyRunRepository } from './npcAutonomyRunRepository';

/** Conservatively reconciles sidecars only when durable world evidence exists. */
export class RuntimeReconciliationService {
  static async reconcileWorld(worldId: string, currentEpoch: number): Promise<void> {
    const runs = await NpcAutonomyRunRepository.listNonTerminalRuns(worldId);
    for (const run of runs) {
      if (run.status === 'DECIDED' && await MemoryEpisodeRepository.hasAutonomyActionMemory(worldId, run.id)) {
        await NpcAutonomyRunRepository.updateRun(run.id, 'COMMITTED');
      } else if (run.epoch < currentEpoch) {
        await NpcAutonomyRunRepository.updateRun(run.id, 'FAILED', { errorCode: 'RECOVERED_STALE_AUTONOMY_RUN' });
      }
    }
  }
}
