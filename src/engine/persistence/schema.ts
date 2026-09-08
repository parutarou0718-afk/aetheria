/**
 * Aetheria Persistence Schema Definitions
 */

export const CREATE_TABLES_SQL = `
CREATE TABLE IF NOT EXISTS worlds (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  preset_type TEXT NOT NULL DEFAULT 'default',
  world_creation_state TEXT NOT NULL DEFAULT 'CREATED',
  current_epoch INTEGER NOT NULL DEFAULT 1,
  random_seed INTEGER NOT NULL DEFAULT 12345,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS world_profiles (
  world_id TEXT PRIMARY KEY,

  genre TEXT NOT NULL DEFAULT 'DYNAMIC',
  genre_version INTEGER NOT NULL DEFAULT 1,

  display_name TEXT NOT NULL,
  world_description TEXT NOT NULL,

  cosmology TEXT NOT NULL DEFAULT '',
  power_system TEXT NOT NULL DEFAULT '',
  social_structure TEXT NOT NULL DEFAULT '',
  economy_system TEXT NOT NULL DEFAULT '',
  geography_style TEXT NOT NULL DEFAULT '',

  currency_name TEXT NOT NULL DEFAULT '',
  energy_name TEXT NOT NULL DEFAULT '',

  narrator_role TEXT NOT NULL DEFAULT '',
  narration_style TEXT NOT NULL DEFAULT '',

  profession_lexicon_json TEXT NOT NULL DEFAULT '[]',
  faction_lexicon_json TEXT NOT NULL DEFAULT '[]',
  location_lexicon_json TEXT NOT NULL DEFAULT '[]',
  creature_lexicon_json TEXT NOT NULL DEFAULT '[]',
  item_lexicon_json TEXT NOT NULL DEFAULT '[]',

  allowed_concepts_json TEXT NOT NULL DEFAULT '[]',
  forbidden_concepts_json TEXT NOT NULL DEFAULT '[]',

  default_player_origin TEXT NOT NULL DEFAULT '',
  default_player_title TEXT NOT NULL DEFAULT '',

  created_at_epoch INTEGER NOT NULL DEFAULT 1,
  updated_at_epoch INTEGER NOT NULL DEFAULT 1,

  profile_version INTEGER NOT NULL DEFAULT 1,
  short_pitch TEXT NOT NULL DEFAULT '',
  genre_labels_json TEXT NOT NULL DEFAULT '[]',
  tone_labels_json TEXT NOT NULL DEFAULT '[]',
  cultural_influences_json TEXT NOT NULL DEFAULT '[]',
  metaphysics TEXT NOT NULL DEFAULT '',
  power_costs TEXT NOT NULL DEFAULT '',
  death_rules TEXT NOT NULL DEFAULT '',
  time_rules TEXT NOT NULL DEFAULT '',
  political_structure TEXT NOT NULL DEFAULT '',
  technology_model TEXT NOT NULL DEFAULT '',
  geography_model TEXT NOT NULL DEFAULT '',
  naming_conventions_json TEXT NOT NULL DEFAULT '{}',
  terminology_json TEXT NOT NULL DEFAULT '{}',
  narrative_style_json TEXT NOT NULL DEFAULT '{}',
  starting_scope TEXT NOT NULL DEFAULT 'LOCAL',
  user_vision TEXT NOT NULL DEFAULT '',
  generation_seed INTEGER NOT NULL DEFAULT 0,
  generator_version TEXT NOT NULL DEFAULT 'v1',

  FOREIGN KEY(world_id) REFERENCES worlds(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS world_axioms (
  id TEXT PRIMARY KEY,
  world_id TEXT NOT NULL,
  category TEXT NOT NULL,
  statement TEXT NOT NULL,
  consequences_json TEXT NOT NULL,
  immutable INTEGER NOT NULL DEFAULT 1,
  created_at_epoch INTEGER NOT NULL DEFAULT 1,
  FOREIGN KEY(world_id) REFERENCES worlds(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS characters (
  id TEXT PRIMARY KEY,
  world_id TEXT NOT NULL,
  type TEXT NOT NULL,
  name TEXT NOT NULL,
  title TEXT NOT NULL,
  species TEXT NOT NULL,
  age INTEGER NOT NULL,
  status TEXT NOT NULL,
  presence_state TEXT NOT NULL DEFAULT 'AT_LOCATION',
  current_transaction_id TEXT,
  location_id TEXT,
  goal_json TEXT,
  personality_json TEXT,
  fear_json TEXT,
  attributes_json TEXT,
  skills_json TEXT,
  resources_json TEXT,
  inventory_json TEXT,
  knowledge_json TEXT,
  memory_json TEXT,
  relationships_json TEXT,
  current_action_json TEXT,
  frozen INTEGER NOT NULL DEFAULT 0,
  simulation_level INTEGER NOT NULL DEFAULT 1,
  last_simulated_epoch INTEGER NOT NULL DEFAULT 1,
  created_at_epoch INTEGER NOT NULL DEFAULT 1,
  updated_at_epoch INTEGER NOT NULL DEFAULT 1,
  FOREIGN KEY(world_id) REFERENCES worlds(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS organizations (
  id TEXT PRIMARY KEY,
  world_id TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  description TEXT NOT NULL,
  headquarters_id TEXT,
  territory_ids_json TEXT,
  leader_id TEXT,
  member_ids_json TEXT,
  resources_json TEXT,
  goals_json TEXT,
  projects_json TEXT,
  relationships_json TEXT,
  reputation_json TEXT,
  frozen INTEGER NOT NULL DEFAULT 0,
  simulation_level INTEGER NOT NULL DEFAULT 1,
  last_simulated_epoch INTEGER NOT NULL DEFAULT 1,
  created_at_epoch INTEGER NOT NULL DEFAULT 1,
  updated_at_epoch INTEGER NOT NULL DEFAULT 1,
  FOREIGN KEY(world_id) REFERENCES worlds(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS locations (
  id TEXT PRIMARY KEY,
  world_id TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  parent_id TEXT,
  child_ids_json TEXT,
  connected_to_json TEXT,
  owner_id TEXT,
  owner_type TEXT,
  population INTEGER NOT NULL DEFAULT 0,
  population_trend TEXT NOT NULL DEFAULT 'STABLE',
  economy_json TEXT,
  security_json TEXT,
  active_events_json TEXT,
  features_json TEXT,
  frozen INTEGER NOT NULL DEFAULT 0,
  simulation_level INTEGER NOT NULL DEFAULT 1,
  last_simulated_epoch INTEGER NOT NULL DEFAULT 1,
  created_at_epoch INTEGER NOT NULL DEFAULT 1,
  updated_at_epoch INTEGER NOT NULL DEFAULT 1,
  FOREIGN KEY(world_id) REFERENCES worlds(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS location_edges (
  id TEXT PRIMARY KEY,
  world_id TEXT NOT NULL,
  from_location_id TEXT NOT NULL,
  to_location_id TEXT NOT NULL,
  distance REAL NOT NULL DEFAULT 1.0,
  travel_cost REAL NOT NULL DEFAULT 1.0,
  travel_time_epochs INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'OPEN',
  metadata_json TEXT,
  FOREIGN KEY(world_id) REFERENCES worlds(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS world_facts (
  id TEXT PRIMARY KEY,
  world_id TEXT NOT NULL,
  statement TEXT NOT NULL,
  category TEXT NOT NULL,
  confidence TEXT NOT NULL,
  subject_type TEXT,
  subject_id TEXT,
  source_json TEXT,
  related_entity_ids_json TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  superseded_by TEXT,
  valid_from_epoch INTEGER NOT NULL DEFAULT 1,
  valid_to_epoch INTEGER,
  created_at_epoch INTEGER NOT NULL DEFAULT 1,
  updated_at_epoch INTEGER NOT NULL DEFAULT 1,
  FOREIGN KEY(world_id) REFERENCES worlds(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS hidden_truths (
  id TEXT PRIMARY KEY,
  world_id TEXT NOT NULL,
  title TEXT NOT NULL,
  layer TEXT NOT NULL,
  layer_name TEXT NOT NULL,
  exists_flag INTEGER NOT NULL DEFAULT 1,
  true_nature TEXT NOT NULL,
  true_owner_id TEXT,
  true_goal TEXT,
  revealed INTEGER NOT NULL DEFAULT 0,
  revealed_to_ids_json TEXT,
  locked_at_epoch INTEGER NOT NULL DEFAULT 1,
  immutable_flag INTEGER NOT NULL DEFAULT 1,
  evidence_required_json TEXT,
  evidence_collected_json TEXT,
  FOREIGN KEY(world_id) REFERENCES worlds(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS seeds (
  id TEXT PRIMARY KEY,
  world_id TEXT NOT NULL,
  type TEXT NOT NULL,
  status TEXT NOT NULL,
  visible_layer_json TEXT,
  hidden_truth_json TEXT,
  hidden_truth_id TEXT,
  causality_chain_id TEXT,
  importance INTEGER NOT NULL DEFAULT 1,
  player_opportunity_json TEXT,
  progress REAL NOT NULL DEFAULT 0.0,
  created_at_epoch INTEGER NOT NULL DEFAULT 1,
  updated_at_epoch INTEGER NOT NULL DEFAULT 1,
  FOREIGN KEY(world_id) REFERENCES worlds(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS world_transactions (
  id TEXT PRIMARY KEY,
  world_id TEXT NOT NULL,
  type TEXT NOT NULL,
  status TEXT NOT NULL,
  actor_ids_json TEXT,
  origin_location_id TEXT,
  destination_location_id TEXT,
  route_location_ids_json TEXT,
  start_epoch INTEGER NOT NULL,
  expected_end_epoch INTEGER NOT NULL,
  completed_epoch INTEGER,
  current_checkpoint_index INTEGER NOT NULL DEFAULT 0,
  checkpoints_json TEXT,
  preconditions_json TEXT,
  dependency_ids_json TEXT,
  parent_seed_id TEXT,
  parent_organization_id TEXT,
  result_json TEXT,
  invalidation_reason TEXT,
  created_at_epoch INTEGER NOT NULL DEFAULT 1,
  updated_at_epoch INTEGER NOT NULL DEFAULT 1,
  FOREIGN KEY(world_id) REFERENCES worlds(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS scheduled_checkpoints (
  id TEXT PRIMARY KEY,
  world_id TEXT NOT NULL,
  transaction_id TEXT NOT NULL,
  epoch INTEGER NOT NULL,
  type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING',
  sequence INTEGER NOT NULL DEFAULT 0,
  payload_json TEXT,
  created_at_epoch INTEGER NOT NULL DEFAULT 1,
  processed_at_epoch INTEGER,
  FOREIGN KEY(world_id) REFERENCES worlds(id) ON DELETE CASCADE,
  FOREIGN KEY(transaction_id) REFERENCES world_transactions(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS dependency_edges (
  id TEXT PRIMARY KEY,
  world_id TEXT NOT NULL,
  source_type TEXT NOT NULL,
  source_id TEXT NOT NULL,
  dependency_type TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  expected_condition_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  failure_policy TEXT NOT NULL DEFAULT 'FAIL_SOURCE',
  priority INTEGER NOT NULL DEFAULT 0,
  created_at_epoch INTEGER NOT NULL DEFAULT 1,
  last_evaluated_epoch INTEGER,
  invalidated_at_epoch INTEGER,
  invalidation_reason TEXT,
  metadata_json TEXT,
  FOREIGN KEY(world_id) REFERENCES worlds(id) ON DELETE CASCADE,
  UNIQUE(world_id, source_type, source_id, dependency_type, target_type, target_id)
);

CREATE TABLE IF NOT EXISTS observed_history (
  id TEXT PRIMARY KEY,
  world_id TEXT NOT NULL,
  observer_type TEXT NOT NULL,
  observer_id TEXT NOT NULL,
  subject_type TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  observation_type TEXT NOT NULL,
  observed_epoch INTEGER NOT NULL,
  recorded_epoch INTEGER NOT NULL,
  fact_path TEXT NOT NULL,
  observed_value_json TEXT,
  confidence REAL NOT NULL DEFAULT 1.0,
  source_event_id TEXT,
  source_transaction_id TEXT,
  visibility TEXT NOT NULL DEFAULT 'PRIVATE',
  immutable_history INTEGER NOT NULL DEFAULT 1,
  metadata_json TEXT,
  FOREIGN KEY(world_id) REFERENCES worlds(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS causal_impacts (
  id TEXT PRIMARY KEY,
  world_id TEXT NOT NULL,
  trigger_type TEXT NOT NULL,
  trigger_id TEXT NOT NULL,
  affected_source_type TEXT NOT NULL,
  affected_source_id TEXT NOT NULL,
  dependency_edge_id TEXT,
  impact_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING',
  reason TEXT NOT NULL,
  created_at_epoch INTEGER NOT NULL,
  processed_at_epoch INTEGER,
  proposal_ids_json TEXT,
  metadata_json TEXT,
  FOREIGN KEY(world_id) REFERENCES worlds(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS observed_intervals (
  id TEXT PRIMARY KEY,
  world_id TEXT NOT NULL,
  player_character_id TEXT NOT NULL,
  location_id TEXT NOT NULL,
  from_epoch INTEGER NOT NULL,
  to_epoch INTEGER,
  observation_level TEXT NOT NULL DEFAULT 'DIRECT',
  metadata_json TEXT,
  FOREIGN KEY(world_id) REFERENCES worlds(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS state_change_log (
  id TEXT PRIMARY KEY,
  world_id TEXT NOT NULL,
  epoch INTEGER NOT NULL,
  operation TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  before_json TEXT,
  after_json TEXT,
  source_type TEXT NOT NULL,
  source_id TEXT,
  committed_at TEXT NOT NULL,
  FOREIGN KEY(world_id) REFERENCES worlds(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  world_id TEXT NOT NULL,
  type TEXT NOT NULL,
  description TEXT NOT NULL,
  location_id TEXT,
  involved_entity_ids_json TEXT,
  cause_json TEXT,
  effects_json TEXT,
  epoch INTEGER NOT NULL,
  resolved INTEGER NOT NULL DEFAULT 1,
  resolution_epoch INTEGER NOT NULL,
  created_at_epoch INTEGER NOT NULL,
  FOREIGN KEY(world_id) REFERENCES worlds(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS quests (
  id TEXT PRIMARY KEY,
  world_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL,
  giver_character_id TEXT,
  assignee_character_id TEXT,
  objective_json TEXT NOT NULL,
  dependency_ids_json TEXT NOT NULL DEFAULT '[]',
  created_at_epoch INTEGER NOT NULL,
  accepted_at_epoch INTEGER,
  resolved_at_epoch INTEGER,
  failure_reason TEXT,
  FOREIGN KEY(world_id) REFERENCES worlds(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS interaction_turns (
  id TEXT PRIMARY KEY, world_id TEXT NOT NULL, session_id TEXT NOT NULL,
  conversation_type TEXT NOT NULL, conversation_id TEXT NOT NULL,
  speaker_type TEXT NOT NULL, speaker_id TEXT NOT NULL, counterpart_id TEXT,
  content TEXT NOT NULL, epoch INTEGER NOT NULL, outcome_status TEXT NOT NULL,
  created_at TEXT NOT NULL, FOREIGN KEY(world_id) REFERENCES worlds(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_interaction_turns_conversation ON interaction_turns(world_id, conversation_id, epoch);
CREATE INDEX IF NOT EXISTS idx_interaction_turns_session_epoch ON interaction_turns(world_id, conversation_id, session_id, epoch DESC, created_at DESC);

CREATE TABLE IF NOT EXISTS memory_episodes (
  id TEXT PRIMARY KEY, world_id TEXT NOT NULL, observer_type TEXT NOT NULL, observer_id TEXT NOT NULL,
  episode_type TEXT NOT NULL, text TEXT NOT NULL, importance INTEGER NOT NULL, epoch INTEGER NOT NULL,
  location_id TEXT, participant_ids_json TEXT NOT NULL, entity_ids_json TEXT NOT NULL,
  source_type TEXT NOT NULL, source_id TEXT, created_at TEXT NOT NULL,
  FOREIGN KEY(world_id) REFERENCES worlds(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_memory_episodes_observer_epoch ON memory_episodes(world_id, observer_type, observer_id, epoch);
CREATE INDEX IF NOT EXISTS idx_memory_episodes_observer_location ON memory_episodes(world_id, observer_type, observer_id, location_id);
CREATE INDEX IF NOT EXISTS idx_memory_episodes_importance ON memory_episodes(world_id, observer_type, observer_id, importance DESC, epoch DESC);

CREATE TABLE IF NOT EXISTS npc_autonomy_runs (
  id TEXT PRIMARY KEY,
  world_id TEXT NOT NULL,
  npc_id TEXT NOT NULL,
  epoch INTEGER NOT NULL,
  trigger_reason TEXT NOT NULL,
  status TEXT NOT NULL,
  intent_action TEXT,
  intent_summary TEXT,
  proposal_ids_json TEXT,
  error_code TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(world_id) REFERENCES worlds(id) ON DELETE CASCADE,
  UNIQUE(world_id, npc_id, epoch)
);
CREATE INDEX IF NOT EXISTS idx_npc_autonomy_runs_world_epoch ON npc_autonomy_runs(world_id, epoch DESC);
CREATE INDEX IF NOT EXISTS idx_scheduled_checkpoints_pending ON scheduled_checkpoints(world_id, status, epoch, sequence);
CREATE INDEX IF NOT EXISTS idx_quests_assignee_status ON quests(world_id, assignee_character_id, status);
CREATE INDEX IF NOT EXISTS idx_observed_history_lookup ON observed_history(world_id, observer_type, observer_id, subject_type, subject_id, fact_path, observed_epoch);
CREATE INDEX IF NOT EXISTS idx_state_change_log_entity_epoch ON state_change_log(world_id, entity_type, entity_id, epoch DESC);

CREATE TABLE IF NOT EXISTS scheduler_wake_signals (
  id TEXT PRIMARY KEY,
  world_id TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  reason TEXT NOT NULL,
  signal_epoch INTEGER NOT NULL,
  weight INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(world_id) REFERENCES worlds(id) ON DELETE CASCADE,
  UNIQUE(world_id, entity_id)
);
CREATE INDEX IF NOT EXISTS idx_scheduler_wake_pending ON scheduler_wake_signals(world_id, status, weight, signal_epoch);

CREATE TABLE IF NOT EXISTS player_request_runs (
  id TEXT PRIMARY KEY,
  world_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  request_id TEXT NOT NULL,
  action_key TEXT NOT NULL,
  status TEXT NOT NULL,
  http_status INTEGER,
  response_json TEXT,
  error_code TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(session_id, request_id, action_key)
);
CREATE INDEX IF NOT EXISTS idx_player_request_runs_terminal ON player_request_runs(status, updated_at);
`;
