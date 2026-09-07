import { WorldRepository } from '../world/worldRepository';
import { QuestRepository } from '../quest/questRepository';
import { ObserverKnowledgeService } from '../history/observerKnowledgeService';
import { getContextPolicy } from './contextPolicy';
import type { ContextPacket, ContextRequest } from './contextTypes';
import { InteractionRepository } from './interactionRepository';
import { MemoryRetrievalService } from './memoryRetrievalService';

export class ContextAssembler {
  static async assemble(request: ContextRequest): Promise<ContextPacket> {
    const policy = getContextPolicy(request.purpose);
    const snapshot = await WorldRepository.getWorldSnapshot(request.worldId);
    if (!snapshot) throw new Error(`World [${request.worldId}] not found.`);
    const actor = await WorldRepository.getCharacter(request.worldId, request.actorId);
    const location = actor?.location_id ? await WorldRepository.getLocation(request.worldId, actor.location_id) : null;
    const packet: ContextPacket = { version: 1, world: { id: snapshot.id, name: snapshot.world_name, epoch: request.currentEpoch }, diagnostics: { estimatedTokens: 0, budgetLimit: policy.maxEstimatedTokens, includedCounts: {}, droppedCounts: {} } };
    if (policy.includeWorldProfile) packet.world.profile = await WorldRepository.getWorldProfile(request.worldId);
    if (policy.includeWorldAxioms) packet.world.axioms = (await WorldRepository.getWorldAxioms(request.worldId)).map(axiom => ({ statement: axiom.statement, immutable: axiom.immutable }));
    if (policy.includeActorPrivateState && actor) packet.actor = { id: actor.id, name: actor.name, title: actor.title, status: actor.status, locationId: actor.location_id, attributes: actor.attributes, resources: actor.resources, inventory: actor.inventory, currentAction: actor.current_action };
    if (policy.includeScene) packet.scene = { location: location ? { id: location.id, name: location.name, description: location.description, status: location.status } : undefined, characters: [] };
    if (policy.includeQuests) {
      const quests = policy.observerScope === 'NPC' && request.npcId
        ? [...await QuestRepository.listAvailableByGiver(request.worldId, request.npcId), ...(await QuestRepository.listActiveByAssignee(request.worldId, request.actorId)).filter(q => q.giver_character_id === request.npcId)]
        : await QuestRepository.listActiveByAssignee(request.worldId, request.actorId);
      packet.quests = quests.slice(0, policy.limits.quests).map(q => ({ id: q.id, title: q.title, description: q.description, status: q.status, objectiveDescription: q.objective.description }));
    }
    const conversationId = request.purpose === 'NPC_DIALOGUE' && request.npcId ? `NPC:${request.npcId}:${request.actorId}` : `DM:${request.actorId}`;
    if (policy.includeRecentInteractions) packet.recentInteractions = await InteractionRepository.listRecentTurns(request.worldId, conversationId, policy.limits.recentTurns);
    if (policy.includeEpisodicMemory) packet.relevantMemories = await MemoryRetrievalService.retrieve({ worldId: request.worldId, observerType: policy.observerScope === 'NPC' ? 'CHARACTER' : 'PLAYER', observerId: policy.observerScope === 'NPC' ? request.npcId || request.actorId : request.actorId, userInput: request.userInput, locationId: actor?.location_id, limit: policy.limits.memories });
    if (policy.observerScope === 'PLAYER' || policy.observerScope === 'NPC') {
      const knowledge = await new ObserverKnowledgeService().getKnowledgeSnapshot({ worldId: request.worldId, observerType: policy.observerScope === 'NPC' ? 'CHARACTER' : 'PLAYER', observerId: policy.observerScope === 'NPC' ? request.npcId || request.actorId : request.actorId, atEpoch: request.currentEpoch });
      packet.observerKnowledge = knowledge;
    }
    packet.diagnostics.estimatedTokens = Math.ceil(JSON.stringify(packet).length / 4);
    return packet;
  }
}
