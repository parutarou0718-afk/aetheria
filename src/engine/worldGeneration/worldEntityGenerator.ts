import { WorldProfile } from '../worldProfile/worldProfileTypes';
import { Location, Character, Organization, Seed, Event, WorldFact } from '../../types';
import { SkeletonGeneratorOutput } from './worldSkeletonGenerator';
import { DeterministicIdFactory } from './deterministicIdFactory';
import { ZodEntityOutput } from './zodSchemas';
import { aiService } from '../ai/aiService';
import { WorldEntityGenerationError } from '../worldProfile/worldProfileErrors';

export interface EntityGeneratorOutput {
  characters: Character[];
  organizations: Organization[];
  facts: WorldFact[];
  seeds: Seed[];
  events: Event[];
}

export class WorldEntityGenerator {
  public static async generateEntities(
    profile: WorldProfile,
    skeleton: SkeletonGeneratorOutput,
    idFactory: DeterministicIdFactory
  ): Promise<EntityGeneratorOutput> {
    const system = [
      'You are an AI RPG Entity Architect. Generate characters, organizations, facts, seeds, and the genesis event',
      'strictly matching the World Profile, Axioms, and Skeleton. Honor the world terminology, power system,',
      'naming conventions, and required/forbidden concepts exactly. Do NOT default to generic Western-fantasy',
      'species/roles/gold/HP semantics when the world lore differs.',
    ].join(' ');

    const user = `World Display Name: ${profile.display_name}
World Description: ${profile.world_description}
Power System: ${profile.power_system}
Culture & Influences: ${JSON.stringify(profile.cultural_influences)}
Naming Conventions: ${JSON.stringify(profile.naming_conventions)}
Terminology: ${JSON.stringify(profile.terminology)}
Allowed Concepts: ${JSON.stringify(profile.allowed_concepts)}
Forbidden Concepts: ${JSON.stringify(profile.forbidden_concepts)}

Locations Available:
${JSON.stringify(skeleton.locations.map((l) => ({ id: l.id, name: l.name, type: l.type })))}

Hidden Truths Available:
${JSON.stringify(skeleton.hiddenTruths.map((ht, idx) => ({ index: idx, id: ht.id, title: ht.title, layer: ht.layer })))}

Requirements:
1. Generate 1 PC character (idKey="pc") and at least 2 NPC characters (idKey="npc1", "npc2").
2. Character species MUST fit this world (DO NOT default to "Human/人类" if the world lore suggests otherwise).
3. Generate at least 1 Organization located at one of the locations, led by one of the NPCs.
4. Generate 1+ World Facts about the world.
5. Generate 1+ Seeds linked to one of the hidden truths.
6. Provide a genesisEventDescription string.
7. Do NOT use any Forbidden Concept, anywhere.

Return JSON ONLY matching structure:
{
  "characters": [
    {
      "idKey": "pc",
      "type": "PC",
      "name": "string",
      "title": "string",
      "species": "string",
      "age": 22,
      "locationKeyId": "string (matches location id or key)",
      "primaryGoal": "string",
      "personality": ["string"],
      "fear": "string",
      "attributes": { "hp": 100, "max_hp": 100, "mp": 50, "max_mp": 50, "strength": 12, "dexterity": 12, "intelligence": 12, "charisma": 12 },
      "skills": { "skillName": 10 },
      "resources": { "gold": 100, "reputation": 0 },
      "inventory": [{ "item_id": "item1", "name": "string", "type": "WEAPON|ARMOR|CONSUMABLE|KEY_ITEM|MISC", "quantity": 1 }]
    }
  ],
  "organizations": [
    {
      "name": "string",
      "type": "GUILD|FACTION|SECT|CORPORATION|GOVERNMENT|CULT|ACADEMY|ALLIANCE",
      "description": "string",
      "headquartersLocationKeyId": "string",
      "leaderCharacterKeyId": "string",
      "goalDescription": "string",
      "projectName": "string",
      "projectDescription": "string"
    }
  ],
  "facts": [
    { "statement": "string", "category": "GEOGRAPHY|HISTORY|MAGIC|POLITICS|CULTURE|FACTION|BIOLOGY|PHYSICS" }
  ],
  "seeds": [
    {
      "type": "INVESTIGATION|CONFLICT|DISCOVERY|CRISIS",
      "description": "string",
      "hiddenTruthIndex": 0,
      "opportunityDescription": "string",
      "discoveryCondition": "string"
    }
  ],
  "genesisEventDescription": "string"
}`;

    const parsed = await this.invokeAi(system, user, profile.world_id);

    try {
      const validated = ZodEntityOutput.safeParse(parsed);
      if (!validated.success) {
        throw new WorldEntityGenerationError(
          `AI returned malformed entity JSON: ${this.safeIssue(validated)}`
        );
      }
      return this.buildEntitiesFromParsed(validated.data, profile, skeleton, idFactory);
    } catch (err) {
      if (err instanceof WorldEntityGenerationError) throw err;
      throw new WorldEntityGenerationError(
        `Failed to interpret AI entity output: ${(err as Error).message}`
      );
    }
  }

