import type { AiPurpose, AiTier } from '../aiTypes';
export interface AiUsageRecord { id: string; userId: string; worldId: string; purpose: AiPurpose; tier: AiTier; upstreamId: string; model: string; inputTokens?: number; outputTokens?: number; estimatedCostUsd?: number; chargedCredits?: number; status: 'SUCCESS' | 'FAILED'; createdAt: number; }
