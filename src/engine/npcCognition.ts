import { Character, CharacterMemoryItem } from '../types';
import { globalWorld } from './worldState';
import { aiService } from './ai/aiService';

export class NPCCognitionEngine {
  public static addMemory(characterId: string, text: string, importance = 3) {
    const npc = globalWorld.characters.get(characterId);
    if (!npc) return;

    npc.memory.short_term.push({ text, importance, epoch: globalWorld.snapshot.epoch });
    if (npc.memory.short_term.length > 15) this.forgeMemory(npc);
  }

  public static forgeMemory(npc: Character) {
    if (npc.memory.short_term.length === 0) return;
    const itemsText = npc.memory.short_term.map((memory) => memory.text).join(' | ');
    npc.memory.compressed = npc.memory.compressed
      ? `${npc.memory.compressed} [Epoch ${globalWorld.snapshot.epoch}: ${itemsText}]`
      : itemsText;
    npc.memory.short_term.sort((left, right) => right.importance - left.importance);
    npc.memory.short_term = npc.memory.short_term.slice(0, 5);
  }

  public static recallMemories(npc: Character, query: string): string[] {
    const results: string[] = [];
    const lowerQuery = query.toLowerCase();
    for (const memory of npc.memory.short_term) {
      if (memory.text.toLowerCase().includes(lowerQuery) || results.length < 3) results.push(memory.text);
    }
    if (npc.memory.compressed && results.length < 5) results.push(`Earlier memories: ${npc.memory.compressed}`);
    return results;
  }

  public static async generateNPCDialogue(
    npcId: string,
    playerMessage: string,
    playerCharacterName = 'Traveler'
  ): Promise<{ reply: string; trustDelta: number; favorDelta: number; actionTriggered?: string }> {
    const npc = globalWorld.characters.get(npcId);
    if (!npc) return { reply: 'This character is unavailable.', trustDelta: 0, favorDelta: 0 };

    const recalledMemories = this.recallMemories(npc, playerMessage);
    const aiContext = { userId: 'SYSTEM_USER', worldId: globalWorld.snapshot.id, purpose: 'NPC_DIALOGUE' as const };
    if (!aiService.isAvailable(aiContext)) {
      const reply = this.buildFallbackReply(npc, playerCharacterName, recalledMemories);
      this.addMemory(npcId, `${playerCharacterName}: "${playerMessage}"`, 2);
      return {
        reply,
        trustDelta: /help|thanks|thank you|帮助|谢谢/i.test(playerMessage) ? 2 : 0,
        favorDelta: /gift|give|礼物|赠送/i.test(playerMessage) ? 3 : 0,
      };
    }

    try {
      globalWorld.totalLLMCalls += 1;
      globalWorld.llmCallsThisEpoch += 1;
      const location = globalWorld.locations.get(npc.location_id);
      const systemPrompt = `You roleplay ${npc.name}, a ${npc.title} in ${globalWorld.snapshot.world_name}.
Location: ${location?.name || 'an unknown place'}.
Goal: ${npc.goal.primary}. Personality: ${npc.personality.join(', ')}.
Relevant memories: ${recalledMemories.join('; ') || 'none'}.
Player ${playerCharacterName} says: "${playerMessage}".
Reply in character and return JSON only: {"reply":"string","trustDelta":0,"favorDelta":0}.`;
      const parsed = await aiService.generateJson(aiContext, systemPrompt, 'Return only the requested JSON object.', { timeoutMs: 60000 }) as any;
      const trustDelta = typeof parsed.trustDelta === 'number' ? parsed.trustDelta : 0;
      const favorDelta = typeof parsed.favorDelta === 'number' ? parsed.favorDelta : 0;
      const reply = typeof parsed.reply === 'string' && parsed.reply.trim() ? parsed.reply : `${npc.name} considers your words.`;

      const player = globalWorld.characters.get('pc-player');
      if (player) {
        let relationship = npc.relationships.find((item) => item.target_id === player.id);
        if (!relationship) {
          relationship = {
            target_id: player.id,
            target_name: player.name,
            type: 'NEUTRAL',
            trust: 50,
            fear: 0,
            favor: 50,
            last_interaction_epoch: globalWorld.snapshot.epoch,
          };
          npc.relationships.push(relationship);
        }
        relationship.trust = Math.max(0, Math.min(100, relationship.trust + trustDelta));
        relationship.favor = Math.max(0, Math.min(100, relationship.favor + favorDelta));
        relationship.last_interaction_epoch = globalWorld.snapshot.epoch;
      }

      this.addMemory(npcId, `${playerCharacterName}: "${playerMessage}"`, 3);
      return { reply, trustDelta, favorDelta };
    } catch (error) {
      console.error('NPC dialogue generation failed:', error);
      return {
        reply: this.buildFallbackReply(npc, playerCharacterName, recalledMemories),
        trustDelta: 0,
        favorDelta: 0,
      };
    }
  }

  private static buildFallbackReply(npc: Character, playerCharacterName: string, memories: string[]): string {
    const location = globalWorld.locations.get(npc.location_id);
    const worldName = globalWorld.profile?.display_name || globalWorld.snapshot.world_name;
    const context = memories[0] || npc.goal.primary || 'the situation around us';
    if (location?.name || worldName) {
      return `${npc.name} pauses in ${location?.name || worldName} before replying to ${playerCharacterName}: “${context}.”`;
    }
    return `${npc.name} considers your words before replying to ${playerCharacterName}.`;
  }
}
