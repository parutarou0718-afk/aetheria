# MVP Runtime Closure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` task-by-task.

**Goal:** Close authoritative NPC writes and introduce the MVP application boundary before World Rules.

**Architecture:** NPC dialogue will emit proposal v2 batches and use `ProposalPipeline`; the application layer will own request context and route only `IN_WORLD_ACTION` to DM. Server routes will create the temporary development context. No WorldRule, Parameter Resolver, repair, quest, account database, or multi-world runtime work is included.

**Tech Stack:** TypeScript, Vitest, Express, Zod, existing ProposalPipeline and Recorder.

## Global Constraints

- Preserve the current single-active-world-per-process MVP model.
- `SYSTEM_USER` is development-only fallback identity.
- No direct NPC memory or relationship mutation outside Recorder.
- Run lint, direct-write audit, tests, build, verify, and diff check before commit.

### Task 1: NPC proposal authority

**Files:** `src/engine/npcCognition.ts`, `tests/npc_proposal_pipeline.test.ts`

- [x] Add failing tests for persisted NPC memory/relationship updates and rejection-without-mutation.
- [x] Change dialogue results into an atomic v2 proposal batch with `SYSTEM` authority and `PLAYER_ACTION` causal basis.
- [x] Verify focused tests.

### Task 2: Application boundary

**Files:** `src/application/gameRequestContext.ts`, `src/application/gameApplicationService.ts`, `tests/game_application_service.test.ts`

- [x] Add failing tests for `IN_WORLD_ACTION` dispatch and explicit unsupported-mode response.
- [x] Define context types and route only in-world actions to DM.
- [x] Verify focused tests.

### Task 3: Context propagation and HTTP migration

**Files:** `src/engine/dmEngine.ts`, `src/engine/npcCognition.ts`, `server.ts`, `tests/*integration*.test.ts`

- [x] Add failing tests proving explicit user/world/actor identity reaches AIService.
- [x] Accept request context in DM/NPC APIs; use a development adapter only at HTTP boundaries.
- [x] Route Web DM and NPC endpoints through `GameApplicationService`.
- [x] Verify focused tests.

### Task 4: Boundary audit and release verification

**Files:** `tests/proposal_runtime_boundary.test.ts`, `scripts/audit-direct-writes.ts`

- [x] Expand static coverage for nested NPC mutations.
- [x] Remove legacy UI commercial mocks (VIP, advertisements, recharge, and art quotas).
- [x] Run full verification and GitHub Actions.
