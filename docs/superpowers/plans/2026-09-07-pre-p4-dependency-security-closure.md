# Pre-P4 Dependency Security Closure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove all safely remediable dependency vulnerabilities before WP4 while proving production startup and existing runtime behavior remain intact.

**Architecture:** This is a package-manager-only change. Audit output determines whether vulnerable packages are direct or transitive, then the smallest compatible npm update regenerates the lockfile. Application source is not changed unless an upgraded direct production dependency requires a focused regression test.

**Tech Stack:** npm lockfile v3, Node 22, Vite, Express, sql.js, Vitest.

## Global Constraints

- Do not run `npm audit fix --force`.
- Prefer patch, then minor, then parent/lockfile refresh; avoid major migrations unless required.
- Keep build tooling in `devDependencies` unless `npm start` needs it at runtime.
- Preserve Express, Vite, sql.js, Zod, React, Vitest, and esbuild behavior.
- Do not start WP4 or modify gameplay/runtime architecture.

---

### Task 1: Capture and classify the original audit

**Files:**
- Read: `package.json`
- Read: `package-lock.json`
- Read: npm audit JSON written outside the repository

**Produces:** A per-advisory record of severity, direct/transitive path, affected and fixed versions, scope, and reachability class.

- [ ] **Step 1: Generate original audit evidence**

Run: `npm audit; npm audit --json > $env:TEMP/aetheria-npm-audit.json; npm ls --all`

Expected: npm reports every advisory and the JSON can be parsed without modifying package files.

- [ ] **Step 2: Classify each advisory**

For every JSON `vulnerabilities` entry, trace `via`, `effects`, and `nodes` to a root dependency in `package.json`; classify it as production reachable, production but not currently reachable, development-only, or no practical exposure.

### Task 2: Apply the smallest safe dependency remediation

**Files:**
- Modify: `package.json` only if a direct version range or dependency placement must change
- Modify: `package-lock.json` only through npm commands

**Produces:** Updated direct dependency range(s), if needed, and npm-generated lockfile entries that eliminate safely patchable audit findings.

- [ ] **Step 1: Inspect build-tool placement**

Run: `Get-Content package.json`

Expected: Determine whether `vite`, `@vitejs/plugin-react`, and `@tailwindcss/vite` are build-only and whether runtime externals used by `dist/server.cjs` remain production dependencies.

- [ ] **Step 2: Update only the advisory parent or direct package**

Run the smallest suitable command discovered in Task 1, such as `npm update <parent-package>` or `npm install <direct-package>@<safe-compatible-version>`.

Expected: npm regenerates `package-lock.json`; no manual `resolved` or `integrity` edits occur.

- [ ] **Step 3: Re-audit both installation scopes**

Run: `npm audit; npm audit --omit=dev`

Expected: production HIGH/CRITICAL is zero; retain a documented justification only for remaining advisories without safe compatibility remediation.

### Task 3: Regression, production boot, and delivery

**Files:**
- Modify: only files changed by Task 2, plus a focused regression test only if required by an upgraded direct runtime package

**Produces:** Fresh local verification evidence, production-bundle boot evidence, a committed and pushed closure.

- [ ] **Step 1: Run the project verification suite**

Run: `npm run lint; npm run audit:direct-writes; npm test; npm run build; npm run verify; git diff --check`

Expected: every command exits zero.

- [ ] **Step 2: Smoke-test the production server**

Run: start `npm start` in the background, issue a local request to its available health/config endpoint, and terminate only the process started for this smoke test.

Expected: the server binds successfully and returns a non-error HTTP response without requiring an LLM credential.

- [ ] **Step 3: Commit, push, and confirm remote Verify**

Run: `git add package.json package-lock.json [only actual changed files]; git commit -m "chore: remediate dependency vulnerabilities"; git push origin main`

Expected: GitHub Actions Verify for the pushed SHA completes successfully.
