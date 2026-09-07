import { RoutePlanner } from '../../timeline/routePlanner';
import { WorldRepository } from '../../world/worldRepository';
import type { WorldRuleStateReader } from './worldRuleValidator';

export class WorldRepositoryRuleStateReader implements WorldRuleStateReader {
  public getCharacter(worldId: string, characterId: string) { return WorldRepository.getCharacter(worldId, characterId); }
  public getLocation(worldId: string, locationId: string) { return WorldRepository.getLocation(worldId, locationId); }
  public getFact(worldId: string, factId: string) { return WorldRepository.getFact(worldId, factId); }
  public getTruth(worldId: string, truthId: string) { return WorldRepository.getHiddenTruth(worldId, truthId); }

  public async entityExists(worldId: string, entityType: string, entityId: string): Promise<boolean> {
    switch (entityType) {
      case 'CHARACTER': return Boolean(await WorldRepository.getCharacter(worldId, entityId));
      case 'LOCATION': return Boolean(await WorldRepository.getLocation(worldId, entityId));
      case 'ORGANIZATION': return Boolean(await WorldRepository.getOrganization(worldId, entityId));
      case 'SEED': return Boolean(await WorldRepository.getSeed(worldId, entityId));
      case 'FACT': return Boolean(await WorldRepository.getFact(worldId, entityId));
      case 'TRUTH': return Boolean(await WorldRepository.getHiddenTruth(worldId, entityId));
      case 'TRANSACTION': return Boolean(await WorldRepository.getWorldTransaction(worldId, entityId));
      case 'CHECKPOINT': return Boolean(await WorldRepository.getScheduledCheckpoint(worldId, entityId));
      default: return true;
    }
  }

  public async hasRoute(worldId: string, originLocationId: string, destinationLocationId: string): Promise<boolean> {
    try {
      await RoutePlanner.findRoute(worldId, originLocationId, destinationLocationId);
      return true;
    } catch {
      return false;
    }
  }
}
