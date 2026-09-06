import type { ProposalV2 } from './proposalSchema';
export type CreateStateChangeProposalInput = Omit<ProposalV2, 'preconditions'> & { preconditions?: ProposalV2['preconditions'] };
export function createStateChangeProposal(input: CreateStateChangeProposalInput): ProposalV2 { return { ...input, preconditions: input.preconditions ?? [] }; }
