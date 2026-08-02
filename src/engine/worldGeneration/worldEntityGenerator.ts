import { WorldProfile } from '../worldProfile/worldProfileTypes';
import { Location, Character, Organization, Seed, Event, WorldFact } from '../../types';
import { SkeletonGeneratorOutput } from './worldSkeletonGenerator';
import { DeterministicIdFactory } from './deterministicIdFactory';

export interface EntityGeneratorOutput {
  characters: Character[];
  organizations: Organization[];
  facts: WorldFact[];
  seeds: Seed[];
  events: Event[];
}

export class WorldEntityGenerator {
  public static generateEntities(
    profile: WorldProfile,
    skeleton: SkeletonGeneratorOutput,
    idFactory: DeterministicIdFactory
  ): EntityGeneratorOutput {
    const worldId = profile.world_id;
    const terms = profile.terminology;

    const locStart = skeleton.locations[0];
    const locTrade = skeleton.locations[1];

    const profession1 = terms.professionTerms?.[0] || '探索者';
    const factionName = terms.factionTerms?.[0] || '自由协客会';

    const pcId = idFactory.createId('pc', 'player');
    const npc1Id = idFactory.createId('npc', 'leader');
    const npc2Id = idFactory.createId('npc', 'merchant');
    const orgId = idFactory.createId('org', 'primary');

    const pc: Character = {
      id: pcId,
      type: 'PC',
      name: '初旅者',
      title: profession1,
      species: '人类',
      age: 21,
      status: 'ALIVE',
      presence_state: 'AT_LOCATION',
      location_id: locStart.id,
      goal: { primary: `在${profile.display_name}中解开古迹秘密并确立自身立足之地`, secondary: [] },
      personality: ['果敢', '好奇'],
      fear: '在未知荒野中失路',
      attributes: { hp: 100, max_hp: 100, mp: 50, max_mp: 50, strength: 12, dexterity: 12, intelligence: 14, charisma: 11 },
      skills: { '基础体术': 10, '察言观色': 10, '物资辨识': 10 },
      resources: { gold: 50, reputation: 10 },
      inventory: [
        { item_id: 'item-1', name: terms.artifactTerms?.[0] || '简易佩锋', type: 'WEAPON', quantity: 1 },
        { item_id: 'item-2', name: '行囊干粮', type: 'CONSUMABLE', quantity: 3 },
      ],
      knowledge: { known_facts: [`${locStart.name}的周边环境`], known_characters: [npc1Id], known_locations: [locStart.id] },
      memory: { short_term: [{ text: `踏入${locStart.name}`, importance: 5, epoch: 1 }], compressed: '', important_events: [] },
      relationships: [],
      current_action: { type: 'IDLE', description: `在${locStart.name}打听各方消息`, started_at_epoch: 1, estimated_end_epoch: 1 },
      frozen: false,
      simulation_level: 1,
      last_simulated_epoch: 1,
      created_at_epoch: 1,
      updated_at_epoch: 1,
    };

    const npc1: Character = {
      id: npc1Id,
      type: 'NPC',
      name: '林远',
      title: `${factionName}负责人`,
      species: '人类',
      age: 42,
      status: 'ALIVE',
      presence_state: 'AT_LOCATION',
      location_id: locStart.id,
      goal: { primary: `维持${locStart.name}的安宁与互助`, secondary: [] },
      personality: ['稳重', '周到'],
      fear: '势力纷争打碎聚落安宁',
      attributes: { hp: 110, max_hp: 110, mp: 40, max_mp: 40, strength: 13, dexterity: 11, intelligence: 13, charisma: 15 },
      skills: { '组织调度': 12, '谈判': 15 },
      resources: { gold: 300, reputation: 50 },
      inventory: [{ item_id: 'item-3', name: '聚落印信', type: 'MISC', quantity: 1 }],
      knowledge: { known_facts: [`${profile.display_name}的势力格局`], known_characters: [pcId], known_locations: [locStart.id, locTrade.id] },
      memory: { short_term: [{ text: `接待初旅者进入${locStart.name}`, importance: 3, epoch: 1 }], compressed: '', important_events: [] },
      relationships: [],
      current_action: { type: 'IDLE', description: '整理聚落的物资布告', started_at_epoch: 1, estimated_end_epoch: 1 },
      frozen: false,
      simulation_level: 1,
      last_simulated_epoch: 1,
      created_at_epoch: 1,
      updated_at_epoch: 1,
    };

    const npc2: Character = {
      id: npc2Id,
      type: 'NPC',
      name: '沈微',
      title: `集市行商`,
      species: '人类',
      age: 35,
      status: 'ALIVE',
      presence_state: 'AT_LOCATION',
      location_id: locTrade.id,
      goal: { primary: `搜集稀有材料`, secondary: [] },
      personality: ['敏锐', '精明'],
      fear: '货物在荒野被劫',
      attributes: { hp: 90, max_hp: 90, mp: 60, max_mp: 60, strength: 10, dexterity: 13, intelligence: 15, charisma: 14 },
      skills: { '鉴宝': 14, '议价': 16 },
      resources: { gold: 800, reputation: 30 },
      inventory: [{ item_id: 'item-4', name: '行商账册', type: 'MISC', quantity: 1 }],
      knowledge: { known_facts: [`${locTrade.name}物资价格`], known_characters: [], known_locations: [locTrade.id] },
      memory: { short_term: [{ text: '清点今日货物', importance: 2, epoch: 1 }], compressed: '', important_events: [] },
      relationships: [],
      current_action: { type: 'IDLE', description: '在商铺前理货', started_at_epoch: 1, estimated_end_epoch: 1 },
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
      description: `在${profile.display_name}中自发形成的探索与互助联盟。`,
      headquarters_id: locStart.id,
      territory_ids: [locStart.id],
      leader_id: npc1Id,
      member_ids: [pcId, npc1Id],
      resources: { wealth: 1000, influence: 40, military_power: 20, secret_knowledge: 10 },
      goals: [{ id: 'g1', description: '维护区域秩序并提供庇护', priority: 1, progress: 0.5, type: 'DEFENSE', status: 'ACTIVE', created_at_epoch: 1 }],
      projects: [{ id: 'p1', name: '探索遗迹前哨', description: '派员前往野外探查', assigned_member_ids: [pcId], epoch_started: 1, epoch_deadline: 5, progress: 0.1, status: 'IN_PROGRESS' }],
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
        statement: `${profile.display_name}各地正处于新的探索与交汇期。`,
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
          description: `${locStart.name}传来关于远方异象的探查委托。`,
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
          description: '接取探查任务以了解世界背后的秘密',
          discovery_condition: '前往聚落公告栏',
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
        description: `【世界创世】${profile.display_name}的秩序轮廓在天地间显现。旅者在${locStart.name}开启了新的旅程。`,
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
