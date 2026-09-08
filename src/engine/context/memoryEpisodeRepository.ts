import { dbManager } from '../persistence/database';
import type { MemoryEpisode } from './memoryEpisodeTypes';
export class MemoryEpisodeRepository {
  static readonly MAX_RECENT_CANDIDATES = 256;
  static readonly MAX_IMPORTANT_CANDIDATES = 128;
  static readonly MAX_LOCATION_CANDIDATES = 128;
  static async appendEpisode(episode: MemoryEpisode): Promise<void> { const text = episode.text.length > 4_000 ? `${episode.text.slice(0, 3_967)}…[truncated]` : episode.text; await dbManager.run('INSERT INTO memory_episodes (id, world_id, observer_type, observer_id, episode_type, text, importance, epoch, location_id, participant_ids_json, entity_ids_json, source_type, source_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [episode.id, episode.worldId, episode.observerType, episode.observerId, episode.episodeType, text, episode.importance, episode.epoch, episode.locationId ?? null, JSON.stringify(episode.participantIds), JSON.stringify(episode.entityIds), episode.sourceType, episode.sourceId ?? null, episode.createdAt]); }
  static async getRecentEpisodes(worldId: string, observerType: string, observerId: string, limit: number): Promise<MemoryEpisode[]> { const rows = await dbManager.all<any>('SELECT * FROM memory_episodes WHERE world_id = ? AND observer_type = ? AND observer_id = ? ORDER BY epoch DESC, created_at DESC LIMIT ?', [worldId, observerType, observerId, limit]); return rows.map(this.map); }
  static async getCandidateEpisodes(worldId: string, observerType: string, observerId: string, locationId?: string | null): Promise<MemoryEpisode[]> {
    const base = [worldId, observerType, observerId];
    const [recent, important, local] = await Promise.all([
      dbManager.all<any>('SELECT * FROM memory_episodes WHERE world_id = ? AND observer_type = ? AND observer_id = ? ORDER BY epoch DESC, created_at DESC LIMIT ?', [...base, this.MAX_RECENT_CANDIDATES]),
      dbManager.all<any>('SELECT * FROM memory_episodes WHERE world_id = ? AND observer_type = ? AND observer_id = ? ORDER BY importance DESC, epoch DESC LIMIT ?', [...base, this.MAX_IMPORTANT_CANDIDATES]),
      locationId ? dbManager.all<any>('SELECT * FROM memory_episodes WHERE world_id = ? AND observer_type = ? AND observer_id = ? AND location_id = ? ORDER BY epoch DESC, created_at DESC LIMIT ?', [...base, locationId, this.MAX_LOCATION_CANDIDATES]) : Promise.resolve([]),
    ]);
    const unique = new Map<string, any>();
    [...recent, ...important, ...local].forEach((row) => unique.set(row.id, row));
    return [...unique.values()].map(this.map);
  }
  static async hasAutonomyActionMemory(worldId: string, runId: string): Promise<boolean> { return Boolean(await dbManager.get('SELECT id FROM memory_episodes WHERE world_id = ? AND episode_type = \'ACTION\' AND source_type = \'NPC_AUTONOMY\' AND source_id = ? LIMIT 1', [worldId, runId])); }
  private static map(row: any): MemoryEpisode { return { id: row.id, worldId: row.world_id, observerType: row.observer_type, observerId: row.observer_id, episodeType: row.episode_type, text: row.text, importance: row.importance, epoch: row.epoch, locationId: row.location_id, participantIds: JSON.parse(row.participant_ids_json), entityIds: JSON.parse(row.entity_ids_json), sourceType: row.source_type, sourceId: row.source_id, createdAt: row.created_at }; }
}
