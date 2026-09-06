import { describe, expect, it } from 'vitest';
import { AuthorityValidator } from '../src/engine/constraints/authority/authorityValidator';

const base: any = { id: 'p', operation: 'UPDATE_CHARACTER', entityType: 'CHARACTER', payload: {}, effectiveEpoch: 1, preconditions: [], source: { type: 'LLM' }, reason: 'r', causalBasis: [{ type: 'PLAYER_ACTION' }], authorityLevel: 'ACTOR' };
describe('AuthorityValidator', () => {
  it('rejects actor authority for system operations and accepts system authority', () => {
    expect(AuthorityValidator.validate({ ...base, operation: 'ADVANCE_WORLD_EPOCH' }).valid).toBe(false);
    expect(AuthorityValidator.validate({ ...base, operation: 'ADVANCE_WORLD_EPOCH', authorityLevel: 'SYSTEM' }).valid).toBe(true);
  });
});
