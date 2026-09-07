export type GameChannel = 'WEB' | 'WECHAT' | 'MINI_PROGRAM' | 'IOS' | 'ANDROID';

export type GameInputMode = 'IN_WORLD_ACTION' | 'WORLD_AUTHORING' | 'META_COMMAND';

export interface GameRequestContext {
  userId: string;
  sessionId: string;
  worldId: string;
  actorId: string;
  channel: GameChannel;
  mode: GameInputMode;
}
