import { globalWorld } from './worldState';
import { SchedulerEngine } from './scheduler';
import { CausalityEngine } from './causality';
import { TruthsEngine } from './truthsEngine';
import { Location } from '../types';
import { StateChangeProposal } from './recorder/changeSchemas';
import { createStateChangeProposal } from './proposal/proposalFactory';
import { proposalPipeline } from './proposal/proposalPipeline';
import { TransactionService } from './timeline/transactionService';
import {
  buildDmFallbackNarration,
  buildDmErrorNarration,
  buildDmPromptHeader,
  resolveNarratorRole,
} from './dmNarrator';
import { aiService } from './ai/aiService';
import type { GameRequestContext } from '../application/gameRequestContext';

export interface DMResponse {
  dmNarration: string;
  diceRoll?: { skill: string; roll: number; target: number; success: boolean };
  stateUpdatesSummary: string[];
  currentLocationName: string;
  epoch: number;
}

export class DMEngine {
  public static async processPlayerAction(context: GameRequestContext, playerActionText: string): Promise<DMResponse> {
    if (context.worldId !== globalWorld.snapshot.id) {
      return this.buildContextErrorResponse();
    }

    const pc = globalWorld.characters.get(context.actorId);
    if (!pc) {
      return this.buildContextErrorResponse();
    }
    const currentLocation = pc ? globalWorld.locations.get(pc.location_id) : null;
    const npcsHere = Array.from(globalWorld.characters.values()).filter(
      (c) => c.type === 'NPC' && c.location_id === pc?.location_id
    );
    const activeSeeds = Array.from(globalWorld.seeds.values()).filter((s) => s.status === 'IN_PROGRESS');
    const hiddenTruths = Array.from(globalWorld.hiddenTruths.values());

    const profile = globalWorld.profile;
    const axioms = globalWorld.axioms || [];

    // [P3.8] Narrator role is profile-driven, never hardcoded as "Dungeon Master".
    // Falls back to the neutral "世界演算者" when no profile is present.
    const narratorRole = resolveNarratorRole(profile);

    const aiContext = { userId: context.userId, worldId: context.worldId, purpose: 'DM_ACTION' as const };
    if (!aiService.isAvailable(aiContext)) {
      const fallbackNarration = buildDmFallbackNarration(
        narratorRole,
        playerActionText,
        currentLocation?.name || '未知区域',
        npcsHere.map((n) => n.name)
      );

      await SchedulerEngine.processEpochTick();
      await CausalityEngine.tickSeeds();

      return {
        dmNarration: fallbackNarration,
        stateUpdatesSummary: ['纪元自动推进到 Epoch ' + globalWorld.snapshot.epoch],
        currentLocationName: currentLocation?.name || '未知',
        epoch: globalWorld.snapshot.epoch,
      };
    }

    try {
      globalWorld.totalLLMCalls++;
      globalWorld.llmCallsThisEpoch++;

      const knownLocations = Array.from(globalWorld.locations.values()).map((l) => ({
        id: l.id,
        name: l.name,
        type: l.type,
        description: l.description,
        connectedTo: l.connected_to,
      }));

      const axiomsFormatted = axioms.length > 0
        ? axioms.map((a) => `- [${a.category}] ${a.statement} (后果: ${a.consequences.join(', ')})`).join('\n')
        : '- 天地万物遵循基本因果规律运转。';

      const systemPrompt = `${buildDmPromptHeader(narratorRole)}
设计核心哲学: 开放世界沙盒。精髓在于【世界推演】而非固定脚本剧本！
- 没有固定强制的线性剧情主线，由玩家自由决定道路与世界方向。
- 玩家随时可以自定义或补充世界观设定，你必须接纳并遵守该世界的宪法与公理！

当前纪元 (Epoch): ${globalWorld.snapshot.epoch}

【世界宪法 (World Profile)】:
- 世界名称: ${profile?.display_name || globalWorld.snapshot.world_name}
- 世界描述: ${profile?.world_description || globalWorld.snapshot.world_description}
- 力量体系: ${profile?.power_system || '标准能量'} (代价: ${profile?.power_costs || '守恒'})
- 死亡规则: ${profile?.death_rules || '不可逆'}
- 科技/文明层级: ${profile?.technology_model || '混合型'}
- 社会/政治结构: ${profile?.social_structure || '多元势力'}
- 核心专用术语: ${JSON.stringify(profile?.terminology || {})}
- 允许/倡导概念: ${JSON.stringify(profile?.allowed_concepts || [])}
- 禁忌/禁止概念: ${JSON.stringify(profile?.forbidden_concepts || [])}

【世界绝对公理 (World Axioms - 必须严格遵循)】:
${axiomsFormatted}

【后台完整世界状态与玩家数据 Context】:
1. 玩家角色卡:
   - 姓名: ${pc?.name || '旅人'} (${pc?.title || '探索者'})
   - 种族: ${pc?.species || '本生界灵'}
   - 状态: HP ${pc?.attributes.hp}/${pc?.attributes.max_hp}, MP ${pc?.attributes.mp}/${pc?.attributes.max_mp}, 资源 ${pc?.resources.gold}
   - 基础属性: STR ${pc?.attributes.strength}, DEX ${pc?.attributes.dexterity}, INT ${pc?.attributes.intelligence}, CHA ${pc?.attributes.charisma}
   - 技能列表: ${JSON.stringify(pc?.skills)}
   - 背包物品: ${JSON.stringify(pc?.inventory)}
   - 当前所在位置: 【${currentLocation?.name}】(${currentLocation?.description})

2. 世界地图已知地点 (Known Locations):
   - ${JSON.stringify(knownLocations)}

3. 本区域与全域 NPCs 状态:
   - 当前地点 NPC: ${JSON.stringify(npcsHere.map((n) => ({ id: n.id, name: n.name, title: n.title, species: n.species, goal: n.goal.primary, trust: n.relationships.find((r) => r.target_id === pc?.id)?.trust || 50 })))}

4. 活跃因果种子 (Seeds & Pressure):
   - 活跃 Seeds: ${JSON.stringify(activeSeeds.map((s) => ({ id: s.id, type: s.type, desc: s.visible_layer.description, progress: (s.progress * 100).toFixed(0) + '%' })))}

5. 4层隐藏真相板 (Hidden Truths):
   - ${JSON.stringify(hiddenTruths.map((t) => ({ layer: t.layer, title: t.title, revealed: t.revealed, evidence_collected: t.evidence_collected, evidence_required: t.evidence_required, true_nature: t.revealed ? t.true_nature : '未揭露' })))}

【玩家的输入/行动/询问】: "${playerActionText}"

【DM 的行为准则与响应要求】:
1. 必须完全尊重世界宪法 Profile 与公理 Axioms 的约束，严禁输出破坏世界规则或包含禁忌概念的内容。
2. 一切世界推进与信息传达全凭你与玩家的对话。
3. 如果玩家提出了对世界观的补充，请顺应并将其织入故事中。
4. 如果玩家的行动触发了后端状态改变，请在返回 JSON 的结构化属性中准确写入：
   - characterUpdate: 包含 name, title, species, skills 等键值的对象 (如果玩家设定/更改了角色属性)
   - newLocation: { id: string, name: string, type: "CITY"|"TOWN"|"FOREST"|"DUNGEON"|"RUINS", description: string, connectedTo: string[] } (如果生成了新地点)
   - targetLocationId: string (如果玩家移动了位置)
   - hpDelta: 整数
   - mpDelta: 整数
   - goldDelta: 整数
   - npcAffinityDelta: { npcId: string, trustDelta: number, favorDelta: number }
   - collectedEvidence: { truthId: string, evidenceName: string }
   - advanceEpoch: boolean (默认 true)
   - diceRoll: { skill: string, roll: number, target: number, success: boolean }

必须严格返回合法 JSON 格式:
{
  "dmNarration": "DM叙述或对玩家行动的回应...",
  "diceRoll": null,
  "characterUpdate": null,
  "newLocation": null,
  "targetLocationId": null,
  "hpDelta": 0,
  "mpDelta": 0,
  "goldDelta": 0,
  "npcAffinityDelta": null,
  "collectedEvidence": null,
  "advanceEpoch": true
}`;

      const parsed = await aiService.generateJson(
        aiContext,
        systemPrompt,
        'Return only the requested JSON object.',
        { timeoutMs: 60000 }
      ) as any;

      const updatesSummary: string[] = [];
      const proposals: StateChangeProposal[] = [];
      const timelineExecutionProposals: StateChangeProposal[] = [];
      const currentEpoch = globalWorld.snapshot.epoch;

      // Handle character updates
      if (pc && parsed.characterUpdate) {
        proposals.push({
          id: `prop-char-${Date.now()}`,
          operation: 'UPDATE_CHARACTER',
          entityType: 'CHARACTER',
          entityId: pc.id,
          payload: parsed.characterUpdate,
          effectiveEpoch: currentEpoch,
          preconditions: [],
          source: { type: 'LLM', id: 'dmEngine' },
        });
        updatesSummary.push(`👤 角色设定已生效: ${parsed.characterUpdate.name || pc.name} (${parsed.characterUpdate.title || pc.title})`);
      }

      // Handle LLM dynamic new location creation
      if (parsed.newLocation && parsed.newLocation.name) {
        const newLocId = parsed.newLocation.id || `loc-dyn-${Date.now()}`;
        const connectedLocs = Array.isArray(parsed.newLocation.connectedTo) && parsed.newLocation.connectedTo.length > 0
          ? parsed.newLocation.connectedTo
          : [pc?.location_id || 'loc-start'];

        const newLocObj: Location = {
          id: newLocId,
          name: parsed.newLocation.name,
          type: parsed.newLocation.type || 'TOWN',
          description: parsed.newLocation.description || '由 DM 在探索中演化生成的新领域。',
          connected_to: connectedLocs,
          child_ids: [],
          population: 80,
          population_trend: 'STABLE',
          economy: { primary_industry: 'TRADE', wealth_level: 3, trade_goods: [], trade_routes: [] },
          security: { guard_presence: 40, crime_rate: 30 },
          active_events: [],
          features: [],
          frozen: false,
          simulation_level: 3,
          last_simulated_epoch: globalWorld.snapshot.epoch,
          created_at_epoch: globalWorld.snapshot.epoch,
          updated_at_epoch: globalWorld.snapshot.epoch,
        };

        proposals.push({
          id: `prop-newloc-${Date.now()}`,
          operation: 'CREATE_LOCATION',
          entityType: 'LOCATION',
          entityId: newLocId,
          payload: { location: newLocObj },
          effectiveEpoch: currentEpoch,
          preconditions: [],
          source: { type: 'LLM' },
        });

        connectedLocs.forEach((existingLocId: string) => {
          proposals.push({
            id: `prop-conn-${existingLocId}-${newLocId}-${Date.now()}`,
            operation: 'CONNECT_LOCATIONS',
            entityType: 'LOCATION',
            payload: { locationIdA: existingLocId, locationIdB: newLocId },
            effectiveEpoch: currentEpoch,
            preconditions: [],
            source: { type: 'LLM' },
          });
        });

        if (pc) {
          proposals.push({
            id: `prop-knowloc-${Date.now()}`,
            operation: 'UPDATE_CHARACTER_KNOWLEDGE',
            entityType: 'CHARACTER',
            entityId: pc.id,
            payload: { characterId: pc.id, knownLocation: newLocId },
            effectiveEpoch: currentEpoch,
            preconditions: [],
            source: { type: 'LLM' },
          });
        }

        if (parsed.targetLocationId === parsed.newLocation.id || !parsed.targetLocationId) {
          parsed.targetLocationId = newLocId;
        }

        updatesSummary.push(`🗺️ DM 动态演化出新地图领域: 【${newLocObj.name}】`);
      }

      // Apply location move via TransactionService travel proposals
      if (parsed.targetLocationId && pc) {
        try {
          const travelPlan = await TransactionService.buildTravelPlanProposals({
            worldId: context.worldId,
            actorId: pc.id,
            destinationLocationId: parsed.targetLocationId,
            startEpoch: currentEpoch,
          });
          timelineExecutionProposals.push(...travelPlan.proposals);
          const locName = globalWorld.locations.get(parsed.targetLocationId)?.name || parsed.targetLocationId;
          updatesSummary.push(`📍 开启旅程: 【${locName}】(预计耗时 ${travelPlan.totalEpochs} 周期)`);
        } catch (err) {
          // [P0-1] Travel planning failure must NOT silently teleport the actor.
          // Do not fabricate a successful move, do not mutate location/presence/transaction.
          const locName = globalWorld.locations.get(parsed.targetLocationId)?.name || parsed.targetLocationId;
          updatesSummary.push(`⚠️ 无法前往【${locName}】：当前不存在连通路线或目标不可达。未执行移动。`);
        }
      }

      // Apply HP/MP/Gold deltas with profile-driven labels
      const currencyTerm = globalWorld.profile?.terminology?.currencyTerms?.[0] || '通用币';
      const energyTerm = globalWorld.profile?.terminology?.energyTerms?.[0] || '能量值 MP';

      if (pc) {
        if (parsed.hpDelta || parsed.mpDelta) {
          proposals.push({
            id: `prop-attr-${Date.now()}`,
            operation: 'UPDATE_CHARACTER_ATTRIBUTES',
            entityType: 'CHARACTER',
            entityId: pc.id,
            payload: { characterId: pc.id, hpDelta: parsed.hpDelta || 0, mpDelta: parsed.mpDelta || 0 },
            effectiveEpoch: currentEpoch,
            preconditions: [],
            source: { type: 'LLM' },
          });
          if (parsed.hpDelta) updatesSummary.push(`❤️ 生命值 HP ${parsed.hpDelta > 0 ? '+' : ''}${parsed.hpDelta}`);
          if (parsed.mpDelta) updatesSummary.push(`✨ ${energyTerm} ${parsed.mpDelta > 0 ? '+' : ''}${parsed.mpDelta}`);
        }

        if (parsed.goldDelta) {
          proposals.push({
            id: `prop-gold-${Date.now()}`,
            operation: 'CHANGE_RESOURCE',
            entityType: 'CHARACTER',
            entityId: pc.id,
            payload: { characterId: pc.id, goldDelta: parsed.goldDelta },
            effectiveEpoch: currentEpoch,
            preconditions: [],
            source: { type: 'LLM' },
          });
          updatesSummary.push(`🪙 ${currencyTerm} ${parsed.goldDelta > 0 ? '+' : ''}${parsed.goldDelta}`);
        }
      }

      // Apply NPC relationship changes
      if (parsed.npcAffinityDelta && parsed.npcAffinityDelta.npcId && pc) {
        proposals.push({
          id: `prop-npc-rel-${Date.now()}`,
          operation: 'CHANGE_RELATIONSHIP',
          entityType: 'CHARACTER',
          entityId: parsed.npcAffinityDelta.npcId,
          payload: {
            sourceCharacterId: parsed.npcAffinityDelta.npcId,
            targetCharacterId: pc.id,
            trustDelta: parsed.npcAffinityDelta.trustDelta || 0,
            favorDelta: parsed.npcAffinityDelta.favorDelta || 0,
          },
          effectiveEpoch: currentEpoch,
          preconditions: [],
          source: { type: 'LLM' },
        });
        const npc = globalWorld.characters.get(parsed.npcAffinityDelta.npcId);
        updatesSummary.push(`🤝 对 ${npc ? npc.name : 'NPC'} 的信任度 ${parsed.npcAffinityDelta.trustDelta > 0 ? '+' : ''}${parsed.npcAffinityDelta.trustDelta || 0}`);
      }

      // Record DM turn event proposal
      proposals.push({
        id: `prop-dm-evt-${Date.now()}`,
        operation: 'CREATE_EVENT',
        entityType: 'EVENT',
        payload: {
          type: 'SOCIAL',
          description: `【DM 跑团回合】玩家推演: "${playerActionText}" -> DM: "${parsed.dmNarration.slice(0, 80)}..."`,
          location_id: pc?.location_id,
          involved_entity_ids: [pc?.id || ''],
        },
        effectiveEpoch: currentEpoch,
        preconditions: [],
        source: { type: 'LLM', id: 'dmEngine' },
      });

      // Keep player/LLM outcomes and timeline execution in one atomic batch,
      // while preserving their distinct authorities.
      if (proposals.length > 0 || timelineExecutionProposals.length > 0) {
        const pipelineResult = await proposalPipeline.processAndCommit({
          worldId: context.worldId,
          proposals: [
            ...proposals.map((proposal) => createStateChangeProposal({
              ...proposal,
              reason: `Resolve player action: ${playerActionText}`,
              causalBasis: [{ type: 'PLAYER_ACTION', description: playerActionText }],
              authorityLevel: 'ACTOR',
            })),
            ...timelineExecutionProposals.map((proposal) => createStateChangeProposal({
              ...proposal,
              reason: 'Execute approved timeline travel transaction.',
              causalBasis: [{
                type: 'SYSTEM_EVENT',
                id: proposal.entityId || proposal.id,
                description: 'The travel transaction reached its execution point.',
              }],
              authorityLevel: 'SYSTEM',
            })),
          ],
        });
        if (!pipelineResult.success) {
          console.warn('[DMEngine] Proposal pipeline rejected action resolution:', pipelineResult.rejected.map((rejection) => rejection.message));
          return {
            dmNarration: buildDmErrorNarration(narratorRole),
            stateUpdatesSummary: ['Action resolution failed; no DM-generated state change was committed.'],
            currentLocationName: currentLocation?.name || '未知位置',
            epoch: globalWorld.snapshot.epoch,
          };
        }
      }

      // Apply Evidence Collection via TruthsEngine
      if (parsed.collectedEvidence && parsed.collectedEvidence.truthId && parsed.collectedEvidence.evidenceName) {
        const res = await TruthsEngine.addEvidenceToTruth(
          parsed.collectedEvidence.truthId,
          parsed.collectedEvidence.evidenceName
        );
        updatesSummary.push(`🔍 搜集到了突破真相物证: 《${parsed.collectedEvidence.evidenceName}》`);
        if (res.isNowReadyToReveal) {
          updatesSummary.push(`🔑 【线索集齐警告】对应真相《${res.truth?.title}》物证已集齐！`);
        }
      }

      // Advance Epoch Tick if requested
      if (parsed.advanceEpoch !== false) {
        await SchedulerEngine.processEpochTick();
        const seedEvents = await CausalityEngine.tickSeeds();
        updatesSummary.push(`⚡ 纪元推进至 Epoch ${globalWorld.snapshot.epoch}`);
        if (seedEvents.length > 0) {
          updatesSummary.push(`🌱 引发了 ${seedEvents.length} 个事件 Seed 结算波纹`);
        }
      }

      const updatedLoc = pc ? globalWorld.locations.get(pc.location_id) : null;

      return {
        dmNarration: parsed.dmNarration || `${narratorRole}静默片刻，世界在继续流转...`,
        diceRoll: parsed.diceRoll || undefined,
        stateUpdatesSummary: updatesSummary,
        currentLocationName: updatedLoc?.name || '未知区域',
        epoch: globalWorld.snapshot.epoch,
      };
    } catch (err: any) {
      console.error('DM Engine Error:', err);
      return {
        dmNarration: buildDmErrorNarration(narratorRole),
        stateUpdatesSummary: ['Action resolution failed; no DM-generated state change was committed.'],
        currentLocationName: currentLocation?.name || '未知',
        epoch: globalWorld.snapshot.epoch,
      };
    }
  }

  private static buildContextErrorResponse(): DMResponse {
    return {
      dmNarration: 'This action cannot be resolved in the current world context.',
      stateUpdatesSummary: ['Action resolution failed; no DM-generated state change was committed.'],
      currentLocationName: 'Unknown',
      epoch: globalWorld.snapshot.epoch,
    };
  }
}
