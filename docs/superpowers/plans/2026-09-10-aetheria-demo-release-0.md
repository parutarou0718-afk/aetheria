# Aetheria Demo Release 0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce an Electron Forge Windows x64 partner package that hosts the existing Aetheria runtime locally without changing gameplay or `main`.

**Architecture:** Electron main initializes local data and demo-only server environment before dynamically importing a reusable Express server startup API. The server listens only on loopback and serves the existing built frontend from an explicit packaged path. Forge packages the main process, frontend, server bundle, production dependencies, SQL.js assets, and an ignored generated secret resource.

**Tech Stack:** Electron 44.3.0, Electron Forge 7.11.2, TypeScript, Express, Vite, esbuild, SQL.js, Vitest.

## Global Constraints

- Target only Windows x64; do not begin WP12 or change gameplay/runtime semantics.
- Renderer security is `nodeIntegration: false`, `contextIsolation: true`, `sandbox: true`; no preload unless a scoped API becomes required.
- Desktop server always binds `127.0.0.1` with ephemeral port `0`; never bind LAN interfaces.
- Demo credentials stay out of Git, logs, HTTP responses, Vite assets, renderer state, and tests.
- `DATABASE_PATH` must be set under Electron userData before server/runtime module import.
- Preserve existing `npm run dev`, `npm run build`, `npm start`, and `npm run verify`.

---

### Task 1: Reusable embedded server startup

**Files:**
- Modify: `server.ts`
- Create: `tests/embedded_server.test.ts`

**Consumes:** existing `createApp`, `dbManager`, runtime health, and standalone server behavior.

**Produces:**
```ts
export interface StartAetheriaServerOptions { host?: string; port?: number; bootstrap?: boolean; includeFrontend?: boolean; staticDir?: string; }
export interface AetheriaServerHandle { origin: string; port: number; close(): Promise<void>; }
export async function startAetheriaServer(options?: StartAetheriaServerOptions): Promise<AetheriaServerHandle>;
```

- [ ] **Step 1: Write failing embedded-server tests**

```ts
it('binds an embedded server to loopback on an ephemeral port and closes cleanly', async () => {
  const server = await startAetheriaServer({ host: '127.0.0.1', port: 0, bootstrap: true, includeFrontend: false });
  expect(server.origin).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
  expect((await fetch(`${server.origin}/health/live`)).status).toBe(200);
  await server.close();
});
```

- [ ] **Step 2: Verify RED**

Run: `npx vitest run tests/embedded_server.test.ts --maxWorkers=1`

Expected: compile failure because `startAetheriaServer` is absent.

- [ ] **Step 3: Implement one canonical startup/close path**

