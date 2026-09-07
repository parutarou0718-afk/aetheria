# WP3 Semantic Parameter and Causal Validation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent ordinary AI gameplay from authoring authoritative numeric values and validate minimal causal references before commit.

**Architecture:** Add injected, read-only causal and parameter policy components to ProposalPipeline. Semantic effects resolve to existing Recorder operations before WorldRule evaluation. DM emits only semantic effects for HP/MP/GOLD gameplay changes.

**Tech Stack:** TypeScript, Zod, Vitest, existing WorldRepository/WorldRuleRepository/ProposalPipeline.

## Global Constraints

- No DSL, parameter formulas, combat engine, causal graph, AI judge, repair loop, History integration, Quest, Input Mode, billing, or multi-world work.
- Resolver and causal validator are deterministic and read-only; they do not import AIService, llmClient, Recorder, DMEngine, or mutable global state.
- Keep direct deterministic SYSTEM numeric proposals and Recorder invariants intact.

### Task 1: Semantic parameter model and resolver

**Files:** Create `src/engine/constraints/parameters/parameterTypes.ts`, `parameterPolicy.ts`, `parameterResolver.ts`; modify `src/engine/recorder/changeSchemas.ts`; create `tests/parameter_resolver.test.ts`.

- [ ] Write failing resolver tests for all supported effects, invalid combinations, purity, and unresolved-operation rejection.
- [ ] Add `APPLY_SEMANTIC_EFFECT`, semantic Zod compatibility, fixed policy, and a pure resolver producing `UPDATE_CHARACTER_ATTRIBUTES` or `CHANGE_RESOURCE`.
- [ ] Run resolver tests and commit `feat: add semantic parameter resolver`.

### Task 2: Minimal causal-basis validator

**Files:** Create `src/engine/constraints/causality/causalBasisTypes.ts`, `causalBasisStateReader.ts`, `causalBasisValidator.ts`; create `tests/causal_basis_validator.test.ts`.

- [ ] Write failing tests for FACT, EVENT time, ENTITY_STATE, RULE, and descriptive bases.
- [ ] Implement injected repository readers and structured causal rejections.
- [ ] Run causal tests and commit `feat: validate proposal causal basis`.

### Task 3: Pipeline integration

**Files:** Modify `src/engine/proposal/proposalPipeline.ts`; modify/add `tests/proposal_pipeline_world_rules.test.ts` and `tests/proposal_pipeline_parameter_causality.test.ts`.

- [ ] Write failing order, resolved-proposal, atomicity, and heavy-GOLD WorldRule integration tests.
- [ ] Inject causal/resolver stages and enforce Schema → Authority → Causal → Parameter → Rule → Preconditions → Recorder.
- [ ] Run focused tests and commit `refactor: resolve semantic effects in proposal pipeline`.

### Task 4: DM semantic-effect migration and boundaries

**Files:** Modify `src/engine/dmEngine.ts`, DM tests, `tests/proposal_runtime_boundary.test.ts`, and `docs/TECHNICAL_DEBT.md`.

- [ ] Write failing DM test proving MEDIUM DAMAGE produces policy HP delta rather than an LLM number.
- [ ] Replace DM numeric response fields with semantic effects and preserve zero-effect behavior.
- [ ] Add static boundaries and Genesis/decriptive-basis debt entries; run focused tests and commit `refactor: move dm numeric effects to semantic effects`.

### Task 5: Release verification

- [ ] Run lint, direct-write audit, full tests, build, verify, diff check, push, and wait for GitHub Actions Verify success.
