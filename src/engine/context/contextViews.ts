import type { Character, HiddenTruth, Location } from '../../types';
import type { WorldRule } from '../constraints/rules/worldRuleTypes';
import type { InteractionTurn } from './interactionTypes';
import type { MemoryEpisode } from './memoryEpisodeTypes';

/** These views deliberately exclude persistence and private implementation fields. */
export function toDmCharacterView(character: Character) {
  return { id: character.id, name: character.name, title: character.title, status: character.status,
    presenceState: character.presence_state, locationId: character.location_id, attributes: character.attributes,
    skills: character.skills, resources: character.resources, inventory: character.inventory, currentAction: character.current_action };
}
export function toNpcSelfBaseView(character: Character) {
  return { id: character.id, name: character.name, title: character.title, species: character.species,
    status: character.status, locationId: character.location_id, personality: character.personality,
    fear: character.fear, goal: character.goal, currentAction: character.current_action };
}
export function toNpcSelfView(character: Character, playerId: string) {
  return { ...toNpcSelfBaseView(character), relationshipWithPlayer: character.relationships.filter(relationship => relationship.target_id === playerId) };
}
export function toNpcObservedCharacterView(character: Character) {
  return { id: character.id, name: character.name, title: character.title, status: character.status, presenceState: character.presence_state };
}
export function toContextLocationView(location: Location) {
  return { id: location.id, name: location.name, description: location.description, status: location.status,
    features: location.features.filter(feature => !feature.hidden_truth_id).map(({ name, description, state }) => ({ name, description, state })) };
}
export function toContextRuleView(rule: WorldRule) { return { type: rule.type, hardness: rule.hardness }; }
export function toNarratorHiddenTruthView(truth: HiddenTruth) {
  return { id: truth.id, title: truth.title, trueNature: truth.true_nature, trueOwnerId: truth.true_owner_id, trueGoal: truth.true_goal, revealed: truth.revealed };
}
export function toContextInteractionTurn(turn: InteractionTurn) {
  return { speakerType: turn.speakerType, speakerId: turn.speakerId, content: turn.content, epoch: turn.epoch };
}
export function toContextMemoryEpisode(episode: MemoryEpisode) {
  return { episodeType: episode.episodeType, text: episode.text, importance: episode.importance, epoch: episode.epoch,
    locationId: episode.locationId, participantIds: episode.participantIds, entityIds: episode.entityIds };
}
