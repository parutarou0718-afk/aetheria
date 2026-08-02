import { GoogleGenAI } from '@google/genai';
import { WorldProfile } from '../worldProfile/worldProfileTypes';
import { Location, Character, Organization, Seed, Event, WorldFact } from '../../types';
import { SkeletonGeneratorOutput } from './worldSkeletonGenerator';
import { DeterministicIdFactory } from './deterministicIdFactory';
import { ZodEntityOutput } from './zodSchemas';

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
    const apiKey = process.env.GEMINI_API_KEY;

    if (apiKey && apiKey !== 'MY_GEMINI_API_KEY') {
      try {
        const ai = new GoogleGenAI({ apiKey });
        const prompt = `You are an AI RPG Entity Architect. Generate characters, organizations, facts, seeds, and genesis event based strictly on this World Profile, Axioms, and Skeleton.

World Display Name: ${profile.display_name}
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

        const response = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: prompt,
          config: {
            responseMimeType: 'application/json',
          },
        });

        const text = response.text;
        if (text) {
          const rawParsed = JSON.parse(text);
          const validated = ZodEntityOutput.safeParse(rawParsed);
          if (validated.success) {
            return this.buildEntitiesFromParsed(validated.data, profile, skeleton, idFactory);
          }
        }
      } catch (err) {
        console.warn('[WorldEntityGenerator] AI entity generation failed. Falling back to dynamic profile generator.', err);
      }
    }

    return this.generateProfileDrivenEntities(profile, skeleton, idFactory);
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
      let leaderId = keyToCharId.get(ro.leaderCharacterKeyId) || characters.find((c) => c.type === 'NPC')?.id || characters[0].id;

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

  private static generateProfileDrivenEntities(
    profile: WorldProfile,
    skeleton: SkeletonGeneratorOutput,
    idFactory: DeterministicIdFactory
  ): EntityGeneratorOutput {
    const worldId = profile.world_id;
    const terms = profile.terminology;

    const locStart = skeleton.locations[0];
    const locTrade = skeleton.locations[1] || locStart;

    const mainTitle = terms.professionTerms?.[0] || '探索者';
    const factionName = terms.factionTerms?.[0] || '自治盟会';
    const mainSpecies = terms.creatureTerms?.[0] || '世间生灵';

    const pcId = idFactory.createId('pc', 'player');
    const npc1Id = idFactory.createId('npc', 'leader');
    const npc2Id = idFactory.createId('npc', 'trader');
    const orgId = idFactory.createId('org', 'primary');

    const pc: Character = {
      id: pcId,
      type: 'PC',
      name: '行路者',
      title: mainTitle,
      species: mainSpecies,
      age: 22,
      status: 'ALIVE',
      presence_state: 'AT_LOCATION',
      location_id: locStart.id,
      goal: { primary: `在${profile.display_name}中探寻深层法则并建立属于自己的传奇`, secondary: [] },
      personality: ['坚韧', '敏锐'],
      fear: '遗失本源使命',
      attributes: { hp: 100, max_hp: 100, mp: 50, max_mp: 50, strength: 12, dexterity: 12, intelligence: 14, charisma: 11 },
      skills: { '秩序觉察': 12, '环境辨识': 10 },
      resources: { gold: 60, reputation: 10 },
      inventory: [
        { item_id: 'item-1', name: terms.artifactTerms?.[0] || '随身信物', type: 'MISC', quantity: 1 },
        { item_id: 'item-2', name: '行囊干粮', type: 'CONSUMABLE', quantity: 3 },
      ],
      knowledge: { known_facts: [`${locStart.name}的周边环境`], known_characters: [npc1Id], known_locations: [locStart.id] },
      memory: { short_term: [{ text: `在${locStart.name}开启了行程`, importance: 4, epoch: 1 }], compressed: '', important_events: [] },
      relationships: [],
      current_action: { type: 'IDLE', description: `在${locStart.name}考察环境`, started_at_epoch: 1, estimated_end_epoch: 1 },
      frozen: false,
      simulation_level: 1,
      last_simulated_epoch: 1,
      created_at_epoch: 1,
      updated_at_epoch: 1,
    };

    const npc1: Character = {
      id: npc1Id,
      type: 'NPC',
      name: '执事管顾',
      title: `${factionName}负责人`,
      species: mainSpecies,
      age: 40,
      status: 'ALIVE',
      presence_state: 'AT_LOCATION',
      location_id: locStart.id,
      goal: { primary: `维护${locStart.name}的秩序与安定`, secondary: [] },
      personality: ['稳重', '周妥'],
      fear: '势力纷争引致聚落破败',
      attributes: { hp: 110, max_hp: 110, mp: 40, max_mp: 40, strength: 12, dexterity: 10, intelligence: 14, charisma: 15 },
      skills: { '调度协商': 14 },
      resources: { gold: 300, reputation: 50 },
      inventory: [{ item_id: 'item-3', name: '结社印记', type: 'MISC', quantity: 1 }],
      knowledge: { known_facts: [`${profile.display_name}的通商要道`], known_characters: [pcId], known_locations: [locStart.id, locTrade.id] },
      memory: { short_term: [{ text: `接待行路者进入${locStart.name}`, importance: 3, epoch: 1 }], compressed: '', important_events: [] },
      relationships: [],
      current_action: { type: 'IDLE', description: '整理布告与要务', started_at_epoch: 1, estimated_end_epoch: 1 },
      frozen: false,
      simulation_level: 1,
      last_simulated_epoch: 1,
      created_at_epoch: 1,
      updated_at_epoch: 1,
    };

    const npc2: Character = {
      id: npc2Id,
      type: 'NPC',
      name: '资深贩客',
      title: '交易行者',
      species: mainSpecies,
      age: 36,
      status: 'ALIVE',
      presence_state: 'AT_LOCATION',
      location_id: locTrade.id,
      goal: { primary: `收集并交易各类${terms.artifactTerms?.[0] || '遗物'}`, secondary: [] },
      personality: ['精明', '干练'],
      fear: '商路断绝',
      attributes: { hp: 90, max_hp: 90, mp: 60, max_mp: 60, strength: 10, dexterity: 12, intelligence: 15, charisma: 14 },
      skills: { '识货交易': 15 },
      resources: { gold: 600, reputation: 30 },
      inventory: [{ item_id: 'item-4', name: '交易名录', type: 'MISC', quantity: 1 }],
      knowledge: { known_facts: [`${locTrade.name}的物价变动`], known_characters: [], known_locations: [locTrade.id] },
      memory: { short_term: [{ text: '清点行囊物资', importance: 2, epoch: 1 }], compressed: '', important_events: [] },
      relationships: [],
      current_action: { type: 'IDLE', description: '在要道旁整顿货盘', started_at_epoch: 1, estimated_end_epoch: 1 },
      frozen: false,
      simulation_level: 1,
      last_simulated_epoch: 1,
      created_at_epoch: 1,
      updated_at_epoch: 1,
    };

    const characters = [pc, npc1, npc2];

    const organization: Organization = {
      id: orgId,
      name: factionName,
      type: 'GUILD',
      description: `在${profile.display_name}中自发形成的互助与探索联盟。`,
      headquarters_id: locStart.id,
      territory_ids: [locStart.id],
      leader_id: npc1Id,
      member_ids: [pcId, npc1Id],
      resources: { wealth: 800, influence: 40, military_power: 20, secret_knowledge: 15 },
      goals: [{ id: 'g1', description: '保障聚落安全并提供支援', priority: 1, progress: 0.4, type: 'DEFENSE', status: 'ACTIVE', created_at_epoch: 1 }],
      projects: [{ id: 'p1', name: '探索外围异常', description: '派员探查周边异状', assigned_member_ids: [pcId], epoch_started: 1, epoch_deadline: 5, progress: 0.1, status: 'IN_PROGRESS' }],
      relationships: [],
      reputation: { public: 50, nobility: 0, underworld: 10 },
      frozen: false,
      simulation_level: 1,
      last_simulated_epoch: 1,
      created_at_epoch: 1,
      updated_at_epoch: 1,
    };

    const facts: WorldFact[] = [
      {
        id: idFactory.createId('fact', 1),
        statement: `${profile.display_name}的秩序轮廓正在重新组合形成。`,
        category: 'GEOGRAPHY',
        confidence: 'CONFIRMED',
        source: { type: 'OBSERVATION', source_id: locStart.id, epoch_discovered: 1 },
        related_entity_ids: [locStart.id],
        is_active: true,
        created_at_epoch: 1,
        updated_at_epoch: 1,
      },
    ];

    const seeds: Seed[] = [
      {
        id: idFactory.createId('seed', 1),
        type: 'INVESTIGATION',
        status: 'IN_PROGRESS',
        visible_layer: {
          description: `${locStart.name}流传着关于深层隐秘的探索委托。`,
          actor_ids: [pcId],
          location_id: locStart.id,
          start_epoch: 1,
          estimated_end_epoch: 3,
        },
        hidden_truth: skeleton.hiddenTruths[0],
        importance: 2,
        progress: 0.1,
        player_opportunity: {
          exists: true,
          description: '开展调查以解开此地真相',
          discovery_condition: '探访聚落公告板与知情人士',
          type: 'QUEST',
        },
        created_at_epoch: 1,
        updated_at_epoch: 1,
      },
    ];

    const events: Event[] = [
      {
        id: idFactory.createId('event', 'init'),
        type: 'WORLD_STATE',
        description: `【创世纪元】${profile.display_name}的法则在世间流转。行路者在${locStart.name}踏上了全新的探索之途。`,
        location_id: locStart.id,
        involved_entity_ids: [pcId, npc1Id],
        cause: { type: 'WORLD_CREATION' },
        effects: [],
        epoch: 1,
        resolved: true,
        resolution_epoch: 1,
        created_at_epoch: 1,
      },
    ];

    return {
      characters,
      organizations: [organization],
      facts,
      seeds,
      events,
    };
  }
}
