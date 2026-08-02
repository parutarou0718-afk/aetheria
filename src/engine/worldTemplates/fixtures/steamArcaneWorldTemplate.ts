/** @deprecated Test fixture only. Never use in production genesis. */
import { WorldTemplate } from '../../worldProfile/worldTemplateTypes';
import { WorldProfile } from '../../worldProfile/worldProfileTypes';
import {
  WorldSnapshot,
  Character,
  Location,
  LocationEdge,
  Organization,
  WorldFact,
  HiddenTruth,
  Seed,
  Event,
} from '../../../types';

export function createSteamArcaneWorldTemplate(worldId: string): WorldTemplate {
  const profile: any = {
    world_id: worldId,
    genre: 'STEAM_ARCANUM',
    genre_version: 1,
    display_name: '蒸辉洲',
    world_description: '蒸汽高炉吐着黑烟，魔导机关与古老符文在齿轮交错中轰鸣。',
    cosmology: '魔导以太流转于地壳之下，巨型蒸汽飞艇与机械齿轮构建凡世帝国。',
    power_system: '魔导机械、元素炼金、精金构装、以太回路。',
    social_structure: '帝国王室、魔导师议会、雇佣兵公会、黑鸦商会、圣光守卫团。',
    economy_system: '金币与银币，以太精晶作为工业核心战略资源。',
    geography_style: '雾都城关、机械高塔、黑烟矿井、微光地下城、巨石遗迹。',
    currency_name: '金币',
    energy_name: '以太',
    narrator_role: '地下城主',
    narration_style: '蒸汽朋克与暗黑魔幻交叉，沉重机械感与以太微光。',
    profession_lexicon: ['雇佣兵', '魔导师', '炼金术士', '构装机械师', '圣骑士', '赏金猎人'],
    faction_lexicon: ['红叶雇佣兵酒馆', '圣光守卫团', '黑鸦商会', '魔导师议会'],
    location_lexicon: ['红叶酒馆', '铁冠城下城区', '蒸汽高炉厂', '以太矿洞'],
    creature_lexicon: ['精金构装体', '以太魔物', '发条机械犬', '地底变异兽'],
    item_lexicon: ['金币', '精金战锤', '以太药剂', '蒸汽连发枪', '魔导手枪', '黑麦啤酒'],
    allowed_concepts: [
      '蒸汽', '煤烟', '魔导', '雇佣兵', '骑士', '金币', '以太', '构装', '黑麦啤酒', '高炉'
    ],
    forbidden_concepts: [
      '灵石', '灵力', '宗门', '坊市', '散修', '元婴', '筑基', '飞剑', '乾坤袋',
      '赛博黑客', '黑客', '超音速战机', '核辐射', '辐射废土'
    ],
    default_player_origin: '老牌雇佣兵',
    default_player_title: '雇佣兵客卿',
    created_at_epoch: 1,
    updated_at_epoch: 1,
  };

  const snapshot: WorldSnapshot = {
    id: worldId,
    epoch: 1,
    created_at: new Date().toISOString(),
    world_name: '蒸辉洲',
    world_description: '蒸汽高炉吐着黑烟，魔导机关与古老符文在齿轮交错中轰鸣。',
    world_creation_state: 'CREATED',
    seed: 1234,
    world_facts_count: 3,
    characters_count: 4,
    organizations_count: 3,
    locations_count: 3,
    active_seeds_count: 3,
    frozen_objects_count: 0,
    completed_epochs: 0,
  };

  const locations: any[] = [
    {
      id: 'loc-tavern',
      world_id: worldId,
      name: '红叶酒馆',
      type: 'TOWN',
      description: '位于铁冠城下城区的雇佣兵酒馆，空气中弥漫着黑麦啤酒与蒸汽机油的气味。',
      status: 'ACTIVE',
      child_ids: [],
      connected_to: ['loc-iron-city'],
      population: 50,
      population_trend: 'STABLE',
      economy: { primary_industry: 'TRADE', wealth_level: 'MEDIUM', trade_volume: 'ACTIVE' },
      security: { crime_rate: 0.4, guard_presence: 'LOW', danger_level: 'SAFE' },
      active_events: [],
      features: ['黑麦啤酒', '悬赏板'],
      frozen: false,
      simulation_level: 1,
      last_simulated_epoch: 1,
      created_at_epoch: 1,
      updated_at_epoch: 1,
    },
  ];

  const locationEdges: LocationEdge[] = [];
  const characters: Character[] = [];
  const organizations: Organization[] = [];
  const facts: WorldFact[] = [];
  const hiddenTruths: HiddenTruth[] = [];
  const seeds: Seed[] = [];
  const events: Event[] = [];

  return {
    profile,
    snapshot,
    characters,
    locations,
    locationEdges,
    organizations,
    facts,
    hiddenTruths,
    seeds,
    events,
  } as any as WorldTemplate;
}
