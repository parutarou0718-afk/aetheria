/** @deprecated Test fixture only. Never use in production genesis. */
import { WorldTemplate } from '../../worldProfile/worldTemplateTypes';
import { WorldProfile } from '../../worldProfile/worldProfileTypes';
import { WorldSnapshot } from '../../../types';

export function createCyberpunkWorldTemplate(worldId: string): WorldTemplate {
  const profile: any = {
    world_id: worldId,
    genre: 'CYBERPUNK',
    genre_version: 1,
    display_name: '新九龙霓虹界',
    world_description: '高耸入云的巨企大厦，永不停息的酸雨，深巷中的霓虹灯牌与黑客深网。',
    cosmology: '物理现实与深层赛博网络（DeepNet）构成的双重空间。',
    power_system: '义体植入、网络入侵、高阶AI算力、战斗芯片。',
    social_structure: '跨国巨企、地下义体帮派、黑客义佣、执法安保公司。',
    economy_system: '欧罗币（EuroDollar）与加密数据货币。',
    geography_style: '霓虹雨夜街区、巨企总部高塔、黑客地下吧、垃圾回收下水道。',
    currency_name: '欧元',
    energy_name: '电力算力',
    narrator_role: '深网监控AI',
    narration_style: '冷硬赛博、科技术语、黑客俚语。',
    profession_lexicon: ['黑客', '义佣', '黑医', '巨企特工', '街头混混', '网路浪客'],
    faction_lexicon: ['荒坂重工', '新九龙黑客帮', '夜巡安保公司'],
    location_lexicon: ['霓虹暗巷', '深网吧', '荒坂高塔', '黑市义体诊所'],
    creature_lexicon: ['战斗流浪者', 'AI流窜体', '强化义体狂暴者'],
    item_lexicon: ['欧元', '黑客接入仓', '单分子线', '神经药剂', '高频振动刃'],
    allowed_concepts: ['赛博', '黑客', '义体', '巨企', '欧元', '深网', '霓虹', '芯片', '义佣'],
    forbidden_concepts: ['灵石', '灵力', '宗门', '坊市', '散修', '元婴', '筑基', '飞剑'],
    default_player_origin: '自由黑客义佣',
    default_player_title: '潜网者',
    created_at_epoch: 1,
    updated_at_epoch: 1,
  };

  const snapshot: WorldSnapshot = {
    id: worldId,
    epoch: 1,
    created_at: new Date().toISOString(),
    world_name: '新九龙霓虹界',
    world_description: '高耸入云的巨企大厦，永不停息的酸雨，深巷中的霓虹灯牌与黑客深网。',
    world_creation_state: 'CREATED',
    seed: 5555,
    world_facts_count: 0,
    characters_count: 0,
    organizations_count: 0,
    locations_count: 0,
    active_seeds_count: 0,
    frozen_objects_count: 0,
    completed_epochs: 0,
  };

  return {
    profile,
    snapshot,
    characters: [],
    locations: [],
    locationEdges: [],
    organizations: [],
    facts: [],
    hiddenTruths: [],
    seeds: [],
    events: [],
  } as any;
}
