export type CausalBasisFailureReason = 'NOT_FOUND' | 'WRONG_WORLD' | 'FROM_FUTURE' | 'MALFORMED';

export interface CausalBasisViolation {
  basisType: string;
  basisId?: string;
  reason: CausalBasisFailureReason;
  message: string;
}
