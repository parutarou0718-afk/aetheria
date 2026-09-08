# WP11 Long-session Stability & Production Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the single-world SQL.js runtime durable, exclusive, restart-safe, and idempotent without changing authoritative gameplay ownership.

**Architecture:** Persistence first makes a successful DB transaction synonymous with a durable disk replacement. Scoped world and scheduler locks then serialize validation-to-commit work. Persistent sidecars recover conservatively, while bounded retrieval and health state keep a long-running process safe to expose.

**Tech Stack:** TypeScript, SQL.js, Express, Vitest, Node fs/path/AsyncLocalStorage.

## Global Constraints

- Preserve `ProposalPipeline -> Recorder` as the sole authoritative gameplay mutation boundary.
- Keep SQL.js as single-process storage; reject a second process instead of supporting shared access.
- Do not add product, account, billing, commercial-channel, or gameplay features.
- Every behavior change is test-first; run focused regression before the next layer.

---

### Task 1: Durable and exclusive SQL.js persistence

**Files:** `src/engine/persistence/database.ts`, `src/engine/persistence/schema.ts`, `tests/database_hardening.test.ts`.

- [x] Add failing tests for concurrent initialize, outside-operation isolation during a transaction, atomic write failure reload, integrity/backup recovery, migration error handling, and process ownership lock.
- [x] Implement a re-entrant database gate, atomic flush with retained backup, durable reload on failure, integrity validation, strict migration errors, and `initialize/flush/close` lifecycle.
- [x] Run `npx vitest run tests/database_hardening.test.ts --maxWorkers=1` and commit the database layer.

### Task 2: Bootstrap, reset, lifecycle, and world commit locks

**Files:** `src/engine/world/worldBootstrap.ts`, `src/engine/world/worldResetService.ts`, `src/engine/world/*Lock*.ts`, `src/engine/proposal/proposalPipeline.ts`, scheduler files, tests for bootstrap/reset/pipeline/scheduler.

- [ ] Add failing tests for CREATED-world integrity failure, reset durability failure, concurrent conflicting proposal validation, and serialized scheduler ticks.
- [ ] Make bootstrap fail closed, reset persist-before-publish, serialize genesis/reset ownership, proposal validation-to-recorder commit, and scheduler tick bodies.
- [ ] Run focused bootstrap/reset/pipeline/timeline suites and commit the lifecycle layer.

### Task 3: Persist wake signals, request idempotency, and reconcile sidecars

**Files:** scheduler repository/service files, `src/application/player/*`, autonomy repository/reconciliation files, schema, tests.

- [ ] Add failing restart, commit-failure, duplicate request, UNKNOWN, and autonomy recovery/claim-error tests.
- [ ] Add narrowly scoped tables/repositories, at-least-once wake consumption after commit, request claim/replay protocol, startup reconciliation, and bounded sidecar maintenance.
- [ ] Run scheduler, player route, autonomy suites and commit the sidecar layer.

### Task 4: Long-session bounds, health, shutdown, and end-to-end faults

**Files:** context/memory repositories, schema indexes, health service, `server.ts`, bootstrap/startup files, integration/soak tests.

- [ ] Add failing bounded-candidate, health readiness, production developer-gate, restart, cache-failure, and deterministic soak tests.
- [ ] Bound retrieval candidate SQL, add non-duplicative indexes and text limits, gate mutations on health, add safe health endpoints and graceful shutdown.
- [ ] Run targeted long-session/restart/health suites, full `npm ci`, audit, lint, direct-write audit, tests, build, verify, and diff check; push exact HEAD and confirm CI.
