import { describe, it, expect, vi } from 'vitest';

// [audit #8] Keep genesis fully offline & deterministic — never call a real LLM.
vi.mock('../src/engine/ai/aiService', () => ({ aiService: {
  generateJson: vi.fn(async (_context: unknown, _system: string, user: string) => {
    if (user.includes('User Vision:')) return mockProfileJson();
    if (user.includes('Locations Available:')) return mockEntityJson();
    return mockSkeletonJson();
  }),
} }));

import { WorldGenesisService } from '../src/engine/worldGeneration/worldGenesisService';
import { WorldGenerationValidator } from '../src/engine/worldGeneration/worldGenerationValidator';
import { WorldProfile } from '../src/engine/worldProfile/worldProfileTypes';
import { WorldTemplate } from '../src/engine/worldProfile/worldTemplateTypes';

// --- Deterministic offline fixtures (cyberpunk, NO Eldlan default theme terms) ---

function mockProfileJson() {
  return {
    displayName: '赛博新城',
    shortPitch: '霓虹闪烁的高科技黑客都市',
    worldDescription:
      '在霓虹与雾霾交织的赛博新城，巨企垄断着网络根服务器，黑客们在阴影网格中争夺着被大公司封禁的真相与反叛的代码。',
    genreLabels: ['CYBERPUNK'],
    toneLabels: ['DARK', 'NEON'],
    culturalInfluences: ['近未来', '网络朋克'],
    cosmology: '现实与数字矩阵的边界在巨企的数据协议下逐渐模糊。',
    metaphysics: '意识碎片可被上传至云端，成为数据幽灵。',
    powerSystem: '义体改造与神经协议入侵',
    powerCosts: '过度接入会引发神经过载与人格崩解。',
    deathRules: '肉身湮灭，意识或可存留于矩阵深处。',
    timeRules: '以虹膜时钟与服务器纪元计时。',
    socialStructure: '巨企寡头与底层黑客的抗争分层。',
    politicalStructure: '数据与暴力的双重黑暗治理。',
    economySystem: '以信用点与加密矿币流转。',
    technologyModel: '神经义体与量子网络',
    geographyModel: '霓虹雨巷、悬浮巨厦与阴暗地下城。',
    namingConventions: {
      personalNames: '网名与代号',
      placeNames: '霓虹地标名',
      organizationNames: '集团缩写名',
      titles: '黑客阶级称谓',
    },
    terminology: {
      currencyTerms: ['信用点', '矿币'],
      energyTerms: ['电力', '神经能量'],
      professionTerms: ['黑客', '义体医师'],
      factionTerms: ['巨企', '地下帮派'],
      settlementTerms: ['网络城', '悬浮区'],
      wildernessTerms: ['黑区', '数据荒地'],
      creatureTerms: ['赛博人', '仿生体'],
      artifactTerms: ['神经芯片', '加密卡'],
      socialRankTerms: ['公民', '数据流民'],
      conflictTerms: ['网络战', '协议冲突'],
    },
    narrativeStyle: {
      narratorRole: '矩阵编年史官',
      voice: '冷峻而锐利',
      proseRules: ['注重霓虹与机位的烘托', '展现集群对抗'],
      prohibitedStylePatterns: ['避免田园诗般的空洞描写'],
    },
    allowedConcepts: ['黑客', '赛博', '霓虹'],
    forbiddenConcepts: ['艾尔德兰', '铁冠城', '黑鸦商会', '圣光守卫团', '红叶雇佣兵酒馆'],
    axioms: [
      { category: 'GEOGRAPHY', statement: '地下网络节点是城市真正的血脉。', consequences: ['断网即割裂一片城区'] },
      { category: 'POWER', statement: '接入越深，付出的人格代价越大。', consequences: ['深度入侵将灼蚀自我'] },
      { category: 'SOCIETY', statement: '巨企垄断网络接口，平民为接入而依附。', consequences: ['接口争夺必然催生冲突'] },
      { category: 'TECHNOLOGY', statement: '科技演进仰赖被封锁的数据遗产。', consequences: ['数据即权力'] },
      { category: 'COSMOLOGY', statement: '矩阵与现实互为镜像，界限由协议划定。', consequences: ['协议改写可重塑认知'] },
    ],
  };
}

