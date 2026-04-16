<!-- Interacts with: docs/checklist.md, docs/platform.md, docs/reference.md, docs/index.md -->

# Host adapter contract (Tauri, WebView2, and similar)

This document consolidates expectations for **native shells** that host the same Brackets app model as the built-in Deno loopback host or a normal HTTPS site. It is **normative for integration design** but **not** a promise of shipped parity: Brackets CI gates the **built-in / web-shaped** path only.

## Goals

- One authoring model (`.view`, `.html`, `.logic`, `.data`, `.api`, storage files, import maps).
- Adapters implement **transport and capability**, not a fork of the Brackets language.
- Native-only features surface through **explicit, permissioned** bridges—not ambient access from `.logic`.

## Shared requirements (all adapters)

1. **Origin and same-origin loading**  
   The WebView must load the app from a **real HTTP(S) origin** (or the adapter’s documented secure equivalent) so same-origin rules, cookies, `import`, and the Brackets contracts behave like the built-in host. `file://` as the primary app origin is out of scope.

2. **Contracts**  
   The adapter (or a sidecar) must serve or proxy:

   - `/.well-known/brackets-host.json`
   - `/.well-known/brackets-app.json`
   - Module and static resolution consistent with [`platform.md`](./platform.md) (import maps, `/app/`, `/framework/`).

3. **Security**  
   CSRF, session cookies, and RPC same-origin rules are part of the framework contract when using `POST /__brackets/rpc`. Adapters must not strip security headers or inject alternate origins in a way that weakens those checks.

4. **Storage authority**  
   Local file-backed `.json` / `.yaml` / `.db` and encrypted storage are **host-mediated** in the built-in adapter. Native hosts must either run a compatible local server or document how persistence maps (and what is **not** portable).

## Tauri-specific notes

- Tauri uses system webviews and **IPC** (`invoke` / events). Brackets’ normal web path should **not** depend on `invoke`.
- A Tauri adapter may expose **optional** native capabilities via a **small, permissioned** surface (for example host-only commands scoped by Tauri’s capability system).
- Do **not** expose a blanket native bridge to untrusted page code.

## WebView2 (C# / .NET)–specific notes

- Provide a **stable origin** and same-origin asset loading (custom scheme + domain mapping is acceptable if it preserves fetch/module semantics).
- Align TLS, cookies, and navigation with how the built-in host expects `fetch` and ES modules to behave.

## Workers and background work

- **Service Workers** and **Web Workers** remain **optional** add-ons (see [guide](./guide.md)).
- **Native background work** (tasks, daemons) is **adapter-specific** and outside the core Brackets language contract.

## OpenAPI-aligned `.api` helpers

A typed/OpenAPI-style helper layer for `.api` is **contract debt** (see [reference.md](./reference.md#deferred-contract-work-post-v1)). It does not block “production-ready” claims for the **web + built-in host** path.

## Testing strategy for adapters

Prefer **compatibility / mock** tests that assert:

- contract JSON shapes;
- predictable URLs for RPC and static assets;

not a full second CI matrix inside this repository unless adapters become first-class shipped products.
