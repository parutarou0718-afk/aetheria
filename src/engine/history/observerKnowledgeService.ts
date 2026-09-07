import { ObservedHistoryRepository } from './observedHistoryRepository';
import type { EpistemicStatus, ObserverType, ObservedHistoryRecord } from './observedHistoryTypes';

export interface KnowledgeEntry {
  subjectType: string;
  subjectId: string;
  factPath: string;
  value: unknown;
  epistemicStatus: EpistemicStatus;
  confidence: number;
  observedEpoch: number;
  observationType: string;
  sourceEventId?: string | null;
}
export interface KnowledgeSnapshot {
  confirmedFacts: KnowledgeEntry[];
  claims: KnowledgeEntry[];
  rumors: KnowledgeEntry[];
  inferences: KnowledgeEntry[];
}

/** Read-only observer knowledge. Canonical world truth is intentionally never a fallback. */
export class ObserverKnowledgeService {
  async getKnowledgeSnapshot(input: { worldId: string; observerType: ObserverType; observerId: string; atEpoch: number }): Promise<KnowledgeSnapshot> {
    const records = await ObservedHistoryRepository.getKnowledgeObservations(
      input.worldId, input.observerType, input.observerId, input.atEpoch,
    );
    const toEntry = (record: ObservedHistoryRecord): KnowledgeEntry => ({
      subjectType: record.subject_type, subjectId: record.subject_id, factPath: record.fact_path,
      value: record.observed_value, epistemicStatus: record.metadata?.epistemic_status ?? 'CONFIRMED_FACT',
      confidence: record.confidence, observedEpoch: record.observed_epoch,
      observationType: record.observation_type, sourceEventId: record.source_event_id,
    });
    const buckets: Record<EpistemicStatus, KnowledgeEntry[]> = {
      CONFIRMED_FACT: [], CLAIM: [], RUMOR: [], INFERENCE: [],
    };
    for (const record of records) buckets[record.metadata?.epistemic_status ?? 'CONFIRMED_FACT'].push(toEntry(record));
    const confirmed = this.latestByField(buckets.CONFIRMED_FACT).slice(0, 20);
    return {
      confirmedFacts: confirmed,
      claims: buckets.CLAIM.slice(-10),
      rumors: buckets.RUMOR.slice(-10),
      inferences: buckets.INFERENCE.slice(-10),
    };
  }

  private latestByField(entries: KnowledgeEntry[]): KnowledgeEntry[] {
    const latest = new Map<string, KnowledgeEntry>();
    for (const entry of entries) {
      const key = `${entry.subjectType}:${entry.subjectId}:${entry.factPath}`;
      const previous = latest.get(key);
      if (!previous || previous.observedEpoch <= entry.observedEpoch) latest.set(key, entry);
    }
    return [...latest.values()].sort((a, b) => b.observedEpoch - a.observedEpoch);
  }
}
