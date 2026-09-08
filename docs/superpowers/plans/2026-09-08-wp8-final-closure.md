# WP8 Final Closure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close actor provenance, semantic-resolution, and travel capability bypasses without starting WP9.

**Architecture:** Capability validation receives pipeline-owned resolution provenance rather than trusting proposal fields. Trusted actor identity remains distinct from mutation targets, while travel initiation reuses the capability snapshot's active-state definition.

**Tech Stack:** TypeScript, Zod, Vitest, sql.js repository fixtures.

## Global Constraints

- Do not alter parameter-policy amounts, Recorder ownership, WP4–WP7 behavior, or start WP9.
- Use ProposalPipeline for authoritative mutations and retain batch atomicity.

### Task 1: Close pipeline actor and semantic-provenance bypasses

**Files:**
- Modify: `src/engine/capability/capabilityTypes.ts`
- Modify: `src/engine/capability/capabilityPolicy.ts`
- Modify: `src/engine/capability/capabilityValidator.ts`
- Modify: `src/engine/proposal/proposalPipeline.ts`
- Test: `tests/capability_runtime.test.ts`

- [ ] Write failing tests for missing actorId, forged numeric semanticEffect, self-only identity edits, composite emptiness, and valid resolved effects.
- [ ] Run `npx vitest run tests/capability_runtime.test.ts` and confirm the required bypasses fail.
- [ ] Add a pipeline-only `originatedFromSemanticResolution` validation input, require actorId for mechanical ACTOR operations, and enforce self-only `UPDATE_CHARACTER` name/title updates.
- [ ] Run the focused capability tests and confirm pass.

### Task 2: Gate travel initiation with the shared active-character definition

**Files:**
- Modify: `src/engine/timeline/transactionService.ts` or its existing validation seam
- Test: `tests/phase3_timeline.test.ts`

- [ ] Write failing INCAPACITATED and MISSING travel-plan tests using a valid route.
- [ ] Run `npx vitest run tests/phase3_timeline.test.ts` and confirm the invalid plans currently proceed.
- [ ] Reuse `CapabilitySnapshotService` in the trusted travel initiation layer and reject non-AVAILABLE actors before transaction/checkpoint mutation.
- [ ] Run the focused timeline tests and confirm pass.

### Task 3: Regressions and closure

**Files:**
- Modify: `tests/semantic_actor_identity.test.ts`
- Modify: `tests/proposal_schema.test.ts`
- Modify: `tests/dm_llm_integration.test.ts` only if repair coverage needs it

- [ ] Verify remote/co-located effects, resource costs, SYSTEM compatibility, repair behavior, and context isolation.
- [ ] Run all verification commands, commit, push, and wait for the exact-head CI Verify workflow.
