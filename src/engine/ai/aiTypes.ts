export type AiPurpose = 'DM_ACTION' | 'NPC_DIALOGUE' | 'WORLD_GENESIS' | 'WORLD_PROFILE' | 'WORLD_SKELETON' | 'WORLD_ENTITY_GENERATION' | 'CAUSALITY' | 'MEMORY_SUMMARY' | 'PROPOSAL_REPAIR';
export type AiTier = 'STANDARD' | 'ADVANCED' | 'DEEP';
export interface AiRequestContext { userId: string; worldId: string; purpose: AiPurpose; tier?: AiTier; }
export type AiServiceErrorCode = 'AI_CREDIT_INSUFFICIENT' | 'AI_NO_ROUTE' | 'AI_UPSTREAM_UNAVAILABLE' | 'AI_UPSTREAM_FAILED' | 'AI_INVALID_RESPONSE' | 'AI_USAGE_RECORD_FAILED';
