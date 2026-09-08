import { globalWorld } from '../worldState';
import { WorldRepository } from '../world/worldRepository';
import { ContextAssembler } from '../context/contextAssembler';
import { NpcMobilityService } from './npcMobilityService';
import { NpcAutonomyEligibility } from './npcAutonomyEligibility';
import { NpcAutonomyRunRepository } from './npcAutonomyRunRepository';
import { NpcAutonomyDecisionService } from './npcAutonomyDecisionService';
import { NpcAutonomyIntentValidator } from './npcAutonomyIntentValidator';
import { NpcAutonomyActionBuilder } from './npcAutonomyActionBuilder';
import { proposalPipeline, type ProposalPipeline } from '../proposal/proposalPipeline';
import { WorldReactionService } from '../world/worldReactionService';
import { MAX_NPC_AUTONOMY_DECISIONS_PER_EPOCH, type NpcAutonomyResult, type NpcAutonomyTriggerReason } from './npcAutonomyTypes';

export interface NpcAutonomyCandidate { npcId: string; triggerReason: NpcAutonomyTriggerReason; weight?: number; signalEpoch?: number; }
export interface NpcAutonomyDecisionPort { isAvailable(worldId: string): boolean; decide(worldId: string, packet: import('../context/contextTypes').ContextPacket): Promise<import('./npcAutonomyIntent').NpcAutonomousIntent>; }
export class NpcAutonomyCoordinator {
  constructor(private readonly decisions: NpcAutonomyDecisionPort = new NpcAutonomyDecisionService(), private readonly pipeline: ProposalPipeline = proposalPipeline) {}
  static orderCandidates(candidates: NpcAutonomyCandidate[], epoch: number): NpcAutonomyCandidate[] {
    return [...new Map(candidates.map(candidate => [candidate.npcId, candidate])).values()].sort((a, b) => (a.weight ?? 99) - (b.weight ?? 99) || (a.signalEpoch ?? epoch) - (b.signalEpoch ?? epoch) || a.npcId.localeCompare(b.npcId));
  }
  async processWakeBatch(input: { worldId: string; epoch: number; candidates: NpcAutonomyCandidate[] }): Promise<NpcAutonomyResult[]> {
    const unique = NpcAutonomyCoordinator.orderCandidates(input.candidates, input.epoch);
    const results: NpcAutonomyResult[] = [];
    for (const candidate of unique.slice(0, MAX_NPC_AUTONOMY_DECISIONS_PER_EPOCH)) {
      try { results.push(await this.processNpc({ ...input, ...candidate })); } catch { results.push({ npcId: candidate.npcId, epoch: input.epoch, triggerReason: candidate.triggerReason, status: 'FAILED', rejectionCodes: ['NPC_AUTONOMY_UNEXPECTED_FAILURE'] }); }
    }
    return results;
  }
  async processNpc(input: { worldId: string; epoch: number; npcId: string; triggerReason: NpcAutonomyTriggerReason }): Promise<NpcAutonomyResult> {
    const claimed = await NpcAutonomyRunRepository.claimRun({ worldId: input.worldId, npcId: input.npcId, epoch: input.epoch, triggerReason: input.triggerReason });
    if (!claimed) return { ...input, status: 'SKIPPED' };
    const npc = await WorldRepository.getCharacter(input.worldId, input.npcId);
    if (!NpcAutonomyEligibility.isEligible(npc, input.epoch) || !this.decisions.isAvailable(input.worldId)) { await NpcAutonomyRunRepository.updateRun(claimed.id, 'SKIPPED'); return { ...input, status: 'SKIPPED' }; }
    try {
      const packet = await ContextAssembler.assemble({ worldId: input.worldId, userId: 'SYSTEM_USER', sessionId: `autonomy:${input.epoch}`, actorId: input.npcId, npcId: input.npcId, purpose: 'NPC_AUTONOMOUS_ACTION', currentEpoch: input.epoch, userInput: input.triggerReason });
      packet.autonomy = { triggerReason: input.triggerReason, allowedActions: ['WAIT', 'SET_ACTIVITY', 'MOVE'], moveOptions: await NpcMobilityService.getOptions(input.worldId, npc!) };
      globalWorld.totalLLMCalls += 1; globalWorld.llmCallsThisEpoch += 1;
      const intent = await this.decisions.decide(input.worldId, packet);
      await NpcAutonomyRunRepository.updateRun(claimed.id, 'DECIDED', { intentAction: intent.action, intentSummary: intent.reason });
      const freshNpc = await WorldRepository.getCharacter(input.worldId, input.npcId);
      const validity = await NpcAutonomyIntentValidator.validate({ worldId: input.worldId, npc: freshNpc, epoch: input.epoch, intent });
      if (!validity.valid) { await NpcAutonomyRunRepository.updateRun(claimed.id, 'REJECTED', { errorCode: validity.code }); return { ...input, status: 'REJECTED', intentAction: intent.action, rejectionCodes: [validity.code ?? 'NPC_INTENT_INVALID'] }; }
      const build = await NpcAutonomyActionBuilder.build({ worldId: input.worldId, npc: freshNpc!, epoch: input.epoch, runId: claimed.id, intent });
      const result = await this.pipeline.processAndCommit({ worldId: input.worldId, proposals: build.proposals });
      if (!result.success || !result.commitResult) { const codes = result.rejected.map(rejection => rejection.code); await NpcAutonomyRunRepository.updateRun(claimed.id, 'REJECTED', { errorCode: codes.join(','), proposalIds: build.proposals.map(proposal => proposal.id) }); return { ...input, status: 'REJECTED', intentAction: build.intentAction, rejectionCodes: codes }; }
      await NpcAutonomyRunRepository.updateRun(claimed.id, 'COMMITTED', { proposalIds: build.proposals.map(proposal => proposal.id) });
      await WorldReactionService.processCommittedChanges({ worldId: input.worldId, commitResult: result.commitResult });
      return { ...input, status: 'COMMITTED', intentAction: build.intentAction, proposalIds: build.proposals.map(proposal => proposal.id) };
    } catch (error) { await NpcAutonomyRunRepository.updateRun(claimed.id, 'FAILED', { errorCode: error instanceof Error ? error.message.slice(0, 120) : 'NPC_AUTONOMY_FAILED' }); return { ...input, status: 'FAILED' }; }
  }
}
