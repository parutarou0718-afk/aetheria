import { describe, it, expect, beforeEach, vi } from 'vitest';

// [audit #8] Mock the LLM client so these tests NEVER call a real API.
// This keeps the generator pipeline fully deterministic and offline-safe.
vi.mock('../ai/aiService', () => ({ aiService: {
  generateJson: vi.fn(async (_context: unknown, system: string, user: string) => {
    if (user.includes('User Vision:')) {
      return mockProfileJson();
    }
    if (user.includes('Locations Available:')) {
      return mockEntityJson();
    }
    return mockSkeletonJson();
  }),
} }));

import { WorldGenesisService } from './worldGenesisService';
import { WorldCreationRequest } from './worldCreationRequest';
import { DeterministicIdFactory } from './deterministicIdFactory';
import { WorldRepository } from '../world/worldRepository';
import { dbManager } from '../persistence/database';
import { WorldCacheLoader } from '../world/worldCacheLoader';
import { runtimeHealth } from '../runtime/runtimeHealthService';

// --- Deterministic offline fixtures (single source of truth for tests) ---

function mockProfileJson() {
  return {
    displayName: '熔岩战界',
    shortPitch: '硅基龙族统治的远古熔岩战场',
    worldDescription:
      '在烈焰翻涌的远古熔岩战界中，硅基龙族以钢铁般的意志统治着喷涌的火山沟壑与晶石矿脉，古老的符文在岩浆中闪烁，龙族与异种兽群在这片焦土上反复争夺生存的疆域。',
    genreLabels: ['奇幻'],
    toneLabels: ['壮丽'],
    culturalInfluences: ['龙族文明', '熔岩生态'],
    cosmology: '熔岩与晶石是世界的本源，一切物质由元素蒸汽驱动。',
    metaphysics: '精神与火焰交汇，铸就可被操持的熔构之力。',
    powerSystem: '熔岩龙息与元素蒸汽机关',
    powerCosts: '过度燃烧本源会导致躯体晶化。',
    deathRules: '硅基躯壳崩解，意识回归熔岩本源。',
    timeRules: '以熔岩潮汐记年，昼夜由地火明灭界定。',
    socialStructure: '龙族氏族为尊，兽群为奴，晶矿井为百战之地。',
    politicalStructure: '七大龙族氏族缔结血誓盟约。',
    economySystem: '以晶石矿晶与熔铸器皿为流通媒介。',
    technologyModel: '符文蒸汽机甲',
    geographyModel: '火山沟壑、晶石矿脉与熔岩平原。',
    namingConventions: {
      personalNames: '龙语风格名',
      placeNames: '熔岩地貌命名',
      organizationNames: '氏族徽记命名',
      titles: '龙威尊称',
    },
    terminology: {
      currencyTerms: ['熔晶', '矿贝'],
      energyTerms: ['元素蒸汽', '地火'],
      professionTerms: ['熔铸匠', '龙语通司'],
      factionTerms: ['熔岩氏族', '灰烬议会'],
      settlementTerms: ['熔城', '焦堡'],
      wildernessTerms: ['火烬荒原', '裂谷深渊'],
      creatureTerms: ['硅基龙裔', '晶皮兽'],
      artifactTerms: ['龙晶杖', '熔纹甲'],
      socialRankTerms: ['族裔', '龙丞'],
      conflictTerms: ['炽血冲突'],
    },
    narrativeStyle: {
      narratorRole: '熔岩史官',
      voice: '壮阔而冷峻',
      proseRules: ['注重地貌与火焰的烘托', '展现氏族角力'],
      prohibitedStylePatterns: ['避免现代俚语'],
    },
    allowedConcepts: ['熔岩战界', '龙族征伐'],
    forbiddenConcepts: ['现代枪械', '赛博智脑'],
    axioms: [
      { category: 'COSMOLOGY', statement: '一切存续皆立足熔岩与晶石的本源循环。', consequences: ['断绝地火将导致世界衰败'] },
      { category: 'POWER', statement: '任何力量契约皆须以本源之躯为媒，不可凭空取用。', consequences: ['过度运使将灼蚀自身'] },
      { category: 'SOCIETY', statement: '氏族以晶矿脉为立身之本，争夺矿脉即争夺存续。', consequences: ['矿脉要地必成征伐前线'] },
      { category: 'DEATH', statement: '硅基躯壳崩解后，意识归于熔岩本源而不灭。', consequences: ['往昔意志仍可于地火中回响'] },
      { category: 'GEOGRAPHY', statement: '地貌由元素蒸汽与地火变迁塑造。', consequences: ['裂谷随时可能因地火重塑'] },
    ],
  };
}

