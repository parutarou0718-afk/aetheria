import type { StateChangeProposal } from '../../recorder/changeSchemas';
import { minimumAuthority } from './authorityPolicy';
import { AUTHORITY_RANK } from './authorityTypes';
export class AuthorityValidator { static validate(proposal: StateChangeProposal & { authorityLevel?: keyof typeof AUTHORITY_RANK }) { const requiredAuthority = minimumAuthority(proposal.operation); const actualAuthority = proposal.authorityLevel ?? 'NARRATIVE'; return AUTHORITY_RANK[actualAuthority] >= AUTHORITY_RANK[requiredAuthority] ? { valid: true as const } : { valid: false as const, requiredAuthority, actualAuthority }; } }
