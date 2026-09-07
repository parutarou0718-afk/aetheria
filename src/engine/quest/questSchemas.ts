import { z } from 'zod';

const QuestTargetTypeSchema = z.enum([
  'CHARACTER', 'LOCATION', 'ORGANIZATION', 'LOCATION_EDGE', 'WORLD_FACT',
  'HIDDEN_TRUTH', 'SEED', 'TRANSACTION',
]);

const DependencyConditionSchema = z.object({
  operator: z.enum([
    'EQUALS', 'NOT_EQUALS', 'IN', 'NOT_IN', 'EXISTS', 'NOT_EXISTS',
    'GREATER_THAN', 'GREATER_THAN_OR_EQUAL', 'LESS_THAN',
    'LESS_THAN_OR_EQUAL', 'CONTAINS',
  ]),
  fieldPath: z.string().min(1).optional(),
  value: z.unknown().optional(),
}).strict();

export const QuestObjectiveSchema = z.object({
  description: z.string().min(1),
  targetType: QuestTargetTypeSchema,
  targetId: z.string().min(1),
  expectedCondition: DependencyConditionSchema,
}).strict();

export const QuestSchema = z.object({
  id: z.string().min(1),
  world_id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  status: z.literal('AVAILABLE'),
  giver_character_id: z.string().min(1).nullable().optional(),
  assignee_character_id: z.null().optional(),
  objective: QuestObjectiveSchema,
  dependency_ids: z.array(z.string().min(1)),
  created_at_epoch: z.number().int().min(1),
  accepted_at_epoch: z.null().optional(),
  resolved_at_epoch: z.null().optional(),
  failure_reason: z.null().optional(),
}).strict();

export type QuestDefinition = z.infer<typeof QuestSchema>;
