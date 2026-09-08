# WP9 NPC Autonomous Action / World Actor Runtime

## Scope and invariants

- Implement only wake-driven, bounded NPC autonomy: one eligible NPC gets at most one decision call and one authoritative action attempt per epoch.
- Keep the LLM at the intent boundary. It can choose only `WAIT`, `SET_ACTIVITY`, or a known one-hop `MOVE`; runtime owns identity, authority, time, routes, proposals, and commits.
- Preserve the existing authoritative path: ProposalPipeline, capability checks, world rules, history, Recorder, timeline, and reactions.
- Do not start WP10 or add combat, dialogue initiation, agent loops, or new dependencies.

## Execution steps

1. Add autonomy types, strict intent schema, eligibility, mobility affordances, and focused tests.
2. Extend context purpose/policy/views so autonomous NPC context is bounded and epistemically isolated.
3. Add the SQLite-backed autonomy-run claim ledger, reset cleanup, and idempotency tests.
4. Add AI-backed decision service, deterministic validation, trusted action builder, and atomic action/memory execution tests.
5. Integrate bounded sequential autonomy after successful scheduler/timeline processing, including reaction handling and failure isolation.
6. Add static boundary tests and run the complete regression/security/CI verification sequence.
