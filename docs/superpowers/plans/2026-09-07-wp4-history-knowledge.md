# WP4 History and Observer Knowledge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add deterministic, append-only observer history validation and an observer-scoped NPC knowledge read model without changing authoritative world truth ownership.

**Architecture:** `ObservedHistoryRepository` enforces immutable-id semantics. A read-only `StateFieldDiffProjector` projects resolved proposals into canonical paths and `HistoryValidator` turns conflicts into pipeline rejections before Recorder. `ObserverKnowledgeService` reads only observations; NPC cognition consumes that service and appends explicit dialogue observations to its existing atomic proposal batch.

**Tech Stack:** TypeScript, Zod Proposal v2, sql.js repository, Vitest, Express/Vite existing runtime.

## Global Constraints

- Keep `ObservedHistory` as the only observation/history store; no schema migration or second store.
- Do not use LLM, Recorder, or global mutation inside projector, history validator, or knowledge reader.
- No temporal reconstruction, generic observer propagation, party permissions, or truth-reveal inference.
- Pipeline order is Schema → Authority → Causal → Parameter → WorldRule → Preconditions → History → Recorder.
- A failing history validation rejects the whole batch and must not call Recorder.

---

### Task 1: Immutable observation persistence

**Files:**
- Modify: `src/engine/history/observedHistoryRepository.ts`
- Test: `tests/phase4/observed_history_lock.test.ts`

**Produces:** `saveObservation` treats an exact immutable duplicate as a no-op and rejects any material same-id overwrite.

- [ ] Write an immutable same-id overwrite test and an idempotent retry test.
- [ ] Run `npx vitest run tests/phase4/observed_history_lock.test.ts`; verify the overwrite test fails against the existing SQL upsert.
- [ ] Replace the unrestricted conflict update with repository-level existing-record comparison and an error on material immutable changes.
- [ ] Re-run the focused suite and commit `fix: enforce immutable observed history`.

### Task 2: Canonical state diffs and history conflict validation

**Files:**
- Create: `src/engine/history/stateFieldDiffProjector.ts`
- Modify: `src/engine/history/historyConflictDetector.ts`
- Modify: `src/engine/history/observedHistoryValidator.ts`
- Test: `tests/state_field_diff_projector.test.ts`, `tests/history_conflict_validator.test.ts`

**Produces:** `StateFieldDiffProjector.project(worldId, proposal)` and a history validator that only locks immutable confirmed observations against contradictory earlier resolved diffs.

- [ ] Write tests for MOVE location, HP/MP deltas and setters, gold delta, location status, confirmed/rumor timing semantics, and semantic-effect resolution.
- [ ] Run focused tests and verify missing projector/legacy raw-payload conflict logic fails.
- [ ] Implement repository-read-only canonical projection and conflict matching; unsupported operations return `{ supported: false, diffs: [] }`.
- [ ] Re-run focused suites and commit `feat: project proposal state diffs for history`.

### Task 3: Pipeline history gate

**Files:**
- Modify: `src/engine/proposal/proposalPipeline.ts`
- Test: `tests/proposal_pipeline_history.test.ts`, `tests/proposal_pipeline_parameter_causality.test.ts`

**Produces:** `PROPOSAL_HISTORY_CONFLICT`, HistoryValidator injection, and history evaluation after preconditions but before Recorder.

- [ ] Write pipeline-order and batch-atomicity tests, including a resolved semantic effect observed at a later epoch.
- [ ] Run focused tests and verify history is absent from the pipeline.
- [ ] Add the injectable validator and structured conflict projection to `ProposalPipeline`.
- [ ] Re-run focused suites and commit `feat: validate history conflicts in proposal pipeline`.

### Task 4: Strict ObservationService and observer knowledge reader

**Files:**
- Modify: `src/engine/history/observationService.ts`
- Create: `src/engine/history/observerKnowledgeService.ts`
- Test: `tests/observation_service.test.ts`, `tests/observer_knowledge_service.test.ts`

**Produces:** strict SYSTEM Proposal v2 observations with dot-path values, plus observer/private/public/epoch-aware snapshots.

- [ ] Write observation metadata/dot-path tests and knowledge isolation, public visibility, future filtering, and latest-confirmed tests.
- [ ] Run focused tests and verify legacy observation proposals and missing service behavior fail.
- [ ] Add `createObservationProposal`, safe dot-path reading, and read-only knowledge snapshot projection.
- [ ] Re-run focused suites and commit `feat: add observer knowledge read model`.

### Task 5: NPC prompt and atomic dialogue observations

**Files:**
- Modify: `src/engine/npcCognition.ts`
- Test: `tests/npc_observer_knowledge.test.ts`, `tests/npc_proposal_pipeline.test.ts`, `tests/proposal_runtime_boundary.test.ts`

**Produces:** observer-scoped NPC prompts and one atomic dialogue batch containing narrative memory, relationship, direct observations, and dialogue claim.

- [ ] Write hidden-truth leakage, known-fact, observer-isolation, dialogue-claim, batch-rejection, and reload-persistence tests.
- [ ] Run focused tests and verify the current prompt has no structured observation knowledge and dialogue batch has no observations.
- [ ] Inject `ObserverKnowledgeService` read results into the prompt and append explicit observation proposals to the existing batch.
- [ ] Re-run focused suites and commit `refactor: persist dialogue observations through proposal pipeline`.

### Task 6: Static boundaries, regression, and delivery

**Files:**
- Modify: `tests/proposal_runtime_boundary.test.ts`
- Test: all existing suites

- [ ] Add static checks preventing history/knowledge services from importing AI, Recorder commits, or global mutation, and preventing NPC cognition from accessing hidden truth fields.
- [ ] Run `npm ci`, both audits, lint, direct-write audit, tests, build, verify, and `git diff --check`.
- [ ] Start the production bundle and smoke an existing public endpoint.
- [ ] Commit, push, and confirm GitHub Actions Verify.
