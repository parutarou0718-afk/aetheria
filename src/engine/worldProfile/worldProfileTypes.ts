export interface NamingConventionProfile {
  personalNames: string;
  placeNames: string;
  organizationNames: string;
  titles: string;
}

export interface WorldTerminology {
  currencyTerms: string[];
  energyTerms: string[];
  professionTerms: string[];
  factionTerms: string[];
  settlementTerms: string[];
  wildernessTerms: string[];
  creatureTerms: string[];
  artifactTerms: string[];
  socialRankTerms: string[];
  conflictTerms: string[];
}

export interface NarrativeStyleProfile {
  narratorRole: string;
  voice: string;
  proseRules: string[];
  prohibitedStylePatterns: string[];
}

export type WorldGenre = 'XIANXIA' | 'STEAM_ARCANUM' | 'CYBERPUNK' | 'WASTELAND' | string;

export interface WorldProfile {
  world_id: string;
  profile_version: number;

  display_name: string;
  short_pitch: string;
  world_description: string;

  genre_labels: string[];
  tone_labels: string[];
  cultural_influences: string[];

  cosmology: string;
  metaphysics: string;

  power_system: string;
  power_costs: string;

  death_rules: string;
  time_rules: string;

  social_structure: string;
  political_structure: string;
  economy_system: string;
  technology_model: string;
  geography_model: string;

  naming_conventions: NamingConventionProfile;
  terminology: WorldTerminology;
  narrative_style: NarrativeStyleProfile;

  allowed_concepts: string[];
  forbidden_concepts: string[];

  starting_scope: 'LOCAL' | 'REGIONAL' | 'CONTINENTAL';

  user_vision: string;
  generation_seed: number;
  generator_version: string;

  created_at_epoch: number;
  updated_at_epoch: number;

  // Optional legacy compatibility fields
  genre?: string;
  genre_version?: number;
  currency_name?: string;
  energy_name?: string;
  narrator_role?: string;
  narration_style?: string;
  geography_style?: string;
  default_player_origin?: string;
  default_player_title?: string;
  profession_lexicon?: string[];
  faction_lexicon?: string[];
  location_lexicon?: string[];
  creature_lexicon?: string[];
  item_lexicon?: string[];
}

export interface GenreViolation {
  concept: string;
  path?: string;
  reason: string;
}

export interface GenreValidationResult {
  valid: boolean;
  violations: GenreViolation[];
}
