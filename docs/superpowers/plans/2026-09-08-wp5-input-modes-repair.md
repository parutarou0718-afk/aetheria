# WP5 Input Modes and Controlled Repair Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add trusted input mode routing and one bounded DM proposal repair without weakening proposal validation.

**Architecture:** Application runtimes receive a trusted `GameRequestContext`; only the DM runtime reaches ordinary gameplay. A deterministic DM proposal builder creates trusted envelopes for initial and repaired LLM intents, while repair only receives sanitized pipeline feedback.

**Tech Stack:** TypeScript, Zod, Vitest, existing ProposalPipeline and AI Gateway.

## Global Constraints

- Mode, authority, actor, world, epoch, causal basis, and numeric effects are runtime-owned.
- Maximum two DM-related AI calls per action; no repair outside `IN_WORLD_ACTION`.
- No Recorder writes outside ProposalPipeline and no public authoring HTTP endpoint.
- Preserve pipeline atomicity and all WP1-WP4 enforcement.

---

### Task 1: Trusted mode runtimes

**Files:**
- Create: `src/application/metaCommandRuntime.ts`
- Create: `src/application/worldAuthoringRuntime.ts`
- Modify: `src/application/gameApplicationService.ts`
- Test: `tests/game_application_service.test.ts`

- [ ] Write routing tests that expect one mode-specific runtime only.
- [ ] Run the focused test and observe it fail because modes are unimplemented.
- [ ] Implement the discriminated result and runtime mode guards.
- [ ] Run the focused test until it passes.

### Task 2: Narrow authoring and meta boundaries

**Files:**
- Modify: `src/application/worldAuthoringRuntime.ts`
- Modify: `src/application/metaCommandRuntime.ts`
- Test: `tests/world_authoring_runtime.test.ts`
- Test: `tests/meta_command_runtime.test.ts`

- [ ] Write failing tests for AUTHOR envelope ownership, immutable history rejection, unsupported rule edits, and no-mutation meta commands.
- [ ] Implement strict authoring resolution parsing, proposal pipeline submission, and deterministic meta commands.
- [ ] Run focused tests until passing.

### Task 3: Deterministic DM intent builder

**Files:**
- Create: `src/engine/dm/dmResolutionIntent.ts`
- Create: `src/engine/dm/dmProposalBuilder.ts`
- Modify: `src/engine/dmEngine.ts`
- Test: `tests/dm_llm_integration.test.ts`

- [ ] Write failing tests proving forged envelope fields and numeric deltas are ignored.
- [ ] Extract parsing and proposal construction without changing normal DM behavior.
- [ ] Run DM integration tests until passing.

### Task 4: One controlled repair

**Files:**
- Create: `src/engine/dm/dmRepairService.ts`
- Modify: `src/engine/dmEngine.ts`
- Test: `tests/dm_repair.test.ts`

- [ ] Write failing tests for successful one-shot repair, repeated rejection, and non-repairable rejection.
- [ ] Implement sanitization, all-or-nothing eligibility, a single gateway call, and normal post-commit effects only after success.
- [ ] Run repair and DM tests until passing.

### Task 5: Boundary and regression closure

**Files:**
- Modify: relevant static boundary tests
- Test: `tests/*`

- [ ] Add static assertions that repair has no persistence/global-write dependency and HTTP DM remains in-world only.
- [ ] Run the full verification suite, commit cohesive checkpoints, push, and wait for CI.
