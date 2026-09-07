import { InteractionRepository } from './interactionRepository';
export class InteractionLogService {
  static async recordExchange(input: { worldId: string; sessionId: string; conversationType: 'DM' | 'NPC'; conversationId: string; playerId: string; counterpartId?: string; playerText: string; responseText: string; epoch: number; outcomeStatus: string }): Promise<void> {
    const stamp = new Date().toISOString();
    await InteractionRepository.appendTurn({ id: `interaction-${crypto.randomUUID()}`, worldId: input.worldId, sessionId: input.sessionId, conversationType: input.conversationType, conversationId: input.conversationId, speakerType: 'PLAYER', speakerId: input.playerId, counterpartId: input.counterpartId, content: input.playerText, epoch: input.epoch, outcomeStatus: input.outcomeStatus, createdAt: stamp });
    await InteractionRepository.appendTurn({ id: `interaction-${crypto.randomUUID()}`, worldId: input.worldId, sessionId: input.sessionId, conversationType: input.conversationType, conversationId: input.conversationId, speakerType: input.conversationType === 'DM' ? 'DM' : 'NPC', speakerId: input.counterpartId || 'dm', counterpartId: input.playerId, content: input.responseText, epoch: input.epoch, outcomeStatus: input.outcomeStatus, createdAt: stamp });
  }
}
