import { describe, it, expect } from 'vitest';
import { WorldGenesisService } from '../src/engine/worldGeneration/worldGenesisService';
import { WorldGenerationValidator } from '../src/engine/worldGeneration/worldGenerationValidator';
import { WorldProfile } from '../src/engine/worldProfile/worldProfileTypes';
import { WorldTemplate } from '../src/engine/worldProfile/worldTemplateTypes';

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
