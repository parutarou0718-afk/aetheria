import { describe, it, expect, vi, beforeEach } from 'vitest';

// [audit #9] Genesis must fully replace the active world cache — no default-theme entity residue.
// P0-2 (方案X): creating a new world must not leave default Eldlan entities in the active globalWorld.
vi.mock('../src/engine/ai/aiService', () => ({ aiService: {
  generateJson: vi.fn(async (_context: unknown, _system: string, user: string) => {
    if (user.includes('User Vision:')) return mockProfileJson();
    if (user.includes('Locations Available:')) return mockEntityJson();
    return mockSkeletonJson();
  }),
} }));

import { WorldGenesisService } from '../src/engine/worldGeneration/worldGenesisService';
import { globalWorld, setRecorderWriteContext } from '../src/engine/worldState';
import { dbManager } from '../src/engine/persistence/database';
import { WorldRepository } from '../src/engine/world/worldRepository';

// --- Deterministic offline fixtures (cyberpunk, NO Eldlan default theme terms) ---

function mockProfileJson() {
  return {
    displayName: '赛博绿洲',
    shortPitch: '霓虹雨影中的黑客自治城市',
    worldDescription: '在赛博绿洲的天空网络下，巨企与数据流民争夺着被封禁的真相。',
    genreLabels: ['CYBERPUNK'],
    toneLabels: ['DARK', 'NEON'],
    culturalInfluences: ['近未来'],
    cosmology: '城市核心是一个人工维护的主干网络，边界由协议划定。',
    metaphysics: '意识碎片可被上传成为数据幽灵。',
    powerSystem: '义体改造与协议入侵',
    powerCosts: '过度接入会神经过载。',
    deathRules: '肉身湮灭，意识或存留矩阵。',
    timeRules: '以服务器纪元计时。',
    socialStructure: '巨企寡头与流民的抗争分层。',
    politicalStructure: '数据与暴力并行的治理。',
    economySystem: '以信用点流转。',
    technologyModel: '神经义体与量子网络',
    geographyModel: '霓虹雨巷与悬浮巨厦。',
    namingConventions: {
      personalNames: '代号',
      placeNames: '霓虹地标',
      organizationNames: '集团缩写',
      titles: '黑客阶级称谓',
    },
    terminology: {
      currencyTerms: ['信用点'],
      energyTerms: ['电力'],
      professionTerms: ['黑客'],
      factionTerms: ['巨企'],
      settlementTerms: ['网络城'],
      wildernessTerms: ['黑区'],
      creatureTerms: ['赛博人'],
      artifactTerms: ['神经芯片'],
      socialRankTerms: ['流民'],
      conflictTerms: ['网络战'],
    },
    narrativeStyle: {
      narratorRole: '矩阵编年史官',
      voice: '冷峻锐利',
      proseRules: ['注重霓虹烘托'],
      prohibitedStylePatterns: ['避免田园诗般描写'],
    },
    allowedConcepts: ['黑客', '赛博', '霓虹'],
    forbiddenConcepts: ['艾尔德兰', '铁冠城', '黑鸦商会', '圣光守卫团', '红叶雇佣兵酒馆'],
    axioms: [
      { category: 'GEOGRAPHY', statement: '地下网络节点是城市血脉。', consequences: ['断网即割裂'] },
      { category: 'POWER', statement: '接入越深代价越大。', consequences: ['灼蚀自我'] },
      { category: 'SOCIETY', statement: '巨企垄断网络接口。', consequences: ['催生冲突'] },
      { category: 'TECHNOLOGY', statement: '科技仰赖被封存的数据遗产。', consequences: ['数据即权力'] },
      { category: 'COSMOLOGY', statement: '矩阵与现实互为镜像。', consequences: ['协议改写重塑认知'] },
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
        description: '黑客与被遗弃的流民交汇的阴湿巷道。',
        population: 400,
        connectedToKeyIds: ['arcology'],
        primaryIndustry: 'TRADE',
        tradeGoods: ['加密卡'],
        featureName: '数据跳蚤市场',
        featureDescription: '地下交易芯片的隐秘市场。',
      },
      {
        idKey: 'arcology',
        name: '量子巨厦',
        type: 'STATION',
        description: '悬浮于雾海之上的巨企总部。',
        population: 5000,
        connectedToKeyIds: ['start', 'underground'],
        primaryIndustry: 'TECH',
        tradeGoods: ['神经芯片'],
        featureName: '主权数据舱',
        featureDescription: '存放秩序密钥的机房。',
      },
      {
        idKey: 'underground',
        name: '地下黑区',
        type: 'RUINS',
        description: '被遗弃城区里的数据荒地。',
        population: 200,
        connectedToKeyIds: ['arcology'],
        primaryIndustry: 'GATHERING',
        tradeGoods: ['加密卡'],
        featureName: '幽灵中继站',
        featureDescription: '连通城市暗网的基站。',
      },
    ],
    hiddenTruths: [
      { title: '跳蚤市场下藏着一台祖母机', layer: 'layer_1_personal_secrets', layerName: '个人秘密', trueNature: '仍可唤醒一段网络自治史。', evidenceRequired: ['祖母机密钥'] },
      { title: '巨厦抬升接入税', layer: 'layer_2_organization_conspiracies', layerName: '组织阴谋', trueNature: '借监管垄断接口。', evidenceRequired: ['巨企账目'] },
      { title: '网络断片是巨企定向清除记忆', layer: 'layer_3_world_lies', layerName: '世界谎言', trueNature: '被抹去的历史指向原始原罪。', evidenceRequired: ['清除日志'] },
      { title: '矩阵熵增被高阶协议加速', layer: 'layer_4_cosmic_illusions', layerName: '宇宙假象', trueNature: '失控尽头是协议死锁。', evidenceRequired: ['异常协议样本'] },
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
        primaryGoal: '夺回被封存的网络自治权',
        personality: ['机敏', '孤僻'],
        fear: '失去接口权限',
        attributes: { hp: 100, max_hp: 100, mp: 80, max_mp: 80, strength: 10, dexterity: 14, intelligence: 18, charisma: 12 },
        skills: { '神经入侵': 16 },
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
        primaryGoal: '为黑客提供安全接入义体',
        personality: ['沉稳'],
        fear: '被巨企盯上',
        attributes: { hp: 90, max_hp: 90, mp: 40, max_mp: 40, strength: 12, dexterity: 13, intelligence: 15, charisma: 13 },
        skills: { '义体修复': 15 },
        resources: { gold: 300, reputation: 40 },
        inventory: [],
      },
    ],
    organizations: [
      {
        name: '断链者',
        type: 'CULT',
        description: '潜入地下黑区的黑客结社。',
        headquartersLocationKeyId: 'underground',
        leaderCharacterKeyId: 'npc1',
        goalDescription: '打破巨企垄断',
        projectName: '黑夜密钥行动',
        projectDescription: '渗透加密舱。',
      },
    ],
    facts: [
      { statement: '巨厦掌握八成网络根接口。', category: 'TECHNOLOGY' },
      { statement: '地下黑区是流民避难所。', category: 'GEOGRAPHY' },
    ],
    seeds: [
      {
        type: 'INVESTIGATION',
        description: '跳蚤市场传出祖母机密钥传闻。',
        hiddenTruthIndex: 0,
        opportunityDescription: '追查祖母机',
        discoveryCondition: '在黑市购得密钥碎片',
      },
      {
        type: 'CONFLICT',
        description: '巨企以网络断片为由封锁城区。',
        hiddenTruthIndex: 2,
        opportunityDescription: '揭露清除日志',
        discoveryCondition: '截获被抹除的数据日志',
      },
    ],
    genesisEventDescription: '【创世纪元】巨厦的宵禁指令亮起，零号信标集结断链者开启夺权征途。',
  };
}

