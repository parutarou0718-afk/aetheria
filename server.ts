import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';
import { globalWorld } from './src/engine/worldState';
import { SchedulerEngine, WAKE_WEIGHTS } from './src/engine/scheduler';
import { CausalityEngine } from './src/engine/causality';
import { TruthsEngine } from './src/engine/truthsEngine';
import { check7Invariants } from './src/engine/invariants';
import { WorldBootstrap } from './src/engine/world/worldBootstrap';
import { WorldRepository } from './src/engine/world/worldRepository';
import { WorldResetService } from './src/engine/world/worldResetService';
import { WorldGenesisService } from './src/engine/worldGeneration/worldGenesisService';
import { StateChangeProposal } from './src/engine/recorder/changeSchemas';

import { TransactionService } from './src/engine/timeline/transactionService';
import { CheckpointProcessor } from './src/engine/timeline/checkpointProcessor';
import { GlobalTimeline } from './src/engine/timeline/globalTimeline';
import { TimelineError } from './src/engine/timeline/timelineErrors';
import { aiService } from './src/engine/ai/aiService';
import { createStateChangeProposal } from './src/engine/proposal/proposalFactory';
import { proposalPipeline } from './src/engine/proposal/proposalPipeline';
import { gameApplicationService } from './src/application/gameApplicationService';
import type { GameRequestContext } from './src/application/gameRequestContext';
import { QuestRepository } from './src/engine/quest/questRepository';
import { toQuestPublicView } from './src/engine/quest/questPublicView';
import { registerPlayerRoutes } from './src/server/routes/playerRoutes';

dotenv.config();

export function createDevelopmentGameRequestContext(actorId?: string): GameRequestContext {
  const currentPc = actorId
    ? globalWorld.characters.get(actorId)
    : globalWorld.characters.get('pc-player') || Array.from(globalWorld.characters.values()).find((character) => character.type === 'PC');
  return {
    userId: 'SYSTEM_USER',
    sessionId: 'dev-session',
    worldId: globalWorld.snapshot.id,
    actorId: currentPc?.id || actorId || 'pc-player',
    channel: 'WEB',
    mode: 'IN_WORLD_ACTION',
  };
}

export function registerConfigRoutes(app: express.Express): void {
  app.get('/api/v1/config', (req, res) => {
    res.json({
      aiAvailable: aiService.isAvailable({
        userId: 'SYSTEM_USER',
        worldId: globalWorld.snapshot.id,
        purpose: 'DM_ACTION',
      }),
      devInspectorAvailable: process.env.AETHERIA_DEV_INSPECTOR === 'true',
    });
  });
}