  private static async invokeAi(system: string, user: string, worldId: string): Promise<any> {
    try {
      return await aiService.generateJson({ userId: 'SYSTEM_USER', worldId, purpose: 'WORLD_ENTITY_GENERATION' }, system, user, {
        timeoutMs: 30000,
        jsonSchemaHint:
          'Return strictly a JSON object with keys "characters", "organizations", "facts", "seeds", "genesisEventDescription".',
      });
    } catch (err) {
      throw new WorldEntityGenerationError(
        `World entity generation failed: ${(err as Error).message}`
      );
    }
  }

  private static safeIssue(result: { error?: any }): string {
    try {
      return JSON.stringify(result?.error ?? '');
    } catch {
      return 'unknown schema error';
    }
  }

  private static buildEntitiesFromParsed(
    parsed: any,
    profile: WorldProfile,
    skeleton: SkeletonGeneratorOutput,
    idFactory: DeterministicIdFactory
  ): EntityGeneratorOutput {
    const worldId = profile.world_id;
    const locMap = new Map(skeleton.locations.map((l) => [l.id, l]));
    const firstLocId = skeleton.locations[0]?.id || 'loc-1';

    // Map key/id to character ID
    const keyToCharId = new Map<string, string>();
    const rawChars: any[] = parsed.characters || [];

    rawChars.forEach((rc, idx) => {
      const key = rc.idKey || (rc.type === 'PC' ? 'pc' : `npc${idx}`);
      const charId = rc.type === 'PC' ? idFactory.createId('pc', 'player') : idFactory.createId('npc', idx);
      keyToCharId.set(key, charId);
    });

    const characters: Character[] = rawChars.map((rc, idx) => {
      const key = rc.idKey || (rc.type === 'PC' ? 'pc' : `npc${idx}`);
      const charId = keyToCharId.get(key)!;
      let locId = rc.locationKeyId;
      if (!locMap.has(locId)) {
        locId = firstLocId;
      }

      return {
        id: charId,
        type: rc.type === 'PC' ? 'PC' : 'NPC',
        name: rc.name || (rc.type === 'PC' ? '探索者' : `居民${idx}`),
        title: rc.title || profile.terminology.professionTerms?.[0] || '成员',
        species: rc.species || profile.terminology.creatureTerms?.[0] || '本地居民',
        age: typeof rc.age === 'number' ? rc.age : 25,
        status: 'ALIVE',
        presence_state: 'AT_LOCATION',
        location_id: locId,
        goal: { primary: rc.primaryGoal || `在${profile.display_name}中实现自我抱负`, secondary: [] },
        personality: Array.isArray(rc.personality) && rc.personality.length ? rc.personality : ['果决'],
        fear: rc.fear || '失序与未知',
        attributes: rc.attributes || { hp: 100, max_hp: 100, mp: 50, max_mp: 50, strength: 10, dexterity: 10, intelligence: 10, charisma: 10 },
        skills: rc.skills && typeof rc.skills === 'object' ? rc.skills : { '基础觉察': 10 },
        resources: rc.resources || { gold: 100, reputation: 0 },
        inventory: Array.isArray(rc.inventory) && rc.inventory.length
          ? rc.inventory.map((inv: any, i: number) => ({
              item_id: inv.item_id || `item-${i + 1}`,
              name: inv.name || '行囊物品',
              type: inv.type || 'MISC',
              quantity: typeof inv.quantity === 'number' ? inv.quantity : 1,
            }))
          : [{ item_id: 'item-init', name: profile.terminology.artifactTerms?.[0] || '随身信物', type: 'MISC', quantity: 1 }],
        knowledge: { known_facts: [`${profile.display_name}的日常`], known_characters: [], known_locations: [locId] },
        memory: { short_term: [{ text: `开始在${locMap.get(locId)?.name || '本地'}的行动`, importance: 3, epoch: 1 }], compressed: '', important_events: [] },
        relationships: [],
        current_action: { type: 'IDLE', description: '观察周遭动态', started_at_epoch: 1, estimated_end_epoch: 1 },
        frozen: false,
        simulation_level: 1,
        last_simulated_epoch: 1,
        created_at_epoch: 1,
        updated_at_epoch: 1,
      };
    });

    // Organizations
    const rawOrgs: any[] = parsed.organizations || [];
    const organizations: Organization[] = rawOrgs.map((ro, idx) => {
      const orgId = idFactory.createId('org', idx + 1);
      let hqId = ro.headquartersLocationKeyId;
      if (!locMap.has(hqId)) hqId = firstLocId;
      const leaderId = keyToCharId.get(ro.leaderCharacterKeyId) || characters.find((c) => c.type === 'NPC')?.id || characters[0].id;

      return {
        id: orgId,
        name: ro.name || profile.terminology.factionTerms?.[0] || '本地公会',
        type: ro.type || 'GUILD',
        description: ro.description || `立足于${profile.display_name}的重要结社。`,
        headquarters_id: hqId,
        territory_ids: [hqId],
        leader_id: leaderId,
        member_ids: characters.map((c) => c.id),
        resources: { wealth: 1000, influence: 50, military_power: 30, secret_knowledge: 20 },
        goals: [{ id: `g-${idx}`, description: ro.goalDescription || '维护社群运转与探索资源', priority: 1, progress: 0.2, type: 'DEFENSE', status: 'ACTIVE', created_at_epoch: 1 }],
        projects: [{ id: `p-${idx}`, name: ro.projectName || '常规例巡', description: ro.projectDescription || '派员巡视周边', assigned_member_ids: [leaderId], epoch_started: 1, epoch_deadline: 5, progress: 0.1, status: 'IN_PROGRESS' }],
        relationships: [],
        reputation: { public: 50, nobility: 10, underworld: 0 },
        frozen: false,
        simulation_level: 1,
        last_simulated_epoch: 1,
        created_at_epoch: 1,
        updated_at_epoch: 1,
      };
    });

    // Facts
    const rawFacts: any[] = parsed.facts || [];
    const facts: WorldFact[] = rawFacts.map((rf, idx) => ({
      id: idFactory.createId('fact', idx + 1),
      statement: rf.statement || `${profile.display_name}有着独特的运行秩序。`,
      category: rf.category || 'GEOGRAPHY',
      confidence: 'CONFIRMED',
      source: { type: 'OBSERVATION', source_id: firstLocId, epoch_discovered: 1 },
      related_entity_ids: [firstLocId],
      is_active: true,
      created_at_epoch: 1,
      updated_at_epoch: 1,
    }));

    (profile.allowed_concepts || []).forEach((concept, idx) => {
      const alreadyMentioned = facts.some((f) => f.statement.includes(concept));
      if (!alreadyMentioned) {
        facts.push({
          id: idFactory.createId('fact', facts.length + idx + 1),
          statement: `${profile.display_name}存在关键要素：${concept}`,
          category: 'GEOGRAPHY',
          confidence: 'CONFIRMED',
          source: { type: 'OBSERVATION', source_id: firstLocId, epoch_discovered: 1 },
          related_entity_ids: [firstLocId],
          is_active: true,
          created_at_epoch: 1,
          updated_at_epoch: 1,
        });
      }
    });

    // Seeds
    const pcId = characters.find((c) => c.type === 'PC')?.id || characters[0].id;
    const rawSeeds: any[] = parsed.seeds || [];
    const seeds: Seed[] = rawSeeds.map((rs, idx) => {
      const truthIdx = typeof rs.hiddenTruthIndex === 'number' && rs.hiddenTruthIndex < skeleton.hiddenTruths.length ? rs.hiddenTruthIndex : 0;
      const targetTruth = skeleton.hiddenTruths[truthIdx] || skeleton.hiddenTruths[0];

      return {
        id: idFactory.createId('seed', idx + 1),
        type: rs.type || 'INVESTIGATION',
        status: 'IN_PROGRESS',
        visible_layer: {
          description: rs.description || `关于${targetTruth.title}的初级线索在坊间流传。`,
          actor_ids: [pcId],
          location_id: firstLocId,
          start_epoch: 1,
          estimated_end_epoch: 3,
        },
        hidden_truth: targetTruth,
        importance: 2,
        progress: 0.1,
        player_opportunity: {
          exists: true,
          description: rs.opportunityDescription || '开展调查以探寻背后隐秘',
          discovery_condition: rs.discoveryCondition || '在当地搜集情报',
          type: 'QUEST',
        },
        created_at_epoch: 1,
        updated_at_epoch: 1,
      };
    });

    // Event
    const genesisDesc = parsed.genesisEventDescription || `【创世纪元】${profile.display_name}的秩序轮廓显现，各方势力展开新的角逐。`;
    const events: Event[] = [
      {
        id: idFactory.createId('event', 'init'),
        type: 'WORLD_STATE',
        description: genesisDesc,
        location_id: firstLocId,
        involved_entity_ids: characters.map((c) => c.id),
        cause: { type: 'WORLD_CREATION' },
        effects: [],
        epoch: 1,
        resolved: true,
        resolution_epoch: 1,
        created_at_epoch: 1,
      },
    ];

    return { characters, organizations, facts, seeds, events };
  }
}
