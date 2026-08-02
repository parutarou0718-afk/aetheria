import { describe, it, expect, beforeEach } from 'vitest';
import { dbManager } from '../../src/engine/persistence/database';
import { WorldBootstrap } from '../../src/engine/world/worldBootstrap';
import { WorldRepository } from '../../src/engine/world/worldRepository';
import { recorder } from '../../src/engine/recorder/recorder';
import { DependencyEdge } from '../../src/engine/dependency/dependencyTypes';

describe('Phase 4: Dependency Registration Tests', () => {
  let worldId: string;

  beforeEach(async () => {
    worldId = `world-dep-reg-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    await dbManager.initialize();
    await WorldBootstrap.bootstrap(worldId);
  });

  it('1. Creates and persists dependency edge via Recorder', async () => {
    const depEdge: DependencyEdge = {
      id: 'dep-tx1-loc1',
      world_id: worldId,
      source_type: 'TRANSACTION',
      source_id: 'tx-travel-101',
      target_type: 'LOCATION',
      target_id: 'loc-bridge',
      dependency_type: 'LOCATION_ACCESSIBLE',
      expected_condition: {
        fieldPath: 'status',
        operator: 'EQUALS',
        value: 'OPEN',
      },
      failure_policy: 'INVALIDATE_SOURCE',
      status: 'ACTIVE',
      created_at_epoch: 1,
    };

    const result = await recorder.commit(worldId, [
      {
        id: 'prop-create-dep-1',
        operation: 'CREATE_DEPENDENCY',
        entityType: 'DEPENDENCY_EDGE',
        entityId: depEdge.id,
        effectiveEpoch: 1,
        preconditions: [],
        payload: { dependency: depEdge },
        source: { type: 'TIMELINE', id: 'tx-travel-101' },
      },
    ]);

    if (!result.success) console.error('Commit failed errors:', result.errors);
    expect(result.success).toBe(true);

    // Verify DB persistence
    const savedDeps = await WorldRepository.getDependenciesForSource(worldId, 'TRANSACTION', 'tx-travel-101');
    expect(savedDeps).toHaveLength(1);
    expect(savedDeps[0].id).toBe('dep-tx1-loc1');
    expect(savedDeps[0].dependency_type).toBe('LOCATION_ACCESSIBLE');
    expect(savedDeps[0].expected_condition.value).toBe('OPEN');
  });

  it('2. Updates and removes dependency edge via Recorder', async () => {
    const depEdge: DependencyEdge = {
      id: 'dep-tx2-loc2',
      world_id: worldId,
      source_type: 'TRANSACTION',
      source_id: 'tx-travel-102',
      target_type: 'LOCATION',
      target_id: 'loc-gate',
      dependency_type: 'LOCATION_ACCESSIBLE',
      expected_condition: { fieldPath: 'status', operator: 'EQUALS', value: 'OPEN' },
      failure_policy: 'PAUSE_SOURCE',
      status: 'ACTIVE',
      created_at_epoch: 1,
    };

    await recorder.commit(worldId, [
      {
        id: 'prop-create-dep-2',
        operation: 'CREATE_DEPENDENCY',
        entityType: 'DEPENDENCY_EDGE',
        entityId: depEdge.id,
        effectiveEpoch: 1,
        preconditions: [],
        payload: { dependency: depEdge },
        source: { type: 'TIMELINE', id: 'tx-travel-102' },
      },
    ]);

    // Update status to INVALIDATED
    const updateRes = await recorder.commit(worldId, [
      {
        id: 'prop-update-dep-2',
        operation: 'UPDATE_DEPENDENCY',
        entityType: 'DEPENDENCY_EDGE',
        entityId: depEdge.id,
        effectiveEpoch: 2,
        preconditions: [],
        payload: { dependencyId: depEdge.id, status: 'INVALIDATED' },
        source: { type: 'TIMELINE', id: 'DependencyImpactService' },
      },
    ]);
    if (!updateRes.success) console.error('Update failed errors:', updateRes.errors);
    expect(updateRes.success).toBe(true);

    const updatedDep = await WorldRepository.getDependency(worldId, depEdge.id);
    expect(updatedDep?.status).toBe('INVALIDATED');

    // Remove dependency
    const removeRes = await recorder.commit(worldId, [
      {
        id: 'prop-remove-dep-2',
        operation: 'REMOVE_DEPENDENCY',
        entityType: 'DEPENDENCY_EDGE',
        entityId: depEdge.id,
        effectiveEpoch: 3,
        preconditions: [],
        payload: { dependencyId: depEdge.id },
        source: { type: 'TIMELINE', id: 'tx-travel-102' },
      },
    ]);
    expect(removeRes.success).toBe(true);

    const removedDep = await WorldRepository.getDependency(worldId, depEdge.id);
    expect(removedDep?.status).toBe('REMOVED');

    const activeDeps = await WorldRepository.getDependenciesForSource(worldId, 'TRANSACTION', 'tx-travel-102');
    expect(activeDeps).toHaveLength(0);
  });
});
