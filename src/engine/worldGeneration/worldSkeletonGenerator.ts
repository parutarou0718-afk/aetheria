import { GoogleGenAI } from '@google/genai';
import { WorldProfile } from '../worldProfile/worldProfileTypes';
import { WorldAxiom } from './worldAxiomTypes';
import { Location, LocationEdge, HiddenTruth } from '../../types';
import { DeterministicIdFactory } from './deterministicIdFactory';
import { ZodSkeletonOutput } from './zodSchemas';

export interface SkeletonGeneratorOutput {
  locations: Location[];
  locationEdges: LocationEdge[];
  hiddenTruths: HiddenTruth[];
}

export class WorldSkeletonGenerator {
  public static async generateSkeleton(
    profile: WorldProfile,
    axioms: WorldAxiom[],
    idFactory: DeterministicIdFactory
  ): Promise<SkeletonGeneratorOutput> {
    const apiKey = process.env.GEMINI_API_KEY;

    if (apiKey && apiKey !== 'MY_GEMINI_API_KEY') {
      try {
        const ai = new GoogleGenAI({ apiKey });
        const prompt = `You are an AI RPG Skeleton Architect. Generate locations, connections, and hidden truths for the world based strictly on this World Profile and Axioms.
Display Name: ${profile.display_name}
Description: ${profile.world_description}
Technology: ${profile.technology_model}
Geography: ${profile.geography_model}
Social Structure: ${profile.social_structure}
Terminology: ${JSON.stringify(profile.terminology)}
Axioms: ${JSON.stringify(axioms.map((a) => a.statement))}
Allowed Concepts: ${JSON.stringify(profile.allowed_concepts)}
Forbidden Concepts: ${JSON.stringify(profile.forbidden_concepts)}

Requirements:
1. Generate 3 to 5 locations matching the world's geography and technology. Include at least 1 settlement and 1 wilderness/ruins.
2. Generate 4 hidden truths across distinct layers (layer_1_personal_secrets, layer_2_organization_conspiracies, layer_3_world_lies, layer_4_cosmic_illusions).
3. DO NOT use generic tropes or unrequested placeholders. Match the specific vision and terminology of this world.

Return JSON ONLY matching:
{
  "locations": [
    {
      "idKey": "start",
      "name": "string",
      "type": "TOWN|CITY|FOREST|CAVE|MOUNTAIN|RUINS|PORT|FORTRESS|TEMPLE|WASTELAND|STATION|VOID|OTHER",
      "description": "string",
      "population": 100,
      "connectedToKeyIds": ["market"],
      "primaryIndustry": "string",
      "tradeGoods": ["string"],
      "featureName": "string",
      "featureDescription": "string"
    }
  ],
  "hiddenTruths": [
    {
      "title": "string",
      "layer": "layer_1_personal_secrets|layer_2_organization_conspiracies|layer_3_world_lies|layer_4_cosmic_illusions",
      "layerName": "string",
      "trueNature": "string",
      "evidenceRequired": ["string"]
    }
  ]
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
          const validated = ZodSkeletonOutput.safeParse(rawParsed);
          if (validated.success) {
            return this.buildSkeletonFromParsed(validated.data, profile, axioms, idFactory);
          }
        }
      } catch (err) {
        console.warn('[WorldSkeletonGenerator] AI skeleton generation failed. Falling back to dynamic profile generator.', err);
      }
    }

    return this.generateProfileDrivenSkeleton(profile, axioms, idFactory);
  }

  private static buildSkeletonFromParsed(
    parsed: any,
    profile: WorldProfile,
    axioms: WorldAxiom[],
    idFactory: DeterministicIdFactory
  ): SkeletonGeneratorOutput {
    const worldId = profile.world_id;
    const rawLocs: any[] = parsed.locations || [];

    // Map idKey to generated locId
    const keyToLocId = new Map<string, string>();
    rawLocs.forEach((rl, idx) => {
      const key = rl.idKey || `loc${idx + 1}`;
      const locId = idFactory.createId('loc', key);
      keyToLocId.set(key, locId);
    });

    const locations: Location[] = rawLocs.map((rl, idx) => {
      const key = rl.idKey || `loc${idx + 1}`;
      const locId = keyToLocId.get(key)!;
      const connectedKeyIds: string[] = Array.isArray(rl.connectedToKeyIds) ? rl.connectedToKeyIds : [];
      const connectedLocIds = connectedKeyIds
        .map((k) => keyToLocId.get(k))
        .filter((id): id is string => Boolean(id) && id !== locId);

      return {
        id: locId,
        name: rl.name || `区域${idx + 1}`,
        type: rl.type || 'TOWN',
        description: rl.description || `位于${profile.display_name}内的重要枢纽。`,
        status: 'ACTIVE',
        child_ids: [],
        connected_to: connectedLocIds,
        population: typeof rl.population === 'number' ? rl.population : 100,
        population_trend: 'STABLE',
        economy: {
          primary_industry: rl.primaryIndustry || 'TRADE',
          wealth_level: 50,
          trade_goods: Array.isArray(rl.tradeGoods) && rl.tradeGoods.length ? rl.tradeGoods : [profile.terminology.currencyTerms?.[0] || '特产'],
          trade_routes: connectedLocIds,
        },
        security: { crime_rate: 20, guard_presence: 40 },
        active_events: [],
        features: [{ name: rl.featureName || '核心地标', description: rl.featureDescription || '活动场所', state: 'NORMAL' }],
        frozen: false,
        simulation_level: 1,
        last_simulated_epoch: 1,
        created_at_epoch: 1,
        updated_at_epoch: 1,
      };
    });

    // Ensure all locations form a connected graph
    if (locations.length > 1) {
      for (let i = 0; i < locations.length - 1; i++) {
        const current = locations[i];
        const next = locations[i + 1];
        if (!current.connected_to.includes(next.id)) {
          current.connected_to.push(next.id);
        }
        if (!next.connected_to.includes(current.id)) {
          next.connected_to.push(current.id);
        }
      }
    }

    // Generate bidirectional LocationEdge[]
    const edgesMap = new Map<string, LocationEdge>();
    locations.forEach((loc) => {
      loc.connected_to.forEach((targetId) => {
        const edgeKey = `${loc.id}->${targetId}`;
        if (!edgesMap.has(edgeKey)) {
          const edgeId = idFactory.createId('edge', `${loc.id}-${targetId}`);
          edgesMap.set(edgeKey, {
            id: edgeId,
            world_id: worldId,
            from_location_id: loc.id,
            to_location_id: targetId,
            distance: 1.5,
            travel_cost: 1.0,
            travel_time_epochs: 1,
            status: 'OPEN',
          });
        }
      });
    });
    const locationEdges = Array.from(edgesMap.values());

    // Hidden Truths
    const rawTruths: any[] = parsed.hiddenTruths || [];
    const hiddenTruths: HiddenTruth[] = rawTruths.map((ht, idx) => ({
      id: idFactory.createId('ht', idx + 1),
      title: ht.title || `${profile.display_name}的深层隐秘`,
      layer: ht.layer || (['layer_1_personal_secrets', 'layer_2_organization_conspiracies', 'layer_3_world_lies', 'layer_4_cosmic_illusions'][idx % 4] as any),
      layer_name: ht.layerName || '暗流真相',
      exists: true,
      true_nature: ht.trueNature || '隐藏在这片土地背后的本源真相。',
      revealed: false,
      revealed_to_ids: [],
      locked_at_epoch: 1,
      never_changes: true,
      evidence_required: Array.isArray(ht.evidenceRequired) && ht.evidenceRequired.length ? ht.evidenceRequired : ['关键线索'],
      evidence_collected: [],
    }));

    return { locations, locationEdges, hiddenTruths };
  }

  private static generateProfileDrivenSkeleton(
    profile: WorldProfile,
    axioms: WorldAxiom[],
    idFactory: DeterministicIdFactory
  ): SkeletonGeneratorOutput {
    const worldId = profile.world_id;
    const terms = profile.terminology;

    const loc1Name = terms.settlementTerms?.[0] || '第一枢纽';
    const loc2Name = terms.settlementTerms?.[1] || '核心集市';
    const loc3Name = terms.wildernessTerms?.[0] || '边界荒原';
    const loc4Name = terms.wildernessTerms?.[1] || '遗迹地心';

    const loc1Id = idFactory.createId('loc', 'start');
    const loc2Id = idFactory.createId('loc', 'center');
    const loc3Id = idFactory.createId('loc', 'wilds');
    const loc4Id = idFactory.createId('loc', 'ruin');

    const locations: Location[] = [
      {
        id: loc1Id,
        name: loc1Name,
        type: 'TOWN',
        description: `这是${profile.display_name}中各方聚拢的起点，供行客修整交流信息。`,
        status: 'ACTIVE',
        child_ids: [],
        connected_to: [loc2Id],
        population: 80,
        population_trend: 'STABLE',
        economy: { primary_industry: 'TRADE', wealth_level: 50, trade_goods: [terms.currencyTerms?.[0] || '物资'], trade_routes: [loc2Id] },
        security: { crime_rate: 10, guard_presence: 50 },
        active_events: [],
        features: [{ name: '信息与修整处', description: '来往旅人歇息与交易的场所', state: 'NORMAL' }],
        frozen: false,
        simulation_level: 1,
        last_simulated_epoch: 1,
        created_at_epoch: 1,
        updated_at_epoch: 1,
      },
      {
        id: loc2Id,
        name: loc2Name,
        type: 'CITY',
        description: `繁忙的物资与信息交汇地，流通着各地特产与${terms.currencyTerms?.[0] || '物资'}。`,
        status: 'ACTIVE',
        child_ids: [],
        connected_to: [loc1Id, loc3Id],
        population: 300,
        population_trend: 'STABLE',
        economy: { primary_industry: 'TRADE', wealth_level: 80, trade_goods: [terms.artifactTerms?.[0] || '珍宝'], trade_routes: [loc1Id, loc3Id] },
        security: { crime_rate: 20, guard_presence: 70 },
        active_events: [],
        features: [{ name: '交汇长廊', description: '各方势力设立的办事机构与交易广场', state: 'NORMAL' }],
        frozen: false,
        simulation_level: 1,
        last_simulated_epoch: 1,
        created_at_epoch: 1,
        updated_at_epoch: 1,
      },
      {
        id: loc3Id,
        name: loc3Name,
        type: 'FOREST',
        description: `围绕主城区延伸的险峻野外，栖息着${terms.creatureTerms?.[0] || '异种'}，潜藏着未知危险。`,
        status: 'ACTIVE',
        child_ids: [],
        connected_to: [loc2Id, loc4Id],
        population: 20,
        population_trend: 'STABLE',
        economy: { primary_industry: 'GATHERING', wealth_level: 25, trade_goods: ['野外原能'], trade_routes: [loc2Id] },
        security: { crime_rate: 50, guard_presence: 10 },
        active_events: [],
        features: [{ name: '危险栖息带', description: '充满了未被开发的天然资源', state: 'HAZARDOUS' }],
        frozen: false,
        simulation_level: 1,
        last_simulated_epoch: 1,
        created_at_epoch: 1,
        updated_at_epoch: 1,
      },
      {
        id: loc4Id,
        name: loc4Name,
        type: 'RUIN',
        description: `藏于深处的古老痕迹，封存着失传的${terms.artifactTerms?.[0] || '古物'}与核心法则。`,
        status: 'ACTIVE',
        child_ids: [],
        connected_to: [loc3Id],
        population: 0,
        population_trend: 'STABLE',
        economy: { primary_industry: 'EXPLORATION', wealth_level: 95, trade_goods: ['核心古物'], trade_routes: [] },
        security: { crime_rate: 85, guard_presence: 0 },
        active_events: [],
        features: [{ name: '古痕核心', description: '封印着本源秘辛的遗迹深处', state: 'DANGEROUS' }],
        frozen: false,
        simulation_level: 1,
        last_simulated_epoch: 1,
        created_at_epoch: 1,
        updated_at_epoch: 1,
      },
    ];

    const locationEdges: LocationEdge[] = [
      { id: idFactory.createId('edge', '1-2'), world_id: worldId, from_location_id: loc1Id, to_location_id: loc2Id, distance: 1.0, travel_cost: 1.0, travel_time_epochs: 1, status: 'OPEN' },
      { id: idFactory.createId('edge', '2-1'), world_id: worldId, from_location_id: loc2Id, to_location_id: loc1Id, distance: 1.0, travel_cost: 1.0, travel_time_epochs: 1, status: 'OPEN' },
      { id: idFactory.createId('edge', '2-3'), world_id: worldId, from_location_id: loc2Id, to_location_id: loc3Id, distance: 2.0, travel_cost: 2.0, travel_time_epochs: 1, status: 'OPEN' },
      { id: idFactory.createId('edge', '3-2'), world_id: worldId, from_location_id: loc3Id, to_location_id: loc2Id, distance: 2.0, travel_cost: 2.0, travel_time_epochs: 1, status: 'OPEN' },
      { id: idFactory.createId('edge', '3-4'), world_id: worldId, from_location_id: loc3Id, to_location_id: loc4Id, distance: 3.5, travel_cost: 3.0, travel_time_epochs: 2, status: 'OPEN' },
      { id: idFactory.createId('edge', '4-3'), world_id: worldId, from_location_id: loc4Id, to_location_id: loc3Id, distance: 3.5, travel_cost: 3.0, travel_time_epochs: 2, status: 'OPEN' },
    ];

    const hiddenTruths: HiddenTruth[] = [
      {
        id: idFactory.createId('ht', 1),
        title: `${loc1Name}的古旧结界并非天然形成，而是人为建立的监控机关`,
        layer: 'layer_1_personal_secrets',
        layer_name: '个人秘密',
        exists: true,
        true_nature: '结界正持续记录着每一个出入人员的能量异动。',
        revealed: false,
        revealed_to_ids: [],
        locked_at_epoch: 1,
        never_changes: true,
        evidence_required: ['结界基座符文'],
        evidence_collected: [],
      },
      {
        id: idFactory.createId('ht', 2),
        title: `${loc2Name}的大势力暗中盘剥野外资源的分配`,
        layer: 'layer_2_organization_conspiracies',
        layer_name: '组织阴谋',
        exists: true,
        true_nature: '势力通过人为制造资源短缺来掌握市场定价权。',
        revealed: false,
        revealed_to_ids: [],
        locked_at_epoch: 1,
        never_changes: true,
        evidence_required: ['秘密配给密卷'],
        evidence_collected: [],
      },
      {
        id: idFactory.createId('ht', 3),
        title: `${loc3Name}中的能量异常并非自然现象，而是古老封印泄露`,
        layer: 'layer_3_world_lies',
        layer_name: '世界谎言',
        exists: true,
        true_nature: '封印之下潜伏着古代失控的本源能量。',
        revealed: false,
        revealed_to_ids: [],
        locked_at_epoch: 1,
        never_changes: true,
        evidence_required: ['破损封印碎片'],
        evidence_collected: [],
      },
      {
        id: idFactory.createId('ht', 4),
        title: `${profile.display_name}的底层物理与魔法规则正在经历周期性重塑`,
        layer: 'layer_4_cosmic_illusions',
        layer_name: '宇宙假象',
        exists: true,
        true_nature: '世间的秩序每隔长久纪元便会由核心法则强行调整。',
        revealed: false,
        revealed_to_ids: [],
        locked_at_epoch: 1,
        never_changes: true,
        evidence_required: ['古纪年碑铭文'],
        evidence_collected: [],
      },
    ];

    return { locations, locationEdges, hiddenTruths };
  }
}
