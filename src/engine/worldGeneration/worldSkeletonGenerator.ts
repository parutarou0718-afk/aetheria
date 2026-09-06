import { WorldProfile } from '../worldProfile/worldProfileTypes';
import { WorldAxiom } from './worldAxiomTypes';
import { Location, LocationEdge, HiddenTruth } from '../../types';
import { DeterministicIdFactory } from './deterministicIdFactory';
import { ZodSkeletonOutput } from './zodSchemas';
import { aiService } from '../ai/aiService';
import { WorldSkeletonGenerationError } from '../worldProfile/worldProfileErrors';

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
    const system = [
      'You are an AI RPG Skeleton Architect. Generate the world map (locations + connections) and hidden truths',
      'strictly matching the supplied World Profile and Axioms. Never use generic Western-fantasy tropes or',
      'placeholders that were not requested. The world may be non-Western or radically non-standard, so honor',
      'its terminology, geography, technology, and the required/forbidden concept lists exactly.',
    ].join(' ');

    const user = `World Display Name: ${profile.display_name}
Description: ${profile.world_description}
Technology: ${profile.technology_model}
Geography: ${profile.geography_model}
Social Structure: ${profile.social_structure}
Terminology: ${JSON.stringify(profile.terminology)}
Axioms: ${JSON.stringify(axioms.map((a) => a.statement))}
Allowed Concepts: ${JSON.stringify(profile.allowed_concepts)}
Forbidden Concepts: ${JSON.stringify(profile.forbidden_concepts)}

Requirements:
1. Generate 3 to 5 locations matching the world's geography, scale, and technology. Locations types may be any of:
   TOWN|CITY|FOREST|CAVE|MOUNTAIN|RUINS|PORT|FORTRESS|TEMPLE|WASTELAND|STATION|VOID|OTHER.
2. Generate 4 hidden truths across distinct layers:
   layer_1_personal_secrets, layer_2_organization_conspiracies, layer_3_world_lies, layer_4_cosmic_illusions.
3. DO NOT use generic tropes or unrequested placeholders. Match the specific vision and terminology of this world.
4. Do NOT use any Forbidden Concept, anywhere.

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

    const parsed = await this.invokeAi(system, user, profile.world_id);

    try {
      const validated = ZodSkeletonOutput.safeParse(parsed);
      if (!validated.success) {
        throw new WorldSkeletonGenerationError(
          `AI returned malformed skeleton JSON: ${this.safeIssue(validated)}`
        );
      }
      return this.buildSkeletonFromParsed(validated.data, profile, axioms, idFactory);
    } catch (err) {
      if (err instanceof WorldSkeletonGenerationError) throw err;
      throw new WorldSkeletonGenerationError(
        `Failed to interpret AI skeleton output: ${(err as Error).message}`
      );
    }
  }

  private static async invokeAi(system: string, user: string, worldId: string): Promise<any> {
    try {
      return await aiService.generateJson({ userId: 'SYSTEM_USER', worldId, purpose: 'WORLD_SKELETON' }, system, user, {
        timeoutMs: 30000,
        jsonSchemaHint: 'Return strictly a JSON object with keys "locations" and "hiddenTruths".',
      });
    } catch (err) {
      throw new WorldSkeletonGenerationError(
        `World skeleton generation failed: ${(err as Error).message}`
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
}
