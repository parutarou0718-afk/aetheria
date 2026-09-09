import express from 'express';
import { z } from 'zod';
import { globalWorld } from '../../engine/worldState';
import { aiService } from '../../engine/ai/aiService';
import { InteractionRepository } from '../../engine/context/interactionRepository';
import { WorldGenesisService } from '../../engine/worldGeneration/worldGenesisService';
import { WorldResetService } from '../../engine/world/worldResetService';
import { SchedulerEngine } from '../../engine/scheduler';
import { gameApplicationService } from '../../application/gameApplicationService';
import { PlayerPresentationService } from '../../application/player/playerPresentationService';
import { PlayerMobilityError, PlayerMobilityService } from '../../application/player/playerMobilityService';
import { PlayerTimeService } from '../../application/player/playerTimeService';
import { proposalPipeline } from '../../engine/proposal/proposalPipeline';
import { createStateChangeProposal } from '../../engine/proposal/proposalFactory';
import type { GameRequestContext } from '../../application/gameRequestContext';
import { PlayerRequestRunRepository, type PlayerRequestKey } from '../../application/player/playerRequestRunRepository';
import { runtimeHealth } from '../../engine/runtime/runtimeHealthService';

const sessionHeader = 'x-aetheria-session-id';
const requestIdHeader = 'x-aetheria-request-id';
const messageSchema = z.object({ message: z.string().trim().min(1).max(4000) }).strict();
const dmSchema = z.object({ text: z.string().trim().min(1).max(8000) }).strict();
const travelSchema = z.object({ destinationLocationId: z.string().trim().min(1).max(200) }).strict();
const profileSchema = z.object({ name: z.string().trim().min(1).max(100).optional(), title: z.string().trim().min(1).max(100).optional() }).strict().refine((value) => value.name !== undefined || value.title !== undefined, 'A profile field is required.');
const genesisSchema = z.object({ userVision: z.string().trim().min(20).max(10000), constraints: z.unknown().optional(), generationSeed: z.number().int().safe().optional() }).strict();

function sessionId(req: express.Request): string {
  const raw = req.header(sessionHeader) ?? '';
  return /^[A-Za-z0-9_-]{1,80}$/.test(raw) ? raw : 'player-session';
}
function playerContext(req: express.Request): GameRequestContext {
  const actor = globalWorld.characters.get('pc-player') || Array.from(globalWorld.characters.values()).find((character) => character.type === 'PC');
  return { userId: 'SYSTEM_USER', sessionId: sessionId(req), worldId: globalWorld.snapshot.id, actorId: actor?.id || 'pc-player', channel: 'WEB', mode: 'IN_WORLD_ACTION' };
}
function aiAvailable(context: GameRequestContext): boolean { return aiService.isAvailable({ userId: context.userId, worldId: context.worldId, purpose: 'DM_ACTION' }); }
function devInspectorAvailable(): boolean { return process.env.AETHERIA_DEV_INSPECTOR === 'true'; }
function error(res: express.Response, code: string, message: string, status = 400): void { res.status(status).json({ status: 'error', code, error: message }); }

function requestId(req: express.Request): string | null {
  const value = req.header(requestIdHeader) ?? '';
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value) ? value : null;
}

function idempotent(actionKey: string, handler: express.RequestHandler): express.RequestHandler {
  return async (req, res, next) => {
    if (!runtimeHealth.isReady()) return error(res, 'RUNTIME_NOT_READY', 'The world is temporarily unavailable.', 503);
    const id = requestId(req);
    if (!id) return error(res, 'REQUEST_ID_REQUIRED', 'A valid request identifier is required.');
    const context = playerContext(req);
    const key: PlayerRequestKey = { worldId: context.worldId, sessionId: context.sessionId, requestId: id, actionKey };
    try {
      const claim = await PlayerRequestRunRepository.claim(key);
      if (claim.kind === 'REPLAY') { res.setHeader('X-Aetheria-Replayed', 'true'); return res.status(claim.httpStatus).json(claim.response); }
      if (claim.kind === 'IN_PROGRESS') return error(res, 'REQUEST_IN_PROGRESS', 'This request is already being processed.', 409);
      if (claim.kind === 'UNKNOWN') return error(res, 'REQUEST_OUTCOME_UNKNOWN', 'The result of this request is unknown and will not be replayed.', 409);

      const originalJson = res.json.bind(res);
      let finalized: Promise<void> | undefined;
      res.json = ((body: unknown) => {
        const httpStatus = res.statusCode || 200;
        const errorCode = typeof (body as { code?: unknown })?.code === 'string' ? (body as { code: string }).code : undefined;
        // The handler's success body means its authoritative mutation already
        // committed. Receipt persistence is deliberately a post-handler sidecar.
        if (httpStatus < 400) {
          finalized = PlayerRequestRunRepository.complete(key, { httpStatus, response: body, errorCode })
            .then(() => { originalJson(body); })
            .catch(() => {
              runtimeHealth.markNotReady();
              res.status(503);
              originalJson({ status: 'error', code: 'REQUEST_OUTCOME_UNCONFIRMED', error: 'The world action committed, but its receipt could not be confirmed. Retry with the same request identifier after reconciliation.' });
            });
        } else {
          finalized = PlayerRequestRunRepository.complete(key, { httpStatus, response: body, errorCode })
            .catch(() => undefined)
            .then(() => { originalJson(body); });
        }
        return res;
      }) as express.Response['json'];
      await handler(req, res, next);
      if (finalized) await finalized;
    } catch (cause) {
      if (res.headersSent) return;
      next(cause);
    }
  };
}

