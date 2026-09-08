import { z } from 'zod';
import {
  AuthorityLevelSchema,
  CausalBasisSchema,
  SemanticEffectSchema,
  StateChangeProposalSchema,
} from '../recorder/changeSchemas';
import type { CapabilityRequirement } from '../capability/capabilityTypes';

export { AuthorityLevelSchema, CausalBasisSchema, SemanticEffectSchema };

const CapabilityRequirementSchema: z.ZodType<CapabilityRequirement> = z.lazy(() => z.union([
  z.object({ type: z.literal('ACTIVE_CHARACTER') }),
  z.object({ type: z.literal('ATTRIBUTE_MIN'), attribute: z.enum(['strength', 'dexterity', 'intelligence', 'charisma']), minimum: z.number() }),
  z.object({ type: z.literal('SKILL_MIN'), skill: z.string().min(1), minimum: z.number() }),
  z.object({ type: z.literal('HAS_ITEM'), itemId: z.string().optional(), itemType: z.string().optional(), minimumQuantity: z.number().min(1) }).refine((value) => Boolean(value.itemId || value.itemType)),
  z.object({ type: z.literal('RESOURCE_MIN'), resource: z.enum(['HP', 'MP', 'GOLD']), minimum: z.number() }),
  z.object({ type: z.literal('PRESENCE'), required: z.literal('AT_LOCATION') }),
  z.object({ type: z.literal('SAME_LOCATION'), targetCharacterId: z.string().min(1) }),
  z.object({ type: z.literal('ALL'), requirements: z.array(CapabilityRequirementSchema) }),
  z.object({ type: z.literal('ANY'), requirements: z.array(CapabilityRequirementSchema) }),
]));

export const ProposalSchema = StateChangeProposalSchema.extend({
  reason: StateChangeProposalSchema.shape.reason.unwrap(),
  causalBasis: StateChangeProposalSchema.shape.causalBasis.unwrap(),
  authorityLevel: StateChangeProposalSchema.shape.authorityLevel.unwrap(),
  semanticEffect: SemanticEffectSchema.optional(),
  capabilityRequirements: z.array(CapabilityRequirementSchema).optional(),
  confidence: StateChangeProposalSchema.shape.confidence,
});
export type ProposalV2 = z.infer<typeof ProposalSchema>;