const DEFAULT_THEME_ENTITY_IDS = [
  'pc-player',
  'npc-elder',
  'npc-innkeeper',
  'loc-tavern',
  'loc-dawnfall',
  'loc-wilds',
  'loc-ruins',
  'org-crow',
  'org-knights',
];

describe('Genesis Active World Isolation (方案X)', () => {
  beforeEach(async () => {
    await dbManager.initialize();
  });

  it('after genesis, the active globalWorld contains NO default-theme entity residue', async () => {
    const worldId = `world-isolation-${Date.now()}`;

    // Deliberately pre-seed default-theme entities into the active cache to simulate
    // a "dirty active world" BEFORE genesis (worst case for pollution).
    setDirtyActiveWorld();

    const result = await WorldGenesisService.createDynamicWorld({
      worldId,
      generationSeed: 777001,
      userVision: '霓虹雨影中的黑客自治城市，巨企垄断网络，数据流民争夺被封禁的真相',
      constraints: {
        requiredElements: ['黑客', '赛博', '霓虹'],
        forbiddenElements: ['艾尔德兰', '铁冠城', '黑鸦商会', '圣光守卫团', '红叶雇佣兵酒馆'],
      },
    });

    expect(result.worldId).toBe(worldId);

    // 1. Active cache must hold the freshly generated world's entity ids, not the default ones.
    const activeCharIds = Array.from(globalWorld.characters.keys());
    const activeLocIds = Array.from(globalWorld.locations.keys());
    const activeOrgIds = Array.from(globalWorld.organizations.keys());

    for (const defaultId of DEFAULT_THEME_ENTITY_IDS) {
      expect(activeCharIds).not.toContain(defaultId);
      expect(activeLocIds).not.toContain(defaultId);
      expect(activeOrgIds).not.toContain(defaultId);
    }

    // 2. No default-name residue anywhere in the active entity text.
    const forbiddenTerms = ['艾尔德兰', '铁冠城', '黑鸦商会', '圣光守卫团', '红叶雇佣兵酒馆', '拂晓'];
    const activeText = [
      globalWorld.snapshot.world_name,
      globalWorld.snapshot.world_description,
      globalWorld.profile?.display_name || '',
      ...activeCharIds.map((id) => globalWorld.characters.get(id)?.name || ''),
      ...activeLocIds.map((id) => globalWorld.locations.get(id)?.name || ''),
      ...activeOrgIds.map((id) => globalWorld.organizations.get(id)?.name || ''),
    ].join(' ');

    for (const term of forbiddenTerms) {
      expect(activeText.includes(term)).toBe(false);
    }

    // 3. The generated world's own entities ARE present in the active cache.
    const generatedChar = Array.from(globalWorld.characters.values()).find((c) => c.name === '零号信标');
    expect(generatedChar).toBeDefined();
    expect(activeLocIds.some((id) => globalWorld.locations.get(id)?.name === '量子巨厦')).toBe(true);

    // 4. Cleanup the isolation world from DB.
    await WorldRepository.deleteWorldData(worldId);
  }, 30000);

  it('genesis persists only its own worldId — default world data is untouched in DB', async () => {
    // Even with a pre-created default snapshot in DB, genesis for a NEW worldId
    // must not delete/rewrite the default world's rows.
    const preservedWorldId = 'world-snapshot-preserved-001';
    await WorldRepository.deleteWorldData(preservedWorldId);
    const now = new Date().toISOString();
    await WorldRepository.saveWorldSnapshot({
      id: preservedWorldId,
      world_name: '被保留的旧世界',
      world_description: '一个不应被触碰的旧世界。',
      world_creation_state: 'CREATED',
      epoch: 1,
      seed: 1,
      created_at: now,
      world_facts_count: 0,
      characters_count: 0,
      organizations_count: 0,
      locations_count: 0,
      active_seeds_count: 0,
      frozen_objects_count: 0,
      completed_epochs: 0,
    });

    const newWorldId = `world-isolation-preserve-${Date.now()}`;
    await WorldGenesisService.createDynamicWorld({
      worldId: newWorldId,
      generationSeed: 999,
      userVision: '一个霓虹雨影中的黑客自治城市，巨企垄断网络接入',
      constraints: {},
    });

    // Preserved world still exists.
    const preserved = await WorldRepository.getWorldSnapshot(preservedWorldId);
    expect(preserved).not.toBeNull();
    expect((preserved as any).world_name).toBe('被保留的旧世界');

    // Newly generated world exists.
    const generated = await WorldRepository.getWorldSnapshot(newWorldId);
    expect(generated).not.toBeNull();

    await WorldRepository.deleteWorldData(newWorldId);
    await WorldRepository.deleteWorldData(preservedWorldId);
  }, 30000);
});

function setDirtyActiveWorld() {
  // Pre-populate active cache with a marker entity resembling a default-theme residue.
  setRecorderWriteContext(true);
  try {
    globalWorld.characters.set('pc-player', { id: 'pc-player', name: '未知旅人', type: 'PC' } as any);
    globalWorld.locations.set('loc-tavern', { id: 'loc-tavern', name: '红叶雇佣兵酒馆', type: 'TOWN' } as any);
    globalWorld.organizations.set('org-crow', { id: 'org-crow', name: '黑鸦商会', type: 'GUILD' } as any);
  } finally {
    setRecorderWriteContext(false);
  }
}
