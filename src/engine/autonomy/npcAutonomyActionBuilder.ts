import { createStateChangeProposal } from '../proposal/proposalFactory';
import type { ProposalV2 } from '../proposal/proposalSchema';
import { TransactionService } from '../timeline/transactionService';
import type { Character } from '../../types';
import type { NpcAutonomousIntent } from './npcAutonomyIntent';
import type { NpcAutonomyBuild, NpcMobilityOption } from './npcAutonomyTypes';

const durations: Record<string, number> = { WAIT: 1, WORK: 2, INVESTIGATE: 2, PATROL: 2, GUARD: 2 };
const actionType: Record<string, string> = { WAIT: 'WAIT', WORK: 'WORK', INVESTIGATE: 'WORK', PATROL: 'WORK', GUARD: 'WORK' };

export class NpcAutonomyActionBuilder {
  static async build(input: { worldId: string; npc: Character; epoch: number; runId: string; intent: NpcAutonomousIntent; mobilityOption?: NpcMobilityOption }): Promise<NpcAutonomyBuild> {
    const causalBasis = [{ type: 'ENTITY_STATE' as const, id: input.npc.id, entityType: 'CHARACTER', description: 'NPC autonomous action selected from current goal and observed context.' }];
    if (input.intent.action === 'MOVE') {
      if (!input.mobilityOption || input.mobilityOption.locationId !== input.intent.destinationLocationId || !input.npc.location_id) throw new Error('NPC_DESTINATION_UNAVAILABLE');
      const plan = await TransactionService.buildTravelPlanProposals({ worldId: input.worldId, actorId: input.npc.id, destinationLocationId: input.intent.destinationLocationId, startEpoch: input.epoch, routeConstraint: { kind: 'DIRECT_EDGE', edgeId: input.mobilityOption.edgeId, originLocationId: input.npc.location_id, destinationLocationId: input.intent.destinationLocationId } });
      const destination = input.intent.destinationLocationId;
      const memory = this.memoryProposal(input, `I began traveling toward ${destination}.`, [input.npc.id, input.npc.location_id ?? '', destination]);
      return { intentAction: 'MOVE', summary: `Move toward ${destination}.`, proposals: [...plan.proposals.map(proposal => createStateChangeProposal({ ...proposal, reason: 'Execute approved NPC autonomous travel transaction.', causalBasis: [{ type: 'SYSTEM_EVENT', description: 'Trusted NPC autonomy travel initiation.' }], authorityLevel: 'SYSTEM', confidence: 1 })), memory] };
    }
    const activity = input.intent.action === 'WAIT' ? 'WAIT' : input.intent.activity;
    const description = input.intent.action === 'WAIT' ? 'Wait briefly.' : input.intent.description;
    const action = { type: actionType[activity], description, started_at_epoch: input.epoch, estimated_end_epoch: input.epoch + durations[activity] };
    const actorProposal = createStateChangeProposal({ id: `prop-npc-autonomy-action-${input.runId}`, operation: 'SET_CHARACTER_ACTION', entityType: 'CHARACTER', entityId: input.npc.id, actorId: input.npc.id, payload: { characterId: input.npc.id, action }, effectiveEpoch: input.epoch, preconditions: [], source: { type: 'LLM', id: 'npcAutonomy' }, reason: 'NPC autonomous action selected during wake processing.', causalBasis, authorityLevel: 'ACTOR', confidence: 1 });
    const memory = this.memoryProposal(input, activity === 'WAIT' ? 'I waited and watched the current scene.' : `I started ${description}`, [input.npc.id, input.npc.location_id ?? '']);
    return { intentAction: input.intent.action, summary: description, proposals: [actorProposal, memory] };
  }
  private static memoryProposal(input: { worldId: string; npc: Character; epoch: number; runId: string }, text: string, entityIds: string[]): ProposalV2 {
    return createStateChangeProposal({ id: `prop-npc-autonomy-memory-${input.runId}`, operation: 'APPEND_MEMORY_EPISODE', entityType: 'MEMORY_EPISODE', entityId: `episode-npc-autonomy-${input.runId}`, payload: { episode: { id: `episode-npc-autonomy-${input.runId}`, observerType: 'CHARACTER', observerId: input.npc.id, episodeType: 'ACTION', text, importance: 3, epoch: input.epoch, locationId: input.npc.location_id, participantIds: [input.npc.id], entityIds: entityIds.filter(Boolean), sourceType: 'NPC_AUTONOMY', sourceId: input.runId } }, effectiveEpoch: input.epoch, preconditions: [], source: { type: 'SYSTEM', id: 'npcAutonomy' }, reason: 'Record a committed NPC autonomous action memory.', causalBasis: [{ type: 'ENTITY_STATE', id: input.npc.id, entityType: 'CHARACTER', description: 'NPC action memory follows a committed autonomous action.' }], authorityLevel: 'SYSTEM', confidence: 1 });
  }
}
