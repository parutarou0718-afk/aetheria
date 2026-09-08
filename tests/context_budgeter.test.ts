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
});
