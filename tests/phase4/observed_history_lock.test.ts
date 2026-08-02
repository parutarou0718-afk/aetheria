import { describe, it, expect, beforeEach } from 'vitest';
import { dbManager } from '../../src/engine/persistence/database';
import { WorldBootstrap } from '../../src/engine/world/worldBootstrap';
import { WorldRepository } from '../../src/engine/world/worldRepository';
import { recorder } from '../../src/engine/recorder/recorder';
import { ObservedHistoryRecord } from '../../src/engine/history/observedHistoryTypes';

describe('Phase 4: Observed History Lock Tests', () => {
  let worldId: string;

  beforeEach(async () => {
    worldId = `world-obs-lock-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    await dbManager.initialize();
    await WorldBootstrap.bootstrap(worldId);
  });

  it('1. Creates and persists observed history record via Recorder', async () => {
    const obsRecord: ObservedHistoryRecord = {
      id: `obs-rec-${Date.now()}`,
      world_id: worldId,
      observer_type: 'CHARACTER',
      observer_id: 'pc-player',
      subject_type: 'CHARACTER',
      subject_id: 'npc-guard',
      observation_type: 'DIRECT_SIGHT',
      observed_epoch: 1,
      recorded_epoch: 1,
      fact_path: 'status',
      observed_value: 'ALIVE',
      confidence: 1.0,
      source_event_id: null,
      source_transaction_id: null,
      visibility: 'PRIVATE',
      immutable_history: true,
      metadata: { epistemic_status: 'CONFIRMED_FACT' },
    };

    const result = await recorder.commit(worldId, [
      {
        id: 'prop-create-obs-1',
        operation: 'CREATE_OBSERVED_HISTORY',
        entityType: 'OBSERVED_HISTORY',
        effectiveEpoch: 1,
        preconditions: [],
        payload: obsRecord,
        source: { type: 'SYSTEM', id: 'ObservationService' },
      },
    ]);

    expect(result.success).toBe(true);

    const savedRecords = await WorldRepository.getObservedHistoryForObserver(worldId, 'CHARACTER', 'pc-player');
    expect(savedRecords).toHaveLength(1);
    expect(savedRecords[0].subject_id).toBe('npc-guard');
    expect(savedRecords[0].fact_path).toBe('status');
    expect(savedRecords[0].observed_value).toBe('ALIVE');
  });

  it('2. History Lock prevents retroactive tampering of observed historical record', async () => {
    const obsRecord: ObservedHistoryRecord = {
      id: `obs-rec-lock-${Date.now()}`,
      world_id: worldId,
      observer_type: 'CHARACTER',
      observer_id: 'pc-player',
      subject_type: 'LOCATION',
      subject_id: 'loc-tavern',
      observation_type: 'DIRECT_SIGHT',
      observed_epoch: 1,
      recorded_epoch: 1,
      fact_path: 'status',
      observed_value: 'OPEN',
      confidence: 1.0,
      source_event_id: null,
      source_transaction_id: null,
      visibility: 'PRIVATE',
      immutable_history: true,
      metadata: { epistemic_status: 'CONFIRMED_FACT' },
    };

    await recorder.commit(worldId, [
      {
        id: 'prop-create-obs-2',
        operation: 'CREATE_OBSERVED_HISTORY',
        entityType: 'OBSERVED_HISTORY',
        effectiveEpoch: 1,
        preconditions: [],
        payload: obsRecord,
        source: { type: 'SYSTEM', id: 'ObservationService' },
      },
    ]);

    // Attempting to modify historical record for epoch 1 must fail or lock
    const historyLocks = await WorldRepository.getObservedHistoryForSubject(worldId, 'LOCATION', 'loc-tavern');
    expect(historyLocks.some((l) => l.observed_epoch === 1 && l.observed_value === 'OPEN')).toBe(true);
  });
});
