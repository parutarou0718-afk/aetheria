import { DefaultWorldRuleRepository } from '../rules/worldRuleRepository';
import { WorldRepository } from '../../world/worldRepository';
import type { CausalBasisStateReader } from './causalBasisValidator';

export class WorldRepositoryCausalBasisStateReader implements CausalBasisStateReader {
  public async factExists(worldId: string, id: string) { return Boolean(await WorldRepository.getFact(worldId, id)); }
  public async eventEpoch(worldId: string, id: string) { return (await WorldRepository.getEvent(worldId, id))?.epoch ?? null; }
  public async entityExists(worldId: string, entityType: string, id: string) {
    switch (entityType) {
      case 'CHARACTER': return Boolean(await WorldRepository.getCharacter(worldId, id));
      case 'LOCATION': return Boolean(await WorldRepository.getLocation(worldId, id));
      case 'ORGANIZATION': return Boolean(await WorldRepository.getOrganization(worldId, id));
      case 'SEED': return Boolean(await WorldRepository.getSeed(worldId, id));
      case 'FACT': return Boolean(await WorldRepository.getFact(worldId, id));
      case 'TRUTH': case 'HIDDEN_TRUTH': return Boolean(await WorldRepository.getHiddenTruth(worldId, id));
      default: return false;
    }
  }
  public async ruleExists(worldId: string, id: string) { return (await new DefaultWorldRuleRepository().getEnabledRules(worldId)).some((rule) => rule.id === id); }
}
