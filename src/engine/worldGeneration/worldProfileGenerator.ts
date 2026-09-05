import { WorldCreationRequest } from './worldCreationRequest';
import { WorldProfile } from '../worldProfile/worldProfileTypes';
import { WorldAxiom } from './worldAxiomTypes';
import { DeterministicIdFactory } from './deterministicIdFactory';
import { ZodWorldProfileOutput } from './zodSchemas';
import { generateJson } from '../llm/llmClient';
import { WorldProfileGenerationError } from '../worldProfile/worldProfileErrors';

export interface ProfileGeneratorOutput {
  profile: WorldProfile;
  axioms: WorldAxiom[];
}

export class WorldProfileGenerator {
  public static async generateProfileAndAxioms(
    request: WorldCreationRequest,
    idFactory: DeterministicIdFactory
  ): Promise<ProfileGeneratorOutput> {
    // Merge required and forbidden concepts
    const requiredConcepts = Array.from(
      new Set([
        ...(request.constraints?.requiredElements || []),
        ...(request.constraints?.required_concepts || []),
      ])
    ).map((s) => s.trim()).filter(Boolean);

    const forbiddenConcepts = Array.from(
      new Set([
        ...(request.constraints?.forbiddenElements || []),
        ...(request.constraints?.forbidden_concepts || []),
      ])
    ).map((s) => s.trim()).filter(Boolean);

    const system = [
      'You are an AI World Constitution Architect. Create a world profile and world axioms for a new RPG',
      'based strictly on the user vision and constraints. Do NOT inject Western-fantasy defaults that the user',
      'did not ask for. Honor every Required Concept and strictly avoid every Forbidden Concept. The world may',
      'be non-Western, non-mechanistic, or radically non-standard.',
    ].join(' ');

    const user = `User Vision: ${request.userVision}
Constraints: ${JSON.stringify(request.constraints || {})}
Required Concepts (MUST include): ${JSON.stringify(requiredConcepts)}
Forbidden Concepts (MUST NOT include): ${JSON.stringify(forbiddenConcepts)}

Return JSON ONLY matching this structure:
{
  "displayName": "string",
  "shortPitch": "string",
  "worldDescription": "string (at least 60 characters)",
  "genreLabels": ["string"],
  "toneLabels": ["string"],
  "culturalInfluences": ["string"],
  "cosmology": "string",
  "metaphysics": "string",
  "powerSystem": "string",
  "powerCosts": "string",
  "deathRules": "string",
  "timeRules": "string",
  "socialStructure": "string",
  "politicalStructure": "string",
  "economySystem": "string",
  "technologyModel": "string",
  "geographyModel": "string",
  "namingConventions": {
    "personalNames": "string",
    "placeNames": "string",
    "organizationNames": "string",
    "titles": "string"
  },
  "terminology": {
    "currencyTerms": ["string"],
    "energyTerms": ["string"],
    "professionTerms": ["string"],
    "factionTerms": ["string"],
    "settlementTerms": ["string"],
    "wildernessTerms": ["string"],
    "creatureTerms": ["string"],
    "artifactTerms": ["string"],
    "socialRankTerms": ["string"],
    "conflictTerms": ["string"]
  },
  "narrativeStyle": {
    "narratorRole": "string",
    "voice": "string",
    "proseRules": ["string"],
    "prohibitedStylePatterns": ["string"]
  },
  "allowedConcepts": ["string"],
  "forbiddenConcepts": ["string"],
  "axioms": [
    {
      "category": "COSMOLOGY|POWER|DEATH|TIME|GEOGRAPHY|SOCIETY|ECONOMY|BIOLOGY|TECHNOLOGY",
      "statement": "string",
      "consequences": ["string"]
    }
  ]
}`;

    let parsed: any;
    try {
      parsed = await generateJson(system, user, {
        timeoutMs: 30000,
        jsonSchemaHint: 'Return strictly a JSON object matching the World Profile schema above.',
      });
    } catch (err) {
      throw new WorldProfileGenerationError(`World profile generation failed: ${(err as Error).message}`);
    }

    try {
      const validated = ZodWorldProfileOutput.safeParse(parsed);
      const parsedData = validated.success ? validated.data : parsed;
      return this.mapParsedToProfileOutput(
        parsedData,
        request,
        idFactory,
        'dyn-v1',
        requiredConcepts,
        forbiddenConcepts
      );
    } catch (err) {
      if (err instanceof WorldProfileGenerationError) throw err;
      throw new WorldProfileGenerationError(
        `Failed to interpret AI profile output: ${(err as Error).message}`
      );
    }
  }

