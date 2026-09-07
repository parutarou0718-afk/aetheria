import type { ProposalV2 } from '../../proposal/proposalSchema';
import type { CausalBasisViolation } from './causalBasisTypes';

export interface CausalBasisStateReader {
  factExists(worldId: string, id: string): Promise<boolean>;
  eventEpoch(worldId: string, id: string): Promise<number | null>;
  entityExists(worldId: string, entityType: string, id: string): Promise<boolean>;
  ruleExists(worldId: string, id: string): Promise<boolean>;
}

export class CausalBasisValidator {
  public constructor(private readonly state: CausalBasisStateReader) {}
  public async validate(input: { worldId: string; proposal: ProposalV2 }): Promise<{ valid: boolean; violations: CausalBasisViolation[] }> {
    const violations: CausalBasisViolation[] = [];
    for (const basis of input.proposal.causalBasis) {
      if (basis.type === 'PLAYER_ACTION' || basis.type === 'SYSTEM_EVENT') {
        if (!basis.id && !basis.description) violations.push(this.violation(basis.type, undefined, 'MALFORMED', 'A descriptive causal basis requires a description.'));
        continue;
      }
      if (!basis.id) {
        if (basis.type === 'RULE' && basis.description) continue;
        violations.push(this.violation(basis.type, undefined, 'MALFORMED', 'This causal basis requires an id.'));
        continue;
      }
      if (basis.type === 'FACT' && !(await this.state.factExists(input.worldId, basis.id))) violations.push(this.violation(basis.type, basis.id, 'NOT_FOUND', 'Referenced fact does not exist in this world.'));
      if (basis.type === 'EVENT') {
        const epoch = await this.state.eventEpoch(input.worldId, basis.id);
        if (epoch === null) violations.push(this.violation(basis.type, basis.id, 'NOT_FOUND', 'Referenced event does not exist in this world.'));
        else if (epoch > input.proposal.effectiveEpoch) violations.push(this.violation(basis.type, basis.id, 'FROM_FUTURE', 'A future event cannot cause this proposal.'));
      }
      if (basis.type === 'ENTITY_STATE' && (!basis.entityType || !(await this.state.entityExists(input.worldId, basis.entityType, basis.id)))) violations.push(this.violation(basis.type, basis.id, basis.entityType ? 'NOT_FOUND' : 'MALFORMED', 'Referenced entity state is unavailable in this world.'));
      if (basis.type === 'RULE' && !(await this.state.ruleExists(input.worldId, basis.id))) violations.push(this.violation(basis.type, basis.id, 'NOT_FOUND', 'Referenced world rule does not exist in this world.'));
    }
    return { valid: violations.length === 0, violations };
  }
  private violation(basisType: string, basisId: string | undefined, reason: CausalBasisViolation['reason'], message: string): CausalBasisViolation { return { basisType, basisId, reason, message }; }
}
