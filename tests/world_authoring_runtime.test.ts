import { describe, expect, it, vi } from 'vitest';
import { WorldAuthoringRuntime } from '../src/application/worldAuthoringRuntime';
import type { GameRequestContext } from '../src/application/gameRequestContext';

const context: GameRequestContext = {
  userId: 'author-1', sessionId: 'session-1', worldId: 'world-1', actorId: 'pc-1', channel: 'WEB', mode: 'WORLD_AUTHORING',
};

describe('WorldAuthoringRuntime', () => {
  it('creates an AUTHOR proposal envelope from a narrow resolution while ignoring forged fields', async () => {
    const generateJson = vi.fn().mockResolvedValue({
      narration: 'The archivist records the correction.',
      authorityLevel: 'ADMIN', worldId: 'forged-world', effectiveEpoch: 999, actorId: 'forged-actor',
      changes: [{ operation: 'UPDATE_CHARACTER', entityType: 'CHARACTER', entityId: 'npc-1', payload: { title: 'Archivist' } }],
    });
    const processAndCommit = vi.fn().mockResolvedValue({ success: true, accepted: [{}], rejected: [] });
    const runtime = new WorldAuthoringRuntime({
      ai: { generateJson },
      pipeline: { processAndCommit },
      getSnapshot: () => ({ id: 'world-1', epoch: 4 }),
    });

    await expect(runtime.processAuthoringRequest(context, 'Make the archivist official.')).resolves.toMatchObject({
      narration: 'The archivist records the correction.', epoch: 4,
    });
    const proposal = processAndCommit.mock.calls[0][0].proposals[0];
    expect(processAndCommit).toHaveBeenCalledWith(expect.objectContaining({ worldId: 'world-1' }));
    expect(proposal).toMatchObject({
      operation: 'UPDATE_CHARACTER', entityType: 'CHARACTER', entityId: 'npc-1',
      authorityLevel: 'AUTHOR', effectiveEpoch: 4,
      causalBasis: [{ type: 'PLAYER_ACTION', description: 'Explicit world-authoring request.' }],
    });
    expect(proposal.actorId).toBeUndefined();
    expect(proposal.payload).toEqual({ title: 'Archivist' });
  });

  it('returns a structured unsupported response for world-rule editing without calling AI or Recorder pipeline', async () => {
    const generateJson = vi.fn();
    const processAndCommit = vi.fn();
    const runtime = new WorldAuthoringRuntime({ ai: { generateJson }, pipeline: { processAndCommit }, getSnapshot: () => ({ id: 'world-1', epoch: 4 }) });

    await expect(runtime.processAuthoringRequest(context, 'Change the world rule so death is reversible.')).resolves.toEqual({
      code: 'AUTHORING_CAPABILITY_NOT_IMPLEMENTED',
      message: 'World-rule editing is not available in world authoring.',
    });
    expect(generateJson).not.toHaveBeenCalled();
    expect(processAndCommit).not.toHaveBeenCalled();
  });

  it('requires trusted world-authoring mode', async () => {
    const runtime = new WorldAuthoringRuntime({ ai: { generateJson: vi.fn() }, pipeline: { processAndCommit: vi.fn() }, getSnapshot: () => ({ id: 'world-1', epoch: 4 }) });
    await expect(runtime.processAuthoringRequest({ ...context, mode: 'IN_WORLD_ACTION' }, 'Add a dock.')).resolves.toEqual({
      code: 'WORLD_AUTHORING_MODE_REQUIRED', message: 'World authoring requires WORLD_AUTHORING mode.',
    });
  });

  it('surfaces an immutable history rejection and does not attempt DM-style repair', async () => {
    const generateJson = vi.fn().mockResolvedValue({
      narration: 'The chronicle is rewritten.',
      changes: [{ operation: 'UPDATE_CHARACTER', entityType: 'CHARACTER', entityId: 'npc-1', payload: { title: 'Different' } }],
    });
    const processAndCommit = vi.fn().mockResolvedValue({ success: false, accepted: [], rejected: [{ code: 'PROPOSAL_HISTORY_CONFLICT', message: 'History conflict.' }] });
    const runtime = new WorldAuthoringRuntime({ ai: { generateJson }, pipeline: { processAndCommit }, getSnapshot: () => ({ id: 'world-1', epoch: 4 }) });

    await expect(runtime.processAuthoringRequest(context, 'Rewrite the archived title.')).resolves.toEqual({
      code: 'PROPOSAL_HISTORY_CONFLICT', message: 'The authoring change is not valid under current world constraints.',
    });
    expect(generateJson).toHaveBeenCalledOnce();
    expect(processAndCommit).toHaveBeenCalledOnce();
  });
});