  private static mapParsedToProfileOutput(
    parsed: any,
    request: WorldCreationRequest,
    idFactory: DeterministicIdFactory,
    generatorVersion: string,
    requiredConcepts: string[],
    forbiddenConcepts: string[]
  ): ProfileGeneratorOutput {
    const worldId = request.worldId;

    const mergedAllowed = Array.from(new Set([...(parsed.allowedConcepts || []), ...requiredConcepts]));
    const mergedForbidden = Array.from(new Set([...(parsed.forbiddenConcepts || []), ...forbiddenConcepts]));

    const profile: WorldProfile = {
      world_id: worldId,
      profile_version: 1,
      display_name: parsed.displayName || '未名新界',
      short_pitch: parsed.shortPitch || '探索这个规则独具一格的世界。',
      world_description: parsed.worldDescription || `${request.userVision}。这是一个规则独特、包罗万象的崭新世界。`,
      genre_labels: parsed.genreLabels || request.constraints?.culturalInfluences || ['DYNAMIC'],
      tone_labels: parsed.toneLabels || (request.constraints?.tone ? [request.constraints.tone] : ['神秘']),
      cultural_influences: parsed.culturalInfluences || request.constraints?.culturalInfluences || ['混合文化'],
      cosmology: parsed.cosmology || '多元与因果交织的世界法则。',
      metaphysics: parsed.metaphysics || '法则与物质的相互作用。',
      power_system: parsed.powerSystem || '独特的能量与技能体系。',
      power_costs: parsed.powerCosts || '使用力量需要付出相应的代价。',
      death_rules: parsed.death_rules || parsed.deathRules || '肉体湮灭，灵魂沉入法则长河。',
      time_rules: parsed.time_rules || parsed.timeRules || '昼夜交替，时光如流。',
      social_structure: parsed.socialStructure || '势力错综复杂，阶层分明。',
      political_structure: parsed.politicalStructure || '联盟与独立领地并存。',
      economy_system: parsed.economySystem || '货币与特产物资交易。',
      technology_model: parsed.technologyModel || request.constraints?.technologyLevel || '文明科技/炼金并存',
      geography_model: parsed.geographyModel || '多元地貌与聚落分布。',
      naming_conventions: parsed.namingConventions || {
        personalNames: '地域风格名字',
        placeNames: '地理特征命名',
        organizationNames: '势力与功能命名',
        titles: '尊称与职业',
      },
      terminology: {
        currencyTerms: parsed.terminology?.currencyTerms?.length ? parsed.terminology.currencyTerms : ['通用金贝'],
        energyTerms: parsed.terminology?.energyTerms?.length ? parsed.terminology.energyTerms : ['本源能'],
        professionTerms: parsed.terminology?.professionTerms?.length ? parsed.terminology.professionTerms : ['行客', '学者'],
        factionTerms: parsed.terminology?.factionTerms?.length ? parsed.terminology.factionTerms : ['自治同盟'],
        settlementTerms: parsed.terminology?.settlementTerms?.length ? parsed.terminology.settlementTerms : ['聚落', '枢纽'],
        wildernessTerms: parsed.terminology?.wildernessTerms?.length ? parsed.terminology.wildernessTerms : ['荒野', '遗迹'],
        creatureTerms: parsed.terminology?.creatureTerms?.length ? parsed.terminology.creatureTerms : ['原生异兽', '异种生灵'],
        artifactTerms: parsed.terminology?.artifactTerms?.length ? parsed.terminology.artifactTerms : ['信物', '旧器'],
        socialRankTerms: parsed.terminology?.socialRankTerms?.length ? parsed.terminology.socialRankTerms : ['平民', '长老'],
        conflictTerms: parsed.terminology?.conflictTerms?.length ? parsed.terminology.conflictTerms : ['暗流', '争端'],
      },
      narrative_style: parsed.narrativeStyle || {
        narratorRole: '客观记录者',
        voice: '沉稳而生动',
        proseRules: ['生动描绘', '保持克制'],
        prohibitedStylePatterns: ['滥用现代俚语'],
      },
      allowed_concepts: mergedAllowed.length ? mergedAllowed : ['探索', '生存'],
      forbidden_concepts: mergedForbidden,
      starting_scope: request.constraints?.startingScale || 'LOCAL',
      user_vision: request.userVision,
      generation_seed: request.generationSeed,
      generator_version: generatorVersion,
      created_at_epoch: 1,
      updated_at_epoch: 1,
    };

    const rawAxioms: any[] = Array.isArray(parsed.axioms) ? parsed.axioms : [];
    const axioms: WorldAxiom[] = rawAxioms.map((ax, idx) => ({
      id: idFactory.createId('axiom', idx + 1),
      world_id: worldId,
      category: ax.category || 'COSMOLOGY',
      statement: ax.statement || '基本因果律法则',
      consequences: Array.isArray(ax.consequences) ? ax.consequences : ['影响规则运转'],
      immutable: true,
      created_at_epoch: 1,
    }));

    return { profile, axioms };
  }
}
