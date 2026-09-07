# WP5 Input Modes and Controlled Repair Design

## Goal

Make the application context the sole authority for game input mode, add the
smallest useful authoring and read-only meta runtimes, and allow one safe DM
proposal repair after a limited set of deterministic pipeline rejections.

## Boundaries

- `GameApplicationService` is the trusted mode router. Natural-language input
  and LLM output never select a mode.
- `IN_WORLD_ACTION` uses the existing DM runtime and produces ACTOR proposals;
  trusted transaction execution remains SYSTEM.
- `WORLD_AUTHORING` uses a narrow, allowlisted `AuthoringResolution`; the
  runtime creates the complete AUTHOR proposal envelope.
- `META_COMMAND` is deterministic and read-only.
- A repair LLM returns only a sanitized `DmResolutionIntent`. The same
  deterministic builder creates both first-pass and repaired proposals.
- There is exactly one repair call, only for all-repairable DM action
  rejections. Recorder, world rules, history, and runtime authority are never
  bypassed.

## Non-goals

No public authoring HTTP route, editable world rules, generic producer repair,
history redesign, quest runtime, NPC autonomy, or gameplay rule redesign.

## Design decisions

`DmProposalBuilder` owns trusted ACTOR/SYSTEM proposal envelopes and preserves
the runtime-owned actor id. `DmRepairService` owns only feedback sanitization,
eligibility, and the repair LLM request; it has no Recorder or repository
write dependency. Failed first attempts run no post-commit effects.
