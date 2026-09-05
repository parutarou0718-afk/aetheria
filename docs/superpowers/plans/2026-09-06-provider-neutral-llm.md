# Provider-Neutral LLM Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove Google/Gemini coupling and route every current LLM call through a single OpenAI-compatible client without changing game-runtime behavior.

**Architecture:** `src/engine/llm/llmClient.ts` becomes the only provider boundary, reading `LLM_PROVIDER`, `LLM_API_KEY`, `LLM_BASE_URL`, and `LLM_MODEL`. JSON-producing callers use `generateJson`; prose-producing callers use `generateText`. DM, NPC, causality, and genesis retain their existing prompts, fallbacks, and proposal/recorder boundaries.

**Tech Stack:** TypeScript, native `fetch`, Vitest, Vite, npm lockfile.

## Global Constraints

- Remove `@google/genai`, `GoogleGenAI`, `GEMINI_API_KEY`, `GEMINI_MODEL`, and Gemini SDK calls from production code and package metadata.
- Support one `OPENAI_COMPATIBLE` configuration; do not add provider-specific branches.
- Keep Proposal, Recorder, Timeline, travel, reset, and genesis-isolation behavior unchanged.
- Normalize failures as `LLM_API_KEY_MISSING`, `LLM_REQUEST_FAILED`, `LLM_TIMEOUT`, or `LLM_INVALID_JSON`.
- End with a passing `npm run verify`.

---

### Task 1: Make the LLM boundary provider-neutral

**Files:**
- Modify: `src/engine/llm/llmClient.ts`
- Create: `tests/llm_client.test.ts`

**Interfaces:**
- Produces: `resolveLlmConfig(): LlmConfig`, `hasLlmApiKey(): boolean`, `generateJson(system, user, options)`, and `generateText(system, user, options)`.
- Consumes: `LLM_PROVIDER`, `LLM_API_KEY`, `LLM_BASE_URL`, and `LLM_MODEL` only.

- [x] Write failing tests for default configuration, OpenAI-compatible JSON parsing, text parsing, missing keys, invalid JSON, HTTP failure, and timeout.
- [x] Run `npm test -- tests/llm_client.test.ts` and confirm the old Gemini-specific implementation fails the new assertions.
- [x] Replace provider aliases and the Gemini SDK path with one Chat Completions request builder. `generateJson` sends `response_format: { type: 'json_object' }`; `generateText` omits it.
- [x] Translate timeout, HTTP, empty-response, and JSON parse failures to documented `LlmError` codes.
- [x] Run `npm test -- tests/llm_client.test.ts` and commit the focused change.

### Task 2: Move runtime callers behind the boundary

**Files:**
- Modify: `src/engine/dmEngine.ts`
- Modify: `src/engine/npcCognition.ts`
- Modify: `src/engine/causality.ts`
- Create: `tests/dm_llm_integration.test.ts`

**Interfaces:**
- Consumes: `generateJson` for DM/NPC structured output and `generateText` for causality prose.
- Preserves: existing fallback narration and existing proposal construction.

- [x] Write a failing DM test that mocks `generateJson` and asserts structured output is passed through the current proposal path; write a failing no-key test that asserts fallback narration.
- [x] Run `npm test -- tests/dm_llm_integration.test.ts` and confirm it fails before migration.
- [x] Remove `GoogleGenAI`, cached SDK clients, SDK request calls, key checks, model literals, and `JSON.parse(response.text)` from all three engines.
- [x] Use `hasLlmApiKey()` to select offline fallbacks; call `generateJson` or `generateText` only inside the existing error-handling boundary.
- [x] Run focused DM tests and existing runtime tests; commit the migration.

### Task 3: Remove Google configuration and dependency

**Files:**
- Modify: `.env.example`
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:**
- Documents: `LLM_PROVIDER=openai-compatible`, `LLM_API_KEY=`, `LLM_BASE_URL=`, and `LLM_MODEL=`.

- [x] Add a failing static scan test that rejects `@google/genai`, `GoogleGenAI`, `GEMINI_API_KEY`, and `GEMINI_MODEL` outside historical documentation.
- [x] Remove `@google/genai` with npm so `package-lock.json` matches the manifest.
- [x] Replace `.env.example` provider-specific entries with the four generic variables and safe placeholder values.
- [x] Run the scan test and `npm ls @google/genai --depth=0`, expecting no installed direct dependency.
- [x] Commit cleanup.

### Task 4: Final regression verification

**Files:**
- Modify only if a test exposes a migration regression.

- [x] Update existing genesis mocks only if the public `llmClient` interfaces require it; preserve their offline deterministic behavior.
- [x] Run `npm run lint`, `npm run audit:direct-writes`, `npm test`, `npm run build`, and `npm run verify`.
- [x] Inspect `git diff --check` and confirm no unrelated runtime architecture changed.
- [x] Commit final test-only corrections, if any.
