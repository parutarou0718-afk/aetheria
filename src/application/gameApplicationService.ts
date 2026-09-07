import { DMEngine, type DMResponse } from '../engine/dmEngine';
import { NPCCognitionEngine } from '../engine/npcCognition';
import type { GameRequestContext } from './gameRequestContext';

export interface GameInput {
  context: GameRequestContext;
  text: string;
}

export interface InWorldActionRuntime {
  processPlayerAction(context: GameRequestContext, playerActionText: string): Promise<DMResponse>;
}

export interface NpcDialogueRuntime {
  generateNPCDialogue(context: GameRequestContext, npcId: string, playerMessage: string): Promise<{ reply: string; trustDelta: number; favorDelta: number; actionTriggered?: string }>;
}

export type GameInputResult =
  | { status: 'OK'; response: DMResponse }
  | { status: 'NOT_IMPLEMENTED'; message: string };

export class GameApplicationService {
  public constructor(
    private readonly runtime: InWorldActionRuntime = DMEngine,
    private readonly npcRuntime: NpcDialogueRuntime = NPCCognitionEngine,
  ) {}

  public async handleInput({ context, text }: GameInput): Promise<GameInputResult> {
    if (context.mode !== 'IN_WORLD_ACTION') {
      return {
        status: 'NOT_IMPLEMENTED',
        message: `${context.mode} is not implemented.`,
      };
    }

    return {
      status: 'OK',
      response: await this.runtime.processPlayerAction(context, text),
    };
  }

  public async handleNpcDialogue({ context, npcId, text }: GameInput & { npcId: string }): Promise<{ reply: string; trustDelta: number; favorDelta: number; actionTriggered?: string }> {
    if (context.mode !== 'IN_WORLD_ACTION') {
      return { reply: `${context.mode} is not implemented.`, trustDelta: 0, favorDelta: 0 };
    }
    return this.npcRuntime.generateNPCDialogue(context, npcId, text);
  }
}

export const gameApplicationService = new GameApplicationService();
