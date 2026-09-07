import { describe, expect, it } from 'vitest';
import { DependencyProposalBuilder } from '../src/engine/dependency/dependencyProposalBuilder';

describe('quest dependency proposal mapping', () => {
  it('maps only quest FAIL_SOURCE and INVALIDATE_SOURCE to terminal system proposals', async () => {
    const failed = await DependencyProposalBuilder.buildImpactProposals('world', [{ dependencyId: 'd1', sourceType: 'QUEST', sourceId: 'quest-1', targetType: 'LOCATION', targetId: 'loc-ruins', failurePolicy: 'FAIL_SOURCE', reason: 'Ruins destroyed.', evaluation: { dependencyId: 'd1', valid: false, actualValue: 'DESTROYED', expectedCondition: { operator: 'NOT_IN', value: ['DESTROYED'] } } }], 2);
    const invalidated = await DependencyProposalBuilder.buildImpactProposals('world', [{ dependencyId: 'd2', sourceType: 'QUEST', sourceId: 'quest-2', targetType: 'LOCATION', targetId: 'loc-ruins', failurePolicy: 'INVALIDATE_SOURCE', reason: 'Ruins inaccessible.', evaluation: { dependencyId: 'd2', valid: false, actualValue: 'BLOCKED', expectedCondition: { operator: 'NOT_IN', value: ['BLOCKED'] } } }], 2);
    expect(failed).toMatchObject([{ operation: 'FAIL_QUEST', entityId: 'quest-1', payload: { questId: 'quest-1' } }]);
    expect(invalidated).toMatchObject([{ operation: 'INVALIDATE_QUEST', entityId: 'quest-2', payload: { questId: 'quest-2' } }]);
  });
});
