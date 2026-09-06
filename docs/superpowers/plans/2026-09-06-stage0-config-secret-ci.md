# Stage 0 Config Secret and CI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent LLM API keys from appearing in HTTP configuration responses and run the existing offline verification suite in GitHub Actions.

**Architecture:** Keep `resolveLlmConfig()` as the internal configuration source. Add a separate public projection without `apiKey`, expose only that projection from a small exported config-route registration boundary, and test it through an actual local HTTP server. The CI workflow invokes the project’s existing `npm run verify` command without secrets.

**Tech Stack:** TypeScript, Express, Vitest, Node HTTP/fetch, GitHub Actions, Node 22.

## Global Constraints

- Do not modify gameplay, recorder, timeline, or Stage 1 functionality.
- Do not log, mask, serialize, or return LLM API keys in HTTP responses.
- Tests and CI must stay offline and require no LLM environment variables.

---

### Task 1: Lock down the HTTP configuration contract

**Files:**
- Modify: `tests/server_config_security.test.ts` (create)
- Modify: `src/engine/llm/llmClient.ts`
- Modify: `server.ts`

**Interfaces:**
- Produces `getPublicLlmConfig(): { provider: 'openai-compatible'; model: string; baseUrl: string; hasApiKey: boolean }`.
- Produces `registerConfigRoutes(app: express.Express): void` for HTTP tests and server startup.

- [ ] **Step 1: Write failing GET and POST HTTP tests**

```ts
expect(response).not.toHaveProperty('apiKey');
expect(JSON.stringify(response)).not.toContain('super-secret-test-key');
```

- [ ] **Step 2: Run the isolated test and verify it fails because the route boundary is unavailable or the response includes `apiKey`**

Run: `npm test -- tests/server_config_security.test.ts`

- [ ] **Step 3: Implement the public configuration projection and register only that projection in GET and POST responses**

```ts
export function getPublicLlmConfig() {
  const config = resolveLlmConfig();
  return { provider: config.provider, model: config.model, baseUrl: config.baseUrl, hasApiKey: hasLlmApiKey() };
}
```

- [ ] **Step 4: Re-run the isolated test and verify it passes**

Run: `npm test -- tests/server_config_security.test.ts`

### Task 2: Add offline remote verification

**Files:**
- Create: `.github/workflows/verify.yml`

- [ ] **Step 1: Add Node 22 workflow for pushes and pull requests targeting `main`**

```yaml
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]
```

- [ ] **Step 2: Configure checkout, setup-node with npm cache, `npm ci`, and `npm run verify` without secrets**

- [ ] **Step 3: Run all required local verification and whitespace checks**

Run: `npm run lint; npm run audit:direct-writes; npm test; npm run build; npm run verify; git diff --check`
