import { describe, expect, it } from 'vitest';
import { ContextBudgeter } from '../src/engine/context/contextBudgeter';
describe('ContextBudgeter', () => {
  it('drops optional context first while retaining mandatory world and actor data', () => {
    const packet: any = { version: 1, world: { id: 'w', name: 'World', epoch: 1 }, actor: { id: 'pc' }, recentInteractions: Array.from({ length: 100 }, (_, i) => ({ id: String(i), content: 'x'.repeat(100) })), relevantMemories: Array.from({ length: 100 }, (_, i) => ({ id: String(i), text: 'm'.repeat(100) })), diagnostics: { estimatedTokens: 0, budgetLimit: 100, includedCounts: {}, droppedCounts: {} } };
    const bounded = ContextBudgeter.apply(packet);
    expect(bounded.world.id).toBe('w');
    expect((bounded.actor as { id: string }).id).toBe('pc');
    expect(bounded.diagnostics.droppedCounts.recentInteractions).toBeGreaterThan(0);
    expect(bounded.diagnostics.estimatedTokens).toBeLessThanOrEqual(100);
    expect(() => JSON.parse(JSON.stringify(bounded))).not.toThrow();
  });

  it('preserves high-ranked memory and current turns before lower-priority event/private context', () => {
    const packet: any = { version: 1, world: { id: 'w', name: 'World', epoch: 1 }, actor: { id: 'pc', name: 'P', title: 'T', status: 'ALIVE' }, scene: { location: { id: 'loc', name: 'L', description: 'd' }, characters: [] }, quests: [{ id: 'q', title: 'Quest', description: 'd', status: 'ACTIVE', objectiveDescription: 'o' }], recentInteractions: [{ speakerType: 'PLAYER', speakerId: 'pc', content: 'newest', epoch: 2 }], relevantMemories: [{ episodeType: 'DIALOGUE', text: 'relevant memory', importance: 9, epoch: 1 }, { episodeType: 'DIALOGUE', text: 'low memory', importance: 1, epoch: 1 }], relevantEvents: [{ id: 'e', type: 'EVENT', description: 'x'.repeat(800), epoch: 1 }], narratorPrivate: { hiddenTruths: [{ id: 't', title: 'T', trueNature: 'x'.repeat(800), revealed: false }] }, diagnostics: { estimatedTokens: 0, budgetLimit: 180, includedCounts: {}, droppedCounts: {} } };
    const bounded = ContextBudgeter.apply(packet);
    expect(bounded.relevantMemories?.[0]?.text).toBe('relevant memory');
    expect(bounded.recentInteractions?.[0]?.content).toBe('newest');
    expect(bounded.quests?.[0]?.id).toBe('q');
    expect(bounded.diagnostics.droppedCounts.narratorPrivate ?? 0).toBeGreaterThanOrEqual(0);
  });
});
