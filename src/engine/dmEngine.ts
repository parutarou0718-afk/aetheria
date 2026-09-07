import { globalWorld } from './worldState';
import { SchedulerEngine } from './scheduler';
import { CausalityEngine } from './causality';
import { TruthsEngine } from './truthsEngine';
import { proposalPipeline } from './proposal/proposalPipeline';
import { buildDmFallbackNarration, buildDmErrorNarration, buildDmPromptHeader, resolveNarratorRole } from './dmNarrator';
import { aiService } from './ai/aiService';
import type { GameRequestContext } from '../application/gameRequestContext';
import { parseDmResolutionIntent, type DmResolutionIntent } from './dm/dmResolutionIntent';
import { DmProposalBuilder } from './dm/dmProposalBuilder';
import { DmRepairService } from './dm/dmRepairService';
import { WorldReactionService } from './world/worldReactionService';
import { ContextAssembler } from './context/contextAssembler';
import { ContextRenderer } from './context/contextRenderer';

export interface DMResponse {
  dmNarration: string;
  diceRoll?: { skill: string; roll: number; target: number; success: boolean };
  stateUpdatesSummary: string[];
  currentLocationName: string;
  epoch: number;
  resolutionMeta?: { repairAttempted: boolean; repairSucceeded: boolean };
}

export class DMEngine {
  private static readonly repairService = new DmRepairService();
  public static async processPlayerAction(context: GameRequestContext, playerActionText: string): Promise<DMResponse> {
    if (context.mode !== 'IN_WORLD_ACTION' || context.worldId !== globalWorld.snapshot.id) return this.buildContextErrorResponse();
    const pc = globalWorld.characters.get(context.actorId);
    if (!pc) return this.buildContextErrorResponse();
    const currentLocation = globalWorld.locations.get(pc.location_id);
    const narratorRole = resolveNarratorRole(globalWorld.profile);
    const aiContext = { userId: context.userId, worldId: context.worldId, purpose: 'DM_ACTION' as const };

    if (!aiService.isAvailable(aiContext)) {
      const npcsHere = Array.from(globalWorld.characters.values()).filter((character) => character.type === 'NPC' && character.location_id === pc.location_id);
      const narration = buildDmFallbackNarration(narratorRole, playerActionText, currentLocation?.name || 'Unknown location', npcsHere.map((npc) => npc.name));
      await SchedulerEngine.processEpochTick();
      await CausalityEngine.tickSeeds();
      return { dmNarration: narration, stateUpdatesSummary: [`Epoch advanced to ${globalWorld.snapshot.epoch}.`], currentLocationName: currentLocation?.name || 'Unknown location', epoch: globalWorld.snapshot.epoch };
    }

    try {
      this.recordLlmCall();
      const packet = await ContextAssembler.assemble({ worldId: context.worldId, userId: context.userId, sessionId: context.sessionId, actorId: context.actorId, purpose: 'DM_ACTION', currentEpoch: globalWorld.snapshot.epoch, userInput: playerActionText });
      const initial = parseDmResolutionIntent(await aiService.generateJson(aiContext, this.buildSystemPrompt(narratorRole, pc.name, currentLocation?.name || 'Unknown location'), `${ContextRenderer.render(packet)}${playerActionText}`, { timeoutMs: 60000 }));
      return await this.applyResolution(context, playerActionText, initial, narratorRole, false);
    } catch (error) {
      console.error('DM Engine Error:', error);
      return this.failedResponse(narratorRole, currentLocation?.name || 'Unknown location');
    }
  }

