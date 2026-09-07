import type { ProposalV2 } from '../proposal/proposalSchema';
import { WorldRepository } from '../world/worldRepository';
import type { StateFieldDiff } from './observedHistoryTypes';

export interface HistoryProjectionResult {
  supported: boolean;
  diffs: StateFieldDiff[];
}

/**
 * Projects supported authoritative state operations into canonical field paths.
 * It is deliberately read-only and mirrors only existing Recorder semantics.
 */
export class StateFieldDiffProjector {
  public async project(worldId: string, proposal: ProposalV2): Promise<HistoryProjectionResult> {
    switch (proposal.operation) {
      case 'MOVE_CHARACTER':
        return this.projectMove(worldId, proposal);
      case 'SET_CHARACTER_PRESENCE':
        return this.projectPresence(worldId, proposal);
      case 'UPDATE_CHARACTER_ATTRIBUTES':
        return this.projectAttributes(worldId, proposal);
      case 'CHANGE_RESOURCE':
        return this.projectResources(worldId, proposal);
      case 'UPDATE_CHARACTER':
        return this.projectCharacter(worldId, proposal);
      case 'UPDATE_LOCATION':
        return this.projectLocation(worldId, proposal);
      case 'UPDATE_ORGANIZATION':
        return this.projectOrganization(worldId, proposal);
      case 'REVEAL_TRUTH':
        return this.projectTruth(worldId, proposal);
      default:
        return { supported: false, diffs: [] };
    }
  }

  private async projectMove(worldId: string, proposal: ProposalV2): Promise<HistoryProjectionResult> {
    const characterId = this.characterId(proposal);
    const targetLocationId = this.stringPayload(proposal, 'targetLocationId') ?? this.stringPayload(proposal, 'locationId');
    if (!characterId || !targetLocationId) return { supported: true, diffs: [] };
    const character = await WorldRepository.getCharacter(worldId, characterId);
    if (!character) return { supported: true, diffs: [] };
    return this.result(proposal, 'CHARACTER', characterId, [{ fieldPath: 'location_id', beforeValue: character.location_id, afterValue: targetLocationId }]);
  }

  private async projectPresence(worldId: string, proposal: ProposalV2): Promise<HistoryProjectionResult> {
    const characterId = this.characterId(proposal);
    if (!characterId) return { supported: true, diffs: [] };
    const character = await WorldRepository.getCharacter(worldId, characterId);
    if (!character) return { supported: true, diffs: [] };
    const diffs: Array<{ fieldPath: string; beforeValue: unknown; afterValue: unknown }> = [];
    for (const field of ['presence_state', 'location_id', 'current_transaction_id'] as const) {
      if (proposal.payload[field] !== undefined) {
        diffs.push({ fieldPath: field, beforeValue: character[field], afterValue: proposal.payload[field] });
      }
    }
    return this.result(proposal, 'CHARACTER', characterId, diffs);
  }

  private async projectAttributes(worldId: string, proposal: ProposalV2): Promise<HistoryProjectionResult> {
    const characterId = this.characterId(proposal);
    if (!characterId) return { supported: true, diffs: [] };
    const character = await WorldRepository.getCharacter(worldId, characterId);
    if (!character) return { supported: true, diffs: [] };
    const payload = proposal.payload;
    const resolve = (field: 'hp' | 'mp', deltaKey: 'hpDelta' | 'mpDelta', setKey: 'setHp' | 'setMp', max: number) => {
      const before = character.attributes[field];
      if (typeof payload[setKey] === 'number') return Math.max(0, Math.min(max, payload[setKey] as number));
      if (typeof payload[deltaKey] === 'number') return Math.max(0, Math.min(max, before + (payload[deltaKey] as number)));
      return undefined;
    };
    const hp = resolve('hp', 'hpDelta', 'setHp', character.attributes.max_hp);
    const mp = resolve('mp', 'mpDelta', 'setMp', character.attributes.max_mp);
    const diffs: Array<{ fieldPath: string; beforeValue: unknown; afterValue: unknown }> = [];
    if (hp !== undefined) diffs.push({ fieldPath: 'attributes.hp', beforeValue: character.attributes.hp, afterValue: hp });
    if (mp !== undefined) diffs.push({ fieldPath: 'attributes.mp', beforeValue: character.attributes.mp, afterValue: mp });
    return this.result(proposal, 'CHARACTER', characterId, diffs);
  }

