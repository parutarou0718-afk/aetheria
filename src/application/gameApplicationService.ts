import { DMEngine, type DMResponse } from '../engine/dmEngine';
import { NPCCognitionEngine } from '../engine/npcCognition';
import type { GameRequestContext } from './gameRequestContext';
import { worldAuthoringRuntime } from './worldAuthoringRuntime';
import { MetaCommandRuntime as DefaultMetaCommandRuntime } from './metaCommandRuntime';
import { globalWorld } from '../engine/worldState';

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

export interface WorldAuthoringResponse {
  narration: string;
  stateUpdatesSummary: string[];
  epoch: number;
}

export interface WorldAuthoringRuntime {
  processAuthoringRequest(context: GameRequestContext, text: string): Promise<WorldAuthoringResponse | RuntimeRejection>;
}

export interface MetaCommandResponse {
  command: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface MetaCommandRuntime {
  processCommand(context: GameRequestContext, text: string): Promise<MetaCommandResponse | RuntimeRejection>;
}

export interface RuntimeRejection { code: string; message: string; }

export type GameInputResult =
  | { status: 'OK'; mode: 'IN_WORLD_ACTION'; response: DMResponse }
  | { status: 'OK'; mode: 'WORLD_AUTHORING'; response: WorldAuthoringResponse }
  | { status: 'OK'; mode: 'META_COMMAND'; response: MetaCommandResponse }
  | { status: 'REJECTED'; code: string; message: string };

export class GameApplicationService {
  public constructor(
    private readonly runtime: InWorldActionRuntime = DMEngine,
    private readonly npcRuntime: NpcDialogueRuntime = NPCCognitionEngine,
    private readonly authoringRuntime: WorldAuthoringRuntime = worldAuthoringRuntime,
    private readonly metaRuntime: MetaCommandRuntime = new DefaultMetaCommandRuntime(() => ({ id: globalWorld.snapshot.id, epoch: globalWorld.snapshot.epoch })),
  ) {}

  public async handleInput({ context, text }: GameInput): Promise<GameInputResult> {
    switch (context.mode) {
      case 'IN_WORLD_ACTION':
        return {
          status: 'OK',
          mode: 'IN_WORLD_ACTION',
          response: await this.runtime.processPlayerAction(context, text),
        };
      case 'WORLD_AUTHORING':
        {
          const response = await this.authoringRuntime.processAuthoringRequest(context, text);
          if ('code' in response) return { status: 'REJECTED', code: response.code, message: response.message };
        return {
          status: 'OK',
          mode: 'WORLD_AUTHORING',
            response,
        };
        }
      case 'META_COMMAND':
        {
          const response = await this.metaRuntime.processCommand(context, text);
          if ('code' in response) return { status: 'REJECTED', code: response.code, message: response.message };
        return {
          status: 'OK',
          mode: 'META_COMMAND',
            response,
        };
        }
    }
  }

  public async handleNpcDialogue({ context, npcId, text }: GameInput & { npcId: string }): Promise<{ reply: string; trustDelta: number; favorDelta: number; actionTriggered?: string }> {
    if (context.mode !== 'IN_WORLD_ACTION') {
      return { reply: `${context.mode} is not implemented.`, trustDelta: 0, favorDelta: 0 };
    }
    return this.npcRuntime.generateNPCDialogue(context, npcId, text);
  }
}

export const gameApplicationService = new GameApplicationService();
