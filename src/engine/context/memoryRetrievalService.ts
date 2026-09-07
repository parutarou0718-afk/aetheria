import { MemoryEpisodeRepository } from './memoryEpisodeRepository';
import type { MemoryEpisode } from './memoryEpisodeTypes';
export class MemoryRetrievalService {
  static async retrieve(input: { worldId: string; observerType: 'CHARACTER' | 'PLAYER'; observerId: string; userInput: string; locationId?: string | null; limit: number }): Promise<MemoryEpisode[]> {
    const episodes = await MemoryEpisodeRepository.getRecentEpisodes(input.worldId, input.observerType, input.observerId, 100);
    const terms = input.userInput.toLowerCase().split(/\W+/).filter(Boolean);
    return episodes.map(episode => ({ episode, score: episode.importance * 100 + episode.epoch + (episode.locationId && episode.locationId === input.locationId ? 50 : 0) + (terms.some(term => episode.text.toLowerCase().includes(term)) ? 75 : 0) })).sort((a, b) => b.score - a.score || a.episode.id.localeCompare(b.episode.id)).slice(0, input.limit).map(item => item.episode);
  }
}
