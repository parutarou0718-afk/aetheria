# AI Gateway Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Route all runtime AI calls through server-owned, request-scoped routing with in-memory credits and usage metering.

**Architecture:** `AIService` owns request policy and calls a request-scoped OpenAI-compatible client selected by `ModelRouter` and `UpstreamPool`. In-memory implementations of the `CreditService` and `UsageLedger` interfaces isolate temporary account state from game state and can later be replaced without Runtime changes.

**Tech Stack:** TypeScript, Vitest, native `fetch`, Express, environment configuration.

## Global Constraints

- Do not alter gameplay, Recorder, Proposal schema, Timeline, World State, or Genesis semantics.
- Do not add payment integrations, SQLite migrations, client upstream configuration, or secret logging.
- Upstream credentials remain server-only and request-scoped; no `process.env` mutation may select an upstream.
- `SYSTEM_USER` is unlimited; all non-system balances and usage are process-local test fixtures.

---

### Task 1: Make the transport request-scoped

**Files:**
- Modify: `src/engine/llm/llmClient.ts`
- Modify: `tests/llm_client.test.ts`

**Interfaces:**
- Produces `createLlmClient(config: LlmConfig)` returning `generateJson` and `generateText` methods.

- [ ] Write a failing test that creates two clients with separate URLs and keys, invokes both concurrently, and expects each fetch call to use only its own URL and Authorization header.
- [ ] Run `npm test -- tests/llm_client.test.ts` and confirm the client factory is missing.
- [ ] Implement an immutable client factory; keep legacy environment-backed exports as compatibility wrappers only.
- [ ] Re-run `npm test -- tests/llm_client.test.ts` and confirm it passes.

### Task 2: Add server-owned routing and metering abstractions

**Files:**
- Create: `src/engine/ai/aiTypes.ts`
- Create: `src/engine/ai/routing/modelRouter.ts`
- Create: `src/engine/ai/upstream/upstreamTypes.ts`
- Create: `src/engine/ai/upstream/upstreamPool.ts`
- Create: `src/engine/ai/usage/usageTypes.ts`
- Create: `src/engine/ai/usage/usageLedger.ts`
- Create: `src/engine/ai/billing/creditService.ts`
- Create: `src/engine/ai/billing/costModel.ts`
- Test: `tests/ai_gateway.test.ts`

- [ ] Write failing tests for priority/compatible routing, public-record secret omission, `SYSTEM_USER` unlimited credit, and insufficient credits.
- [ ] Run `npm test -- tests/ai_gateway.test.ts` and confirm imports fail.
- [ ] Implement deterministic purpose/tier routing, environment-only pool parsing, in-memory ledger, in-memory credit interface, and optional cost estimator.
- [ ] Re-run `npm test -- tests/ai_gateway.test.ts` and confirm those tests pass.

### Task 3: Implement AIService behavior

**Files:**
- Create: `src/engine/ai/aiService.ts`
- Modify: `tests/ai_gateway.test.ts`

- [ ] Write failing tests for success ledger data, failed upstream record with no charge, no upstream call for insufficient credit, and no credential exposure in results/errors/ledger.
- [ ] Run `npm test -- tests/ai_gateway.test.ts` and confirm the service is missing.
- [ ] Implement preflight, request-scoped client call, token extraction, post-success charge, ledger write, fallback on unavailable upstream, and stable `AiServiceError` codes.
- [ ] Re-run `npm test -- tests/ai_gateway.test.ts` and confirm all gateway tests pass.

### Task 4: Migrate runtime callers

**Files:**
- Modify: `src/engine/dmEngine.ts`
- Modify: `src/engine/npcCognition.ts`
- Modify: `src/engine/causality.ts`
- Modify: `src/engine/worldGeneration/worldProfileGenerator.ts`
- Modify: `src/engine/worldGeneration/worldSkeletonGenerator.ts`
- Modify: `src/engine/worldGeneration/worldEntityGenerator.ts`
- Modify: existing DM, Genesis, NPC, and causality tests

- [ ] Update mocked boundary tests to mock `AIService` and write assertions for each explicit purpose.
- [ ] Run affected test files and confirm they fail against direct transport imports.
- [ ] Replace direct transport calls with `AIService` calls while retaining prompts, timeout options, fallbacks, and existing output handling.
- [ ] Re-run affected tests and confirm existing DM and Genesis integration behavior is unchanged.

### Task 5: Deployment config, static safety, and final verification

**Files:**
- Modify: `.env.example`
- Modify: `tests/provider_neutral_llm_usage.test.ts`

- [ ] Add non-secret upstream variable examples and assert runtime modules no longer import the transport directly.
- [ ] Run the static safety test, then run `npm run lint`, `npm run audit:direct-writes`, `npm test`, `npm run build`, `npm run verify`, and `git diff --check` serially.
