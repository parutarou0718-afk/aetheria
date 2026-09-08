import { WorldRepository } from '../world/worldRepository';
import { QuestRepository } from '../quest/questRepository';
import { ObserverKnowledgeService } from '../history/observerKnowledgeService';
import { getContextPolicy } from './contextPolicy';
import type { ContextPacket, ContextRequest } from './contextTypes';
import { InteractionRepository } from './interactionRepository';
import { MemoryRetrievalService } from './memoryRetrievalService';
import { ContextBudgeter } from './contextBudgeter';
import { DefaultWorldRuleRepository } from '../constraints/rules/worldRuleRepository';
import { toContextInteractionTurn, toContextLocationView, toContextMemoryEpisode, toContextRuleView, toDmCharacterView, toNarratorHiddenTruthView, toNpcObservedCharacterView, toNpcSelfView } from './contextViews';

export class ContextAssembler {
  static async assemble(request: ContextRequest): Promise<ContextPacket> {
    const policy = getContextPolicy(request.purpose);
    const snapshot = await WorldRepository.getWorldSnapshot(request.worldId);
    if (!snapshot) throw new Error(`World [${request.worldId}] not found.`);
    const epoch = snapshot.epoch;
    const actor = await WorldRepository.getCharacter(request.worldId, request.actorId);
    const npc = policy.observerScope === 'NPC' && request.npcId ? await WorldRepository.getCharacter(request.worldId, request.npcId) : null;
    const sceneOwner = npc ?? actor;
    const location = sceneOwner?.location_id ? await WorldRepository.getLocation(request.worldId, sceneOwner.location_id) : null;
    const packet: ContextPacket = { version: 1, world: { id: snapshot.id, name: snapshot.world_name, epoch }, diagnostics: { estimatedTokens: 0, budgetLimit: policy.maxEstimatedTokens, includedCounts: {}, droppedCounts: {} } };
    if (policy.includeWorldProfile) {
      const profile = await WorldRepository.getWorldProfile(request.worldId);
      packet.world.profile = profile ? { displayName: profile.display_name, description: profile.world_description, genre: profile.genre, cosmology: profile.cosmology, narratorRole: profile.narrative_style?.narratorRole ?? profile.narrator_role, narrationStyle: profile.narration_style } : undefined;
    }
    if (policy.includeWorldAxioms) packet.world.axioms = (await WorldRepository.getWorldAxioms(request.worldId)).map(axiom => ({ statement: axiom.statement, immutable: axiom.immutable }));
    if (policy.includeWorldRules) packet.world.rules = (await new DefaultWorldRuleRepository().getEnabledRules(request.worldId)).map(toContextRuleView);
    if (actor && policy.includeActorPrivateState) packet.actor = toDmCharacterView(actor);
    if (npc) packet.actor = toNpcSelfView(npc, request.actorId);
    if (policy.includeScene) {
      const present = location ? (await WorldRepository.getAllCharacters(request.worldId)).filter(character => character.location_id === location.id) : [];
      packet.scene = { location: location ? toContextLocationView(location) : undefined, characters: present.map(character => toNpcObservedCharacterView(character)) };
    }
    if (policy.includeQuests) {
      const quests = policy.observerScope === 'NPC' && request.npcId
        ? [...await QuestRepository.listAvailableByGiver(request.worldId, request.npcId), ...(await QuestRepository.listActiveByAssignee(request.worldId, request.actorId)).filter(q => q.giver_character_id === request.npcId)]
        : await QuestRepository.listActiveByAssignee(request.worldId, request.actorId);
      packet.quests = quests.slice(0, policy.limits.quests).map(q => ({ id: q.id, title: q.title, description: q.description, status: q.status, objectiveDescription: q.objective.description }));
    }
    const conversationId = request.purpose === 'NPC_DIALOGUE' && request.npcId ? `NPC:${request.npcId}:${request.actorId}` : `DM:${request.actorId}`;
    if (policy.includeRecentInteractions) {
      const recent = await InteractionRepository.listRecentSessionTurns(request.worldId, conversationId, request.sessionId, policy.limits.recentTurns);
      const remaining = Math.max(0, policy.limits.recentTurns - recent.length);
      const older = remaining ? await InteractionRepository.listRelevantOlderTurns(request.worldId, conversationId, request.sessionId, request.userInput, remaining) : [];
      packet.recentInteractions = [...older, ...recent].map(toContextInteractionTurn);
    }
    if (policy.includeEpisodicMemory) packet.relevantMemories = (await MemoryRetrievalService.retrieve({ worldId: request.worldId, observerType: policy.observerScope === 'NPC' ? 'CHARACTER' : 'PLAYER', observerId: policy.observerScope === 'NPC' ? request.npcId || request.actorId : request.actorId, userInput: request.userInput, locationId: sceneOwner?.location_id, limit: policy.limits.memories })).map(toContextMemoryEpisode);
    if (policy.observerScope === 'PLAYER' || policy.observerScope === 'NPC') {
      const knowledge = await new ObserverKnowledgeService().getKnowledgeSnapshot({ worldId: request.worldId, observerType: policy.observerScope === 'NPC' ? 'CHARACTER' : 'PLAYER', observerId: policy.observerScope === 'NPC' ? request.npcId || request.actorId : request.actorId, atEpoch: epoch });
      packet.observerKnowledge = {
        confirmedFacts: knowledge.confirmedFacts.slice(0, policy.limits.knowledgePerBucket),
        claims: knowledge.claims.slice(0, policy.limits.knowledgePerBucket),
        rumors: knowledge.rumors.slice(0, policy.limits.knowledgePerBucket),
        inferences: knowledge.inferences.slice(0, policy.limits.knowledgePerBucket),
      };
    }
    if (policy.includeWorldEvents) packet.relevantEvents = (await WorldRepository.getRecentEvents(request.worldId, policy.limits.events)).map(event => ({ id: event.id, type: event.type, description: event.description, epoch: event.epoch, locationId: event.location_id, involvedEntityIds: event.involved_entity_ids }));
    if (policy.hiddenTruthAccess !== 'NONE') {
      const terms = request.userInput.toLowerCase().split(/\W+/).filter(Boolean);
      const relevantIds = new Set([request.actorId, location?.id, request.npcId].filter(Boolean));
      const truths = await WorldRepository.getAllHiddenTruths(request.worldId);
      const ranked = truths.filter(truth => truth.revealed_to_ids.includes(request.actorId) || relevantIds.has(truth.true_owner_id) || terms.some(term => term.length > 2 && `${truth.title} ${truth.true_nature} ${truth.true_goal ?? ''}`.toLowerCase().includes(term)))
        .sort((a, b) => a.id.localeCompare(b.id)).slice(0, policy.limits.hiddenTruths);
      packet.narratorPrivate = { hiddenTruths: ranked.map(toNarratorHiddenTruthView) };
    }
    packet.diagnostics.estimatedTokens = ContextBudgeter.estimateTokens(packet);
    return ContextBudgeter.apply(packet);
  }
}
