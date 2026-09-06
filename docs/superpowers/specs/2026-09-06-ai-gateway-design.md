# Aetheria AI Gateway Design

## Goal

Route every runtime AI operation through a server-owned gateway that applies request context, credit policy, model routing, upstream selection, usage measurement, and ledger recording. Runtime code must not know provider models, upstream IDs, base URLs, or credentials.

## Scope and Constraints

- This is AI infrastructure only; do not change gameplay, Proposal schemas, Recorder, Timeline, World State semantics, or Genesis behavior.
- Do not implement payments, consumer-account rotation, quota evasion, or client-managed provider configuration.
- No SQLite schema or migration is added in this phase.
- In-memory credits and usage records are architecture/test fixtures, not a source of truth for real balances.

## Request Flow

```text
Runtime (DM / NPC / Genesis / Causality)
  -> AIService
  -> CreditService preflight
  -> ModelRouter
  -> UpstreamPool
  -> request-scoped LLM client
  -> OpenAI-compatible upstream
  -> usage measurement
  -> UsageLedger
  -> final credit charge
```

The response flow records provider token usage when supplied, calculates an optional configured cost estimate, charges credits only after a successful request, and returns the generated value to the runtime. A complete upstream failure records `FAILED` with zero charged credits.

## Public AI Contract

`AiRequestContext` always includes `userId`, `worldId`, and a purpose. `SYSTEM_USER` is permitted only as an internal migration placeholder and has unlimited credit. Runtime callers request an internal tier (`STANDARD`, `ADVANCED`, or `DEEP`) rather than a provider model.

`AIService` exposes `generateJson(context, system, user, options)` and `generateText(context, system, user, options)`. It is the only AI business-facing entry point. Stable `AiServiceError` codes cover insufficient credit, no route, unavailable or failed upstream, invalid response, and ledger-write failure.

## Routing and Upstreams

`ModelRouter` deterministically maps `(purpose, tier)` to a model requirement. `UpstreamPool` loads only server-side `AETHERIA_UPSTREAM_<n>_*` deployment variables and selects enabled compatible upstreams by priority, using stable user sharding only as a tie-breaker. Router decisions may override the shard.

An upstream is never returned to an HTTP client, World State, usage record, log, or error. Fallback moves to another compatible enabled upstream only for availability. It is not credential rotation for quota or policy evasion.

## Transport and Secret Isolation

`llmClient` remains the OpenAI-compatible transport, but gains a request-scoped client factory. Each selected upstream creates a client with its own immutable `{ apiKey, baseUrl, model }` configuration. `AIService` never mutates `process.env` to switch credentials. API keys and Authorization headers never appear in results, ledger records, errors, logs, browser bundles, or public config.

## Credits and Usage

`CreditService` is an interface with `InMemoryCreditService` as the initial implementation:

```ts
interface CreditService {
  getBalance(userId: string): Promise<number>;
  canAfford(userId: string, amount: number): Promise<boolean>;
  charge(userId: string, amount: number, usageRecordId: string): Promise<void>;
}
```

`UsageLedger` is likewise interface-backed with an in-memory implementation. Records include user/world/purpose/tier, upstream ID, model, optional token counts/cost/credits, status, and timestamp; they never include prompts or credentials. Both interfaces can later be replaced by SQLite or Postgres implementations without changing Runtime, Router, or AIService calling contracts.

## Migration

DM, NPC Cognition, Causality, World Profile, World Skeleton, and World Entity generation migrate to `AIService` with explicit purposes. Prompts, fallback behavior, Recorder behavior, and generated gameplay semantics remain unchanged.

## Verification

Tests cover secret isolation, priority and compatibility routing, concurrent credential isolation, successful and failed ledger records, no charge on failure, credit insufficiency without upstream execution, and existing DM/Genesis behavior. All tests remain offline; GitHub Actions runs `npm ci` and `npm run verify` without LLM secrets.
