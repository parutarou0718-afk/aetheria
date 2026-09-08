import type { QuestPublicView } from '../../engine/quest/questPublicView';

export type PlayerBootstrapPhase = 'NEEDS_GENESIS' | 'READY';

export interface PlayerCharacterView {
  id: string;
  name: string;
  title: string;
  species: string;
  status: string;
  presenceState: string;
  currentLocationId: string | null;
  attributes: { hp: number; maxHp: number; mp: number; maxMp: number };
  skills: Record<string, number>;
  resources: { gold: number; reputation: number };
  inventory: Array<{ itemId: string; name: string; quantity: number; type: string }>;
  currentAction: { type: string; description: string; estimatedEndEpoch: number };
  capability: { actionState: string };
}

export interface PlayerLocationView {
  id: string;
  name: string;
  description: string;
  status: string;
  visibleFeatures: Array<{ name: string; description: string; state: string }>;
}

export interface PlayerNpcView {
  id: string;
  name: string;
  title: string;
  species: string;
  status: string;
  presenceState: string;
  observableActivityType: string;
}

export interface PlayerTravelOption { locationId: string; name: string; estimatedEpochs: number; }
export interface PlayerTravelState { status: 'IN_TRANSIT'; destinationName: string; expectedEndEpoch: number; currentEpoch: number; }
export interface PlayerConversationTurn { id: string; speaker: 'PLAYER' | 'DM' | 'NPC'; content: string; epoch: number; }
export interface PlayerKnowledgeEntry { subject: string; statement: string; epistemicStatus: string; confidence?: number; observedEpoch?: number; }
export interface PlayerKnowledgeJournalView { confirmedFacts: PlayerKnowledgeEntry[]; claims: PlayerKnowledgeEntry[]; rumors: PlayerKnowledgeEntry[]; inferences: PlayerKnowledgeEntry[]; }
export interface PlayerWorldView { id: string; name: string; description: string; epoch: number; }

export interface PlayerBootstrapReadyView {
  phase: 'READY';
  aiAvailable: boolean;
  world: PlayerWorldView;
  player: PlayerCharacterView;
  currentLocation: PlayerLocationView | null;
  knownLocations: PlayerLocationView[];
  travelOptions: PlayerTravelOption[];
  visibleNpcs: PlayerNpcView[];
  activeQuests: QuestPublicView[];
  knowledge: PlayerKnowledgeJournalView;
  travel: PlayerTravelState | null;
  recentDmHistory: PlayerConversationTurn[];
  devInspectorAvailable: boolean;
}

export interface PlayerBootstrapNeedsGenesisView { phase: 'NEEDS_GENESIS'; aiAvailable: boolean; devInspectorAvailable: boolean; }
export type PlayerBootstrapView = PlayerBootstrapReadyView | PlayerBootstrapNeedsGenesisView;
