# WP6 Minimal Quest Runtime Implementation Plan

**Goal:** Build an authoritative, persistent single-objective quest runtime with deterministic progression and NPC acceptance.

**Architecture:** Quest state is persisted in SQLite and changes only through Quest proposal operations handled by Recorder. Objective evaluation, dependency impact, and world reactions remain deterministic readers/builders that route resulting proposals through ProposalPipeline.

## Tasks

1. Add strict quest types, schema, `quests` migration/repository, operations, authority policy, Recorder state-machine handling, and persistence tests.
2. Add pure objective evaluator and progress service; ensure only SYSTEM completion proposals result from authoritative state.
3. Extend dependency source handling for QUEST, create `WorldReactionService`, and move coordinator propagation through it.
4. Add QuestService, public view/read routes, NPC public context and strict ACCEPT intent with one atomic dialogue batch.
5. Add end-to-end lifecycle, invalidation, reaction, static-boundary, and regression tests; run full verification and CI.

## Constraints

- Single objective only; no rewards, stages, branching, generic AI judge, or editor.
- No direct quest repository mutation from runtime producers.
- No hidden truth internals or raw conditions in NPC prompts/public views.
