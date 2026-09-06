import { CausalityPressure, Event } from '../types';
import { globalWorld } from './worldState';
import { StateChangeProposal } from './recorder/changeSchemas';
import { aiService } from './ai/aiService';
import { createStateChangeProposal } from './proposal/proposalFactory';
import { proposalPipeline } from './proposal/proposalPipeline';

export class CausalityEngine {
  public static evaluatePressures(): CausalityPressure[] {
    const pressures: CausalityPressure[] = [];

    globalWorld.organizations.forEach((organization) => {
      organization.goals.forEach((goal) => {
        if (goal.status === 'ACTIVE') {
          pressures.push({
            source: 'ORG_GOAL_PROGRESSION',
            entity_id: organization.id,
            description: `${organization.name} 试图推进目标: ${goal.description}`,
            pressure: Math.min(100, Math.round((1 - goal.progress) * 70 + organization.resources.military_power * 0.3)),
          });
        }
      });
    });

    globalWorld.characters.forEach((character) => {
      if (character.type !== 'PC' && character.status === 'ALIVE' && character.goal.primary) {
        pressures.push({
          source: 'NPC_PERSONAL_MOTIVE',
          entity_id: character.id,
          description: `${character.name} 的个人执念: ${character.goal.primary}`,
          pressure: 55,
        });
      }
    });

    return pressures;
  }

  public static async tickSeeds(): Promise<Event[]> {
    const epoch = globalWorld.snapshot.epoch;
    const proposals: StateChangeProposal[] = [];

    globalWorld.seeds.forEach((seed) => {
      if (seed.status !== 'IN_PROGRESS') return;

      const actor = seed.visible_layer.actor_ids[0]
        ? globalWorld.characters.get(seed.visible_layer.actor_ids[0])
        : null;
      const skillBonus = actor && (actor.skills['锻造'] || actor.skills['潜行'] || actor.skills['交涉']) ? 0.05 : 0;
      const progress = Math.min(1, seed.progress + 0.15 + skillBonus);
      const completed = progress >= 1;

      proposals.push({
        id: `prop-seed-${seed.id}-${Date.now()}`,
        operation: 'UPDATE_SEED',
        entityType: 'SEED',
        entityId: seed.id,
        payload: { seedId: seed.id, progress, status: completed ? 'COMPLETED' : 'IN_PROGRESS' },
        effectiveEpoch: epoch,
        preconditions: [],
        source: { type: 'SIMULATION', id: 'causalityEngine' },
      });

      if (!completed) return;

      proposals.push({
        id: `prop-seed-evt-${seed.id}-${Date.now()}`,
        operation: 'CREATE_EVENT',
        entityType: 'EVENT',
        payload: {
          type: 'DISCOVERY',
          description: `【Seed 事件完成】${seed.visible_layer.description} (进度 100%)。其引发的连锁涟漪已扩散至周围区域。`,
          location_id: seed.visible_layer.location_id,
          involved_entity_ids: [...seed.visible_layer.actor_ids],
          effects: [{
            type: 'FACT_CHANGE',
            description: `Seed [${seed.type}] 执行完毕，引起局势动荡。`,
            target_type: 'LOCATION',
            target_id: seed.visible_layer.location_id,
            changes: {},
          }],
        },
        effectiveEpoch: epoch,
        preconditions: [],
        source: { type: 'SIMULATION', id: 'causalityEngine' },
      });

      const actorIds = seed.visible_layer.actor_ids;
      for (let index = 0; index < actorIds.length; index += 1) {
        for (let target = index + 1; target < actorIds.length; target += 1) {
          proposals.push({
            id: `prop-seed-rel-${actorIds[index]}-${actorIds[target]}-${Date.now()}`,
            operation: 'CHANGE_RELATIONSHIP',
            entityType: 'CHARACTER',
            entityId: actorIds[index],
            payload: {
              sourceCharacterId: actorIds[index],
              targetCharacterId: actorIds[target],
              trustDelta: 8,
              favorDelta: 5,
            },
            effectiveEpoch: epoch,
            preconditions: [],
            source: { type: 'SIMULATION' },
          });
        }
      }
    });

    if (proposals.length === 0) return [];
    const worldId = globalWorld.snapshot.id;
    if (!worldId) {
      throw new Error('Cannot commit causality proposals without an active world id.');
    }
    const result = await proposalPipeline.processAndCommit({
      worldId,
      proposals: proposals.map((proposal) => createStateChangeProposal({
        ...proposal,
        reason: 'Advance active simulation seed.',
        causalBasis: [{ type: 'SYSTEM_EVENT', id: proposal.entityId, description: 'Simulation seed reached its scheduled evaluation.' }],
        authorityLevel: 'SYSTEM',
      })),
    });
    return result.commitResult?.eventsGenerated ?? [];
  }

  public static async generateDeepCausalityEvaluation(): Promise<string> {
    const aiContext = { userId: 'SYSTEM_USER', worldId: globalWorld.snapshot.id, purpose: 'CAUSALITY' as const };
    if (!aiService.isAvailable(aiContext)) {
      const worldName = globalWorld.profile?.display_name || globalWorld.snapshot.world_name || 'the current world';
      const organizations = Array.from(globalWorld.organizations.values()).map((organization) => organization.name);
      const activeSeeds = Array.from(globalWorld.seeds.values())
        .filter((seed) => seed.status === 'IN_PROGRESS')
        .map((seed) => seed.visible_layer.description);
      const organizationSummary = organizations.length > 0 ? organizations.join(', ') : 'no active organizations';
      const seedSummary = activeSeeds.length > 0 ? activeSeeds.join('; ') : 'no active seeds';
      return `Deterministic causality forecast for ${worldName}: organizations: ${organizationSummary}. Active developments: ${seedSummary}.`;
    }

    try {
      globalWorld.totalLLMCalls += 1;
      globalWorld.llmCallsThisEpoch += 1;
      const activeSeeds = Array.from(globalWorld.seeds.values()).map((seed) => ({
        type: seed.type,
        description: seed.visible_layer.description,
        progress: seed.progress,
      }));
      const organizations = Array.from(globalWorld.organizations.values())
        .map((organization) => `${organization.name} (${organization.type})`)
        .join(', ');

      return await aiService.generateText(
        aiContext,
        '你是一个 AI-Native 永恒世界 RPG 的【因果律推演引擎】。',
        `当前世界: ${globalWorld.snapshot.world_name || '原初界域'}\n世界设定: ${globalWorld.snapshot.world_description || '未知世界'}\n当前纪元 (Epoch): ${globalWorld.snapshot.epoch}\n活跃种子 Seed: ${JSON.stringify(activeSeeds, null, 2)}\n主要势力: ${organizations || '暂无主要势力'}\n\n请以符合当前世界风格、写实严谨的语气，推演 1-2 段本纪元因果树的深层涟漪 (200字以内)。`,
        { timeoutMs: 60000 }
      );
    } catch (error) {
      console.error('Causality evaluation failed:', error);
      return '因果推演引擎遇到微弱扰动，局势依然在按轨迹发展。';
    }
  }
}
