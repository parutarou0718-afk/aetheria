import { beforeEach, describe, expect, it } from 'vitest';
import { proposalPipeline } from '../src/engine/proposal/proposalPipeline';
import { QuestRepository } from '../src/engine/quest/questRepository';
import { bootstrapWithDefaultWorld } from './helpers/worldFixture';
import { dbManager } from '../src/engine/persistence/database';

let worldId: string;
let questId: string;
const proposal = (overrides: Record<string, unknown> = {}) => ({
  id: `quest-proposal-${Math.random()}`,
  operation: 'CREATE_QUEST' as const,
  entityType: 'QUEST',
  entityId: questId,
  payload: {
    quest: {
      id: questId, world_id: worldId, title: 'Reach the Ruins', description: 'Travel to the ruins.',
      status: 'AVAILABLE', giver_character_id: 'npc-elder', assignee_character_id: null,
      objective: { description: 'Reach the ruins.', targetType: 'CHARACTER', targetId: 'pc-player', expectedCondition: { operator: 'EQUALS', fieldPath: 'location_id', value: 'loc-ruins' } },
      dependency_ids: [], created_at_epoch: 1, accepted_at_epoch: null, resolved_at_epoch: null, failure_reason: null,
    },
  },
  effectiveEpoch: 1,
  preconditions: [],
  source: { type: 'SYSTEM' as const },
  reason: 'Create a deterministic quest.',
  causalBasis: [{ type: 'SYSTEM_EVENT' as const, description: 'Quest fixture initialization.' }],
  authorityLevel: 'SYSTEM' as const,
  ...overrides,
});

describe('quest Recorder operations through ProposalPipeline', () => {
  beforeEach(async () => {
    worldId = `quest-recorder-world-${crypto.randomUUID()}`;
    questId = `quest-runtime-reach-ruins-${crypto.randomUUID()}`;
    await dbManager.initialize();
    await bootstrapWithDefaultWorld(worldId);
  });

  it('creates, accepts, and completes a quest through authoritative transitions', async () => {
    const created = await proposalPipeline.processAndCommit({ worldId, proposals: [proposal()] });
    expect(created.success).toBe(true);
    const accepted = await proposalPipeline.processAndCommit({ worldId, proposals: [proposal({ operation: 'ACCEPT_QUEST', entityId: questId, payload: { assigneeCharacterId: 'pc-player' }, source: { type: 'PLAYER_ACTION' }, reason: 'Player accepts the quest.', causalBasis: [{ type: 'PLAYER_ACTION', description: 'Accept quest.' }], authorityLevel: 'ACTOR', actorId: 'pc-player' })] });
    expect(accepted.success).toBe(true);
    expect((await proposalPipeline.processAndCommit({ worldId, proposals: [proposal({ operation: 'COMPLETE_QUEST', entityId: questId, payload: {}, effectiveEpoch: 2, reason: 'Objective is satisfied.' })] })).success).toBe(true);
    expect(await QuestRepository.getQuest(worldId, questId)).toMatchObject({ status: 'COMPLETED', assignee_character_id: 'pc-player', accepted_at_epoch: 1, resolved_at_epoch: 2 });
  });

  it('rejects terminal reopens and actor completion before Recorder', async () => {
    await proposalPipeline.processAndCommit({ worldId, proposals: [proposal()] });
    const rejected = await proposalPipeline.processAndCommit({ worldId, proposals: [proposal({ operation: 'COMPLETE_QUEST', entityId: questId, payload: {}, authorityLevel: 'ACTOR', actorId: 'pc-player', source: { type: 'PLAYER_ACTION' }, reason: 'Player claims completion.', causalBasis: [{ type: 'PLAYER_ACTION', description: 'Claim.' }] })] });
    expect(rejected).toMatchObject({ success: false, rejected: [{ code: 'PROPOSAL_AUTHORITY_INSUFFICIENT' }] });
    expect((await QuestRepository.getQuest(worldId, questId))?.status).toBe('AVAILABLE');
  });
});
