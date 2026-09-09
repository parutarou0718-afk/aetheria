# Aetheria Demo Release 0 — Windows Partner Build Design

## Goal

Package the existing single-player Aetheria vertical slice as a Windows x64 desktop application that a closed partner can launch without Node.js or developer setup. The desktop shell is a host only: all existing Player API, application, runtime, Recorder, and SQL.js boundaries remain intact.

## Architecture

Electron Forge packages a sandboxed renderer and a small Electron main process. Before dynamically importing the existing server bundle, the main process loads a generated, ignored demo credential resource and sets the Aetheria upstream environment contract plus `DATABASE_PATH` under Electron `userData/world-data`. The server starts once on `127.0.0.1` with port `0`, bootstraps fully, serves the packaged Vite output from an explicit path, and returns its selected origin. The renderer loads only that origin.

```
Electron main
  -> desktop environment initialization
  -> dynamic server import
  -> embedded Express server (127.0.0.1, ephemeral port)
  -> existing Player UI / Player HTTP API / Runtime / Recorder
  -> SQL.js database in userData/world-data
```

## Server boundary

`server.ts` gains one reusable `startAetheriaServer(options)` implementation that owns app creation, listen, and bounded persistence shutdown. It accepts a host, port, bootstrap flag, frontend flag, and explicit static directory. The standalone entry uses it for `npm start`; Electron uses it for the local loopback host. Importing the server does not start a listener.

## Desktop shell

The Electron main process uses a single instance lock, opens one `1280×800` window with `nodeIntegration: false`, `contextIsolation: true`, and `sandbox: true`, and denies external navigation and new windows. No preload is included because the renderer needs no desktop capability. Startup failures are written to a local safe log and shown as a non-technical dialog without deleting local data.

## Credentials and build inputs

`.env.demo.local` is an ignored build input and `.env.demo.example` is a placeholder-only committed template. A demo preparation script validates the required `AETHERIA_UPSTREAM_1_*` values, copies the private content into an ignored generated Electron resource, builds the Vite frontend and server bundle, and scans frontend `dist` bytes for the exact key. The renderer cannot access the generated resource, key, upstream id, base URL, or provider configuration.

## Persistence and lifecycle

The desktop database path is `<userData>/world-data/aetheria.db`, set before importing any persistence-derived module. Existing SQL.js lock, backup, recovery, and WP11 bounded shutdown behavior stay authoritative. Electron shutdown awaits the embedded server handle, which closes HTTP then flushes/closes persistence. A second Electron launch focuses the original window and never starts a second runtime.

## Packaging

Electron Forge packages Windows x64 Squirrel installer and ZIP artifacts. Packaging includes production frontend, server bundle, Electron main code, external production dependencies, SQL.js JavaScript/WASM assets, and generated private demo resource; it excludes tests, Git data, local `.env.demo.local`, development sources, and caches. `demo:build` performs preparation and production build; `demo:make` invokes Forge.

## Verification

Targeted tests cover desktop environment preparation, credential isolation, embedded loopback startup and shutdown, desktop-style persistence path, and production player boundary. Full existing verification remains mandatory. The demo build performs its own secret scan. GUI smoke is reported as manual unless a Windows GUI run is actually performed.

## Explicit exclusions

This does not add gameplay, accounts, billing, remote persistence, networking services, update infrastructure, telemetry, macOS/mobile support, or any WP12 work.