  private async projectResources(worldId: string, proposal: ProposalV2): Promise<HistoryProjectionResult> {
    const characterId = this.characterId(proposal);
    if (!characterId) return { supported: true, diffs: [] };
    const character = await WorldRepository.getCharacter(worldId, characterId);
    const goldDelta = proposal.payload.goldDelta;
    if (!character || typeof goldDelta !== 'number') return { supported: true, diffs: [] };
    return this.result(proposal, 'CHARACTER', characterId, [{
      fieldPath: 'resources.gold', beforeValue: character.resources.gold, afterValue: character.resources.gold + goldDelta,
    }]);
  }

  private async projectCharacter(worldId: string, proposal: ProposalV2): Promise<HistoryProjectionResult> {
    const characterId = this.characterId(proposal);
    if (!characterId) return { supported: true, diffs: [] };
    const character = await WorldRepository.getCharacter(worldId, characterId);
    if (!character) return { supported: true, diffs: [] };
    const allowed = ['name', 'title', 'status', 'location_id', 'presence_state'] as const;
    const diffs: Array<{ fieldPath: string; beforeValue: unknown; afterValue: unknown }> = allowed.flatMap((field) => proposal.payload[field] === undefined ? [] : [{
      fieldPath: field, beforeValue: character[field], afterValue: proposal.payload[field],
    }]);
    return this.result(proposal, 'CHARACTER', characterId, diffs);
  }

  private async projectLocation(worldId: string, proposal: ProposalV2): Promise<HistoryProjectionResult> {
    const locationId = proposal.entityId ?? this.stringPayload(proposal, 'locationId');
    if (!locationId) return { supported: true, diffs: [] };
    const location = await WorldRepository.getLocation(worldId, locationId);
    if (!location) return { supported: true, diffs: [] };
    const allowed = ['name', 'type', 'description', 'status', 'owner_id', 'owner_type'] as const;
    const diffs = allowed.flatMap((field) => proposal.payload[field] === undefined ? [] : [{
      fieldPath: field, beforeValue: location[field], afterValue: proposal.payload[field],
    }]);
    return this.result(proposal, 'LOCATION', locationId, diffs);
  }

  private async projectOrganization(worldId: string, proposal: ProposalV2): Promise<HistoryProjectionResult> {
    const organizationId = proposal.entityId ?? this.stringPayload(proposal, 'organizationId');
    if (!organizationId) return { supported: true, diffs: [] };
    const organization = await WorldRepository.getOrganization(worldId, organizationId);
    if (!organization) return { supported: true, diffs: [] };
    const allowed = ['leader_id', 'headquarters_id'] as const;
    const diffs = allowed.flatMap((field) => proposal.payload[field] === undefined ? [] : [{
      fieldPath: field, beforeValue: organization[field], afterValue: proposal.payload[field],
    }]);
    return this.result(proposal, 'ORGANIZATION', organizationId, diffs);
  }

  private async projectTruth(worldId: string, proposal: ProposalV2): Promise<HistoryProjectionResult> {
    const truthId = proposal.entityId ?? this.stringPayload(proposal, 'truthId');
    if (!truthId) return { supported: true, diffs: [] };
    const truth = await WorldRepository.getHiddenTruth(worldId, truthId);
    if (!truth) return { supported: true, diffs: [] };
    const allowed = ['true_nature', 'true_owner_id', 'true_goal', 'exists', 'locked_at_epoch', 'never_changes'] as const;
    const diffs: Array<{ fieldPath: string; beforeValue: unknown; afterValue: unknown }> = allowed.flatMap((field) => proposal.payload[field] === undefined ? [] : [{
      fieldPath: field, beforeValue: truth[field], afterValue: proposal.payload[field],
    }]);
    if (!truth.revealed) diffs.push({ fieldPath: 'revealed', beforeValue: false, afterValue: true });
    return this.result(proposal, 'HIDDEN_TRUTH', truthId, diffs);
  }

  private result(
    proposal: ProposalV2,
    entityType: string,
    entityId: string,
    fields: Array<{ fieldPath: string; beforeValue: unknown; afterValue: unknown }>,
  ): HistoryProjectionResult {
    return {
      supported: true,
      diffs: fields.map((field) => ({ ...field, entityType, entityId, effectiveEpoch: proposal.effectiveEpoch, proposalId: proposal.id })),
    };
  }

  private characterId(proposal: ProposalV2): string | undefined {
    return proposal.entityId ?? this.stringPayload(proposal, 'characterId');
  }

  private stringPayload(proposal: ProposalV2, key: string): string | undefined {
    return typeof proposal.payload[key] === 'string' ? proposal.payload[key] as string : undefined;
  }
}
