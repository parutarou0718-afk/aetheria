import { Character } from '../types';
import { globalWorld } from './worldState';
import { aiService } from './ai/aiService';
import { createStateChangeProposal } from './proposal/proposalFactory';
import { proposalPipeline } from './proposal/proposalPipeline';
import type { GameRequestContext } from '../application/gameRequestContext';
import { ObservationService } from './history/observationService';
import { ObserverKnowledgeService } from './history/observerKnowledgeService';

export class NPCCognitionEngine {
  public static recallMemories(npc: Character, query: string): string[] {
    const lowerQuery = query.toLowerCase();
    const results = npc.memory.short_term
      .filter((memory) => memory.text.toLowerCase().includes(lowerQuery))
      .map((memory) => memory.text);
    if (results.length < 3) results.push(...npc.memory.short_term.map((memory) => memory.text).slice(0, 3 - results.length));
    if (npc.memory.compressed && results.length < 5) results.push(`Earlier memories: ${npc.memory.compressed}`);
    return results;
  }

  public static async generateNPCDialogue(context: GameRequestContext, npcId: string, playerMessage: string, playerCharacterName?: string): Promise<{ reply: string; trustDelta: number; favorDelta: number; actionTriggered?: string }> {
    if (context.worldId !== globalWorld.snapshot.id) return { reply: 'This action cannot be resolved in the current world context.', trustDelta: 0, favorDelta: 0 };
    const npc = globalWorld.characters.get(npcId);
    if (!npc) return { reply: 'This character is unavailable.', trustDelta: 0, favorDelta: 0 };
    const player = globalWorld.characters.get(context.actorId);
    const resolvedPlayerName = playerCharacterName || player?.name || 'Traveler';
    const memories = this.recallMemories(npc, playerMessage);
    const knowledge = await new ObserverKnowledgeService().getKnowledgeSnapshot({
      worldId: context.worldId, observerType: 'CHARACTER', observerId: npc.id, atEpoch: globalWorld.snapshot.epoch,
    });
    const aiContext = { userId: context.userId, worldId: context.worldId, purpose: 'NPC_DIALOGUE' as const };
    let reply: string;
    let trustDelta = 0;
    let favorDelta = 0;
    if (!aiService.isAvailable(aiContext)) {
      reply = this.buildFallbackReply(npc, resolvedPlayerName, memories);
      trustDelta = /help|thanks|thank you|帮助|谢谢/i.test(playerMessage) ? 2 : 0;
      favorDelta = /gift|give|礼物|赠送/i.test(playerMessage) ? 3 : 0;
    } else {
      try {
        globalWorld.totalLLMCalls += 1;
        globalWorld.llmCallsThisEpoch += 1;
        const location = globalWorld.locations.get(npc.location_id);
        const parsed = await aiService.generateJson(aiContext,
          `You roleplay ${npc.name}. Location: ${location?.name || 'unknown'}. Goal: ${npc.goal.primary}. Memories: ${memories.join('; ') || 'none'}. Known confirmed facts: ${this.renderKnowledge(knowledge.confirmedFacts)}. Claims: ${this.renderKnowledge(knowledge.claims)}. Rumors: ${this.renderKnowledge(knowledge.rumors)}. Inferences: ${this.renderKnowledge(knowledge.inferences)}. Do not infer or reveal hidden world truth not listed here.`,
          `Player ${resolvedPlayerName} says: "${playerMessage}". Return JSON: {"reply":"string","trustDelta":0,"favorDelta":0}.`,
          { timeoutMs: 60000 }) as any;
        reply = typeof parsed.reply === 'string' && parsed.reply.trim() ? parsed.reply : `${npc.name} considers your words.`;
        trustDelta = typeof parsed.trustDelta === 'number' ? parsed.trustDelta : 0;
        favorDelta = typeof parsed.favorDelta === 'number' ? parsed.favorDelta : 0;
      } catch (error) {
        console.error('NPC dialogue generation failed:', error);
        return { reply: this.buildFallbackReply(npc, resolvedPlayerName, memories), trustDelta: 0, favorDelta: 0 };
      }
    }
    const committed = await this.commitDialogueEffects(context, npc, resolvedPlayerName, playerMessage, trustDelta, favorDelta);
    return { reply, trustDelta: committed ? trustDelta : 0, favorDelta: committed ? favorDelta : 0 };
  }

