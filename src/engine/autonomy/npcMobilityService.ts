import { WorldRepository } from '../world/worldRepository';
import type { Character } from '../../types';
import type { NpcMobilityOption } from './npcAutonomyTypes';

export class NpcMobilityService {
  static async getOptions(worldId: string, npc: Character): Promise<NpcMobilityOption[]> {
    if (!npc.location_id) return [];
    const known = new Set(npc.knowledge.known_locations);
    const edges = await WorldRepository.getLocationEdgesFrom(worldId, npc.location_id);
    const options: NpcMobilityOption[] = [];
    for (const edge of edges) {
      if (edge.status && edge.status !== 'OPEN' || !known.has(edge.to_location_id)) continue;
      const destination = await WorldRepository.getLocation(worldId, edge.to_location_id);
      if (!destination || ['BLOCKED', 'DESTROYED', 'INACCESSIBLE'].includes(destination.status ?? 'ACTIVE')) continue;
      options.push({ locationId: destination.id, name: destination.name });
    }
    return options.sort((a, b) => a.locationId.localeCompare(b.locationId)).slice(0, 24);
  }
}
