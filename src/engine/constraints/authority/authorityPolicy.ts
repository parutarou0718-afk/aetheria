import type { StateChangeOperation } from '../../recorder/changeSchemas';
import type { AuthorityLevel } from './authorityTypes';
const SYSTEM_OPERATIONS = new Set<StateChangeOperation>([
  'ADVANCE_WORLD_EPOCH', 'CREATE_SCHEDULED_CHECKPOINT', 'UPDATE_SCHEDULED_CHECKPOINT', 'REGISTER_WAKE_SIGNAL',
  'CREATE_QUEST', 'COMPLETE_QUEST', 'FAIL_QUEST', 'INVALIDATE_QUEST',
]);
export function minimumAuthority(operation: StateChangeOperation): AuthorityLevel { return SYSTEM_OPERATIONS.has(operation) ? 'SYSTEM' : 'ACTOR'; }