```ts
export async function startAetheriaServer(options: StartAetheriaServerOptions = {}): Promise<AetheriaServerHandle> {
  const app = await createApp({ bootstrap: options.bootstrap ?? true, includeFrontend: options.includeFrontend ?? true, staticDir: options.staticDir });
  const server = await new Promise<Server>((resolve, reject) => {
    const listener = app.listen(options.port ?? 3000, options.host ?? '0.0.0.0', () => resolve(listener));
    listener.once('error', reject);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Aetheria server did not expose a TCP address.');
  return { origin: `http://${options.host ?? '0.0.0.0'}:${address.port}`, port: address.port, close: () => closeAetheriaServer(server) };
}
```

Make `createApp` use `options.staticDir ?? path.join(process.cwd(), 'dist')`; move only standalone invocation into the entry guard, using this function.

- [ ] **Step 4: Verify GREEN**

Run: `npx vitest run tests/embedded_server.test.ts --maxWorkers=1`

Expected: PASS with loopback health endpoint reachable and clean close.

- [ ] **Step 5: Commit**

```bash
git add server.ts tests/embedded_server.test.ts
git commit -m "refactor: expose embedded aetheria server startup"
```

### Task 2: Desktop environment and secret-safe build preparation

**Files:**
- Create: `desktop/environment.ts`
- Create: `scripts/prepare-demo-build.ts`
- Create: `.env.demo.example`
- Modify: `.gitignore`, `package.json`
- Create: `tests/desktop_environment.test.ts`

**Consumes:** Electron userData path and existing `AETHERIA_UPSTREAM_1_*` configuration.

**Produces:**
```ts
export function prepareDesktopEnvironment(userDataPath: string, demoConfigPath: string): { databasePath: string; logDirectory: string };
```

- [ ] **Step 1: Write failing environment and build-input tests**

```ts
it('sets a database path below userData and applies private upstream settings', () => {
  const result = prepareDesktopEnvironment(tempUserData, tempDemoConfig);
  expect(result.databasePath).toBe(join(tempUserData, 'world-data', 'aetheria.db'));
  expect(process.env.AETHERIA_UPSTREAM_1_API_KEY).toBe('test-secret');
});
it('rejects a missing private demo key', () => expect(() => validateDemoConfig(missingConfig)).toThrow('AETHERIA_UPSTREAM_1_API_KEY'));
```

- [ ] **Step 2: Verify RED**

Run: `npx vitest run tests/desktop_environment.test.ts --maxWorkers=1`

Expected: module missing.

- [ ] **Step 3: Implement private configuration preparation**

Implement a line-based dotenv parser using `dotenv.config({ path, override: true })`, require id/base URL/API key/models/enabled/priority, create `<userData>/world-data` and `<userData>/logs`, set `DATABASE_PATH`, and never return or log secret values. `prepare-demo-build.ts` must load `.env.demo.local`, generate ignored `desktop/generated/demo-env.json`, build `dist`, scan every `dist` file for the exact key, and fail if found.

Add `.env.demo.local`, `.env.*.local`, `desktop/generated/`, `out/`, and `make/` to `.gitignore`; keep `.env.demo.example` unignored with placeholder values.

- [ ] **Step 4: Verify GREEN**

Run: `npx vitest run tests/desktop_environment.test.ts --maxWorkers=1`

Expected: PASS; key appears only in generated private resource.

- [ ] **Step 5: Commit**

```bash
git add desktop/environment.ts scripts/prepare-demo-build.ts .env.demo.example .gitignore package.json tests/desktop_environment.test.ts
git commit -m "feat: prepare private desktop demo environment"
```

### Task 3: Hardened Electron main process

**Files:**
- Create: `desktop/main.ts`
- Create: `desktop/logging.ts`
- Create: `tests/desktop_main_policy.test.ts`

**Consumes:** `prepareDesktopEnvironment`, generated private resource, and `startAetheriaServer`.

**Produces:** a one-instance Electron host which dynamically imports the server only after environment setup.

- [ ] **Step 1: Write failing policy tests**

```ts
it('uses a sandboxed BrowserWindow and only permits its local origin', () => {
  expect(createWindowOptions().webPreferences).toMatchObject({ nodeIntegration: false, contextIsolation: true, sandbox: true });
  expect(isAllowedNavigation('http://127.0.0.1:49152/')).toBe(true);
  expect(isAllowedNavigation('https://example.test/')).toBe(false);
});
```

- [ ] **Step 2: Verify RED**

Run: `npx vitest run tests/desktop_main_policy.test.ts --maxWorkers=1`

Expected: import failure because desktop main policy exports are absent.

- [ ] **Step 3: Implement Electron lifecycle**

Use `app.requestSingleInstanceLock()`, focus the current window on `second-instance`, set `AETHERIA_DEV_INSPECTOR=false`, invoke `prepareDesktopEnvironment(app.getPath('userData'), resourceConfigPath)`, dynamically import server only afterward, and load the returned loopback origin only after bootstrap. Use `setWindowOpenHandler(() => ({ action: 'deny' }))`, deny non-origin navigation, log only safe diagnostic data, and on startup failure show `dialog.showErrorBox('Aetheria could not start', 'Your local world data has not been reset. Please contact the demo owner.')`.

- [ ] **Step 4: Verify GREEN**

Run: `npx vitest run tests/desktop_main_policy.test.ts --maxWorkers=1`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add desktop/main.ts desktop/logging.ts tests/desktop_main_policy.test.ts
git commit -m "feat: add secure electron desktop host"
```

### Task 4: Forge packaging and artifact verification

