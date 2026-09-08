import { globalWorld } from '../../engine/worldState';
import { WorldRepository } from '../../engine/world/worldRepository';
import { TransactionService } from '../../engine/timeline/transactionService';

export class PlayerMobilityError extends Error { public constructor(public readonly code: string, message: string) { super(message); } }

/** Validates a player-visible direct edge immediately before delegating to Timeline. */
export class PlayerMobilityService {
  public async travel(input: { worldId: string; actorId: string; destinationLocationId: string }): Promise<{ expectedEndEpoch: number }> {
    const player = globalWorld.characters.get(input.actorId);
    const presence = player?.presence_state ?? (player?.location_id ? 'AT_LOCATION' : 'MISSING');
    if (!player || player.type !== 'PC' || player.status !== 'ALIVE' || presence !== 'AT_LOCATION' || !player.location_id) throw new PlayerMobilityError('TRAVEL_NOT_AVAILABLE', 'Travel is not available for the current character state.');
    const edge = (await WorldRepository.getLocationEdgesFrom(input.worldId, player.location_id)).find((item) => item.to_location_id === input.destinationLocationId && item.status === 'OPEN');
    const destination = globalWorld.locations.get(input.destinationLocationId);
    if (!edge || !destination || ['BLOCKED', 'DESTROYED', 'INACCESSIBLE'].includes(destination.status ?? 'ACTIVE')) throw new PlayerMobilityError('TRAVEL_NOT_AVAILABLE', 'That destination is not currently reachable.');
    const plan = await TransactionService.planTravel({ worldId: input.worldId, actorId: input.actorId, destinationLocationId: input.destinationLocationId, startEpoch: globalWorld.snapshot.epoch, routeConstraint: { kind: 'DIRECT_EDGE', edgeId: edge.id, originLocationId: player.location_id, destinationLocationId: input.destinationLocationId } });
    return { expectedEndEpoch: plan.transaction.expected_end_epoch };
  }
}
