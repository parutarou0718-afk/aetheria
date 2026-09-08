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

const sessionHeader = 'x-aetheria-session-id';
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

export function registerPlayerRoutes(app: express.Express): void {
  const presentation = new PlayerPresentationService();
  const mobility = new PlayerMobilityService();
  const time = new PlayerTimeService();

  app.get('/api/v1/player/bootstrap', async (req, res) => {
    const context = playerContext(req);
    res.json(await presentation.getBootstrap({ worldId: context.worldId, actorId: context.actorId, aiAvailable: aiAvailable(context), devInspectorAvailable: devInspectorAvailable() }));
  });

  app.post('/api/v1/player/dm/action', async (req, res) => {
    const parsed = dmSchema.safeParse(req.body);
    if (!parsed.success) return error(res, 'ACTION_REJECTED', 'A valid action is required.');
    const result = await gameApplicationService.handleInput({ context: playerContext(req), text: parsed.data.text });
    if (result.status !== 'OK') return error(res, result.code, result.message);
    const response = result.response as { dmNarration?: string; stateUpdatesSummary?: string[]; epoch?: number };
    res.json({ narration: response.dmNarration ?? '', stateUpdates: response.stateUpdatesSummary ?? [], epoch: response.epoch ?? globalWorld.snapshot.epoch });
  });

  app.get('/api/v1/player/npcs/:npcId/dialogue-history', async (req, res) => {
    const context = playerContext(req);
    const turns = await InteractionRepository.listRecentTurns(context.worldId, `NPC:${req.params.npcId}:${context.actorId}`, 50);
    res.json({ turns: turns.map((turn) => ({ id: turn.id, speaker: turn.speakerType, content: turn.content, epoch: turn.epoch })) });
  });

  app.post('/api/v1/player/npcs/:npcId/dialogue', async (req, res) => {
    const parsed = messageSchema.safeParse(req.body);
    if (!parsed.success) return error(res, 'ACTION_REJECTED', 'A valid dialogue message is required.');
    const context = playerContext(req);
    const player = globalWorld.characters.get(context.actorId);
    const npc = globalWorld.characters.get(req.params.npcId);
    if (!player || !npc || npc.type !== 'NPC' || player.location_id !== npc.location_id || player.presence_state !== 'AT_LOCATION' || npc.presence_state !== 'AT_LOCATION') return error(res, 'NPC_NOT_PRESENT', 'That character is not currently present.');
    const result = await gameApplicationService.handleNpcDialogue({ context, npcId: npc.id, text: parsed.data.message });
    res.json({ reply: result.reply, epoch: globalWorld.snapshot.epoch, stateUpdates: result.actionTriggered ? [result.actionTriggered] : [] });
  });

  app.post('/api/v1/player/travel', async (req, res) => {
    const parsed = travelSchema.safeParse(req.body);
    if (!parsed.success) return error(res, 'TRAVEL_NOT_AVAILABLE', 'A valid destination is required.');
    const context = playerContext(req);
    try { const result = await mobility.travel({ worldId: context.worldId, actorId: context.actorId, destinationLocationId: parsed.data.destinationLocationId }); res.json({ status: 'ok', expectedEndEpoch: result.expectedEndEpoch }); }
    catch (cause) { return error(res, cause instanceof PlayerMobilityError ? cause.code : 'TRAVEL_NOT_AVAILABLE', 'That destination is not currently reachable.'); }
  });

  app.post('/api/v1/player/time/advance', async (req, res) => {
    const context = playerContext(req);
    try { res.json(await time.advance(context.worldId)); } catch { return error(res, 'ACTION_REJECTED', 'Time could not be advanced.'); }
  });

  app.post('/api/v1/player/profile', async (req, res) => {
    const parsed = profileSchema.safeParse(req.body);
    if (!parsed.success) return error(res, 'ACTION_REJECTED', 'Only a name or title may be changed.');
    const context = playerContext(req);
    const committed = await proposalPipeline.processAndCommit({ worldId: context.worldId, proposals: [createStateChangeProposal({ id: `player-profile-${crypto.randomUUID()}`, operation: 'UPDATE_CHARACTER', entityType: 'CHARACTER', entityId: context.actorId, actorId: context.actorId, payload: { characterId: context.actorId, ...parsed.data }, effectiveEpoch: globalWorld.snapshot.epoch, preconditions: [], source: { type: 'PLAYER_ACTION', id: context.actorId }, reason: 'Player updated their public profile.', causalBasis: [{ type: 'PLAYER_ACTION', id: context.actorId, description: 'Player profile edit.' }], authorityLevel: 'ACTOR' })] });
    if (!committed.success) return error(res, 'ACTION_REJECTED', 'Profile change was not accepted.');
    res.json({ status: 'ok' });
  });

  app.post('/api/v1/player/world/genesis', async (req, res) => {
    const parsed = genesisSchema.safeParse(req.body);
    if (!parsed.success) return error(res, 'WORLD_VISION_REQUIRED', 'A world vision of at least 20 characters is required.');
    try {
      const result = await WorldGenesisService.createDynamicWorld({ worldId: globalWorld.snapshot.id, userVision: parsed.data.userVision, constraints: parsed.data.constraints as never, generationSeed: parsed.data.generationSeed ?? Math.floor(Math.random() * 1_000_000) });
      res.json({ status: 'ok', world: { id: result.worldId, name: result.profile.display_name, description: result.profile.world_description }, axiomCount: result.axioms.length });
    } catch { return error(res, 'WORLD_GENERATION_FAILED', 'World creation could not be completed.'); }
  });

  app.post('/api/v1/player/world/reset', async (_req, res) => {
    await WorldResetService.reset(globalWorld.snapshot.id);
    res.json({ status: 'ok', phase: 'NEEDS_GENESIS' });
  });
}
