# Proposal Runtime Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Proposal v2 metadata, authority validation, and an atomic pre-Recorder pipeline without changing gameplay semantics.

**Architecture:** Preserve Recorder as the sole state mutation and persistence authority. A ProposalPipeline validates Zod shape, authority policy, and existing Recorder preconditions before a single Recorder commit; any invalid proposal rejects the full batch.

**Tech Stack:** TypeScript, Zod, Vitest.

## Global Constraints

- No WorldRule, constraint, resolver, repair-loop, payment, or gameplay work.
- Legacy proposal producers remain compatible through defaults supplied by `createProposal`.
- Pipeline never mutates `globalWorld`.

### Task 1: Proposal v2 schema and authority types

**Files:** `src/engine/recorder/changeSchemas.ts`, `src/engine/proposal/*`, `tests/proposal_schema.test.ts`, `tests/authority_validator.test.ts`

- [ ] Write failing schema/authority tests for required reason, causal basis, authority, confidence range, and policy ranks.
- [ ] Implement v2 metadata, factory adapter, authority rank/policy/validator.
- [ ] Run both tests until green.

### Task 2: Pipeline shell

**Files:** `src/engine/proposal/proposalPipeline.ts`, `src/engine/proposal/proposalErrors.ts`, `tests/proposal_pipeline.test.ts`

- [ ] Write failing tests proving invalid batches never call Recorder and valid batches call it once.
- [ ] Implement schema and authority preflight, then delegate exactly once to Recorder.
- [ ] Run pipeline tests until green.

### Task 3: Producer migration and verification

- [ ] Route one runtime producer at a time through ProposalPipeline while preserving metadata and semantics.
- [ ] Run full verification and direct-boundary scan.
