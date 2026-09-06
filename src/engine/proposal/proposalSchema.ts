import { z } from 'zod';
import {
  AuthorityLevelSchema,
  CausalBasisSchema,
  SemanticEffectSchema,
  StateChangeProposalSchema,
} from '../recorder/changeSchemas';

export { AuthorityLevelSchema, CausalBasisSchema, SemanticEffectSchema };

export const ProposalSchema = StateChangeProposalSchema.extend({
  reason: StateChangeProposalSchema.shape.reason.unwrap(),
  causalBasis: StateChangeProposalSchema.shape.causalBasis.unwrap(),
  authorityLevel: StateChangeProposalSchema.shape.authorityLevel.unwrap(),
  semanticEffect: SemanticEffectSchema.optional(),
  confidence: StateChangeProposalSchema.shape.confidence,
});
export type ProposalV2 = z.infer<typeof ProposalSchema>;
