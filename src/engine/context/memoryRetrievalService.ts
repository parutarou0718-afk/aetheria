import { MemoryEpisodeRepository } from './memoryEpisodeRepository';
import type { MemoryEpisode } from './memoryEpisodeTypes';
export class MemoryRetrievalService {
  static async retrieve(input: { worldId: string; observerType: 'CHARACTER' | 'PLAYER'; observerId: string; userInput: string; locationId?: string | null; limit: number }): Promise<MemoryEpisode[]> {
    const episodes = await MemoryEpisodeRepository.getCandidateEpisodes(input.worldId, input.observerType, input.observerId, input.locationId);
    const terms = input.userInput.toLowerCase().split(/\W+/).filter(term => term.length > 1);
    return episodes.map(episode => {
      const entityMatch = episode.entityIds.some(id => terms.includes(id.toLowerCase()));
      const lexicalMatches = terms.filter(term => episode.text.toLowerCase().includes(term)).length;
      return { episode, score: episode.importance * 1000 + episode.epoch + (episode.locationId && episode.locationId === input.locationId ? 500 : 0) + lexicalMatches * 250 + (entityMatch ? 250 : 0) };
    }).sort((a, b) => b.score - a.score || a.episode.id.localeCompare(b.episode.id)).slice(0, input.limit).map(item => item.episode);
  }
}
