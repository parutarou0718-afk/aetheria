import { StateChangeProposal } from './recorder/changeSchemas';
import { Character } from '../types';
import { TransactionService } from './timeline/transactionService';
import { PreparedTravelPlan } from './timeline/transactionService';

export type TravelPlannerFn = (args: {
  worldId: string;
  actorId: string;
  destinationLocationId: string;
  startEpoch: number;
}) => Promise<PreparedTravelPlan>;

/**
 * Default travel planner — the real `TransactionService` proposal builder.
 */
export const defaultTravelPlanner: TravelPlannerFn = (args) =>
  TransactionService.buildTravelPlanProposals(args);

interface AppendTravelArgs {
  worldId: string;
  pc: Character;
  targetLocationId: string;
  epoch: number;
  proposals: StateChangeProposal[];
  updatesSummary: string[];
  /** Injectable for tests — defaults to TransactionService.buildTravelPlanProposals. */
  buildPlanner?: TravelPlannerFn;
  /** Injectable for tests — resolve a location's display name. */
  resolveLocationName?: (id: string) => string | undefined;
}

/**
 * Apply a location move requested by the DM's parsed output.
 *
 * [P0-1] On planning failure this MUST NOT silently teleport the actor: no
 * fabricated success narrative, no mutated location/presence/transaction, and
 * crucially NO `MOVE_CHARACTER` proposal. The failure is surfaced as a
 * `⚠️ 无法前往…未执行移动` summary line instead.
 *
 * Extracted as a testable helper so the DM path can be unit-tested by injecting
 * a planner that throws, without any live model or DB writes.
 */
export async function appendDMTravelProposals(args: AppendTravelArgs): Promise<void> {
  const {
    worldId,
    pc,
    targetLocationId,
    epoch,
    proposals,
    updatesSummary,
    buildPlanner = defaultTravelPlanner,
    resolveLocationName = (id) => undefined,
  } = args;

  const locName = resolveLocationName(targetLocationId) || targetLocationId;

  try {
    const travelPlan = await buildPlanner({
      worldId,
      actorId: pc.id,
      destinationLocationId: targetLocationId,
      startEpoch: epoch,
    });
    proposals.push(...travelPlan.proposals);
    updatesSummary.push(`📍 开启旅程: 【${locName}】(预计耗时 ${travelPlan.totalEpochs} 周期)`);
  } catch (err: unknown) {
    // [P0-1] Do not fabricate a successful move, do not mutate location/presence/transaction.
    const message = err instanceof Error ? err.message : String(err);
    // eslint-disable-next-line no-console
    console.warn('[DMTravel] buildTravelPlanProposals failed:', message);
    updatesSummary.push(`⚠️ 无法前往【${locName}】：当前不存在连通路线或目标不可达。未执行移动。`);
  }
}
