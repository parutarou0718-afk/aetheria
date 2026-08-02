import { WorldProfile } from './worldProfileTypes';
import {
  WorldSnapshot,
  Character,
  Location,
  LocationEdge,
  Organization,
  WorldFact,
  HiddenTruth,
  Seed,
  Event,
} from '../../types';

export interface WorldTemplate {
  profile: WorldProfile;
  snapshot: WorldSnapshot;
  characters: Character[];
  locations: Location[];
  locationEdges: LocationEdge[];
  organizations: Organization[];
  facts: WorldFact[];
  hiddenTruths: HiddenTruth[];
  seeds: Seed[];
  events: Event[];
}
