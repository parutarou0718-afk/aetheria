import { describe, it, expect, beforeEach } from 'vitest';
import { dbManager } from '../../src/engine/persistence/database';
import { WorldBootstrap } from '../../src/engine/world/worldBootstrap';
import { WorldRepository } from '../../src/engine/world/worldRepository';
import { WorldMutationCoordinator } from '../../src/engine/world/worldMutationCoordinator';
import { TransactionService } from '../../src/engine/timeline/transactionService';
import { DependencyEdge } from '../../src/engine/dependency/dependencyTypes';

describe('Phase 4: Dependency Propagation Tests', () => {
  let worldId: string;

  beforeEach(async () => {
    worldId = `world-dep-prop-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    await dbManager.initialize();
    await WorldBootstrap.bootstrap(worldId);
  });

  it('1. Propagates location status change to invalidate dependent travel transaction', async () => {
    // 1. Plan travel for PC player from loc-tavern to loc-ruins
    const travelRes = await TransactionService.planTravel({
      worldId,
      actorId: 'pc-player',
      destinationLocationId: 'loc-ruins',
      startEpoch: 1,
    });
    const txId = travelRes.transaction.id;

    // 2. Register dependency: Transaction txId LOCATION_ACCESSIBLE loc-ruins (status EQUALS OPEN)
    const depEdge: DependencyEdge = {
      id: `dep-tx-loc-${txId}`,
      world_id: worldId,
      source_type: 'TRANSACTION',
      source_id: txId,
      target_type: 'LOCATION',
      target_id: 'loc-ruins',
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

    await WorldMutationCoordinator.commitWithCausalPropagation(worldId, [
      {
        id: `prop-add-dep-${txId}`,
        operation: 'CREATE_DEPENDENCY',
        entityType: 'DEPENDENCY_EDGE',
        entityId: depEdge.id,
        effectiveEpoch: 1,
        preconditions: [],
        payload: { dependency: depEdge },
        source: { type: 'TIMELINE', id: txId },
      },
    ]);

    // 3. Destroy/Block location loc-ruins via WorldMutationCoordinator
    const mutRes = await WorldMutationCoordinator.commit(worldId, [
      {
        id: 'prop-destroy-loc-ruins',
        operation: 'UPDATE_LOCATION',
        entityType: 'LOCATION',
        entityId: 'loc-ruins',
        effectiveEpoch: 2,
        preconditions: [],
        payload: {
          locationId: 'loc-ruins',
          status: 'DESTROYED',
        },
        source: { type: 'SIMULATION', id: 'disaster' },
      },
    ]);

    expect(mutRes.commitResult.success).toBe(true);
    expect(mutRes.invalidatedDependencies).toBeGreaterThanOrEqual(1);

    // 4. Verify transaction txId is now INVALIDATED
    const updatedTx = await WorldRepository.getWorldTransaction(worldId, txId);
    expect(updatedTx?.status).toBe('INVALIDATED');
  });
});
