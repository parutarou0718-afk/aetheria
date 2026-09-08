import type { ContextPacket } from './contextTypes';

export class ContextBudgetError extends Error { public constructor() { super('CONTEXT_BUDGET_EXCEEDED'); } }

/** Deterministic structural truncation; never slices serialized JSON. */
export class ContextBudgeter {
  static estimateTokens(value: unknown): number { return Math.ceil(JSON.stringify(value).length / 4); }
  static apply(packet: ContextPacket): ContextPacket {
    const copy = structuredClone(packet);
    const budget = copy.diagnostics.budgetLimit;
    const dropped: Record<string, number> = {};
    this.capTexts(copy, 480);
    const remove = (key: 'relevantEvents' | 'relevantMemories' | 'recentInteractions' | 'quests', fromStart = false) => {
      const entries = copy[key];
      if (!entries?.length) return false;
      if (fromStart) entries.shift(); else entries.pop();
      dropped[key] = (dropped[key] ?? 0) + 1;
      return true;
    };
    const hidden = copy.narratorPrivate?.hiddenTruths;
    while (this.estimateTokens(this.withoutDiagnostics(copy)) > budget) {
      if (hidden?.length) { hidden.pop(); dropped.narratorPrivate = (dropped.narratorPrivate ?? 0) + 1; continue; }
      if (remove('relevantEvents')) continue;
      if (remove('relevantMemories')) continue; // relevance ranking is highest first
      if (remove('recentInteractions', true)) continue; // keep newest turns
      if (remove('quests')) continue;
      this.capTexts(copy, 96);
      if (this.estimateTokens(this.withoutDiagnostics(copy)) > budget) throw new ContextBudgetError();
      break;
    }
    copy.diagnostics.includedCounts = { recentInteractions: copy.recentInteractions?.length ?? 0, relevantMemories: copy.relevantMemories?.length ?? 0, relevantEvents: copy.relevantEvents?.length ?? 0, quests: copy.quests?.length ?? 0, narratorPrivate: hidden?.length ?? 0 };
    copy.diagnostics.droppedCounts = dropped;
    copy.diagnostics.estimatedTokens = this.estimateTokens(this.withoutDiagnostics(copy));
    if (copy.diagnostics.estimatedTokens > budget) throw new ContextBudgetError();
    return copy;
  }
  private static withoutDiagnostics(packet: ContextPacket): Omit<ContextPacket, 'diagnostics'> { const { diagnostics: _diagnostics, ...payload } = packet; return payload; }
  private static capTexts(value: unknown, cap: number): void {
    if (Array.isArray(value)) { value.forEach(item => this.capTexts(item, cap)); return; }
    if (!value || typeof value !== 'object') return;
    for (const [key, current] of Object.entries(value as Record<string, unknown>)) {
      if (typeof current === 'string' && /description|content|text|cosmology|narration|trueNature|trueGoal|statement|value/i.test(key) && current.length > cap) (value as Record<string, unknown>)[key] = `${current.slice(0, cap - 1)}…`;
      else this.capTexts(current, cap);
    }
  }
}
