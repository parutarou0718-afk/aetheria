/** @deprecated Test fixture only. Never use in production genesis. */
import { WorldTemplate } from '../../worldProfile/worldTemplateTypes';
import { WorldProfile } from '../../worldProfile/worldProfileTypes';
import { WorldSnapshot } from '../../../types';

export function createWastelandWorldTemplate(worldId: string): WorldTemplate {
  const profile: any = {
    world_id: worldId,
    genre: 'WASTELAND',
    genre_version: 1,
    display_name: '废土废墟',
    world_description: '核冬后的黄沙荒漠，坍塌的钢铁地堡，辐射狂暴者与瓶盖交易者。',
    cosmology: '旧文明在核火中化为灰烬，废土幸存者在废墟中苟延残喘。',
    power_system: '废土改枪、变异基因、战术机甲残骸、辐射抗体。',
    social_structure: '废土聚落、掠夺者军阀、拾荒者联盟、钢之兄弟会。',
    economy_system: '瓶盖、纯净水、净水芯片与弹药。',
    geography_style: '黄沙荒漠、破败地堡、辐射坑、废弃机场、荒野加油站。',
    currency_name: '瓶盖',
    energy_name: '燃油核电池',
    narrator_role: '废土记录者',
    narration_style: '粗粝沉重、末日荒凉、生存抉择。',
    profession_lexicon: ['拾荒者', '废土枪手', '废品机械师', '变异猎人', '掠夺者', '守卫者'],
    faction_lexicon: ['钢铁兄弟会', '荒野掠夺者', '绿洲拾荒互助会'],
    location_lexicon: ['黄沙镇', '73号地堡废墟', '辐射沙丘', '废弃加油站'],
    creature_lexicon: ['辐射巨蝎', '变异狂暴犬', '废土辐射人', '沙暴狂徒'],
    item_lexicon: ['瓶盖', '纯净水', '铁管步枪', '抗辐射药', '罐头肉', '核电池'],
    allowed_concepts: ['废土', '瓶盖', '辐射', '拾荒', '纯净水', '地堡', '变异', '黄沙', '掠夺者'],
    forbidden_concepts: ['灵石', '灵力', '宗门', '坊市', '散修', '元婴', '筑基', '飞剑'],
    default_player_origin: '地堡出身的独行拾荒者',
    default_player_title: '荒野浪客',
    created_at_epoch: 1,
    updated_at_epoch: 1,
  };

  const snapshot: WorldSnapshot = {
    id: worldId,
    epoch: 1,
    created_at: new Date().toISOString(),
    world_name: '废土废墟',
    world_description: '核冬后的黄沙荒漠，坍塌的钢铁地堡，辐射狂暴者与瓶盖交易者。',
    world_creation_state: 'CREATED',
    seed: 7777,
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
