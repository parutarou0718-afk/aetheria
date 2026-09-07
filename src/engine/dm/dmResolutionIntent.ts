import { z } from 'zod';

const effectSchema = z.object({
  type: z.enum(['DAMAGE', 'RECOVERY', 'RESOURCE_COST', 'RESOURCE_GAIN']),
  magnitude: z.enum(['LIGHT', 'MEDIUM', 'HEAVY']),
  resource: z.enum(['HP', 'MP', 'GOLD']),
  targetEntityId: z.string().min(1),
}).strip();

export const DmResolutionIntentSchema = z.object({
  dmNarration: z.string().default('The action is resolved.'),
  diceRoll: z.object({ skill: z.string(), roll: z.number(), target: z.number(), success: z.boolean() }).nullable().optional(),
  characterUpdate: z.object({
    name: z.string().optional(),
    title: z.string().optional(),
  }).strict().nullable().optional(),
  newLocation: z.object({
    id: z.string().optional(), name: z.string().min(1),
    type: z.enum(['CITY', 'TOWN', 'FOREST', 'DUNGEON', 'RUINS']).optional(),
    description: z.string().optional(), connectedTo: z.array(z.string()).optional(),
  }).nullable().optional(),
  targetLocationId: z.string().nullable().optional(),
  effects: z.array(effectSchema).default([]),
  npcAffinityDelta: z.object({ npcId: z.string(), trustDelta: z.number().optional(), favorDelta: z.number().optional() }).nullable().optional(),
  collectedEvidence: z.object({ truthId: z.string(), evidenceName: z.string() }).nullable().optional(),
  advanceEpoch: z.boolean().optional(),
}).strip();

export type DmResolutionIntent = z.infer<typeof DmResolutionIntentSchema>;

export function parseDmResolutionIntent(value: unknown): DmResolutionIntent {
  return DmResolutionIntentSchema.parse(value);
}