function mockSkeletonJson() {
  return {
    locations: [
      {
        idKey: 'start',
        name: '焦堡',
        type: 'FORTRESS',
        description: '龙族氏族驻守的核心要塞，矗立于熔岩平原的制高点，是进出火烬荒原的门户。',
        population: 800,
        connectedToKeyIds: ['foundry'],
        primaryIndustry: 'GOVERNMENT',
        tradeGoods: ['熔晶', '矿贝'],
        featureName: '龙威熔炉',
        featureDescription: '氏族铸造龙晶与机甲的巨型熔炉。',
      },
      {
        idKey: 'foundry',
        name: '炽城',
        type: 'CITY',
        description: '浮空符能熔铸与机甲研造的重镇，炉火彻夜不熄，云梯连接着各层矿场。',
        population: 3000,
        connectedToKeyIds: ['start', 'pits'],
        primaryIndustry: 'TRADE',
        tradeGoods: ['龙晶杖', '熔纹甲'],
        featureName: '万炉广场',
        featureDescription: '各族交易与铸造契约的露天广场。',
      },
      {
        idKey: 'pits',
        name: '裂谷深渊',
        type: 'CAVE',
        description: '地火喷涌的晶石矿洞，出产珍贵矿脉，但也潜伏着饥饿的晶皮兽群。',
        population: 200,
        connectedToKeyIds: ['foundry'],
        primaryIndustry: 'GATHERING',
        tradeGoods: ['矿晶'],
        featureName: '地火矿廊',
        featureDescription: '延绵不绝的深层矿廊。',
      },
    ],
    hiddenTruths: [
      { title: '焦堡地下一座远古熔炉封印着失控的初火之种', layer: 'layer_1_personal_secrets', layerName: '个人秘密', trueNature: '封印正在逐年松动，地火的躁动即源于此。', evidenceRequired: ['熔炉铭文拓片'] },
      { title: '灰烬议会暗中操纵矿价，垄断晶石命脉', layer: 'layer_2_organization_conspiracies', layerName: '组织阴谋', trueNature: '议会以囤积与哄抬维系对龙族的钳制。', evidenceRequired: ['灰烬密契'] },
      { title: '地火并非自然造化，而是古老龙战遗留的能量残响', layer: 'layer_3_world_lies', layerName: '世界谎言', trueNature: '世人以为地火天成，实则源于上古龙族的毁天之战。', evidenceRequired: ['上古龙战碑铭'] },
      { title: '元素蒸汽的源头正被虚空裂隙一点点吞噬', layer: 'layer_4_cosmic_illusions', layerName: '宇宙假象', trueNature: '世界的能量根基正缓慢泄漏，秩序终将失衡。', evidenceRequired: ['裂隙观测仪'] },
    ],
  };
}

