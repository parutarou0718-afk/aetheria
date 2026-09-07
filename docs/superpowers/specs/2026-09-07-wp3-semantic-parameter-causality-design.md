# WP3 Semantic Parameter and Causal Validation Design

## Decision

WP3 introduces two deterministic policy stages. `CausalBasisValidator` validates only reference integrity, world ownership, and event time. `ParameterResolver` converts the new `APPLY_SEMANTIC_EFFECT` operation into existing numeric Recorder operations using a fixed, server-owned policy. Neither component writes world state, calls Recorder, or calls AI.

## Pipeline

`Schema → Authority → Causal Basis → Parameter Resolution → World Rule → Preconditions → Recorder`.

Resolution occurs before WorldRule so resource rules inspect the authoritative numeric delta. A resolution or causal rejection rejects the whole batch before Recorder.

## Boundaries

The resolver supports only DAMAGE/RECOVERY for HP and RESOURCE_COST/RESOURCE_GAIN for MP and GOLD, each with LIGHT/MEDIUM/HEAVY magnitude. Direct numeric system proposals remain supported. Ordinary DM gameplay emits semantic effects rather than numeric deltas. `APPLY_SEMANTIC_EFFECT` must never reach Recorder.

FACT, EVENT, ENTITY_STATE, and identified RULE bases are verified against repository-backed state. Description-only PLAYER_ACTION and SYSTEM_EVENT bases remain accepted for compatibility. History, repair, generic formulas, causal truth inference, and gameplay-system redesign remain out of scope.

## Compatibility and Debt

Genesis creation values remain unchanged. Travel transaction validation remains owned by TransactionService and RoutePlanner. PLAYER_ACTION/SYSTEM_EVENT basis references are descriptive until those actions are persisted as first-class records.
