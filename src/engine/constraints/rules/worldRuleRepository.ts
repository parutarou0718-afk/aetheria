import { createDefaultWorldRules } from './worldRuleCatalog';
import type { WorldRule } from './worldRuleTypes';

export interface WorldRuleRepository {
  getEnabledRules(worldId: string): Promise<WorldRule[]>;
}

export class DefaultWorldRuleRepository implements WorldRuleRepository {
  public async getEnabledRules(worldId: string): Promise<WorldRule[]> {
    return createDefaultWorldRules(worldId).filter((rule) => rule.enabled);
  }
}
