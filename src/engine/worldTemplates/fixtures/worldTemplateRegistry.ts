/** @deprecated Test fixture only. Never use in production genesis. */
import { WorldGenre } from '../../worldProfile/worldProfileTypes';
import { WorldTemplate } from '../../worldProfile/worldTemplateTypes';
import { WorldPresetNotFoundError } from '../../worldProfile/worldProfileErrors';
import { createXianxiaWorldTemplate } from './xianxiaWorldTemplate';
import { createSteamArcaneWorldTemplate } from './steamArcaneWorldTemplate';
import { createCyberpunkWorldTemplate } from './cyberpunkWorldTemplate';
import { createWastelandWorldTemplate } from './wastelandWorldTemplate';

export class WorldTemplateRegistry {
  public static getTemplate(preset: WorldGenre, worldId: string): WorldTemplate {
    switch (preset) {
      case 'XIANXIA':
        return createXianxiaWorldTemplate(worldId);
      case 'STEAM_ARCANUM':
        return createSteamArcaneWorldTemplate(worldId);
      case 'CYBERPUNK':
        return createCyberpunkWorldTemplate(worldId);
      case 'WASTELAND':
        return createWastelandWorldTemplate(worldId);
      default:
        throw new WorldPresetNotFoundError(preset as string);
    }
  }
}
