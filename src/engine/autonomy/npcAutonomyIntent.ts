import { z } from 'zod';

export const NpcAutonomousIntentSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('WAIT'), reason: z.string().min(1).max(240) }).strict(),
  z.object({ action: z.literal('SET_ACTIVITY'), activity: z.enum(['WAIT', 'WORK', 'INVESTIGATE', 'PATROL', 'GUARD']), description: z.string().min(1).max(240), reason: z.string().min(1).max(240) }).strict(),
  z.object({ action: z.literal('MOVE'), destinationLocationId: z.string().min(1), reason: z.string().min(1).max(240) }).strict(),
]);
export type NpcAutonomousIntent = z.infer<typeof NpcAutonomousIntentSchema>;
