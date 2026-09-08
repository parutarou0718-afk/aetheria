# WP10 Playable Experience Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the browser's raw world inspector loop with a safe, persistent, playable player experience.

**Architecture:** A server-side player presentation layer projects only player-authorized views from authoritative state. Player mutation routes build server-owned request contexts and delegate to existing application, timeline, scheduler, and genesis services. The React application consumes only typed player DTOs and is separated from the optional developer inspector.

**Tech Stack:** TypeScript, Express, Zod, React 19, Vitest, sql.js.

## Global Constraints

- Implement WP10 only; do not start WP11 or alter WP1–WP9 runtime semantics.
- Never return raw `Character`, `HiddenTruth`, seed hidden state, internal memory/history, autonomy run, transaction, provider, or admin data to player routes.
- Player identity, actor identity, authority, world id, proposals, and route constraints are server-owned.
- Travel is limited to a currently-valid direct open edge and reuses Timeline transactions/checkpoints.
- Presentation services are read-only; mutations go through application/runtime services.
- Add tests first for each new external behavior and retain batch/recorder ownership.

---

### Task 1: Player-safe presentation model and projection

**Files:**
- Create: `src/application/player/playerTypes.ts`
- Create: `src/application/player/playerPresentationService.ts`
- Create: `src/application/player/playerHistoryService.ts`
- Test: `tests/player_presentation.test.ts`

- [ ] Write failing projection/privacy tests for READY/NEEDS_GENESIS, self state, visible NPCs, known direct routes, active quests, knowledge, and serialized secret exclusion.
- [ ] Implement typed DTOs and a read-only projector backed by repository/state reads.
- [ ] Run `npx vitest run tests/player_presentation.test.ts` and commit `feat: add player-safe presentation boundary`.

### Task 2: Player actions and safe HTTP routes

**Files:**
- Create: `src/application/player/playerMobilityService.ts`
- Create: `src/application/player/playerTimeService.ts`
- Create: `src/server/routes/playerRoutes.ts`
- Modify: `server.ts`
- Test: `tests/player_routes.test.ts`

- [ ] Write failing integration tests for server-owned identity, dialogue eligibility/history scope, profile strictness, constrained travel, one-epoch advance, reset/genesis privacy, and safe errors.
- [ ] Implement player route registration and request context/session sanitation; keep legacy/admin routes outside the player tree.
- [ ] Run focused tests and commit `feat: add player interaction application routes`.

### Task 3: Player API client and lifecycle shell

**Files:**
- Create: `src/client/playerApi.ts`
- Create: `src/components/player/PlayerGameShell.tsx`
- Create: `src/components/player/PlayerWorldGenesis.tsx`
- Modify: `src/App.tsx`
- Test: `tests/player_client_boundary.test.ts`

- [ ] Write failing compile/static tests proving client components import presentation DTOs rather than raw domain types.
- [ ] Implement typed API/error mapping, a session id, BOOTING/NEEDS_GENESIS/READY/ERROR states, refresh generation protection, and serial mutation handling.
- [ ] Run focused tests and commit `refactor: migrate web client to player bootstrap`.

### Task 4: Player-facing panels and persistent conversations

**Files:**
- Create: `src/components/player/PlayerCharacterCard.tsx`
- Create: `src/components/player/PlayerLocationPanel.tsx`
- Create: `src/components/player/PlayerTravelPanel.tsx`
- Create: `src/components/player/PlayerNpcList.tsx`
- Create: `src/components/player/PlayerNpcDialogueModal.tsx`
- Create: `src/components/player/PlayerDmConsole.tsx`
- Create: `src/components/player/PlayerQuestJournal.tsx`
- Create: `src/components/player/PlayerKnowledgeJournal.tsx`
- Test: `tests/player_play_loop.test.ts`

- [ ] Write failing route/service tests for DM and NPC transcript continuity/isolation, safe dialogue reply, quest refresh, travel state/arrival, and visible NPC autonomy result.
- [ ] Implement UI components using only DTO props and player API calls; no dice result panel or hard-coded world actions/locations.
- [ ] Run focused tests and commit `feat: integrate persistent dialogue quests and travel ui`.

### Task 5: Developer separation and closure tests

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/server/routes/playerRoutes.ts`
- Test: `tests/player_presentation.test.ts`
- Test: `tests/player_routes.test.ts`
- Test: `tests/player_static_boundary.test.ts`

- [ ] Write failing tests that normal bootstrap/startup never fetches or returns truths, seeds, stats, internal NPC state, or raw domain records.
- [ ] Retain existing inspector in an explicit lazy developer-only tree, conditional on server-owned config.
- [ ] Run full required verification, commit the final test/security closure, push exact HEAD, and confirm CI.
