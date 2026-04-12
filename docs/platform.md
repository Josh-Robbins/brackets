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
- `test app`

## 3. Auth/Session/Security Contract

Brackets supports:

- route-level auth requirements via `auth`
- session access via `ctx.auth`
- CSRF-aware framework requests
- same-origin checks on framework RPC
- request-size limits
- secure response headers
- fetch-metadata-aware same-origin checks on framework RPC

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
- app verification through `test app`
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

## 12. Remaining Deepening Targets

The next layers to deepen after the current pass are:

- observability and tracing
- environment/config guidance across hosts
- richer auth/backend integration examples

For containerized local and production deployment patterns, read:

- [docker.md](./docker.md)