  private static async commitDialogueEffects(context: GameRequestContext, npc: Character, playerName: string, message: string, trustDelta: number, favorDelta: number): Promise<boolean> {
    const worldId = context.worldId;
    const player = globalWorld.characters.get(context.actorId);
    if (!worldId) return false;
    const base = { effectiveEpoch: globalWorld.snapshot.epoch, preconditions: [], source: { type: 'SYSTEM' as const, id: 'npcCognition' }, causalBasis: [{ type: 'PLAYER_ACTION' as const, id: player?.id, description: message }], authorityLevel: 'SYSTEM' as const };
    const directObservations = player ? await ObservationService.observeCharacter({
      worldId, observerType: 'CHARACTER', observerId: npc.id, subjectType: 'CHARACTER', subjectId: player.id,
      observationType: 'DIRECT_INTERACTION', observedEpoch: globalWorld.snapshot.epoch,
      factPaths: ['name', 'status', 'location_id'], epistemicStatus: 'CONFIRMED_FACT',
    }) : [];
    const playerObservations = player ? await ObservationService.observeCharacter({
      worldId, observerType: 'PLAYER', observerId: player.id, subjectType: 'CHARACTER', subjectId: npc.id,
      observationType: 'DIRECT_INTERACTION', observedEpoch: globalWorld.snapshot.epoch,
      factPaths: ['name', 'status', 'location_id'], epistemicStatus: 'CONFIRMED_FACT',
    }) : [];
    const dialogueClaim = player ? [ObservationService.observeDialogueStatement({
      worldId, observerType: 'CHARACTER', observerId: npc.id, speakerId: player.id,
      statement: message, observedEpoch: globalWorld.snapshot.epoch,
    })] : [];
    const proposals = [
      createStateChangeProposal({ ...base, id: `prop-npc-memory-${npc.id}-${Date.now()}`, operation: 'UPDATE_CHARACTER_MEMORY', entityType: 'CHARACTER', entityId: npc.id, payload: { characterId: npc.id, memoryItem: { text: `${playerName}: "${message}"`, importance: 3, epoch: globalWorld.snapshot.epoch } }, reason: 'Record an NPC dialogue memory.' }),
      ...(player ? [createStateChangeProposal({ ...base, id: `prop-npc-relationship-${npc.id}-${player.id}-${Date.now()}`, operation: 'CHANGE_RELATIONSHIP', entityType: 'CHARACTER', entityId: npc.id, payload: { sourceCharacterId: npc.id, targetCharacterId: player.id, trustDelta, favorDelta }, reason: 'Apply the NPC relationship outcome of a dialogue.' })] : []),
      ...directObservations,
      ...playerObservations,
      ...dialogueClaim,
    ];
    return (await proposalPipeline.processAndCommit({ worldId, proposals })).success;
  }

  private static buildFallbackReply(npc: Character, playerName: string, memories: string[]): string {
    const location = globalWorld.locations.get(npc.location_id);
    const context = memories[0] || npc.goal.primary || 'the situation around us';
    return `${npc.name} pauses in ${location?.name || globalWorld.snapshot.world_name} before replying to ${playerName}: ${context}.`;
  }

  private static renderKnowledge(entries: Array<{ subjectId: string; factPath: string; value: unknown }>): string {
    return entries.length ? entries.map((entry) => `${entry.subjectId}.${entry.factPath}=${JSON.stringify(entry.value)}`).join('; ') : 'none';
  }
}
