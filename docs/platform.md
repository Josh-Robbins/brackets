# Brackets Platform

This document describes the framework-level contracts beyond basic syntax.

It exists so Brackets can stay compelling without drifting into framework sprawl.

## 1. Async/Data UX Contract

Brackets supports:

- route-level loading and error state
- request-key loading and error state
- optimistic state updates
- cache fetch, refresh, and invalidate
- prefetch on navigation intent

Current public hooks:

- `:loading="route"`
- `:error="route"`
- `:loading="<request-key>"`
- `:error="<request-key>"`
- `ctx.state.optimistic(...)`
- `ctx.cache.fetch(...)`
- `ctx.cache.refresh(...)`
- `ctx.cache.invalidate(...)`

## 2. Website/SEO/Runtime Contract

Route manifests may define:

- `meta`
- `seo`
- `assets`

The built-in host currently exposes:

- `/sitemap.xml`
- `/feed.xml`
- `/robots.txt`
- `/manifest.webmanifest`
- `/service-worker.js` when present

The root CLI currently supports:

- `info`
- `config show`
- `run app`
- `run app dev`
- `status server`
- `health`
- `run app test`

**Dev stream:** `run app dev` enables the built-in watcher and a dev-only SSE endpoint (`/__brackets/dev-reload`). The browser runtime reconnects when `host.devReload` is true: **edits under `app/`** (and most package files) trigger an **in-place SPA refresh** (current route re-fetched and morphed); changes to **package root `index.html`**, **root config** (`config.yaml` / `config.yml` / `config.json` or `config/brackets.*`), or **core `framework/runtime.js`**, **`framework/datastar.js`**, **`framework/syntax.js`**, **`framework/version.js`** trigger a **full page reload**. You can get the same stream on `run app` by setting `watch.enabled: true` and `watch.reload: true` in `config.yaml` (see [README workflow](../README.md) and [Guide: SPA development](./guide.md#spa-development-run-app-dev)).

## 3. Auth/Session/Security Contract

Brackets supports:

- route-level auth requirements via `auth`
- session access via `ctx.auth`
- CSRF validation on state-changing framework RPC (including `POST /__brackets/rpc`)
- request-size limits
- secure response headers (including COOP, CORP, and Referrer-Policy defaults)

Current route auth shape:

```js
auth: {
  required: true,
  redirectTo: '/login'
}
```

## 4. Local Data Contract

Brackets `.data` modules may use:

- `storage.json(...)`
- `storage.yaml(...)`
- `storage.db(...)`

Current guarantees in the built-in host adapter:

- serialized local file access
- SQLite-backed `.db` access
- adapter cleanup on host shutdown
- encrypted local persistence for JSON and YAML through host-managed keys

Directional architecture:

- `.data` defines the data model and persistence rules
- the runtime or host manages `.json`, `.yaml`, and `.db`
- `.logic` reads and writes through `.data`
- `.view` and `.html` react through Datastar

This keeps the framework file-first while still behaving like a dynamic application framework.

## 4A. Authority Profiles

Brackets should support three clear authority profiles without changing the app model:

- local authority
  desktop-folder or host-adapter mode where `.data` can persist to real local `.json`, `.yaml`, and `.db` files
- browser-local authority
  static-host mode where UI, state, routes, and offline behavior still work, but local storage remains machine-local and untrusted
- shared authority
  remote or installed backend authority through `.api`

This is the intended boundary:

- dynamic UI and app behavior: yes
- local persistence and local database: yes
- offline and local-first workflows: yes
- shared trusted server authority: optional, through `.api`

Security note:

- local or browser-held persistence should not be treated as trusted authority for authentication or authorization decisions
- shared security decisions still belong to a trusted backend or host authority when an app needs them
- encrypted local persistence is an optional host capability, not a replacement for trusted shared authority

## 5. Host Adapter Contract

Brackets is intended to run through multiple hosts with one app contract:

- built-in loopback host
- standard web server
- Tauri
- WebView2

Current public host endpoints:

- `/__brackets/host`
- `/.well-known/brackets-host.json`
- `/.well-known/brackets-app.json`

### 5A. Production-Supported Surface

Current v1 production surface:

- built-in same-origin Brackets host
- ordinary HTTPS web deployment of the same portable folder

Current adapter-contract surface:

- Tauri
- WebView2

Those adapter targets are part of the public contract, but they are not a shipped parity matrix today. They should implement the same route/render/module/host contracts rather than introducing a second Brackets dialect.

### 5B. Host-Native Capability Boundary

Host-native capabilities should stay outside normal `.logic` and `.html` authoring.

Current rule:

- `.data` may expose local authority and host-backed persistence
- `.api` remains the remote/shared-authority path
- host-specific native bridges must be explicit, permissioned, and adapter-owned

That keeps the core app model portable across the built-in host, web deployment, Tauri, and WebView2-style shells.

### 5C. Asset And Module Resolution Rules

Current resolution contract:

- `@app/` resolves from the package entry root
- `@data/` and `@api/` resolve from `app/data/` and `app/api/`
- route dependency declarations normalize `@data/...`, `@api/...`, `@app/data/...`, `@app/api/...`, bare ids, and app-relative module paths to the same canonical module id
- `/.well-known/brackets-app.json` is the source of truth for resolved routes, layouts, and declared module dependencies

The point is to keep route/module identity stable no matter which supported host serves the folder.

## 6. Distribution Contract

Brackets should ship as a portable folder model.

Current contract:

- install-free
- no-build
- file-first
- works in desktop-folder, file-server, and paired-backend modes
- the canonical package includes `framework/`, optional `app/`, root `config.yaml`, and `tests/test.js`

## 7. Tooling Contract

Brackets now provides:

- manifest validation through `page()`
- app verification through `run app test`
- host inspection through `/__brackets/host`
- public host and app contracts through `/.well-known/brackets-host.json` and `/.well-known/brackets-app.json`
- regression tests for syntax, runtime, server, transport, and storage

Validation now reports:

- blocking issues
- accessibility warnings
- i18n/document-language warnings

## 8. No-Build Contract

Every platform feature must respect:

- no mandatory bundler
- no JSX compiler
- no generated frontend artifact required before local use
- browser-native modules
- on-serve transforms only

## 9. File Flow Contract

Brackets upload/download support should stay HTML-first.

Current path:

- uploads use normal forms, `FormData`, and transport helpers
- action helpers expose `ctx.action.formData()` and `ctx.action.files(name?)`
- downloads use backend `Content-Disposition` or static/app files with `?download=...`
- navigation helpers expose `ctx.nav.download(path, filename?)`

## 10. Internationalization Contract

Current simple i18n contract:

- `meta.lang` sets document language
- `meta.dir` sets document direction when needed
- `seo.alternates` defines alternate language URLs
- dictionaries may live in `.json`, `.yaml`, `.data`, or remote `.api`

## 11. Offline Contract

Current no-build offline/PWA contract:

- generated `/manifest.webmanifest`
- optional root `/service-worker.js`
- automatic service worker registration on trustworthy origins when available

A commented template lives at [`framework/example/service-worker.js`](../framework/example/service-worker.js); copy it to your entry root when you want offline support. The runtime only attempts registration on trustworthy origins so the worker stays additive rather than mandatory.

## 11A. Worker Strategy

Current worker strategy:

- Web Workers are optional and non-core
- Service Workers are optional and offline-focused
- native background work is adapter-specific

Brackets should not move routing, template composition, or Datastar-driven reactivity into workers.

## 11B. Observability Contract

Current production-readiness diagnostics:

- framework request ids on RPC/session/render failures
- structured denial logging for RPC/live access checks
- `health`, `status server`, and `/.well-known/*` host/app contracts for runtime inspection

The next layer to deepen is richer tracing and metrics, but the shipped baseline should already make request failures diagnosable.

## 11C. OpenAPI Helper Status

The `.api` helper contract keeps the `http.client(...)`, `http.resource(...)`, and `http.openapi(...)` shape in the docs, but the OpenAPI-aligned operation path is still a documented extension target rather than a completed v1 runtime feature.

That deferral is intentional: Brackets should stay production-ready on the built-in/web-host path without pretending the OpenAPI layer is already finished.

## 12. Remaining Deepening Targets

The next layers to deepen after the current pass are:

- observability and tracing
- environment/config guidance across hosts
- richer auth/backend integration examples

For containerized local and production deployment patterns, read:

- [docker.md](./docker.md)

For the **release gate**, checksum CI behavior, and verification order, see [production-readiness.md](./production-readiness.md). For **native WebView shells** (Tauri, WebView2), see [adapter-contract.md](./adapter-contract.md).