function mockEntityJson() {
  return {
    characters: [
      {
        idKey: 'pc',
        type: 'PC',
        name: '赤砎',
        title: '游离龙语通司',
        species: '硅基龙裔',
        age: 124,
        locationKeyId: 'start',
        primaryGoal: '探寻地火躁动的真相，维护氏族存续',
        personality: ['坚韧', '敏锐'],
        fear: '氏族因晶石枯竭而崩解',
        attributes: { hp: 100, max_hp: 100, mp: 50, max_mp: 50, strength: 12, dexterity: 10, intelligence: 15, charisma: 11 },
        skills: { '龙语解析': 14, '熔构辨识': 12 },
        resources: { gold: 80, reputation: 15 },
        inventory: [{ item_id: 'item1', name: '龙晶杖', type: 'KEY_ITEM', quantity: 1 }],
      },
      {
        idKey: 'npc1',
        type: 'NPC',
        name: '沸岩督军',
        title: '熔岩氏族酋长',
        species: '硅基龙裔',
        age: 480,
        locationKeyId: 'start',
        primaryGoal: '以铁腕维持氏族征伐与矿脉掌控',
        personality: ['威厉', '刚直'],
        fear: '裔族被叛盟吞并',
        attributes: { hp: 120, max_hp: 120, mp: 40, max_mp: 40, strength: 16, dexterity: 9, intelligence: 12, charisma: 14 },
        skills: { '指挥征伐': 15 },
        resources: { gold: 500, reputation: 60 },
        inventory: [{ item_id: 'item2', name: '熔纹甲', type: 'ARMOR', quantity: 1 }],
      },
      {
        idKey: 'npc2',
        type: 'NPC',
        name: '灰烬账师',
        title: '灰烬议会驻使',
        species: '晶皮兽灵',
        age: 96,
        locationKeyId: 'foundry',
        primaryGoal: '替灰烬议会打点矿价与密契',
        personality: ['精明', '善辩'],
        fear: '密契败露',
        attributes: { hp: 80, max_hp: 80, mp: 70, max_mp: 70, strength: 8, dexterity: 11, intelligence: 15, charisma: 16 },
        skills: { '斡旋密契': 15 },
        resources: { gold: 900, reputation: 30 },
        inventory: [{ item_id: 'item3', name: '密契火印', type: 'KEY_ITEM', quantity: 1 }],
      },
    ],
    organizations: [
      {
        name: '熔岩氏族',
        type: 'FACTION',
        description: '把持焦堡与炽城矿脉的龙族氏族，以征伐立威。',
        headquartersLocationKeyId: 'start',
        leaderCharacterKeyId: 'npc1',
        goalDescription: '扩张矿脉疆域，稳固族权',
        projectName: '地火勘探令',
        projectDescription: '派员深入裂谷深渊探查失控地火。',
      },
    ],
    facts: [
      { statement: '熔岩战界的晶石矿脉是氏族权力的根基。', category: 'GEOGRAPHY' },
      { statement: '龙族氏族以元素蒸汽驱动金属机甲征战四方。', category: 'TECHNOLOGY' },
    ],
    seeds: [
      {
        type: 'INVESTIGATION',
        description: '焦堡地下初火之种的封印松动传闻正在族内暗中流传。',
        hiddenTruthIndex: 0,
        opportunityDescription: '调查远古熔炉，解开封印真相',
        discoveryCondition: '在焦堡取得熔炉铭文拓片',
      },
      {
        type: 'CONFLICT',
        description: '灰烬议会突然抬升矿价，引发铸匠们的怨愤。',
        hiddenTruthIndex: 1,
        opportunityDescription: '追查议会密契背后的主使',
        discoveryCondition: '在炽城探听商路动向',
      },
    ],
    genesisEventDescription:
      '【创世纪元】地火异动频发，熔岩氏族与灰烬议会的暗流在炽城的万炉广场交汇，龙语通司赤砎踏上探寻初火真相的征途。',
  };
}