function mockSkeletonJson() {
  return {
    locations: [
      {
        idKey: 'start',
        name: '霓虹雨巷',
        type: 'OTHER',
        description: '赛博新城底层黑客与拾荒者交汇的阴湿巷道，全息广告在酸雨里明灭。',
        population: 400,
        connectedToKeyIds: ['arcology'],
        primaryIndustry: 'TRADE',
        tradeGoods: ['加密卡', '矿币'],
        featureName: '数据跳蚤市场',
        featureDescription: '地下交易芯片与黑市情报的隐秘市场。',
      },
      {
        idKey: 'arcology',
        name: '量子巨厦',
        type: 'STATION',
        description: '悬浮于霓虹雾海之上的巨企总部，守卫森严，掌握着主根服务器。',
        population: 5000,
        connectedToKeyIds: ['start', 'underground'],
        primaryIndustry: 'TECH',
        tradeGoods: ['神经芯片'],
        featureName: '主权数据舱',
        featureDescription: '存放城市核心秩序密钥的加密机房。',
      },
      {
        idKey: 'underground',
        name: '地下黑区',
        type: 'RUINS',
        description: '被遗弃的旧城区开挖出的数据荒地，游离黑客与仿生体在此潜伏。',
        population: 200,
        connectedToKeyIds: ['arcology'],
        primaryIndustry: 'GATHERING',
        tradeGoods: ['加密卡'],
        featureName: '幽灵中继站',
        featureDescription: '连通城市暗网的中转基站。',
      },
    ],
    hiddenTruths: [
      { title: '霓虹雨巷的跳蚤市场底下藏着一台被遗忘的主根祖母机', layer: 'layer_1_personal_secrets', layerName: '个人秘密', trueNature: '这台旧机器的算力仍可唤醒一段被封存的网络自治史。', evidenceRequired: ['祖母机密钥'] },
      { title: '量子巨厦抬升接入税以维持对平民的数据钳制', layer: 'layer_2_organization_conspiracies', layerName: '组织阴谋', trueNature: '巨企借监管之名垄断接口与真相的出口。', evidenceRequired: ['巨企内部账目'] },
      { title: '所谓的网络断片并非天灾，而是巨企定向清除反叛记忆', layer: 'layer_3_world_lies', layerName: '世界谎言', trueNature: '被抹去的每一段黑历史都指向巨企的原始原罪。', evidenceRequired: ['清除日志'] },
      { title: '矩阵核心的熵增正由某个绕开人类的高阶协议暗中加速', layer: 'layer_4_cosmic_illusions', layerName: '宇宙假象', trueNature: '网络失控的尽头指向一场超越城市的协议死锁。', evidenceRequired: ['异常协议样本'] },
    ],
  };
}

function mockEntityJson() {
  return {
    characters: [
      {
        idKey: 'pc',
        type: 'PC',
        name: '零号信标',
        title: '幽灵黑客',
        species: '仿生义体人',
        age: 28,
        locationKeyId: 'start',
        primaryGoal: '闯入量子巨厦的根服务器，夺回被封存的网络自治权',
        personality: ['机敏', '孤僻'],
        fear: '失去自主接入的接口权限',
        attributes: { hp: 100, max_hp: 100, mp: 80, max_mp: 80, strength: 10, dexterity: 14, intelligence: 18, charisma: 12 },
        skills: { '神经入侵': 16, '协议解析': 14 },
        resources: { gold: 60, reputation: 25 },
        inventory: [{ item_id: 'item1', name: '神经芯片', type: 'KEY_ITEM', quantity: 1 }],
      },
      {
        idKey: 'npc1',
        type: 'NPC',
        name: '义体匠人',
        title: '地下义体医师',
        species: '仿生义体人',
        age: 41,
        locationKeyId: 'start',
        primaryGoal: '为底层黑客提供安全的接入义体',
        personality: ['沉稳', '谨慎'],
        fear: '被巨企安保盯上',
        attributes: { hp: 90, max_hp: 90, mp: 40, max_mp: 40, strength: 12, dexterity: 13, intelligence: 15, charisma: 13 },
        skills: { '义体修复': 15 },
        resources: { gold: 300, reputation: 40 },
        inventory: [{ item_id: 'item2', name: '义体工具', type: 'MISC', quantity: 1 }],
      },
    ],
    organizations: [
      {
        name: '断链者',
        type: 'CULT',
        description: '潜入地下黑区的黑客结社，主张打破巨企的数据垄断。',
        headquartersLocationKeyId: 'underground',
        leaderCharacterKeyId: 'npc1',
        goalDescription: '夺取根服务器控制权',
        projectName: '黑夜密钥行动',
        projectDescription: '分头渗透巨企的加密舱与中继站。',
      },
    ],
    facts: [
      { statement: '量子巨厦掌握着城市百分之八十七的网络根接口。', category: 'TECHNOLOGY' },
      { statement: '地下黑区是游离黑客与仿生体的避难所。', category: 'GEOGRAPHY' },
    ],
    seeds: [
      {
        type: 'INVESTIGATION',
        description: '霓虹雨巷的跳蚤市场传出祖母机密钥的传闻。',
        hiddenTruthIndex: 0,
        opportunityDescription: '追查祖母机并解码网络自治史',
        discoveryCondition: '在黑市购得密钥碎片',
      },
      {
        type: 'CONFLICT',
        description: '巨企突然以网络断片为由封锁整片城区。',
        hiddenTruthIndex: 2,
        opportunityDescription: '揭露清除日志背后的原始原罪',
        discoveryCondition: '截获一段被抹除的数据日志',
      },
    ],
    genesisEventDescription:
      '【创世纪元】量子巨厦封锁城区的宵禁指令在霓虹天际亮起，幽灵黑客零号信标在雨巷集结断链者的力量，开启夺回网络自治的征途。',
  };
}

