import { WorldProfile } from '../worldProfile/worldProfileTypes';
import { WorldAxiom } from './worldAxiomTypes';
import { Location, LocationEdge, HiddenTruth } from '../../types';
import { DeterministicIdFactory } from './deterministicIdFactory';

export interface SkeletonGeneratorOutput {
  locations: Location[];
  locationEdges: LocationEdge[];
  hiddenTruths: HiddenTruth[];
}

export class WorldSkeletonGenerator {
  public static generateSkeleton(
    profile: WorldProfile,
    axioms: WorldAxiom[],
    idFactory: DeterministicIdFactory
  ): SkeletonGeneratorOutput {
    const worldId = profile.world_id;
    const terms = profile.terminology;

    const settlementName = terms.settlementTerms?.[0] || '青云小镇';
    const cityAreaName = terms.settlementTerms?.[1] || '中心集市';
    const wildernessName = terms.wildernessTerms?.[0] || '幽谷林莽';
    const ruinName = terms.wildernessTerms?.[1] || '古荒遗迹';

    const loc1Id = idFactory.createId('loc', 'town');
    const loc2Id = idFactory.createId('loc', 'market');
    const loc3Id = idFactory.createId('loc', 'wilds');
    const loc4Id = idFactory.createId('loc', 'ruin');

    const locations: Location[] = [
      {
        id: loc1Id,
        name: settlementName,
        type: 'TOWN',
        description: `这是位于${profile.display_name}边陲落脚的平静聚落，来往旅者在此歇息交流信息。`,
        status: 'ACTIVE',
        child_ids: [],
        connected_to: [loc2Id],
        population: 60,
        population_trend: 'STABLE',
        economy: { primary_industry: 'TRADE', wealth_level: 50, trade_goods: ['日常补给'], trade_routes: [loc2Id] },
        security: { crime_rate: 15, guard_presence: 40 },
        active_events: [],
        features: [{ name: '旅者歇脚处', description: '提供修整与消息打听的地方', state: 'NORMAL' }],
        frozen: false,
        simulation_level: 1,
        last_simulated_epoch: 1,
        created_at_epoch: 1,
        updated_at_epoch: 1,
      },
      {
        id: loc2Id,
        name: cityAreaName,
        type: 'CITY',
        description: `依托要道建立的繁忙交易场所，陈列着来自各地的稀有物品与${terms.currencyTerms?.[0] || '货币'}。`,
        status: 'ACTIVE',
        child_ids: [],
        connected_to: [loc1Id, loc3Id],
        population: 250,
        population_trend: 'STABLE',
        economy: { primary_industry: 'TRADE', wealth_level: 75, trade_goods: ['装备', '特殊材料'], trade_routes: [loc1Id, loc3Id] },
        security: { crime_rate: 25, guard_presence: 60 },
        active_events: [],
        features: [{ name: '集市摊位', description: '商贩云集的交易长廊', state: 'NORMAL' }],
        frozen: false,
        simulation_level: 1,
        last_simulated_epoch: 1,
        created_at_epoch: 1,
        updated_at_epoch: 1,
      },
      {
        id: loc3Id,
        name: wildernessName,
        type: 'FOREST',
        description: `集市外围被雾气笼罩的野外区域，有出没的${terms.creatureTerms?.[0] || '异兽'}，环境潜藏危险。`,
        status: 'ACTIVE',
        child_ids: [],
        connected_to: [loc2Id, loc4Id],
        population: 15,
        population_trend: 'STABLE',
        economy: { primary_industry: 'GATHERING', wealth_level: 20, trade_goods: ['野外草药'], trade_routes: [loc2Id] },
        security: { crime_rate: 60, guard_presence: 0 },
        active_events: [],
        features: [{ name: '野生栖息地', description: '充满未知危险与自然资源的区域', state: 'HAZARDOUS' }],
        frozen: false,
        simulation_level: 1,
        last_simulated_epoch: 1,
        created_at_epoch: 1,
        updated_at_epoch: 1,
      },
      {
        id: loc4Id,
        name: ruinName,
        type: 'CAVE',
        description: `隐藏在深处的历史古迹，蕴藏着失传的古代${terms.artifactTerms?.[0] || '遗物'}与神秘机关。`,
        status: 'ACTIVE',
        child_ids: [],
        connected_to: [loc3Id],
        population: 0,
        population_trend: 'STABLE',
        economy: { primary_industry: 'EXPLORATION', wealth_level: 90, trade_goods: ['古代遗物'], trade_routes: [] },
        security: { crime_rate: 80, guard_presence: 0 },
        active_events: [],
        features: [{ name: '古迹核心', description: '封印着古老历史的遗迹深处', state: 'DANGEROUS' }],
        frozen: false,
        simulation_level: 1,
        last_simulated_epoch: 1,
        created_at_epoch: 1,
        updated_at_epoch: 1,
      },
    ];

    const locationEdges: LocationEdge[] = [
      {
        id: idFactory.createId('edge', '1-2'),
        world_id: worldId,
        from_location_id: loc1Id,
        to_location_id: loc2Id,
        distance: 1.0,
        travel_cost: 1.0,
        travel_time_epochs: 1,
        status: 'OPEN',
      },
      {
        id: idFactory.createId('edge', '2-1'),
        world_id: worldId,
        from_location_id: loc2Id,
        to_location_id: loc1Id,
        distance: 1.0,
        travel_cost: 1.0,
        travel_time_epochs: 1,
        status: 'OPEN',
      },
      {
        id: idFactory.createId('edge', '2-3'),
        world_id: worldId,
        from_location_id: loc2Id,
        to_location_id: loc3Id,
        distance: 2.5,
        travel_cost: 2.0,
        travel_time_epochs: 1,
        status: 'OPEN',
      },
      {
        id: idFactory.createId('edge', '3-2'),
        world_id: worldId,
        from_location_id: loc3Id,
        to_location_id: loc2Id,
        distance: 2.5,
        travel_cost: 2.0,
        travel_time_epochs: 1,
        status: 'OPEN',
      },
      {
        id: idFactory.createId('edge', '3-4'),
        world_id: worldId,
        from_location_id: loc3Id,
        to_location_id: loc4Id,
        distance: 4.0,
        travel_cost: 4.0,
        travel_time_epochs: 2,
        status: 'OPEN',
      },
      {
        id: idFactory.createId('edge', '4-3'),
        world_id: worldId,
        from_location_id: loc4Id,
        to_location_id: loc3Id,
        distance: 4.0,
        travel_cost: 4.0,
        travel_time_epochs: 2,
        status: 'OPEN',
      },
    ];

    const hiddenTruths: HiddenTruth[] = [
      {
        id: idFactory.createId('ht', 1),
        title: `${settlementName}的聚落守护石并非天然，而是人为安放的监测装置`,
        layer: 'layer_1_personal_secrets',
        layer_name: '个人秘密',
        exists: true,
        true_nature: '守护石在缓慢记录着每一个出入聚落者的能量波动。',
        revealed: false,
        revealed_to_ids: [],
        locked_at_epoch: 1,
        never_changes: true,
        evidence_required: ['守护石基座铭文', '能量波动记录册'],
        evidence_collected: [],
      },
      {
        id: idFactory.createId('ht', 2),
        title: `${cityAreaName}的大商会暗中控制着野外资源的配给`,
        layer: 'layer_2_organization_conspiracies',
        layer_name: '组织阴谋',
        exists: true,
        true_nature: '为了维持物资高价，商会故意限制了前往古迹的通行许可证。',
        revealed: false,
        revealed_to_ids: [],
        locked_at_epoch: 1,
        never_changes: true,
        evidence_required: ['商会秘密账本'],
        evidence_collected: [],
      },
      {
        id: idFactory.createId('ht', 3),
        title: `${wildernessName}中的异象并非自然天灾，而是古代封印破损`,
        layer: 'layer_3_world_lies',
        layer_name: '世界谎言',
        exists: true,
        true_nature: '封印之下镇压着失控的能量源，一旦爆发将重塑周围环境。',
        revealed: false,
        revealed_to_ids: [],
        locked_at_epoch: 1,
        never_changes: true,
        evidence_required: ['破损封印残片'],
        evidence_collected: [],
      },
      {
        id: idFactory.createId('ht', 4),
        title: `${profile.display_name}的本源规则正在经历周期性重构`,
        layer: 'layer_4_cosmic_illusions',
        layer_name: '宇宙假象',
        exists: true,
        true_nature: '世界的核心力量每隔千年将重新梳理文明的秩序。',
        revealed: false,
        revealed_to_ids: [],
        locked_at_epoch: 1,
        never_changes: true,
        evidence_required: ['千年前的古纪年碑'],
        evidence_collected: [],
      },
    ];

    return { locations, locationEdges, hiddenTruths };
  }
}
