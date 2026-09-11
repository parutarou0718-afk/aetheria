# 🌌 Aetheria — AI-Native Persistent-World Sandbox RPG

**An experiment in letting an LLM-driven system act inside controlled state boundaries.** Aetheria is an AI-native persistent-world sandbox RPG in which an AI Dungeon Master can reason about player actions, but cannot directly mutate the public world state.

Every proposed state change is represented as a `StateChangeProposal` and passes through a single authoritative Recorder. The Recorder validates the batch in an isolated working set, persists it and its state-change log in a SQLite transaction, then publishes it to the runtime cache. If the publish phase fails, the system reloads from persistence rather than leaving partial in-memory state.

## My role and development approach

Aetheria was developed through **controlled agent-assisted development**. I defined the problem of safely translating AI-generated intent into real application state; set the architecture direction and authority boundary; scoped the allowed proposal pipeline; identified validation, transaction, recovery, and idempotency risks; and used checkpointed commits to keep changes reviewable and reversible.

Coding agents implemented bounded tasks. I used focused tests, static direct-write audits, regression checks, observed runtime behavior, and commit review to accept or reject iterations. This repository does not claim that the LLM or the coding agent is trusted to write state directly.

## What this project demonstrates

- **AI integration with controlled execution:** LLM output is treated as a proposal, not an instruction to mutate state.
- **Risk identification and boundary design:** a single Recorder authority, runtime write guards, invariant validation, and state-change logging address direct-write and partial-update risks.
- **Recovery and operational thinking:** the documented runtime includes transaction boundaries, cache reload recovery, request idempotency, and long-session hardening work.
- **Validation-led iteration:** `npm run verify` combines TypeScript checking, direct-write auditing, Vitest, and a production build; the repository also contains dedicated atomicity, rollback, recovery, and boundary tests.
- **Scope discipline:** the project remains an engineering experiment in controlled LLM action inside a game system, not a claim of production-ready autonomous AI.

## Controlled state-change pipeline

```text
LLM / AI Dungeon Master
→ StateChangeProposal
→ isolated Recorder working set and invariant validation
→ SQLite transaction and state_change_log
→ Publish to protected runtime state
→ reload recovery if publishing fails
```

The runtime protects `globalWorld` with write guards. AI-generated decisions and other world changes use `Recorder.commit()` rather than bypassing the authority boundary.

## Engineering evidence

- [Architecture](ARCHITECTURE.md) describes the authoritative Recorder and atomic state-consistency model.
- [Phase 2 closure report](docs/PHASE2_CLOSURE_REPORT.md) records the closure work and verification context.
- [State write audit](docs/STATE_WRITE_AUDIT.md) documents the direct-write audit boundary.
- The commit history records incremental work on proposal pipelines, semantic and causal validation, context isolation, bounded NPC autonomy, durable request idempotency, runtime recovery, and long-session hardening.

## Technology

- React 19, TypeScript, Tailwind CSS, Motion, and Lucide React
- Express and Node.js, bundled with Esbuild
- WASM SQLite / sql.js with transactional persistence
- Provider-neutral, OpenAI-compatible LLM API configuration
- Vite, Vitest, and TypeScript compiler checking

## Verification

```bash
# TypeScript checking, direct-write audit, Vitest, and production build
npm run verify

# Direct state-write scan
npm run audit:direct-writes

# Automated test suite
npx vitest run
```

## Project structure

```text
.
├── server.ts                   # Express server and provider-neutral LLM configuration
├── src/
│   ├── components/             # UI components
│   └── engine/
│       ├── recorder/           # Authoritative Prepare–Persist–Publish Recorder
│       ├── persistence/        # WASM SQLite schema and persistence
│       ├── world/              # WorldRepository and WorldBootstrap
│       └── worldState.ts       # Protected public world state
├── scripts/
│   └── audit-direct-writes.ts  # Direct state-write audit
├── tests/                      # Unit and integration coverage
├── ARCHITECTURE.md
└── docs/
```

## Related portfolio projects

- [Research Workspace](https://github.com/parutarou0718-afk/research-workspace) — a structured AI workflow that turns paper analysis into reviewable research ideas.
- [GymFlow](https://github.com/parutarou0718-afk/GymFlow) — a local-first product case with explicit module and persistence boundaries.
- [PM Agent Skills](https://github.com/parutarou0718-afk/pm-agent-skills) — the reusable Discovery → Scope Reduction → PRD → Plan → Acceptance method behind controlled agent-assisted development.

## License

[MIT License](LICENSE)
