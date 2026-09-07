import type { Location } from '../../types';
import type { GameRequestContext } from '../../application/gameRequestContext';
import { globalWorld } from '../worldState';
import { createStateChangeProposal } from '../proposal/proposalFactory';
import type { ProposalV2 } from '../proposal/proposalSchema';
import { TransactionService } from '../timeline/transactionService';
import type { DmResolutionIntent } from './dmResolutionIntent';

export interface DmProposalBuildResult {
  proposals: ProposalV2[];
  timelineExecutionProposals: ProposalV2[];
  updatesSummary: string[];
}

export class DmProposalBuilder {
  public static async build(input: { context: GameRequestContext; playerActionText: string; resolution: DmResolutionIntent; currentEpoch: number }): Promise<DmProposalBuildResult> {
    const { context, playerActionText, resolution, currentEpoch } = input;
    const pc = globalWorld.characters.get(context.actorId);
    const proposals: ProposalV2[] = [];
    const timelineExecutionProposals: ProposalV2[] = [];
    const updatesSummary: string[] = [];
    const actorEnvelope = {
      effectiveEpoch: currentEpoch, source: { type: 'LLM' as const, id: 'dmEngine' },
      reason: `Resolve player action: ${playerActionText}`,
      causalBasis: [{ type: 'PLAYER_ACTION' as const, description: playerActionText }], authorityLevel: 'ACTOR' as const,
      confidence: 1,
    };

    if (pc && resolution.characterUpdate) {
      proposals.push(createStateChangeProposal({ id: `prop-char-${crypto.randomUUID()}`, operation: 'UPDATE_CHARACTER', entityType: 'CHARACTER', entityId: pc.id, payload: resolution.characterUpdate, ...actorEnvelope }));
      updatesSummary.push('Character details updated.');
    }

    let targetLocationId = resolution.targetLocationId ?? undefined;
    if (resolution.newLocation) {
      const newLocId = resolution.newLocation.id || `loc-dyn-${crypto.randomUUID()}`;
      const connectedLocs = resolution.newLocation.connectedTo?.length ? resolution.newLocation.connectedTo : [pc?.location_id || 'loc-start'];
      const location: Location = {
        id: newLocId, name: resolution.newLocation.name, type: resolution.newLocation.type === 'RUINS' ? 'RUIN' : (resolution.newLocation.type || 'TOWN'), description: resolution.newLocation.description || 'A newly discovered location.',
        connected_to: connectedLocs, child_ids: [], population: 80, population_trend: 'STABLE', economy: { primary_industry: 'TRADE', wealth_level: 3, trade_goods: [], trade_routes: [] }, security: { guard_presence: 40, crime_rate: 30 }, active_events: [], features: [], frozen: false, simulation_level: 3, last_simulated_epoch: currentEpoch, created_at_epoch: currentEpoch, updated_at_epoch: currentEpoch,
      };
      proposals.push(createStateChangeProposal({ id: `prop-newloc-${crypto.randomUUID()}`, operation: 'CREATE_LOCATION', entityType: 'LOCATION', entityId: newLocId, payload: { location }, ...actorEnvelope }));
      for (const existingLocId of connectedLocs) proposals.push(createStateChangeProposal({ id: `prop-conn-${crypto.randomUUID()}`, operation: 'CONNECT_LOCATIONS', entityType: 'LOCATION', payload: { locationIdA: existingLocId, locationIdB: newLocId }, ...actorEnvelope }));
      if (pc) proposals.push(createStateChangeProposal({ id: `prop-knowloc-${crypto.randomUUID()}`, operation: 'UPDATE_CHARACTER_KNOWLEDGE', entityType: 'CHARACTER', entityId: pc.id, payload: { characterId: pc.id, knownLocation: newLocId }, ...actorEnvelope }));
      targetLocationId ||= newLocId;
      updatesSummary.push(`New location discovered: ${location.name}.`);
    }

    if (targetLocationId && pc) {
      try {
        const plan = await TransactionService.buildTravelPlanProposals({ worldId: context.worldId, actorId: pc.id, destinationLocationId: targetLocationId, startEpoch: currentEpoch });
        timelineExecutionProposals.push(...plan.proposals.map((proposal) => createStateChangeProposal({ ...proposal, reason: 'Execute approved timeline travel transaction.', causalBasis: [{ type: 'SYSTEM_EVENT', id: proposal.entityId || proposal.id, description: 'The travel transaction reached its execution point.' }], authorityLevel: 'SYSTEM', confidence: 1 })));
        updatesSummary.push(`Travel transaction planned for ${targetLocationId}.`);
      } catch {
        updatesSummary.push(`Travel to ${targetLocationId} could not be planned.`);
      }
    }

    for (const effect of resolution.effects) {
      proposals.push(createStateChangeProposal({ id: `prop-effect-${crypto.randomUUID()}`, operation: 'APPLY_SEMANTIC_EFFECT', entityType: 'CHARACTER', entityId: effect.targetEntityId, actorId: context.actorId, payload: {}, semanticEffect: effect, ...actorEnvelope }));
      updatesSummary.push(`Semantic effect proposed: ${effect.type} ${effect.magnitude} ${effect.resource}.`);
    }
    if (resolution.npcAffinityDelta && pc) {
      const relationship = resolution.npcAffinityDelta;
      proposals.push(createStateChangeProposal({ id: `prop-npc-rel-${crypto.randomUUID()}`, operation: 'CHANGE_RELATIONSHIP', entityType: 'CHARACTER', entityId: relationship.npcId, payload: { sourceCharacterId: relationship.npcId, targetCharacterId: pc.id, trustDelta: relationship.trustDelta ?? 0, favorDelta: relationship.favorDelta ?? 0 }, ...actorEnvelope }));
      updatesSummary.push('NPC relationship updated.');
    }
    proposals.push(createStateChangeProposal({ id: `prop-dm-evt-${crypto.randomUUID()}`, operation: 'CREATE_EVENT', entityType: 'EVENT', payload: { type: 'SOCIAL', description: `Player action: "${playerActionText}"`, location_id: pc?.location_id, involved_entity_ids: pc ? [pc.id] : [] }, ...actorEnvelope }));
    return { proposals, timelineExecutionProposals, updatesSummary };
  }
}