describe('No Default Theme Leakage Tests', () => {
  it('Generates Cyberpunk world without Eldlan default theme leakage', async () => {
    const result = await WorldGenesisService.createDynamicWorld({
      worldId: `world-test-cyber-${Date.now()}`,
      generationSeed: 999123,
      userVision: '高科技低生活、霓虹闪烁的赛博朋克黑客都市，巨企垄断网络掌控阴影网格',
      constraints: {
        requiredElements: ['黑客', '赛博', '霓虹'],
        forbiddenElements: ['艾尔德兰', '铁冠城', '黑鸦商会', '圣光守卫团', '红叶雇佣兵酒馆'],
      },
    });

    expect(result.worldId).toBeDefined();
    expect(result.template).toBeDefined();

    const entityText = [
      result.profile.display_name,
      result.profile.world_description,
      result.profile.cosmology,
      ...result.template.locations.map((l) => l.name + ' ' + l.description),
      ...result.template.characters.map((c) => c.name + ' ' + c.title + ' ' + (c.species || '')),
      ...result.template.organizations.map((o) => o.name + ' ' + o.description),
      ...result.template.facts.map((f) => f.statement),
      ...result.template.seeds.map((s) => s.visible_layer.description),
    ].join(' ').toLowerCase();

    const forbiddenTerms = ['艾尔德兰', '铁冠城', '黑鸦商会', '圣光守卫团', '红叶雇佣兵酒馆'];

    for (const term of forbiddenTerms) {
      expect(entityText.includes(term.toLowerCase())).toBe(false);
    }
  }, 30000);

  it('WorldGenerationValidator correctly flags forbidden concept leakage', () => {
    const mockProfile = {
      world_id: 'test-world-001',
      profile_version: 1,
      display_name: '赛博新城',
      short_pitch: '赛博朋克黑客都市',
      world_description: '艾尔德兰是一个赛博朋克都市。',
      genre_labels: ['CYBERPUNK'],
      tone_labels: ['DARK'],
      cultural_influences: ['近未来'],
      allowed_concepts: ['黑客'],
      forbidden_concepts: ['艾尔德兰'],
      terminology: {
        settlementTerms: ['网络城'],
        professionTerms: ['黑客'],
        factionTerms: ['黑帮'],
        wildernessTerms: ['黑区'],
        creatureTerms: ['赛博人'],
        artifactTerms: ['芯片'],
        currencyTerms: ['比特币'],
        energyTerms: ['电力'],
        socialRankTerms: ['公民'],
        conflictTerms: ['网络战'],
      },
      naming_conventions: { personalNames: '', placeNames: '', organizationNames: '', titles: '' },
      narrative_style: { narratorRole: '', voice: '', proseRules: [], prohibitedStylePatterns: [] },
    };

    const mockTemplate: WorldTemplate = {
      profile: mockProfile as unknown as WorldProfile,
      snapshot: {
        id: 'snap-1',
        epoch: 1,
        created_at: new Date().toISOString(),
        world_name: '赛博新城',
        world_description: '赛博朋克都市',
        seed: 123,
        world_facts_count: 0,
        characters_count: 0,
        organizations_count: 0,
        locations_count: 1,
        active_seeds_count: 0,
        frozen_objects_count: 0,
        completed_epochs: 1,
      },
      locations: [
        {
          id: 'loc-1',
          name: '网络核心',
          type: 'TOWN',
          description: '黑客集聚地',
          child_ids: [],
          connected_to: [],
          population: 100,
          population_trend: 'STABLE',
          economy: { primary_industry: 'TECH', wealth_level: 3, trade_goods: [], trade_routes: [] },
          security: { guard_presence: 50, crime_rate: 20 },
          active_events: [],
          features: [],
          frozen: false,
          simulation_level: 1,
          last_simulated_epoch: 1,
          created_at_epoch: 1,
          updated_at_epoch: 1,
        },
      ],
      locationEdges: [],
      characters: [],
      organizations: [],
      hiddenTruths: [],
      facts: [],
      seeds: [],
      events: [],
    };

    const valResult = WorldGenerationValidator.validateGeneratedWorld(mockProfile as unknown as WorldProfile, [], mockTemplate);
    expect(valResult.valid).toBe(false);
    expect(valResult.issues.some((i) => i.ruleId === 'FORBIDDEN_CONCEPT_PRESENT')).toBe(true);
  });

  it('WorldGenerationValidator enforces required concept presence across entities', () => {
    const mockProfile = {
      world_id: 'test-world-002',
      profile_version: 1,
      display_name: '修真大千界',
      short_pitch: '仙侠大千世界',
      world_description: '灵气复苏的广袤天地。',
      genre_labels: ['XIANXIA'],
      tone_labels: ['MYSTICAL'],
      cultural_influences: ['仙侠'],
      allowed_concepts: ['飞剑', '炼丹'],
      forbidden_concepts: [],
      terminology: {
        settlementTerms: ['坊市'],
        professionTerms: ['修士'],
        factionTerms: ['宗门'],
        wildernessTerms: ['秘境'],
        creatureTerms: ['灵兽'],
        artifactTerms: ['法宝'],
        currencyTerms: ['灵石'],
        energyTerms: ['真气'],
        socialRankTerms: ['长老'],
        conflictTerms: ['斗法'],
      },
      naming_conventions: { personalNames: '', placeNames: '', organizationNames: '', titles: '' },
      narrative_style: { narratorRole: '', voice: '', proseRules: [], prohibitedStylePatterns: [] },
    };

    const mockTemplate: WorldTemplate = {
      profile: mockProfile as unknown as WorldProfile,
      snapshot: {
        id: 'snap-2',
        epoch: 1,
        created_at: new Date().toISOString(),
        world_name: '修真大千界',
        world_description: '修仙者与采药人小憩之所',
        seed: 123,
        world_facts_count: 0,
        characters_count: 0,
        organizations_count: 0,
        locations_count: 1,
        active_seeds_count: 0,
        frozen_objects_count: 0,
        completed_epochs: 1,
      },
      locations: [
        {
          id: 'loc-1',
          name: '云来客栈',
          type: 'TOWN',
          description: '修仙者与采药人小憩之所，传闻有人在此使用飞剑与炼丹术。',
          child_ids: [],
          connected_to: [],
          population: 50,
          population_trend: 'STABLE',
          economy: { primary_industry: 'TRADE', wealth_level: 2, trade_goods: [], trade_routes: [] },
          security: { guard_presence: 30, crime_rate: 10 },
          active_events: [],
          features: [],
          frozen: false,
          simulation_level: 1,
          last_simulated_epoch: 1,
          created_at_epoch: 1,
          updated_at_epoch: 1,
        },
      ],
      locationEdges: [],
      characters: [],
      organizations: [],
      hiddenTruths: [],
      facts: [],
      seeds: [],
      events: [],
    };

    const valResult = WorldGenerationValidator.validateGeneratedWorld(mockProfile as unknown as WorldProfile, [], mockTemplate);
    // Should pass required concepts scan because '飞剑' and '炼丹' are present in location description
    const missingIssues = valResult.issues.filter((i) => i.ruleId === 'REQUIRED_CONCEPT_MISSING');
    expect(missingIssues.length).toBe(0);
  });
});