export function registerPlayerRoutes(app: express.Express): void {
  const presentation = new PlayerPresentationService();
  const mobility = new PlayerMobilityService();
  const time = new PlayerTimeService();

  app.get('/api/v1/player/bootstrap', async (req, res) => {
    const context = playerContext(req);
    res.json(await presentation.getBootstrap({ worldId: context.worldId, actorId: context.actorId, aiAvailable: aiAvailable(context), devInspectorAvailable: devInspectorAvailable() }));
  });

  app.post('/api/v1/player/dm/action', idempotent('DM_ACTION', async (req, res) => {
    const parsed = dmSchema.safeParse(req.body);
    if (!parsed.success) return error(res, 'ACTION_REJECTED', 'A valid action is required.');
    const result = await gameApplicationService.handleInput({ context: playerContext(req), text: parsed.data.text });
    if (result.status !== 'OK') return error(res, result.code, result.message);
    const response = result.response as { dmNarration?: string; stateUpdatesSummary?: string[]; epoch?: number };
    res.json({ narration: response.dmNarration ?? '', stateUpdates: response.stateUpdatesSummary ?? [], epoch: response.epoch ?? globalWorld.snapshot.epoch });
  }));

  app.get('/api/v1/player/npcs/:npcId/dialogue-history', async (req, res) => {
    const context = playerContext(req);
    const turns = await InteractionRepository.listRecentTurns(context.worldId, `NPC:${req.params.npcId}:${context.actorId}`, 50);
    res.json({ turns: turns.map((turn) => ({ id: turn.id, speaker: turn.speakerType, content: turn.content, epoch: turn.epoch })) });
  });

  app.post('/api/v1/player/npcs/:npcId/dialogue', idempotent('NPC_DIALOGUE', async (req, res) => {
    const parsed = messageSchema.safeParse(req.body);
    if (!parsed.success) return error(res, 'ACTION_REJECTED', 'A valid dialogue message is required.');
    const context = playerContext(req);
    const player = globalWorld.characters.get(context.actorId);
    const npc = globalWorld.characters.get(req.params.npcId);
    if (!player || !npc || npc.type !== 'NPC' || player.location_id !== npc.location_id || player.presence_state !== 'AT_LOCATION' || npc.presence_state !== 'AT_LOCATION') return error(res, 'NPC_NOT_PRESENT', 'That character is not currently present.');
    const result = await gameApplicationService.handleNpcDialogue({ context, npcId: npc.id, text: parsed.data.message });
    res.json({ reply: result.reply, epoch: globalWorld.snapshot.epoch, stateUpdates: result.actionTriggered ? [result.actionTriggered] : [] });
  }));

  app.post('/api/v1/player/travel', idempotent('TRAVEL', async (req, res) => {
    const parsed = travelSchema.safeParse(req.body);
    if (!parsed.success) return error(res, 'TRAVEL_NOT_AVAILABLE', 'A valid destination is required.');
    const context = playerContext(req);
    try { const result = await mobility.travel({ worldId: context.worldId, actorId: context.actorId, destinationLocationId: parsed.data.destinationLocationId }); res.json({ status: 'ok', expectedEndEpoch: result.expectedEndEpoch }); }
    catch (cause) { return error(res, cause instanceof PlayerMobilityError ? cause.code : 'TRAVEL_NOT_AVAILABLE', 'That destination is not currently reachable.'); }
  }));

  app.post('/api/v1/player/time/advance', idempotent('TIME_ADVANCE', async (req, res) => {
    const context = playerContext(req);
    try { res.json(await time.advance(context.worldId)); } catch { return error(res, 'ACTION_REJECTED', 'Time could not be advanced.'); }
  }));

  app.post('/api/v1/player/profile', idempotent('PROFILE', async (req, res) => {
    const parsed = profileSchema.safeParse(req.body);
    if (!parsed.success) return error(res, 'ACTION_REJECTED', 'Only a name or title may be changed.');
    const context = playerContext(req);
    const committed = await proposalPipeline.processAndCommit({ worldId: context.worldId, proposals: [createStateChangeProposal({ id: `player-profile-${crypto.randomUUID()}`, operation: 'UPDATE_CHARACTER', entityType: 'CHARACTER', entityId: context.actorId, actorId: context.actorId, payload: { characterId: context.actorId, ...parsed.data }, effectiveEpoch: globalWorld.snapshot.epoch, preconditions: [], source: { type: 'PLAYER_ACTION', id: context.actorId }, reason: 'Player updated their public profile.', causalBasis: [{ type: 'PLAYER_ACTION', id: context.actorId, description: 'Player profile edit.' }], authorityLevel: 'ACTOR' })] });
    if (!committed.success) return error(res, 'ACTION_REJECTED', 'Profile change was not accepted.');
    res.json({ status: 'ok' });
  }));

  app.post('/api/v1/player/world/genesis', idempotent('GENESIS', async (req, res) => {
    const parsed = genesisSchema.safeParse(req.body);
    if (!parsed.success) return error(res, 'WORLD_VISION_REQUIRED', 'A world vision of at least 20 characters is required.');
    try {
      const result = await WorldGenesisService.createDynamicWorld({ worldId: globalWorld.snapshot.id, userVision: parsed.data.userVision, constraints: parsed.data.constraints as never, generationSeed: parsed.data.generationSeed ?? Math.floor(Math.random() * 1_000_000) });
      res.json({ status: 'ok', world: { id: result.worldId, name: result.profile.display_name, description: result.profile.world_description }, axiomCount: result.axioms.length });
    } catch { return error(res, 'WORLD_GENERATION_FAILED', 'World creation could not be completed.'); }
  }));

  app.post('/api/v1/player/world/reset', idempotent('RESET', async (_req, res) => {
    await WorldResetService.reset(globalWorld.snapshot.id);
    res.json({ status: 'ok', phase: 'NEEDS_GENESIS' });
  }));
}
