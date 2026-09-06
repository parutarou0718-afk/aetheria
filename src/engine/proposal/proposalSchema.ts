import { z } from 'zod';
import { StateChangeProposalSchema } from '../recorder/changeSchemas';
export const AuthorityLevelSchema = z.enum(['NARRATIVE', 'ACTOR', 'SYSTEM', 'AUTHOR', 'ADMIN']);
export const CausalBasisSchema = z.object({ type: z.enum(['FACT', 'EVENT', 'ENTITY_STATE', 'RULE', 'PLAYER_ACTION', 'SYSTEM_EVENT']), id: z.string().optional(), description: z.string().optional() });
export const SemanticEffectSchema = z.object({ type: z.string(), magnitude: z.string().optional(), target: z.string().optional(), metadata: z.record(z.string(), z.unknown()).optional() });
export const ProposalSchema = StateChangeProposalSchema.extend({ reason: z.string().min(1), causalBasis: z.array(CausalBasisSchema).min(1), authorityLevel: AuthorityLevelSchema, semanticEffect: SemanticEffectSchema.optional(), confidence: z.number().min(0).max(1).optional() });
export type ProposalV2 = z.infer<typeof ProposalSchema>;
