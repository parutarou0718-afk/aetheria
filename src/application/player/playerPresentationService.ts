import { globalWorld } from '../../engine/worldState';
import { WorldRepository } from '../../engine/world/worldRepository';
import { QuestRepository } from '../../engine/quest/questRepository';
import { toQuestPublicView } from '../../engine/quest/questPublicView';
import { InteractionRepository } from '../../engine/context/interactionRepository';
import { ObserverKnowledgeService, type KnowledgeEntry } from '../../engine/history/observerKnowledgeService';
import { CapabilitySnapshotService } from '../../engine/capability/capabilitySnapshot';
import type { Character, Location } from '../../types';
import type {
  PlayerBootstrapView, PlayerCharacterView, PlayerConversationTurn, PlayerKnowledgeEntry,
  PlayerKnowledgeJournalView, PlayerLocationView, PlayerNpcView, PlayerTravelOption,
} from './playerTypes';

export interface PlayerPresentationRequest { worldId: string; actorId: string; aiAvailable: boolean; devInspectorAvailable?: boolean; }

/** Read-only player projection. Raw domain records never cross this boundary. */
export class PlayerPresentationService {
  public async getBootstrap(input: PlayerPresentationRequest): Promise<PlayerBootstrapView> {
    const snapshot = globalWorld.snapshot;
    const player = globalWorld.characters.get(input.actorId);
    if (snapshot.world_creation_state !== 'CREATED' || !player || player.type !== 'PC') {
      return { phase: 'NEEDS_GENESIS', aiAvailable: input.aiAvailable, devInspectorAvailable: input.devInspectorAvailable === true };
    }
    const locations = Array.from(globalWorld.locations.values());
    const currentLocation = player.location_id ? globalWorld.locations.get(player.location_id) ?? null : null;
    const edges = player.location_id ? await WorldRepository.getLocationEdgesFrom(input.worldId, player.location_id) : [];
    const accessibleStatuses = new Set(['ACTIVE', 'DAMAGED']);
    const travelOptions: PlayerTravelOption[] = edges
      .filter((edge) => edge.status === 'OPEN')
      .map((edge) => ({ edge, location: globalWorld.locations.get(edge.to_location_id) }))
      .filter((item): item is { edge: typeof edges[number]; location: Location } => Boolean(item.location && accessibleStatuses.has(item.location.status ?? 'ACTIVE')))
      .map(({ edge, location }) => ({ locationId: location.id, name: location.name, estimatedEpochs: Math.max(1, edge.travel_time_epochs || 1) }));
    const knowledge = await new ObserverKnowledgeService().getKnowledgeSnapshot({ worldId: input.worldId, observerType: 'PLAYER', observerId: input.actorId, atEpoch: snapshot.epoch });
    const transactions = await WorldRepository.getTransactionsForActor(input.worldId, input.actorId);
    const activeTravel = transactions.find((transaction) => transaction.type === 'TRAVEL' && transaction.status === 'IN_PROGRESS');
    const destination = activeTravel?.destination_location_id ? globalWorld.locations.get(activeTravel.destination_location_id) : undefined;
    const dmTurns = await InteractionRepository.listRecentTurns(input.worldId, `DM:${input.actorId}`, 50);
    return {
      phase: 'READY', aiAvailable: input.aiAvailable,
      world: { id: snapshot.id, name: snapshot.world_name, description: snapshot.world_description, epoch: snapshot.epoch },
      player: this.projectPlayer(player), currentLocation: currentLocation ? this.projectLocation(currentLocation) : null,
      knownLocations: currentLocation ? [this.projectLocation(currentLocation), ...travelOptions.map((option) => this.projectLocation(globalWorld.locations.get(option.locationId)!))] : [],
      travelOptions,
      visibleNpcs: Array.from(globalWorld.characters.values()).filter((character) => character.type === 'NPC' && character.location_id === player.location_id && character.presence_state === 'AT_LOCATION').map(this.projectNpc),
      activeQuests: (await QuestRepository.listActiveByAssignee(input.worldId, input.actorId)).map(toQuestPublicView),
      knowledge: this.projectKnowledge(knowledge),
      travel: activeTravel && destination ? { status: 'IN_TRANSIT', destinationName: destination.name, expectedEndEpoch: activeTravel.expected_end_epoch, currentEpoch: snapshot.epoch } : null,
      recentDmHistory: dmTurns.map(this.projectTurn),
      devInspectorAvailable: input.devInspectorAvailable === true,
    };
  }

  private projectPlayer(character: Character): PlayerCharacterView {
    const capability = CapabilitySnapshotService.fromCharacter(character);
    return { id: character.id, name: character.name, title: character.title, species: character.species, status: character.status, presenceState: character.presence_state ?? 'AT_LOCATION', currentLocationId: character.location_id,
      attributes: { hp: character.attributes.hp, maxHp: character.attributes.max_hp, mp: character.attributes.mp, maxMp: character.attributes.max_mp }, skills: { ...character.skills }, resources: { gold: character.resources.gold, reputation: character.resources.reputation },
      inventory: character.inventory.map((item) => ({ itemId: item.item_id, name: item.name, quantity: item.quantity, type: item.type })), currentAction: { type: character.current_action.type, description: character.current_action.description, estimatedEndEpoch: character.current_action.estimated_end_epoch }, capability: { actionState: capability.actionState } };
  }
  private projectLocation(location: Location): PlayerLocationView { return { id: location.id, name: location.name, description: location.description, status: location.status ?? 'ACTIVE', visibleFeatures: location.features.filter((feature) => !feature.hidden_truth_id).map(({ name, description, state }) => ({ name, description, state })) }; }
  private projectNpc(character: Character): PlayerNpcView { return { id: character.id, name: character.name, title: character.title, species: character.species, status: character.status, presenceState: character.presence_state ?? 'AT_LOCATION', observableActivityType: character.current_action.type }; }
  private projectTurn(turn: { id: string; speakerType: 'PLAYER' | 'DM' | 'NPC'; content: string; epoch: number }): PlayerConversationTurn { return { id: turn.id, speaker: turn.speakerType, content: turn.content, epoch: turn.epoch }; }
  private projectKnowledge(knowledge: { confirmedFacts: KnowledgeEntry[]; claims: KnowledgeEntry[]; rumors: KnowledgeEntry[]; inferences: KnowledgeEntry[] }): PlayerKnowledgeJournalView {
    const project = (entry: KnowledgeEntry): PlayerKnowledgeEntry => ({ subject: entry.subjectId, statement: typeof entry.value === 'string' ? entry.value : JSON.stringify(entry.value), epistemicStatus: entry.epistemicStatus, confidence: entry.confidence, observedEpoch: entry.observedEpoch });
    return { confirmedFacts: knowledge.confirmedFacts.map(project), claims: knowledge.claims.map(project), rumors: knowledge.rumors.map(project), inferences: knowledge.inferences.map(project) };
  }
}
