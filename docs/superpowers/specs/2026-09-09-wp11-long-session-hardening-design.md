# WP11 Long-session Stability & Production Hardening Design

## Goal

Make the existing single-process, single-world SQL.js runtime fail closed: an acknowledged authoritative mutation is durable, concurrent work cannot validate stale state, and restart/fault paths neither duplicate nor silently discard work.

## Design

WP11 keeps `ProposalPipeline -> Recorder` as the only authoritative world-mutation path. Hardening services only coordinate persistence, locks, readiness, and explicitly scoped sidecars.

1. **Durable database foundation.** `DatabaseManager` owns one re-entrant exclusive gate, an atomic same-directory flush (`temp -> fsync -> rename`), backup/integrity recovery, process ownership lock, and explicit `initialize/flush/close` lifecycle. A persistence error reloads the last durable database and throws a sanitized durability error.
2. **World lifecycle and mutation coordination.** Bootstrap validates a persisted CREATED world rather than replacing it. Reset persists its target inside one transaction before publishing cache state. World lifecycle and proposal validation-to-commit each have scoped locks; scheduler ticks serialize per world.
3. **Durable sidecars.** Wake signals and player request runs receive narrow repositories and migrations. Wake delivery is at-least-once and request replay is persistent, never auto-replaying an unknown outcome. Autonomy runs are reconciled only from authoritative action-memory evidence.
4. **Long-session and operations boundary.** Query candidate pools are bounded and indexed without deleting canonical history. Runtime health gates new mutations after cache desynchronization; safe live/ready endpoints, production developer-gate fail-closed behavior, graceful shutdown, restart/fault and deterministic soak coverage complete the package.

## Non-goals

No multi-process database sharing, cloud database, authentication, billing, new gameplay, combat, commercial channels, or WP12 work. SQL.js remains explicitly single-process storage.

## Acceptance

The WP11 closure matrix in the supplied specification is covered by focused tests plus full project verification and exact-head GitHub Actions Verify.
