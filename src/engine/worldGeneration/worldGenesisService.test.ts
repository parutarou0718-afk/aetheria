import { describe, it, expect, beforeEach } from 'vitest';
import { WorldGenesisService } from './worldGenesisService';
import { WorldCreationRequest } from './worldCreationRequest';
import { DeterministicIdFactory } from './deterministicIdFactory';
import { WorldRepository } from '../world/worldRepository';
import { dbManager } from '../persistence/database';

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

    // Verify all axioms are immutable
    result.axioms.forEach((ax) => {
      expect(ax.immutable).toBe(true);
    });

    // Verify exactly 1 PC
    const pcs = result.template.characters.filter((c) => c.type === 'PC');
    expect(pcs.length).toBe(1);

    // Verify locations connectivity
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

    // Verify required concepts injected into world facts
    const hasRequiredFact = result.template.facts.some((f) =>
      f.statement.includes('精金符文') || f.statement.includes('悬赏令')
    );
    expect(hasRequiredFact).toBe(true);

    // Verify no forbidden concepts in character titles or location descriptions
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

    // Verify PC species is derived or profile-appropriate, not hardcoded
    const pc = result.template.characters.find((c) => c.type === 'PC');
    expect(pc).toBeDefined();
    expect(pc?.title).not.toBe('人类探索者');
    expect(pc?.species).not.toBe('普通人类');
  }, 30000);
});
