import type { ContextPacket } from './contextTypes';
export class ContextBudgeter {
  static estimateTokens(value: unknown): number { return Math.ceil(JSON.stringify(value).length / 4); }
  static apply(packet: ContextPacket): ContextPacket {
    const budget = packet.diagnostics.budgetLimit;
    const copy = structuredClone(packet);
    const dropped: Record<string, number> = {};
    const trim = (key: 'recentInteractions' | 'relevantMemories' | 'relevantEvents' | 'quests') => {
      const items = copy[key] as unknown[] | undefined;
      while (items?.length && this.estimateTokens(copy) > budget) { items.shift(); dropped[key] = (dropped[key] ?? 0) + 1; }
    };
    trim('recentInteractions'); trim('relevantMemories'); trim('relevantEvents'); trim('quests');
    const hiddenTruths = (copy.narratorPrivate as { hiddenTruths?: unknown[] } | undefined)?.hiddenTruths;
    while (hiddenTruths?.length && this.estimateTokens(copy) > budget) {
      hiddenTruths.pop();
      dropped.narratorPrivate = (dropped.narratorPrivate ?? 0) + 1;
    }
    const count = (value: unknown[] | undefined) => value?.length ?? 0;
    copy.diagnostics.includedCounts = {
      recentInteractions: count(copy.recentInteractions), relevantMemories: count(copy.relevantMemories),
      relevantEvents: count(copy.relevantEvents), quests: count(copy.quests), narratorPrivate: count(hiddenTruths),
    };
    copy.diagnostics.estimatedTokens = this.estimateTokens({ ...copy, diagnostics: undefined });
    copy.diagnostics.droppedCounts = dropped;
    return copy;
  }
}
