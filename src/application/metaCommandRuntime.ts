import type { MetaCommandResponse } from './gameApplicationService';
import type { GameRequestContext } from './gameRequestContext';

export type MetaCommandResult = MetaCommandResponse | { code: string; command?: string; message: string };

interface MetaWorldSnapshot {
  id: string;
  epoch: number;
}

export class MetaCommandRuntime {
  public constructor(private readonly getSnapshot: () => MetaWorldSnapshot) {}

  public async processCommand(context: GameRequestContext, text: string): Promise<MetaCommandResult> {
    if (context.mode !== 'META_COMMAND') {
      return { code: 'META_MODE_REQUIRED', message: 'Meta commands require META_COMMAND mode.' };
    }

    const command = text.trim().replace(/^\//, '').toLowerCase();
    switch (command) {
      case 'help':
        return { command, message: 'Available meta commands: help, status, mode.' };
      case 'mode':
        return { command, message: 'Current input mode is META_COMMAND.', details: { mode: context.mode } };
      case 'status': {
        const snapshot = this.getSnapshot();
        return {
          command,
          message: 'World status is available.',
          details: { worldId: snapshot.id, epoch: snapshot.epoch, actorId: context.actorId, mode: context.mode },
        };
      }
      default:
        return { code: 'META_COMMAND_UNSUPPORTED', command, message: 'This meta command is not supported.' };
    }
  }
}