**Files:**
- Create: `forge.config.ts`
- Modify: `package.json`, `tsconfig.json`
- Create: `scripts/verify-demo-artifact.ts`
- Create: `tests/demo_build_security.test.ts`

**Consumes:** built frontend/server, `desktop/main.ts`, generated private resource, and Forge makers.

**Produces:** `npm run demo:build` and `npm run demo:make` for Windows x64 Squirrel and ZIP artifacts.

- [ ] **Step 1: Write failing packaging tests**

```ts
it('rejects a frontend build containing the exact demo key', () => {
  expect(() => assertNoDemoSecretInFrontend(distDirectory, 'test-secret')).toThrow('Demo credential leaked into frontend asset');
});
it('declares x64 Squirrel and ZIP makers', () => {
  expect(readForgeConfig()).toContain('@electron-forge/maker-squirrel');
  expect(readForgeConfig()).toContain('@electron-forge/maker-zip');
});
```

- [ ] **Step 2: Verify RED**

Run: `npx vitest run tests/demo_build_security.test.ts --maxWorkers=1`

Expected: missing artifact verifier/configuration.

- [ ] **Step 3: Implement packaging**

Install Electron 44.3.0 and Forge 7.11.2 maker packages. Configure `packagerConfig.asar`, unpack SQL.js native/WASM runtime assets if required, include `dist`, server bundle, generated secret resource, and runtime dependencies through `extraResource`. Exclude tests, source Git data, local demo env, and caches. Define `demo:build` as preparation plus production build and `demo:make` as build plus `electron-forge make --platform=win32 --arch=x64`. `verify-demo-artifact.ts` must assert generated artifact paths exist and SQL.js JS/WASM files are present in package staging.

- [ ] **Step 4: Verify GREEN**

Run: `npx vitest run tests/demo_build_security.test.ts --maxWorkers=1`

Expected: PASS; secret scanner catches only deliberate fixture leak.

- [ ] **Step 5: Commit**

```bash
git add forge.config.ts package.json package-lock.json tsconfig.json scripts/verify-demo-artifact.ts tests/demo_build_security.test.ts
git commit -m "feat: package windows partner demo with forge"
```

### Task 5: End-to-end verification and release evidence

**Files:**
- Modify: `README.md`
- Create: `docs/demo-release-0-manual-smoke.md`

**Consumes:** all desktop build commands and full existing verification.

**Produces:** partner build instructions, artifact paths, and an honest GUI smoke checklist.

- [ ] **Step 1: Write documentation assertions**

```ts
it('documents the no-Node partner launch path and manual smoke steps', () => {
  expect(readFileSync('docs/demo-release-0-manual-smoke.md', 'utf8')).toContain('create world');
  expect(readFileSync('README.md', 'utf8')).toContain('npm run demo:make');
});
```

- [ ] **Step 2: Verify RED**

Run: `npx vitest run tests/demo_build_security.test.ts --maxWorkers=1`

Expected: missing release documentation.

- [ ] **Step 3: Document and run release checks**

Document `.env.demo.local` placement, artifact delivery, revocable-key warning, and the required create/DM/NPC/travel/time/relaunch/reset manual smoke sequence. Run `npm ci`, both audits, lint, direct-write audit, tests, build, verify, `git diff --check`, `npm run demo:build`, and `npm run demo:make`. If GUI cannot be launched, record that as manual-not-run rather than passed.

- [ ] **Step 4: Verify GREEN and commit**

Run: `npx vitest run tests/demo_build_security.test.ts --maxWorkers=1`

Expected: PASS.

```bash
git add README.md docs/demo-release-0-manual-smoke.md tests/demo_build_security.test.ts
git commit -m "docs: add windows demo partner release guide"
```

## Plan self-review

- Server startup, loopback binding, explicit static path, and shutdown are Task 1.
- Local DB location, private demo config, secret scan, and ignore safety are Task 2.
- single-instance Electron security, startup errors, safe logging, and navigation protection are Task 3.
- Forge x64 installer/ZIP, package contents, scripts, and SQL.js checks are Task 4.
- release documentation, manual smoke honesty, and mandatory full verification are Task 5.
- The plan adds no gameplay, cloud service, account, or WP12 work.
