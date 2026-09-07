# Minimal World Rule Runtime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a deterministic, built-in WorldRule policy layer between Proposal authority validation and Recorder commits.

**Architecture:** A default-derived `WorldRuleRepository` provides seven stable rules per world. An injected, read-only validator evaluates each valid, authorized `ProposalV2`; `ProposalPipeline` rejects the entire batch before preconditions or Recorder when any rule is violated. History immutability remains delegated to the existing Recorder validator.

**Tech Stack:** TypeScript, Vitest, Zod, existing `WorldRepository`, `RoutePlanner`, ProposalPipeline, Recorder.

## Global Constraints

- Do not add a database migration, DSL, expression evaluator, Parameter Resolver, repair loop, history pipeline, payment, user database, or multi-world registry.
- WorldRule code is deterministic and read-only: it must not import AIService, llmClient, Recorder, or global mutable world state.
- Preserve Recorder invariants and atomic batch behavior.
- Pipeline order is Schema → Authority → World Rule → Preconditions → Recorder.

### Task 1: Rule model, catalog, and repository

**Files:** Create `src/engine/constraints/rules/worldRuleTypes.ts`, `worldRuleCatalog.ts`, `worldRuleRepository.ts`; create `tests/world_rule_catalog.test.ts`.

- [x] Write a failing catalog test asserting seven enabled stable rules for an injected world id and a separate SOFT exception fixture.
- [x] Implement `WorldRule`, `RuleHardness`, seven `WorldRuleType` values, default catalog, and an async `WorldRuleRepository` returning derived rules.
- [x] Run `npx vitest run tests/world_rule_catalog.test.ts`.
- [x] Commit `feat: add minimal world rule model`.

### Task 2: Deterministic validator

**Files:** Create `src/engine/constraints/rules/worldRuleValidator.ts`; create `tests/world_rule_validator.test.ts`.

- [x] Write failing tests for missing entity, dead ACTOR move/resource, negative gold, route and location access, immutable fact authority, SOFT exception authority, and no mutation.
- [x] Implement an injected validator using `WorldRepository` through a thin state-reader interface and `RoutePlanner.findRoute` only for route queries.
- [x] Keep `HISTORY_IMMUTABLE` explicitly delegated to Recorder and return no duplicate rule violation for it.
- [x] Run `npx vitest run tests/world_rule_validator.test.ts`.

### Task 3: Pipeline integration and ordering

**Files:** Modify `src/engine/proposal/proposalPipeline.ts`; create `tests/proposal_pipeline_world_rules.test.ts`.

- [x] Write failing tests proving schema/authority failures skip rules, rule failure skips preconditions and Recorder, successful validation commits once, and a mixed batch is atomic.
- [x] Inject the validator into `ProposalPipeline`, add `PROPOSAL_RULE_VIOLATION` with rule metadata, and evaluate rules between authority and preconditions.
- [x] Run `npx vitest run tests/proposal_pipeline_world_rules.test.ts`.
- [x] Commit `feat: enforce world rules in proposal pipeline`.

### Task 4: Runtime wording and boundary regressions

**Files:** Modify `src/engine/dmEngine.ts`, `tests/dm_llm_integration.test.ts`, `tests/proposal_runtime_boundary.test.ts`.

- [x] Add a failing DM test asserting a rule rejection has no state update and returns neutral legal narration.
- [x] Update the prompt to treat ordinary input as in-world actions rather than world-rule authoring; use rule-aware rejection wording without technical codes.
- [x] Add a static boundary assertion that WorldRuleValidator has no AI, Recorder commit, or global mutation dependency.
- [x] Run focused tests and commit `test: cover world rule runtime behavior`.

### Task 5: Release verification

- [ ] Run `npm run lint`, `npm run audit:direct-writes`, `npm test`, `npm run build`, `npm run verify`, and `git diff --check`.
- [ ] Push main and wait for the Verify GitHub Actions run to succeed.
