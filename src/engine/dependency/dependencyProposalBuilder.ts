import { StateChangeProposal } from '../recorder/changeSchemas';
import { DependencyImpact } from './dependencyTypes';

export class DependencyProposalBuilder {
  static async buildImpactProposals(
    worldId: string,
    impacts: DependencyImpact[],
    epoch: number
  ): Promise<StateChangeProposal[]> {
    const proposals: StateChangeProposal[] = [];

    for (const impact of impacts) {
      const { sourceType, sourceId, failurePolicy, reason } = impact;

      switch (sourceType) {
        case 'TRANSACTION': {
          if (failurePolicy === 'FAIL_SOURCE') {
            proposals.push({
              id: `prop-fail-tx-${sourceId}-${epoch}-${Math.random().toString(36).substring(2, 6)}`,
              operation: 'FAIL_TRANSACTION',
              entityType: 'WORLD_TRANSACTION',
              entityId: sourceId,
              effectiveEpoch: epoch,
              preconditions: [],
              payload: {
                transactionId: sourceId,
                reason,
              },
              source: { type: 'TIMELINE', id: 'DependencyImpactService' },
            });
          } else if (failurePolicy === 'INVALIDATE_SOURCE') {
            proposals.push({
              id: `prop-inval-tx-${sourceId}-${epoch}-${Math.random().toString(36).substring(2, 6)}`,
              operation: 'INVALIDATE_TRANSACTION',
              entityType: 'WORLD_TRANSACTION',
              entityId: sourceId,
              effectiveEpoch: epoch,
              preconditions: [],
              payload: {
                transactionId: sourceId,
                status: 'INVALIDATED',
                reason,
              },
              source: { type: 'TIMELINE', id: 'DependencyImpactService' },
            });
          } else if (failurePolicy === 'PAUSE_SOURCE') {
            proposals.push({
              id: `prop-pause-tx-${sourceId}-${epoch}-${Math.random().toString(36).substring(2, 6)}`,
              operation: 'PAUSE_TRANSACTION',
              entityType: 'WORLD_TRANSACTION',
              entityId: sourceId,
              effectiveEpoch: epoch,
              preconditions: [],
              payload: {
                transactionId: sourceId,
                status: 'PAUSED',
                reason,
              },
              source: { type: 'TIMELINE', id: 'DependencyImpactService' },
            });
          } else if (failurePolicy === 'DELAY_SOURCE') {
            proposals.push({
              id: `prop-delay-tx-${sourceId}-${epoch}-${Math.random().toString(36).substring(2, 6)}`,
              operation: 'UPDATE_WORLD_TRANSACTION',
              entityType: 'WORLD_TRANSACTION',
              entityId: sourceId,
              effectiveEpoch: epoch,
              preconditions: [],
              payload: {
                transactionId: sourceId,
                status: 'DELAYED',
                reason,
              },
              source: { type: 'TIMELINE', id: 'DependencyImpactService' },
            });
          } else if (failurePolicy === 'REPLAN_SOURCE') {
            proposals.push({
              id: `prop-pause-tx-${sourceId}-${epoch}-${Math.random().toString(36).substring(2, 6)}`,
              operation: 'PAUSE_TRANSACTION',
              entityType: 'WORLD_TRANSACTION',
              entityId: sourceId,
              effectiveEpoch: epoch,
              preconditions: [],
              payload: {
                transactionId: sourceId,
                status: 'PAUSED',
                reason,
              },
              source: { type: 'TIMELINE', id: 'DependencyImpactService' },
            });
            proposals.push({
              id: `prop-wake-tx-${sourceId}-${epoch}-${Math.random().toString(36).substring(2, 6)}`,
              operation: 'REGISTER_WAKE_SIGNAL',
              entityType: 'WAKE_SIGNAL',
              effectiveEpoch: epoch,
              preconditions: [],
              payload: {
                sourceType,
                sourceId,
                reason: `Replan required due to dependency invalidation: ${reason}`,
              },
              source: { type: 'TIMELINE', id: 'DependencyImpactService' },
            });
          }
          break;
        }

        case 'SEED': {
          if (failurePolicy === 'PAUSE_SOURCE') {
            proposals.push({
              id: `prop-pause-seed-${sourceId}-${epoch}-${Math.random().toString(36).substring(2, 6)}`,
              operation: 'UPDATE_SEED',
              entityType: 'SEED',
              entityId: sourceId,
              effectiveEpoch: epoch,
              preconditions: [],
              payload: {
                seedId: sourceId,
                status: 'PAUSED',
                invalidationReason: reason,
              },
              source: { type: 'SIMULATION', id: 'DependencyImpactService' },
            });
          } else if (failurePolicy === 'INVALIDATE_SOURCE') {
            proposals.push({
              id: `prop-inval-seed-${sourceId}-${epoch}-${Math.random().toString(36).substring(2, 6)}`,
              operation: 'UPDATE_SEED',
              entityType: 'SEED',
              entityId: sourceId,
              effectiveEpoch: epoch,
              preconditions: [],
              payload: {
                seedId: sourceId,
                status: 'FAILED',
                invalidationReason: reason,
              },
              source: { type: 'SIMULATION', id: 'DependencyImpactService' },
            });
          } else if (failurePolicy === 'WAKE_SOURCE') {
            proposals.push({
              id: `prop-wake-seed-${sourceId}-${epoch}-${Math.random().toString(36).substring(2, 6)}`,
              operation: 'REGISTER_WAKE_SIGNAL',
              entityType: 'WAKE_SIGNAL',
              effectiveEpoch: epoch,
              preconditions: [],
              payload: {
                sourceType,
                sourceId,
                reason,
              },
              source: { type: 'SIMULATION', id: 'DependencyImpactService' },
            });
          }
          break;
        }

        case 'ORGANIZATION_PROJECT': {
          if (failurePolicy === 'PAUSE_SOURCE') {
            proposals.push({
              id: `prop-pause-proj-${sourceId}-${epoch}-${Math.random().toString(36).substring(2, 6)}`,
              operation: 'UPDATE_PROJECT_DEPENDENCIES',
              entityType: 'ORGANIZATION',
              entityId: sourceId,
              effectiveEpoch: epoch,
              preconditions: [],
              payload: {
                projectId: sourceId,
                status: 'PAUSED',
                reason,
              },
              source: { type: 'SIMULATION', id: 'DependencyImpactService' },
            });
          } else if (failurePolicy === 'INVALIDATE_SOURCE') {
            proposals.push({
              id: `prop-inval-proj-${sourceId}-${epoch}-${Math.random().toString(36).substring(2, 6)}`,
              operation: 'UPDATE_PROJECT_DEPENDENCIES',
              entityType: 'ORGANIZATION',
              entityId: sourceId,
              effectiveEpoch: epoch,
              preconditions: [],
              payload: {
                projectId: sourceId,
                status: 'FAILED',
                reason,
              },
              source: { type: 'SIMULATION', id: 'DependencyImpactService' },
            });
          }
          break;
        }
      }
    }

    return proposals;
  }
}