describe('WorldGenesisService Dynamic Creation Engine', () => {
  beforeEach(async () => {
    await dbManager.initialize();
  });

  it('should generate a structured world profile and axioms from user prompt', async () => {
    const request: WorldCreationRequest = {
      worldId: 'world-test-001',
      userVision: '一个浮空大陆上的符文蒸汽世界，人们借助元素蒸汽驱动机关，天空有浮空鲸游弋',
      constraints: {
        tone: '奇幻壮丽',
        culturalInfluences: ['蒸汽朋克', '古典华丽'],
        technologyLevel: '符文蒸汽机甲',
      },
      generationSeed: 12345,
    };

    const result = await WorldGenesisService.createDynamicWorld(request);

    expect(result.worldId).toBe('world-test-001');
    expect(result.profile.display_name).toBeTruthy();
    expect(result.profile.world_description.length).toBeGreaterThanOrEqual(50);
    expect(result.axioms.length).toBeGreaterThanOrEqual(4);
    expect(result.axioms.length).toBeLessThanOrEqual(12);

    result.axioms.forEach((ax) => {
      expect(ax.immutable).toBe(true);
    });

    const pcs = result.template.characters.filter((c) => c.type === 'PC');
    expect(pcs.length).toBe(1);

    expect(result.template.locations.length).toBeGreaterThan(0);
    expect(result.validationReport.valid).toBe(true);
  }, 30000);

  it('should produce deterministic IDs for identical seed and inputs', () => {
    const factory1 = new DeterministicIdFactory(9999);
    const factory2 = new DeterministicIdFactory(9999);

    const id1 = factory1.createId('loc', 1);
    const id2 = factory2.createId('loc', 1);

    expect(id1).toBe(id2);
  });

  it('should persist world profile and axioms to database and reload them', async () => {
    const worldId = 'world-test-persisted';
    const request: WorldCreationRequest = {
      worldId,
      userVision: '一个充满黑暗哥特风格的吸血鬼古堡与古老血族争端世界',
      generationSeed: 54321,
    };

    await WorldGenesisService.createDynamicWorld(request);

    const loadedProfile = await WorldRepository.getWorldProfile(worldId);
    expect(loadedProfile).not.toBeNull();
    expect(loadedProfile?.world_id).toBe(worldId);

    const loadedAxioms = await WorldRepository.getWorldAxioms(worldId);
    expect(loadedAxioms.length).toBeGreaterThanOrEqual(4);
  }, 30000);

  it('keeps a durably created world when post-commit cache loading fails', async () => {
    const worldId = `world-cache-failure-${crypto.randomUUID()}`;
    runtimeHealth.markDatabaseHealthy();
    runtimeHealth.markBootstrapHealthy();
    runtimeHealth.markCacheSynchronized();
    vi.spyOn(WorldCacheLoader, 'loadWorldStateIntoCache').mockRejectedValueOnce(new Error('cache unavailable'));
    const result = await WorldGenesisService.createDynamicWorld({ worldId, userVision: 'A durable world whose post-commit cache publication is deliberately unavailable.', generationSeed: 3901 });
    expect(result.warnings).toEqual(expect.arrayContaining([expect.stringContaining('committed')]));
    expect((await WorldRepository.getWorldSnapshot(worldId))?.world_creation_state).toBe('CREATED');
    expect(runtimeHealth.isReady()).toBe(false);
    vi.restoreAllMocks();
  }, 30000);

  it('should enforce user required and forbidden concepts in world genesis', async () => {
    const worldId = 'world-test-constraints';
    const request: WorldCreationRequest = {
      worldId,
      userVision: '一个关于浮空飞艇与浮空矿岛的大陆，云海深处藏有古老遗迹',
      constraints: {
        required_concepts: ['精金符文', '悬赏令'],
        forbidden_concepts: ['现代枪械', '赛博智脑'],
      },
      generationSeed: 88888,
    };

    const result = await WorldGenesisService.createDynamicWorld(request);

    expect(result.profile.allowed_concepts).toContain('精金符文');
    expect(result.profile.allowed_concepts).toContain('悬赏令');
    expect(result.profile.forbidden_concepts).toContain('现代枪械');
    expect(result.profile.forbidden_concepts).toContain('赛博智脑');

    const hasRequiredFact = result.template.facts.some((f) =>
      f.statement.includes('精金符文') || f.statement.includes('悬赏令')
    );
    expect(hasRequiredFact).toBe(true);

    const allText = [
      ...result.template.characters.map((c) => c.name + c.title + (c.species || '')),
      ...result.template.locations.map((l) => l.name + l.description),
    ].join(' ');

    expect(allText).not.toContain('现代枪械');
    expect(allText).not.toContain('赛博智脑');
  }, 30000);

  it('should generate profile-driven characters without falling back to hardcoded Human Explorer', async () => {
    const worldId = 'world-test-repair';
    const request: WorldCreationRequest = {
      worldId,
      userVision: '一个全员硅基龙族的远古熔岩战界，烈焰在沟壑中喷涌不息',
      generationSeed: 77777,
    };

    const result = await WorldGenesisService.createDynamicWorld(request);

    const pc = result.template.characters.find((c) => c.type === 'PC');
    expect(pc).toBeDefined();
    expect(pc?.title).not.toBe('人类探索者');
    expect(pc?.species).not.toBe('普通人类');
    expect(pc?.species).toBe('硅基龙裔');
  }, 30000);
});
