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
  });

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
  });
});
