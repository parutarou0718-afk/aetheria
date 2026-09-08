import type { ProposalV2 } from '../proposal/proposalSchema';

export const MAX_NPC_AUTONOMY_DECISIONS_PER_EPOCH = 3;
export type NpcAutonomyRunStatus = 'CLAIMED' | 'DECIDED' | 'COMMITTED' | 'REJECTED' | 'FAILED' | 'SKIPPED';
export type NpcAutonomyTriggerReason = 'PLAYER_APPROACH' | 'PLAYER_INVESTIGATE' | 'DEADLINE' | 'DEPENDENCY_WAKE' | 'ORGANIZATION_REQUIRES' | 'REGIONAL_SIMULATION' | 'CAUSALITY_PRESSURE' | 'PERIODIC_REFRESH';
export interface NpcMobilityOption { locationId: string; name: string; }
export interface NpcAutonomyRun { id: string; worldId: string; npcId: string; epoch: number; triggerReason: string; status: NpcAutonomyRunStatus; intentAction?: string; intentSummary?: string; proposalIds?: string[]; errorCode?: string; createdAt: string; updatedAt: string; }
export interface NpcAutonomyResult { npcId: string; epoch: number; triggerReason: string; status: Extract<NpcAutonomyRunStatus, 'COMMITTED' | 'REJECTED' | 'FAILED' | 'SKIPPED'>; intentAction?: string; proposalIds?: string[]; rejectionCodes?: string[]; }
export interface NpcAutonomyBuild { proposals: ProposalV2[]; intentAction: string; summary: string; }