export function registerCharacterActionRoutes(app: express.Express): void {
  app.post('/api/v1/characters/:id/action', async (req, res) => {
    const { action_type, target_location_id } = req.body;
    const char = globalWorld.characters.get(req.params.id);
    if (!char) {
      res.status(404).json({ error: 'Character not found' });
      return;
    }

    const worldId = globalWorld.snapshot.id;
    if (!worldId) {
      res.status(503).json({ status: 'error', code: 'ACTIVE_WORLD_REQUIRED', error: 'No active world is loaded.' });
      return;
    }

    const proposals: StateChangeProposal[] = [];
    const currentEpoch = globalWorld.snapshot.epoch;

    if (action_type === 'TRAVEL' && target_location_id) {
      const targetLoc = globalWorld.locations.get(target_location_id);
      if (targetLoc) {
        try {
          await TransactionService.planTravel({
            worldId,
            actorId: char.id,
            destinationLocationId: target_location_id,
            startEpoch: currentEpoch,
          });
        } catch (err: any) {
          const msg = err?.message || String(err);
          console.warn(`[Server] TransactionService.planTravel failed: ${msg}. No movement was committed.`);
          res.status(400).json({
            status: 'error',
            code: 'TRAVEL_PLAN_FAILED',
            error: `Route to ${target_location_id} is not currently feasible. No movement performed.`,
          });
          return;
        }

        SchedulerEngine.pushWakeSignal({
          entity_id: char.id,
          entity_type: 'CHARACTER',
          reason: 'PLAYER_APPROACH',
          epoch: currentEpoch,
          weight: 0,
        });
      }
    } else if (action_type === 'REST') {
      proposals.push({
        id: `prop-route-rest-${Date.now()}`,
        operation: 'APPLY_SEMANTIC_EFFECT',
        entityType: 'CHARACTER',
        entityId: char.id,
        payload: {},
        semanticEffect: { type: 'RECOVERY', magnitude: 'MEDIUM', resource: 'HP', targetEntityId: char.id },
        effectiveEpoch: currentEpoch,
        preconditions: [],
        source: { type: 'PLAYER_ACTION', id: char.id },
      });
      proposals.push({
        id: `prop-route-rest-mp-${Date.now()}`,
        operation: 'APPLY_SEMANTIC_EFFECT',
        entityType: 'CHARACTER',
        entityId: char.id,
        payload: {},
        semanticEffect: { type: 'RESOURCE_GAIN', magnitude: 'MEDIUM', resource: 'MP', targetEntityId: char.id },
        effectiveEpoch: currentEpoch,
        preconditions: [],
        source: { type: 'PLAYER_ACTION', id: char.id },
      });
      proposals.push({
        id: `prop-route-restact-${Date.now()}`,
        operation: 'SET_CHARACTER_ACTION',
        entityType: 'CHARACTER',
        entityId: char.id,
        payload: {
          characterId: char.id,
          action: {
            type: 'REST',
            description: 'Rest to recover health and energy.',
            started_at_epoch: currentEpoch,
            estimated_end_epoch: currentEpoch + 1,
          },
        },
        effectiveEpoch: currentEpoch,
        preconditions: [],
        source: { type: 'PLAYER_ACTION', id: char.id },
      });
    }

    if (proposals.length > 0) {
      const pipelineResult = await proposalPipeline.processAndCommit({
        worldId,
        proposals: proposals.map((proposal) => createStateChangeProposal({
          ...proposal,
          reason: `Player submitted ${action_type} action.`,
          causalBasis: [{ type: 'PLAYER_ACTION', id: char.id, description: `REST action submitted by ${char.name}.` }],
          authorityLevel: 'ACTOR',
          actorId: char.id,
        })),
      });
      if (!pipelineResult.success) {
        res.status(400).json({ status: 'error', code: 'ACTION_RESOLUTION_FAILED', error: 'Action resolution was not committed.' });
        return;
      }
    }

    const updatedChar = globalWorld.characters.get(req.params.id);
    res.json({ status: 'ok', character: updatedChar });
  });
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // === INITIALIZE PERSISTENCE LAYER ===
  try {
    await WorldBootstrap.bootstrap('world-snapshot-001');
  } catch (dbErr) {
    console.error('Failed to initialize SQLite persistent world engine:', dbErr);
  }

  // === REST API ENDPOINTS ===

  // 0. API & LLM Provider Configuration
  registerConfigRoutes(app);
  registerPlayerRoutes(app);

  // 1. Get World Snapshot & Overview
  app.get('/api/v1/world/snapshot', (req, res) => {
    globalWorld.updateStats();
    res.json({
      snapshot: globalWorld.snapshot,
      stats: globalWorld.getStats(),
    });
  });

  // 1.1 AI-Driven World Genesis
  app.post('/api/v1/world/genesis', async (req, res) => {
    try {
      const { userVision, worldId = 'world-snapshot-001', constraints, generationSeed } = req.body;

      // [P0-3] Do NOT guess the user's world. Missing vision is an explicit error.
      if (!userVision || typeof userVision !== 'string' || userVision.trim().length < 20) {
        res.status(400).json({
          status: 'error',
          code: 'WORLD_VISION_REQUIRED',
          error: 'world genesis requires a userVision of at least 20 characters describing the desired world. Nothing will be fabricated.',
        });
        return;
      }

      const request = {
        worldId,
        userVision: userVision.trim(),
        constraints,
        generationSeed: typeof generationSeed === 'number' ? generationSeed : Math.floor(Math.random() * 1000000),
      };
      const result = await WorldGenesisService.createDynamicWorld(request);
      res.json({ status: 'ok', ...result });
    } catch (err: any) {
      const code = typeof err?.code === 'string' ? err.code : 'WORLD_GENERATION_FAILED';
      res.status(400).json({ status: 'error', code, error: err.message });
    }
  });

  // 1.2 Get World Profile
  app.get('/api/v1/world/profile', async (req, res) => {
    const profile = globalWorld.profile || (await WorldRepository.getWorldProfile('world-snapshot-001'));
    res.json(profile || {});
  });

  // 1.3 Get World Axioms
  app.get('/api/v1/world/axioms', async (req, res) => {
    const axioms = globalWorld.axioms?.length > 0 ? globalWorld.axioms : await WorldRepository.getWorldAxioms('world-snapshot-001');
    res.json(axioms || []);
  });

  // 2. Get Characters
  app.get('/api/v1/characters', (req, res) => {
    res.json(Array.from(globalWorld.characters.values()));
  });

  app.get('/api/v1/characters/:id', (req, res) => {
    const char = globalWorld.characters.get(req.params.id);
    if (!char) {
      res.status(404).json({ error: 'Character not found' });
      return;
    }
    res.json(char);
  });

  // 3. Get Locations
  app.get('/api/v1/locations', (req, res) => {
    res.json(Array.from(globalWorld.locations.values()));
  });

  app.get('/api/v1/locations/:id', (req, res) => {
    const loc = globalWorld.locations.get(req.params.id);
    if (!loc) {
      res.status(404).json({ error: 'Location not found' });
      return;
    }
    res.json(loc);
  });

  // 4. Get Organizations
  app.get('/api/v1/organizations', (req, res) => {
    res.json(Array.from(globalWorld.organizations.values()));
  });

  // 5. Get Active Seeds & Causality Pressures
  app.get('/api/v1/seeds/active', (req, res) => {
    const active = Array.from(globalWorld.seeds.values()).filter((s) => s.status === 'IN_PROGRESS');
    const pressures = CausalityEngine.evaluatePressures();
    res.json({ seeds: active, pressures });
  });

  // 6. Get Recent Events
  app.get('/api/v1/events/recent', (req, res) => {
    const limit = parseInt(req.query.limit as string) || 20;
    res.json(globalWorld.events.slice(0, limit));
  });

  // 7. Get Hidden Truths
  app.get('/api/v1/truths', (req, res) => {
    res.json(Array.from(globalWorld.hiddenTruths.values()));
  });

  // 8. Character Action (Travel, Investigate, Rest, etc.)
  app.post('/api/v1/dm/action', async (req, res) => {
    const { action_text } = req.body;
    if (!action_text || typeof action_text !== 'string') {
      res.status(400).json({ error: 'action_text is required' });
      return;
    }
    const result = await gameApplicationService.handleInput({
      context: createDevelopmentGameRequestContext(),
      text: action_text,
    });
    if (result.status !== 'OK') {
      res.status(501).json(result);
      return;
    }
    res.json(result.response);
  });

  registerCharacterActionRoutes(app);

  app.get('/api/v1/quests', async (_req, res) => {
    res.json((await QuestRepository.listQuests(globalWorld.snapshot.id)).map(toQuestPublicView));
  });
  app.get('/api/v1/quests/active', async (_req, res) => {
    const player = createDevelopmentGameRequestContext().actorId;
    res.json((await QuestRepository.listActiveByAssignee(globalWorld.snapshot.id, player)).map(toQuestPublicView));
  });

  // 9. NPC Dialogue (provider-neutral LLM)
  app.post('/api/v1/characters/:id/dialogue', async (req, res) => {
    const { message } = req.body;
    if (!message) {
      res.status(400).json({ error: 'Message required' });
      return;
    }

    const result = await gameApplicationService.handleNpcDialogue({
      context: createDevelopmentGameRequestContext(),
      npcId: req.params.id,
      text: message,
    });

    res.json(result);
  });

  // 10. Advance Epoch Tick
  app.post('/api/v1/admin/epoch/tick', async (req, res) => {
    const tickResult = await SchedulerEngine.processEpochTick();
    const seedEvents = await CausalityEngine.tickSeeds();

    res.json({
      ...tickResult,
      events_generated: seedEvents.length,
      snapshot: globalWorld.snapshot,
    });
  });

  // 11. Deep AI Causality Evaluation
  app.post('/api/v1/causality/evaluate', async (req, res) => {
    const result = await CausalityEngine.generateDeepCausalityEvaluation();
    res.json({ evaluation: result });
  });

  // 12. Collect Evidence for Truth
  app.post('/api/v1/truths/collect-evidence', async (req, res) => {
    const { truth_id, evidence_name } = req.body;
    if (!truth_id || !evidence_name) {
      res.status(400).json({ error: 'truth_id and evidence_name required' });
      return;
    }
    const result = await TruthsEngine.addEvidenceToTruth(truth_id, evidence_name);
    res.json(result);
  });

  // 13. Reveal Truth
  app.post('/api/v1/truths/reveal', async (req, res) => {
    const { truth_id, revealer_id } = req.body;
    if (!truth_id) {
      res.status(400).json({ error: 'truth_id required' });
      return;
    }
    const result = await TruthsEngine.revealTruth(truth_id, revealer_id || 'pc-player');
    res.json(result);
  });

  // === PHASE 3 TIMELINE API ENDPOINTS ===

  // Helper to resolve effective epoch for a given worldId
  const getEffectiveEpoch = async (worldId: string, providedEpoch?: number) => {
    if (typeof providedEpoch === 'number') return providedEpoch;
    const snap = await WorldRepository.getWorldSnapshot(worldId);
    return snap ? snap.epoch : globalWorld.snapshot.epoch;
  };

  // 1. Plan travel transaction
  const handlePlanTravel = async (req: express.Request, res: express.Response) => {
    try {
      const worldId = req.params.worldId || req.body.worldId || 'world-snapshot-001';
      const { actorId, destinationLocationId, startEpoch, speedMultiplier } = req.body;
      if (!actorId || !destinationLocationId) {
        res.status(400).json({ error: 'actorId and destinationLocationId are required' });
        return;
      }
      const effectiveStartEpoch = await getEffectiveEpoch(worldId, startEpoch);
      const result = await TransactionService.planTravel({
        worldId,
        actorId,
        destinationLocationId,
        startEpoch: effectiveStartEpoch,
        speedMultiplier,
      });
      res.json({ status: 'ok', ...result });
    } catch (err: any) {
      if (err instanceof TimelineError) {
        res.status(400).json({ error: err.message, code: err.code });
      } else {
        res.status(500).json({ error: err.message || 'Internal server error' });
      }
    }
  };

  app.post('/api/v1/timeline/plan-travel', handlePlanTravel);
  app.post('/api/v1/worlds/:worldId/transactions/travel', handlePlanTravel);

  // 2. Cancel transaction
  const handleCancelTransaction = async (req: express.Request, res: express.Response) => {
    try {
      const worldId = req.params.worldId || req.body.worldId || 'world-snapshot-001';
      const transactionId = req.params.transactionId || req.body.transactionId;
      const { reason = 'User cancelled', epoch } = req.body;
      if (!transactionId) {
        res.status(400).json({ error: 'transactionId is required' });
        return;
      }
      const effectiveEpoch = await getEffectiveEpoch(worldId, epoch);
      await TransactionService.cancelTransaction(worldId, transactionId, reason, effectiveEpoch);
      res.json({ status: 'ok', transactionId });
    } catch (err: any) {
      if (err instanceof TimelineError) {
        res.status(400).json({ error: err.message, code: err.code });
      } else {
        res.status(500).json({ error: err.message || 'Internal server error' });
      }
    }
  };

  app.post('/api/v1/timeline/cancel-transaction', handleCancelTransaction);
  app.post('/api/v1/worlds/:worldId/transactions/:transactionId/cancel', handleCancelTransaction);

  // 3. Fail transaction
  const handleFailTransaction = async (req: express.Request, res: express.Response) => {
    try {
      const worldId = req.params.worldId || req.body.worldId || 'world-snapshot-001';
      const transactionId = req.params.transactionId || req.body.transactionId;
      const { reason = 'Travel interrupted', epoch } = req.body;
      if (!transactionId) {
        res.status(400).json({ error: 'transactionId is required' });
        return;
      }
      const effectiveEpoch = await getEffectiveEpoch(worldId, epoch);
      await TransactionService.failTransaction(worldId, transactionId, reason, effectiveEpoch);
      res.json({ status: 'ok', transactionId });
    } catch (err: any) {
      if (err instanceof TimelineError) {
        res.status(400).json({ error: err.message, code: err.code });
      } else {
        res.status(500).json({ error: err.message || 'Internal server error' });
      }
    }
  };

  app.post('/api/v1/timeline/fail-transaction', handleFailTransaction);
  app.post('/api/v1/worlds/:worldId/transactions/:transactionId/fail', handleFailTransaction);

  // 4. Get active transactions for actor
  const handleGetTransactionsForActor = async (req: express.Request, res: express.Response) => {
    try {
      const worldId = req.params.worldId || (req.query.worldId as string) || 'world-snapshot-001';
      const actorId = req.params.actorId;
      const transactions = await WorldRepository.getTransactionsForActor(worldId, actorId);
      res.json({ status: 'ok', transactions });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  };

  app.get('/api/v1/timeline/transactions/:actorId', handleGetTransactionsForActor);
  app.get('/api/v1/worlds/:worldId/transactions/actor/:actorId', handleGetTransactionsForActor);

  // 5. Get due checkpoints
  const handleGetDueCheckpoints = async (req: express.Request, res: express.Response) => {
    try {
      const worldId = req.params.worldId || (req.query.worldId as string) || 'world-snapshot-001';
      const queryEpoch = req.query.epoch ? parseInt(req.query.epoch as string) : undefined;
      const effectiveEpoch = await getEffectiveEpoch(worldId, queryEpoch);
      const checkpoints = await WorldRepository.getDueCheckpoints(worldId, effectiveEpoch);
      res.json({ status: 'ok', checkpoints });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  };

  app.get('/api/v1/timeline/checkpoints/due', handleGetDueCheckpoints);
  app.get('/api/v1/worlds/:worldId/checkpoints/due', handleGetDueCheckpoints);

  // 6. Process due checkpoints
  const handleProcessCheckpoints = async (req: express.Request, res: express.Response) => {
    try {
      const worldId = req.params.worldId || req.body.worldId || 'world-snapshot-001';
      const effectiveEpoch = await getEffectiveEpoch(worldId, req.body.epoch);
      const result = await CheckpointProcessor.processDueCheckpoints(worldId, effectiveEpoch);
      res.json({ status: 'ok', ...result });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  };

  app.post('/api/v1/timeline/checkpoints/process', handleProcessCheckpoints);
  app.post('/api/v1/worlds/:worldId/checkpoints/process', handleProcessCheckpoints);

  // 7. GlobalTimeline process until target epoch
  app.post('/api/v1/worlds/:worldId/timeline/process-until', async (req, res) => {
    try {
      const worldId = req.params.worldId || 'world-snapshot-001';
      const { targetEpoch } = req.body;
      if (typeof targetEpoch !== 'number') {
        res.status(400).json({ error: 'targetEpoch is required as a number' });
        return;
      }
      const summary = await GlobalTimeline.processUntil(worldId, targetEpoch);
      res.json({ status: 'ok', summary });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 14. Admin Stats & Invariant Checks
  app.get('/api/v1/admin/stats', (req, res) => {
    const invCheck = check7Invariants(
      globalWorld.snapshot,
      Array.from(globalWorld.characters.values()),
      Array.from(globalWorld.seeds.values()),
      globalWorld.events
    );

    res.json({
      stats: globalWorld.getStats(),
      invariants: invCheck,
    });
  });

  // 14.5. Get Persistence Atomic State Change Log
  app.get('/api/v1/persistence/changelog', async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      const logs = await WorldRepository.getChangeLogs('world-snapshot-001', limit);
      res.json({ status: 'ok', logs });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 15. Reset World to Initial Baseline (empty awaiting-genesis state)
  app.post('/api/v1/world/reset', async (req, res) => {
    const worldId = typeof req.query.worldId === 'string' ? req.query.worldId : 'world-snapshot-001';
    // [P0-2] Reset must NOT recreate the default fantasy world. It clears the current
    // world back to an empty `UNSELECTED` state (both memory and DB), returning to awaiting-genesis.
    // Delegating to WorldResetService keeps the reset behavior single-sourced & unit testable.
    const result = await WorldResetService.reset(worldId);
    res.json({ ...result, snapshot: globalWorld.snapshot });
  });

  // === VITE MIDDLEWARE SETUP ===
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req: express.Request, res: express.Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

if (process.env.NODE_ENV !== 'test') {
  void startServer();
}
