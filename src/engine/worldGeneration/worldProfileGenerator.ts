import { GoogleGenAI } from '@google/genai';
import { WorldCreationRequest } from './worldCreationRequest';
import { WorldProfile } from '../worldProfile/worldProfileTypes';
import { WorldAxiom } from './worldAxiomTypes';
import { DeterministicIdFactory } from './deterministicIdFactory';

export interface ProfileGeneratorOutput {
  profile: WorldProfile;
  axioms: WorldAxiom[];
}

export class WorldProfileGenerator {
  public static async generateProfileAndAxioms(
    request: WorldCreationRequest,
    idFactory: DeterministicIdFactory
  ): Promise<ProfileGeneratorOutput> {
    const apiKey = process.env.GEMINI_API_KEY;

    if (apiKey && apiKey !== 'MY_GEMINI_API_KEY') {
      try {
        const ai = new GoogleGenAI({ apiKey });
        const prompt = `You are an AI World Constitution Architect. Create a world profile and world axioms for a new tabletop RPG based on the user vision and constraints.
User Vision: ${request.userVision}
Constraints: ${JSON.stringify(request.constraints || {})}

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

        const response = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: prompt,
          config: {
            responseMimeType: 'application/json',
          },
        });

        const text = response.text;
        if (text) {
          const parsed = JSON.parse(text);
          return this.mapParsedToProfileOutput(parsed, request, idFactory, 'gemini-2.5-flash-v1');
        }
      } catch (err) {
        console.warn('[WorldProfileGenerator] AI generation failed or timed out. Falling back to local generator.', err);
      }
    }

    // Local deterministic fallback
    return this.generateLocalFallback(request, idFactory);
  }

  private static mapParsedToProfileOutput(
    parsed: any,
    request: WorldCreationRequest,
    idFactory: DeterministicIdFactory,
    generatorVersion: string
  ): ProfileGeneratorOutput {
    const worldId = request.worldId;

    const profile: WorldProfile = {
      world_id: worldId,
      profile_version: 1,
      display_name: parsed.displayName || '未名异界',
      short_pitch: parsed.shortPitch || '探寻这个奇幻世界的深层秘密。',
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
        placeNames: '自然与历史命名',
        organizationNames: '势力与功能命名',
        titles: '尊称与职业',
      },
      terminology: parsed.terminology || {
        currencyTerms: ['通用币'],
        energyTerms: ['本源能'],
        professionTerms: ['探索者', '学者'],
        factionTerms: ['领主公会'],
        settlementTerms: ['聚落', '卫城'],
        wildernessTerms: ['荒野'],
        creatureTerms: ['异兽'],
        artifactTerms: ['遗物'],
        socialRankTerms: ['公民'],
        conflictTerms: ['争端'],
      },
      narrative_style: parsed.narrativeStyle || {
        narratorRole: '客观记录者',
        voice: '沉稳而生动',
        proseRules: ['生动描绘', '保持克制'],
        prohibitedStylePatterns: ['滥用现代俚语'],
      },
      allowed_concepts: parsed.allowedConcepts || request.constraints?.requiredElements || ['探索', '生存', '解谜'],
      forbidden_concepts: parsed.forbiddenConcepts || request.constraints?.forbiddenElements || [],
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

  private static generateLocalFallback(
    request: WorldCreationRequest,
    idFactory: DeterministicIdFactory
  ): ProfileGeneratorOutput {
    const worldId = request.worldId;
    const visionSnippet = request.userVision.substring(0, 30);

    const profile: WorldProfile = {
      world_id: worldId,
      profile_version: 1,
      display_name: `创世之域 (${visionSnippet.substring(0, 10)})`,
      short_pitch: '基于用户构想建立的独立动态世界。',
      world_description: `${request.userVision}。在这个世界中，自然法则与文明秩序正交织出独特的历史篇章，各方势力在迷雾中展开角逐。`,
      genre_labels: ['DYNAMIC', 'FANTASY'],
      tone_labels: request.constraints?.tone ? [request.constraints.tone] : ['壮丽', '神秘'],
      cultural_influences: request.constraints?.culturalInfluences || ['古风', '异域'],
      cosmology: '天地分立，万物受本源法则驱使。',
      metaphysics: '精神与物质通过秩序流向彼此转换。',
      power_system: request.constraints?.supernaturalLevel || '超自然灵气与技艺结合体系',
      power_costs: '过度激发力量会导致生命与精神负荷。',
      death_rules: '生命的终点回归自然法则微粒。',
      time_rules: '四季更替，光阴不息。',
      social_structure: '自由领地、行会组织与世家古族并存。',
      political_structure: '分权自治与领主盟约。',
      economy_system: '以金属硬币与稀有资源为流通媒介。',
      technology_model: request.constraints?.technologyLevel || '手工工坊与古代机关术',
      geography_model: '山川险隘、河流聚落与未知荒野。',
      naming_conventions: {
        personalNames: '常用古典自然名',
        placeNames: '地理特征名',
        organizationNames: '同盟与社团',
        titles: '尊称与头衔',
      },
      terminology: {
        currencyTerms: ['金铢', '银贝'],
        energyTerms: ['灵韵', '源能'],
        professionTerms: ['行客', '学者', '匠人'],
        factionTerms: ['星辉同盟', '荒原猎团'],
        settlementTerms: ['石桥镇', '风谷城'],
        wildernessTerms: ['迷雾森林', '裂谷废墟'],
        creatureTerms: ['林地兽', '深谷异种'],
        artifactTerms: ['古旧符石', '精工短剑'],
        socialRankTerms: ['平民', '领主'],
        conflictTerms: ['暗流争端'],
      },
      narrative_style: {
        narratorRole: '旁观史官',
        voice: '典雅生动',
        proseRules: ['注重环境烘托', '展现势力互动'],
        prohibitedStylePatterns: ['禁止堆砌无关词藻'],
      },
      allowed_concepts: request.constraints?.requiredElements || ['探索', '求真', '阵营冲突'],
      forbidden_concepts: request.constraints?.forbiddenElements || [],
      starting_scope: request.constraints?.startingScale || 'LOCAL',
      user_vision: request.userVision,
      generation_seed: request.generationSeed,
      generator_version: 'local-minimal-v1',
      created_at_epoch: 1,
      updated_at_epoch: 1,
    };

    const axioms: WorldAxiom[] = [
      {
        id: idFactory.createId('axiom', 1),
        world_id: worldId,
        category: 'COSMOLOGY',
        statement: '天地万物皆遵循本源因果守护平衡。',
        consequences: ['打破平衡将引发天地异象'],
        immutable: true,
        created_at_epoch: 1,
      },
      {
        id: idFactory.createId('axiom', 2),
        world_id: worldId,
        category: 'POWER',
        statement: '任何超自然力量的驱使皆需要相应的精神与物质介质。',
        consequences: ['无法凭空创造不守恒的力量'],
        immutable: true,
        created_at_epoch: 1,
      },
      {
        id: idFactory.createId('axiom', 3),
        world_id: worldId,
        category: 'SOCIETY',
        statement: '聚落生存依赖水源与战略通道的掌控。',
        consequences: ['资源要地必然引发势力角逐'],
        immutable: true,
        created_at_epoch: 1,
      },
      {
        id: idFactory.createId('axiom', 4),
        world_id: worldId,
        category: 'DEATH',
        statement: '生命逝去后留下的痕迹不可抹灭。',
        consequences: ['过往历史与执念影响后世'],
        immutable: true,
        created_at_epoch: 1,
      },
    ];

    return { profile, axioms };
  }
}
