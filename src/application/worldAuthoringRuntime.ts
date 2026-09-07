import { z } from 'zod';
import { globalWorld } from '../engine/worldState';
import { aiService, type AiService } from '../engine/ai/aiService';
import { createStateChangeProposal } from '../engine/proposal/proposalFactory';
import { proposalPipeline, type ProposalPipeline } from '../engine/proposal/proposalPipeline';
import type { StateChangeOperation } from '../engine/recorder/changeSchemas';
import type { GameRequestContext } from './gameRequestContext';
import type { WorldAuthoringResponse } from './gameApplicationService';

const authoringOperations = [
  'UPDATE_CHARACTER', 'CREATE_LOCATION', 'UPDATE_LOCATION', 'CONNECT_LOCATIONS',
  'UPDATE_ORGANIZATION', 'ADD_FACT', 'REVEAL_TRUTH',
] as const satisfies readonly StateChangeOperation[];

const AuthoringResolutionSchema = z.object({
  narration: z.string().min(1),
  changes: z.array(z.object({
    operation: z.enum(authoringOperations),
    entityType: z.string().min(1),
    entityId: z.string().min(1).optional(),
    payload: z.record(z.string(), z.unknown()),
  })).default([]),
}).strip();

interface AuthoringAi { generateJson(context: { userId: string; worldId: string; purpose: 'WORLD_AUTHORING' }, system: string, user: string): Promise<unknown>; }
interface AuthoringPipeline { processAndCommit(input: { worldId: string; proposals: ReturnType<typeof createStateChangeProposal>[] }): Promise<{ success: boolean; rejected: Array<{ code: string; message: string }> }>; }
interface AuthoringSnapshot { id: string; epoch: number; }

export type WorldAuthoringResult = WorldAuthoringResponse | { code: string; message: string };

export class WorldAuthoringRuntime {
  public constructor(private readonly dependencies: { ai: AuthoringAi; pipeline: AuthoringPipeline; getSnapshot: () => AuthoringSnapshot }) {}

  public async processAuthoringRequest(context: GameRequestContext, text: string): Promise<WorldAuthoringResult> {
    if (context.mode !== 'WORLD_AUTHORING') return { code: 'WORLD_AUTHORING_MODE_REQUIRED', message: 'World authoring requires WORLD_AUTHORING mode.' };
    if (/\b(world[ -]?rule|rule edit|change.*rule)\b|世界规则|规则/.test(text.toLowerCase())) {
      return { code: 'AUTHORING_CAPABILITY_NOT_IMPLEMENTED', message: 'World-rule editing is not available in world authoring.' };
    }

    const snapshot = this.dependencies.getSnapshot();
    if (snapshot.id !== context.worldId) return { code: 'WORLD_CONTEXT_MISMATCH', message: 'The request does not match the active world.' };
    let parsed: z.infer<typeof AuthoringResolutionSchema>;
    try {
      parsed = AuthoringResolutionSchema.parse(await this.dependencies.ai.generateJson(
        { userId: context.userId, worldId: context.worldId, purpose: 'WORLD_AUTHORING' },
        'Return a narrow authoring resolution. You may only use the listed supported operations. Do not supply authority, actor, world, epoch, source, or causal metadata.',
        text,
      ));
    } catch {
      return { code: 'AUTHORING_RESOLUTION_INVALID', message: 'The authoring request could not be resolved.' };
    }

    const proposals = parsed.changes.map((change) => createStateChangeProposal({
      id: `authoring-${crypto.randomUUID()}`,
      operation: change.operation,
      entityType: change.entityType,
      entityId: change.entityId,
      payload: change.payload,
      effectiveEpoch: snapshot.epoch,
      source: { type: 'LLM', id: 'world-authoring-runtime' },
      reason: 'Explicit world-authoring request.',
      causalBasis: [{ type: 'PLAYER_ACTION', description: 'Explicit world-authoring request.' }],
      authorityLevel: 'AUTHOR',
      confidence: 1,
    }));
    const result = await this.dependencies.pipeline.processAndCommit({ worldId: context.worldId, proposals });
    if (!result.success) {
      const first = result.rejected[0];
      return { code: first?.code ?? 'AUTHORING_REJECTED', message: 'The authoring change is not valid under current world constraints.' };
    }
    return { narration: parsed.narration, stateUpdatesSummary: proposals.map((proposal) => proposal.operation), epoch: snapshot.epoch };
  }
}

export const worldAuthoringRuntime = new WorldAuthoringRuntime({
  ai: aiService as AiService as AuthoringAi,
  pipeline: proposalPipeline as ProposalPipeline as AuthoringPipeline,
  getSnapshot: () => ({ id: globalWorld.snapshot.id, epoch: globalWorld.snapshot.epoch }),
});
