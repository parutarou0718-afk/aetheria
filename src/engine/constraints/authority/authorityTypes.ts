export const AUTHORITY_RANK = { NARRATIVE: 0, ACTOR: 1, SYSTEM: 2, AUTHOR: 3, ADMIN: 4 } as const;
export type AuthorityLevel = keyof typeof AUTHORITY_RANK;
