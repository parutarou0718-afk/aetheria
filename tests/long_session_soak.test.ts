import { describe, expect, it } from 'vitest';
import { bootstrapWithDefaultWorld } from './helpers/worldFixture';
import { proposalPipeline } from '../src/engine/proposal/proposalPipeline';
import { createStateChangeProposal } from '../src/engine/proposal/proposalFactory';
import { globalWorld } from '../src/engine/worldState';

describe('deterministic long-session soak', () => {
  it('keeps 100 authoritative epoch advances ordered and bounded', async () => {
    const worldId = `world-soak-${crypto.randomUUID()}`;
    await bootstrapWithDefaultWorld(worldId);
    for (let epoch = 2; epoch <= 101; epoch++) {
      const result = await proposalPipeline.processAndCommit({ worldId, proposals: [createStateChangeProposal({ id: crypto.randomUUID(), operation: 'ADVANCE_WORLD_EPOCH', entityType: 'WORLD', payload: { advanceBy: 1 }, effectiveEpoch: epoch, preconditions: [], source: { type: 'SCHEDULER' }, reason: 'Deterministic soak epoch.', causalBasis: [{ type: 'SYSTEM_EVENT', description: 'Deterministic soak tick.' }], authorityLevel: 'SYSTEM' })] });
      expect(result.success).toBe(true);
    }
    expect(globalWorld.snapshot.epoch).toBe(101);
  }, 30_000);
});
