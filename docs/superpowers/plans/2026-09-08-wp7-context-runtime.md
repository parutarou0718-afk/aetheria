# WP7 Context Runtime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Provide policy-owned, bounded, privacy-safe context packets and durable transcript/episodic memory for DM, NPC, repair, and authoring LLM calls.

**Architecture:** Context assembly is read-only and purpose-governed. Interaction transcripts are a sidecar persistence path; episodic memory is an append-only Recorder proposal so NPC dialogue state and episodic recall remain atomic.

**Tech Stack:** TypeScript, sql.js, Zod, Vitest, existing ProposalPipeline/Recorder.

## Global Constraints

- No AI, mutation, Recorder, Pipeline, Scheduler, or Causality dependency in ContextAssembler/retrieval/rendering.
- Context data is serialized JSON data, never prompt instructions.
- No vectors, embeddings, LLM summarization, deletion, or WP8 work.
- Preserve existing Character.memory as a legacy fallback only.

---

### Task 1: Context model, policy, views, and renderer

**Files:** Create `src/engine/context/contextTypes.ts`, `contextPolicy.ts`, `contextViews.ts`, `contextBudgeter.ts`, `contextRenderer.ts`; test `tests/context_policy_renderer.test.ts`.

- [ ] Define four purpose policies and a versioned ContextPacket with diagnostics.
- [ ] Test mandatory context retention, diagnostics exclusion, and JSON data/injection boundary.
- [ ] Implement deterministic token estimates and structured rendering.

### Task 2: Durable transcripts and episodes

**Files:** Modify `src/engine/persistence/schema.ts`, Recorder schema/working set/prepared commit; create interaction and memory repositories; test persistence and duplicate handling.

- [ ] Add `interaction_turns` and `memory_episodes` tables and indexed append-only repositories.
- [ ] Add `APPEND_MEMORY_EPISODE` SYSTEM operation through Recorder only.
- [ ] Test persistence/reload and duplicate episode rejection.

### Task 3: Retrieval and assembly

**Files:** Create `contextAssembler.ts`, `contextRelevance.ts`, `memoryRetrievalService.ts`; tests privacy, relevance, and 100-item budgets.

- [ ] Retrieve same-observer memory deterministically by entity/location/input, importance, then recency.
- [ ] Assemble DM narrator/private and player knowledge separately; assemble NPC from self, scene, knowledge, own quests, own transcript, and own episodes.
- [ ] Enforce deterministic policy budget without dropping mandatory context.

### Task 4: Runtime migration and atomic NPC episode

**Files:** Modify DM, NPC, repair, authoring; add InteractionLogService and context integration tests.

- [ ] Route all four consumers through ContextAssembler and ContextRenderer.
- [ ] Record DM/NPC exchanges best-effort after responses.
- [ ] Add NPC APPEND_MEMORY_EPISODE into the existing dialogue Pipeline batch.

### Task 5: Verification

- [ ] Run privacy/isolation, context budget, transcript restart, and existing regressions.
- [ ] Run `npm ci`, audits, lint, direct-write audit, test, build, verify, diff check; push and await CI.