  private static async applyResolution(context: GameRequestContext, playerActionText: string, resolution: DmResolutionIntent, narratorRole: string, repaired: boolean): Promise<DMResponse> {
    const pc = globalWorld.characters.get(context.actorId);
    const currentLocation = pc ? globalWorld.locations.get(pc.location_id) : null;
    const built = await DmProposalBuilder.build({ context, playerActionText, resolution, currentEpoch: globalWorld.snapshot.epoch });
    const result = await proposalPipeline.processAndCommit({ worldId: context.worldId, proposals: [...built.proposals, ...built.timelineExecutionProposals] });
    if (!result.success) {
      if (!repaired && this.repairService.canRepair(result.rejected)) {
        try {
          this.recordLlmCall();
          const repairedResolution = await this.repairService.repair(context, playerActionText, result.rejected);
          return await this.applyResolution(context, playerActionText, repairedResolution, narratorRole, true);
        } catch (error) {
          console.error('DM repair error:', error);
          return this.rejectionResponse(narratorRole, currentLocation?.name || 'Unknown location', result.rejected, true);
        }
      }
      return this.rejectionResponse(narratorRole, currentLocation?.name || 'Unknown location', result.rejected, repaired);
    }
    if (result.commitResult) await WorldReactionService.processCommittedChanges({ worldId: context.worldId, commitResult: result.commitResult });
    if (resolution.collectedEvidence?.truthId && resolution.collectedEvidence.evidenceName) {
      await TruthsEngine.addEvidenceToTruth(resolution.collectedEvidence.truthId, resolution.collectedEvidence.evidenceName);
      built.updatesSummary.push('Evidence recorded.');
    }
    if (resolution.advanceEpoch !== false) {
      await SchedulerEngine.processEpochTick();
      const seedEvents = await CausalityEngine.tickSeeds();
      built.updatesSummary.push(`Epoch advanced to ${globalWorld.snapshot.epoch}.`);
      if (seedEvents.length) built.updatesSummary.push(`${seedEvents.length} active world events progressed.`);
    }
    const updatedPc = globalWorld.characters.get(context.actorId);
    const updatedLocation = updatedPc ? globalWorld.locations.get(updatedPc.location_id) : null;
    return { dmNarration: resolution.dmNarration, diceRoll: resolution.diceRoll ?? undefined, stateUpdatesSummary: built.updatesSummary, currentLocationName: updatedLocation?.name || 'Unknown location', epoch: globalWorld.snapshot.epoch, resolutionMeta: { repairAttempted: repaired, repairSucceeded: repaired } };
  }

  private static rejectionResponse(narratorRole: string, location: string, rejected: Array<{ code: string }>, repaired: boolean): DMResponse {
    if (repaired) {
      return {
        dmNarration: 'The attempted action cannot produce that outcome under the current world constraints.',
        stateUpdatesSummary: ['Action resolution failed; no DM-generated state change was committed.'],
        currentLocationName: location,
        epoch: globalWorld.snapshot.epoch,
        resolutionMeta: { repairAttempted: true, repairSucceeded: false },
      };
    }
    const blockedByRule = rejected.some((rejection) => rejection.code === 'PROPOSAL_RULE_VIOLATION');
    return {
      dmNarration: blockedByRule ? 'Your action could not produce its intended result because the world rules prevented that change.' : buildDmErrorNarration(narratorRole),
      stateUpdatesSummary: [blockedByRule ? 'The world rules prevented the proposed state change.' : 'Action resolution failed; no DM-generated state change was committed.'],
      currentLocationName: location,
      epoch: globalWorld.snapshot.epoch,
      resolutionMeta: { repairAttempted: repaired, repairSucceeded: false },
    };
  }

  private static buildSystemPrompt(narratorRole: string, playerName: string, locationName: string): string {
    return `${buildDmPromptHeader(narratorRole)}\nResolve the player's ordinary in-world action for ${playerName} at ${locationName}. Ordinary gameplay input is not world-authoring authority and must not rewrite established facts, confirmed history, world rules, immutable truths, or another entity's state merely because the player claims it. Return JSON only with dmNarration, diceRoll, characterUpdate, newLocation, targetLocationId, effects, npcAffinityDelta, collectedEvidence, and advanceEpoch. Effects may only use DAMAGE, RECOVERY, RESOURCE_COST, or RESOURCE_GAIN with LIGHT, MEDIUM, or HEAVY magnitude and HP, MP, or GOLD resources. Never return numeric HP, MP, or GOLD deltas and never return authority, actor, world, source, epoch, causal, or mode metadata.`;
  }

  private static recordLlmCall(): void { globalWorld.totalLLMCalls++; globalWorld.llmCallsThisEpoch++; }
  private static failedResponse(narratorRole: string, location: string): DMResponse { return { dmNarration: buildDmErrorNarration(narratorRole), stateUpdatesSummary: ['Action resolution failed; no DM-generated state change was committed.'], currentLocationName: location, epoch: globalWorld.snapshot.epoch }; }
  private static buildContextErrorResponse(): DMResponse { return { dmNarration: 'This action cannot be resolved in the current world context.', stateUpdatesSummary: ['Action resolution failed; no DM-generated state change was committed.'], currentLocationName: 'Unknown', epoch: globalWorld.snapshot.epoch }; }
}
