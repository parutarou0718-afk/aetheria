import type { ProposalV2 } from '../proposal/proposalSchema';
import { WorldRepository } from '../world/worldRepository';
import type { StateFieldDiff } from './observedHistoryTypes';

export interface HistoryProjectionResult {
  supported: boolean;
  diffs: StateFieldDiff[];
  /** Internal execution metadata; StateFieldDiff remains the canonical public projection. */
  numericMutations?: NumericMutationDescriptor[];
}

interface NumericMutationDescriptor {
  entityType: string;
  entityId: string;
  fieldPath: string;
  mode: 'DELTA' | 'SET';
  numericOperand: number;
  maximumValue?: number;
}

/**
 * Projects supported authoritative state operations into canonical field paths.
 * It is deliberately read-only and mirrors only existing Recorder semantics.
 */
export class StateFieldDiffProjector {
  public async project(worldId: string, proposal: ProposalV2, shadow?: Map<string, unknown>): Promise<HistoryProjectionResult> {
    let projection: HistoryProjectionResult;
    switch (proposal.operation) {
      case 'MOVE_CHARACTER':
        projection = await this.projectMove(worldId, proposal); break;
      case 'SET_CHARACTER_PRESENCE':
        projection = await this.projectPresence(worldId, proposal); break;
      case 'UPDATE_CHARACTER_ATTRIBUTES':
        projection = await this.projectAttributes(worldId, proposal); break;
      case 'CHANGE_RESOURCE':
        projection = await this.projectResources(worldId, proposal); break;
      case 'UPDATE_CHARACTER':
        projection = await this.projectCharacter(worldId, proposal); break;
      case 'UPDATE_LOCATION':
        projection = await this.projectLocation(worldId, proposal); break;
      case 'UPDATE_ORGANIZATION':
        projection = await this.projectOrganization(worldId, proposal); break;
      case 'REVEAL_TRUTH':
        projection = await this.projectTruth(worldId, proposal); break;
      default:
        return { supported: false, diffs: [] };
    }
    return this.applyShadow(proposal, projection, shadow);
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
      let resolved = before;
      let changed = false;
      // This is the Recorder order: apply delta first, then let set win.
      if (typeof payload[deltaKey] === 'number') { resolved = Math.max(0, Math.min(max, resolved + (payload[deltaKey] as number))); changed = true; }
      if (typeof payload[setKey] === 'number') { resolved = Math.max(0, Math.min(max, payload[setKey] as number)); changed = true; }
      return changed ? resolved : undefined;
    };
    const hp = resolve('hp', 'hpDelta', 'setHp', character.attributes.max_hp);
    const mp = resolve('mp', 'mpDelta', 'setMp', character.attributes.max_mp);
    const diffs: Array<{ fieldPath: string; beforeValue: unknown; afterValue: unknown }> = [];
    if (hp !== undefined) diffs.push({ fieldPath: 'attributes.hp', beforeValue: character.attributes.hp, afterValue: hp });
    if (mp !== undefined) diffs.push({ fieldPath: 'attributes.mp', beforeValue: character.attributes.mp, afterValue: mp });
    const numericMutations: NumericMutationDescriptor[] = [];
    for (const [fieldPath, deltaKey, setKey, maximumValue] of [
      ['attributes.hp', 'hpDelta', 'setHp', character.attributes.max_hp],
      ['attributes.mp', 'mpDelta', 'setMp', character.attributes.max_mp],
    ] as const) {
      if (typeof payload[setKey] === 'number') numericMutations.push({ entityType: 'CHARACTER', entityId: characterId, fieldPath, mode: 'SET', numericOperand: payload[setKey] as number, maximumValue });
      else if (typeof payload[deltaKey] === 'number') numericMutations.push({ entityType: 'CHARACTER', entityId: characterId, fieldPath, mode: 'DELTA', numericOperand: payload[deltaKey] as number, maximumValue });
    }
    return { ...this.result(proposal, 'CHARACTER', characterId, diffs), numericMutations };
  }

  private async projectResources(worldId: string, proposal: ProposalV2): Promise<HistoryProjectionResult> {
    const characterId = this.characterId(proposal);
    if (!characterId) return { supported: true, diffs: [] };
    const character = await WorldRepository.getCharacter(worldId, characterId);
    const goldDelta = proposal.payload.goldDelta;
    if (!character || typeof goldDelta !== 'number') return { supported: true, diffs: [] };
    return { ...this.result(proposal, 'CHARACTER', characterId, [{
      fieldPath: 'resources.gold', beforeValue: character.resources.gold, afterValue: character.resources.gold + goldDelta,
    }]), numericMutations: [{ entityType: 'CHARACTER', entityId: characterId, fieldPath: 'resources.gold', mode: 'DELTA', numericOperand: goldDelta }] };
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
    const revealerId = this.stringPayload(proposal, 'revealerId') ?? 'pc-player';
    const revealedTo = truth.revealed_to_ids.includes(revealerId)
      ? truth.revealed_to_ids
      : [...truth.revealed_to_ids, revealerId];
    if (JSON.stringify(revealedTo) !== JSON.stringify(truth.revealed_to_ids)) {
      diffs.push({ fieldPath: 'revealed_to_ids', beforeValue: truth.revealed_to_ids, afterValue: revealedTo });
    }
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

  private applyShadow(proposal: ProposalV2, projection: HistoryProjectionResult, shadow?: Map<string, unknown>): HistoryProjectionResult {
    if (!shadow || !projection.supported) return projection;
    const mutations = new Map((projection.numericMutations ?? []).map((mutation) => [
      `${mutation.entityType}:${mutation.entityId}:${mutation.fieldPath}`, mutation,
    ]));
    const diffs = projection.diffs.map((diff) => {
      const key = `${diff.entityType}:${diff.entityId}:${diff.fieldPath}`;
      const shadowBefore = shadow.has(key) ? shadow.get(key) : diff.beforeValue;
      let afterValue = diff.afterValue;
      const mutation = mutations.get(key);
      if (mutation) {
        const resolved = mutation.mode === 'DELTA' && typeof shadowBefore === 'number'
          ? shadowBefore + mutation.numericOperand
          : mutation.numericOperand;
        afterValue = Math.max(0, Math.min(mutation.maximumValue ?? Number.POSITIVE_INFINITY, resolved));
      }
      shadow.set(key, afterValue);
      return { ...diff, beforeValue: shadowBefore, afterValue };
    });
    return { ...projection, diffs };
  }
}
