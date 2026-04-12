# Brackets Checklist

This document turns the reference into a practical path forward for the codebase.

The compact canonical summary lives in [reference.md](./reference.md) and should be treated as the fast-scanning contract. This checklist exists to turn that contract into implementation work.

It is intentionally biased toward the project goals:

- no build step
- HTML templating that runs in the browser
- runs from a desktop folder
- no external app server required for local use
- no browser CORS friction for the normal local workflow
- backend agnostic by design
- local-first and authority-flexible by design
- usable for SPAs, websites, web apps, and desktop apps
- Datastar remains the engine

## Non-Negotiable Goals

These goals should act as a filter for every implementation choice.

### 1. No build step

Brackets should not require:

- a bundler
- a compile pipeline
- a transpile step before local use

Allowed:

- a tiny runtime host that serves files directly
- import maps
- on-serve syntax transforms
- browser-native ES modules

Not allowed as the default path:

- JSX compilation
- Vite/Webpack-style mandatory build flow
- "generate app output first, then run it"

### 2. HTML templating runs in the browser

The primary authoring surface remains:

- `.html` for pages, layouts, components, and fragments
- `.view`, `.logic`, `.api`, `.data` as framework modules

That means Brackets should feel like:

- HTML with powers
- Datastar underneath
- JavaScript where behavior belongs

Not like:

- template-in-JS as the main model
- a VDOM renderer
- a compile-only template language

### 3. Desktop-folder local workflow

The local app should be able to live in a normal folder on disk and run through a tiny built-in loopback host.

That local workflow should provide:

- same-origin asset loading
- module loading for `.view`, `.logic`, `.api`, `.data`
- HTML loading for `.html`
- import maps
- SPA fallback
- optional same-origin proxying for remote backends

Important clarification:

- the goal is not `file://`
- the goal is "runs from a desktop folder without needing an external server"
- the tiny built-in local server is part of the product concept because it removes `file://` and CORS limitations while keeping the workflow local and simple
- the built-in host in this repo may be implemented with Node today, but Node must remain only one host adapter implementation, not a framework requirement

### 4. Datastar is the engine

Brackets should add:

- syntax
- file contracts
- scoped vocabulary
- routing and layout orchestration
- same-origin local hosting

Brackets should not replace:

- Datastar signal reactivity
- Datastar event handling
- Datastar backend request model
- Datastar HTML patch handling
- Datastar SSE handling

### 5. Backend agnostic by design

Brackets should not assume:

- a backend language
- a server framework
- a remote database
- that an app even has an external backend

The framework should support all of these shapes:

- a local desktop-folder app with no remote backend
- a flat-file local backend using `.data` adapters over `.json`, `.yaml`, and `.db`
- a remote backend exposed through `.api`
- a hybrid app that uses local `.data` and remote `.api` together

Important split:

- `.api` = remote/backend transport contract
- `.data` = local persistence and storage adapter contract
- `.json`, `.yaml`, `.db` = actual local storage formats

Directional runtime flow:

- `.data` defines local data rules
- the runtime or host manages `.json`, `.yaml`, and `.db`
- `.logic` reads and writes
- `.view` / `.html` react through Datastar

That means the tiny local host is not "the backend" in the architectural sense. It is the same-origin runtime shell that can also expose local `.data` capabilities when the app uses flat-file or SQLite-backed local persistence.

### 6. Multi-target by design

Brackets should be able to power:

- fast SPAs
- websites
- web apps
- desktop apps

That does not mean one runtime path for every environment. It means one authoring model with multiple host adapters.

The same Brackets app contract should be able to run through:

- the built-in loopback host for local desktop-folder use
- a normal web server for deployed websites and web apps
- a desktop shell such as Tauri
- a Windows desktop shell such as a C# app using WebView2

## Current Mismatches In The Repo

These are the biggest gaps between the earlier prototype and the intended direction.

### `framework/syntax.js`

Current state:

- rewrites only part of the language
- rewrites to `data-brx-*` custom attributes
- does not yet centralize the full language contract

Why this is a problem:

- it makes Brackets look like a second runtime instead of a Datastar-first layer
- it under-implements the notes
- it does not distinguish clearly between Datastar-native mappings and framework-only directives

### `framework/runtime.js`

Current state:

- now lets Datastar own the native directive path for state, computed values, effects, text, show, bind, classes, and attributes
- uses a restricted framework-only expression evaluator instead of broad `Function(...)` execution
- prefetches and caches route and component assets for faster SPA navigation
- still keeps a custom bridge for framework-only directives such as `:html`, `:if`, `:each`, layout composition, and named actions

Why this is a problem:

- framework-only directives still need to keep shrinking where Datastar can take over
- the transport-helper bridge still needs to stay aligned with Datastar instead of growing into a second request system
- router and lifecycle behavior still need to stay thin, predictable, and host-neutral
- `:html` still needs a clearly documented trust/sanitization policy across all hosts

### `framework/server.js`

Current state:

- already provides the right kind of tiny local loopback host
- serves framework identity files as modules
- supports SPA fallback and proxying
- caches transformed routes and sources so the local host stays fast
- no longer needs `'unsafe-eval'` in its CSP for the Brackets runtime
- still exposes a fairly broad RPC shape for module invocation

Why this is only partially right:

- the server concept is correct
- the trust boundaries need tightening
- the proxy/RPC layer should only exist where it supports the Datastar-first architecture
- the local host also needs to more clearly support the flat-file local-backend role from the notes without turning into a mandatory app backend

## Architecture Rules For The Next Passes

These rules should guide implementation decisions.

### Rule 1: Compile to Datastar first

If Datastar already has a native primitive, Brackets should target it.

Examples:

- `@click` -> `data-on:click`
- `:state` -> `data-signals`
- `:calc` -> `data-computed`
- `:watch` -> `data-effect`
- `:text` -> `data-text`
- `:show` -> `data-show`
- `:bind` -> `data-bind`
- `:class.name` -> `data-class:name`
- `:set.name` -> `data-attr:name`
- plain `get('/path')` -> Datastar `@get('/path')`
- plain `create('/path')` -> Datastar `@post('/path')`
- plain `update('/path')` -> Datastar `@put('/path')`
- plain `patch('/path')` -> Datastar `@patch('/path')`
- plain `delete('/path')` -> Datastar `@delete('/path')`

That includes simple named actions:

- `@click="refresh"` should still compile to Datastar `data-on:click`, with Brackets only supplying the action bridge target

If Brackets adds suffix-based or framework-specific transport behavior, that bridge should stay small and explicit.

### Rule 2: Keep framework-only directives thin

Brackets-specific directives should only cover what Datastar does not directly define.

That includes:

- `:use`
- `:props`
- `:area`
- `:fill`
- `:mount`
- `page()`
- `print()`
- `ctx`
- `mount()/sync()/run()`

Framework-owned ergonomics that are still aligned with this rule:

- `:props` becoming local signals for a `:use` block
- named `.logic` actions accepting explicit arguments from markup
- `:loading` and `:error` binding to request-state keys instead of forcing manual boolean flags everywhere

### Rule 3: `mutate()` is sugar over signal writes

`mutate()` should not create a second store.

It should be:

- the preferred write helper
- compatible with scoped signal resolution
- compiled to signal assignment or patch behavior Datastar already reacts to

### Rule 4: Local host is part of the framework, not a workaround

The tiny local server is not a deviation from the goals.

It is how Brackets delivers:

- no build
- browser-native modules
- no CORS pain in local use
- desktop-folder workflow

It can also provide the local execution surface for:

- `.data` adapters
- `.json` storage
- `.yaml` storage
- `.db` storage such as SQLite

without forcing every app into the same backend model.

### Rule 5: Security belongs at the boundary

The framework should avoid introducing risk where Datastar already has an opinionated path.

Key implications:

- prefer Datastar-native request handling over custom fetch plumbing
- avoid broad runtime expression execution
- keep framework-only expression evaluation restricted and explicit
- keep `:html` trusted-only unless sanitized
- treat client state and local storage as untrusted

### Rule 5A: Keep transport intent and result handling separate

The docs and implementation should never blur these together.

Required interpretation:

- `read()` is the live/SSE helper
- `request()`, `get()`, `create()`, `update()`, `patch()`, and `delete()` are HTTP by default
- `.html`, `.sse`, `.state`, and `.json` describe result handling
- `mutate()` is local state mutation, not transport

Datastar alignment:

- helper intent should map onto Datastar's request model
- response handling should map onto Datastar's content-type behavior
- Brackets should not invent a conflicting transport vocabulary

### Rule 6: Keep the `.api` / `.data` split strict

The notes are consistent about this:

- `.api` is for remote/backend transport
- `.data` is for local persistence/storage access

Implementation should not blur them together.

That means:

- routing does not belong in `.api`
- local JSON/YAML/SQLite storage does not belong in `.api`
- remote transport does not belong in `.data`
- the local host may support `.data`, but `.data` should still feel like a storage adapter layer, not a generic server controller layer
- `.api` should offer a small reusable transport helper surface such as `http.client(baseUrl)` instead of pushing every app toward ad hoc fetch wrappers
- that helper surface should also expose an OpenAPI-aligned operation path so authors can describe path params, query params, headers, cookies, and bodies once instead of hand-serializing them

### Rule 7: Use host adapters, not host-specific framework forks

Brackets should keep one app model and support different runtime hosts through adapters.

Examples:

- local loopback host adapter
- generic web server adapter
- Tauri adapter
- C# / WebView2 adapter

The framework should avoid becoming:

- "the web version"
- "the Tauri version"
- "the C# version"

Instead:

- the syntax stays the same
- the file model stays the same
- the view/logic/api/data contract stays the same
- only the host integration layer changes

### Rule 8: Worker support should be additive, not foundational

Web workers may be useful, but they should not become the framework's core execution model.

Recommended split:

- Web Workers for heavy client-side computation or non-DOM background work
- Service Workers only for optional PWA/offline/caching concerns
- host-side workers or native background tasks for desktop-native capabilities

Not recommended:

- moving core routing, template composition, or reactivity into workers
- passing executable code strings into workers
- making worker support mandatory for the basic framework story

OWASP's HTML5 Security guidance also warns that worker messages should be validated and that executable code should not be exchanged for evaluation.

### Rule 9: Router speed should come from simplicity, not more framework weight

The router should feel instant without adding a React-style application runtime.

Preferred tools:

- route prefetch on intent signals such as hover and focus
- cached page, layout, logic, and component assets
- preserved layouts and preserved page instances where identity is stable
- async-navigation cancellation so stale navigations cannot overwrite fresh ones

Not preferred:

- a second client state graph for navigation
- route rendering through a VDOM layer
- background complexity that makes host adapters harder

### Rule 10: Common pages and forms should take less code than React/Next

The framework should keep reducing the amount of author code needed for ordinary work.

Preferred examples:

- component composition with `:use` + `:props` instead of wrapper components and prop plumbing
- named actions with optional arguments instead of handler boilerplate
- form requests that stay terse by compiling to Datastar-native form options where possible
- loading and error UI that can bind to request keys instead of hand-managed local flags

## Runtime Targets And Host Adapters

These are the main environments the framework should cover.

### Target 1: Web server deployment

Use case:

- websites
- SPAs
- deployed web apps

Host expectations:

- serves `.html`
- serves framework identity files as JS modules
- supports import maps
- supports Datastar request and SSE flows

### Target 2: Built-in local loopback host

Use case:

- desktop-folder apps
- local prototypes
- apps with local `.data` persistence

Host expectations:

- loopback-only by default
- same-origin asset and module loading
- no browser CORS friction
- local `.data` execution path for `.json`, `.yaml`, and `.db`

### Target 3: Tauri host adapter

Assumption:

- "Tori" means [Tauri](https://v2.tauri.app/start/).

Relevant platform facts from the official Tauri docs:

- Tauri uses system webviews for app UI.
- Tauri exposes two IPC primitives: commands and events.
- Tauri's `invoke` command path is JSON-serializable IPC.
- Tauri runtime authority/capabilities control what commands a webview may call.

Framework implication:

- Brackets should not depend on Tauri-specific APIs for its normal web story.
- A Tauri adapter can optionally expose native capabilities through `.data` or a separate host bridge contract.
- The adapter should respect Tauri command permissions and not expose a blanket native bridge to all app code.

### Target 4: C# / WebView2 host adapter

Relevant platform facts from the official WebView2 docs:

- local content can be loaded through file URLs, virtual host mapping, or request interception
- origin-aware and secure-context behavior is better when using virtual host mapping or request interception than raw `file://`
- WebView2 can host local content with an HTTP-like origin, which fits Brackets' same-origin needs better than `file://`

Framework implication:

- Brackets should support a C# / WebView2 host adapter that provides a proper origin and same-origin asset loading
- Brackets should not require Node to exist just because the desktop host is C#
- the local host contract should be implementable either by the built-in Node host or by a C# host that serves the same framework surface

## Missing Framework Needs To Add To The Contract

The docs are stronger now, but these framework-level needs still need to be carried explicitly into implementation planning.

### 1. Deployment profiles

We need an explicit supported profile list:

- web deployment profile
- local loopback desktop-folder profile
- Tauri desktop profile
- C# / WebView2 desktop profile

### 2. Host bridge contract

We need a clear rule for native or host-specific capabilities.

Questions the framework should answer:

- how does a Brackets app call host-native features when present?
- does that belong in `.data`, a host bridge namespace, or a separate adapter layer?
- how are permissions enforced in Tauri or other desktop hosts?

### 3. Local data adapter contract

We need a clearer `.data` contract for:

- JSON repositories
- YAML content/config access
- SQLite-backed durable storage
- file locking / write safety / concurrency behavior

### 4. Request and streaming compatibility

We need explicit compatibility expectations for:

- standard HTTP responses
- Datastar HTML patch responses
- Datastar JSON/state responses
- SSE/read flows
- proxy pass-through in desktop and hosted environments

This matters especially for:

- Tauri-backed apps
- C# backends
- C# WebView2-hosted desktop apps talking to a local or embedded backend

### 5. Optional worker strategy

We need to decide what is officially supported for:

- Web Workers
- Service Workers
- host-side/native background tasks

My recommendation:

- Web Worker support: optional
- Service Worker support: optional and separate from the core SPA/router/runtime story
- native host background work: adapter-specific

### 6. Asset and file resolution rules

We need explicit rules for:

- how `.html` references are resolved
- how `.view` references are resolved
- how import map aliases behave across hosts
- how local storage paths are resolved safely

### 7. Offline and caching story

Current contract:

- service-worker-backed offline is an optional add-on
- `/manifest.webmanifest` is generated by the built-in host
- a root `service-worker.js` is auto-registered on trustworthy origins when present
- local desktop hosts may still rely on packaged local assets without requiring a PWA path

### 8. Forms, uploads, and binary/file flows

Current contract:

- forms stay HTML-first
- uploads use normal forms, `FormData`, and transport helpers
- `ctx.action.formData()` and `ctx.action.files(name?)` support file-aware logic
- downloads use backend `Content-Disposition` or app/static files with `?download=...`
- binary responses flow through the runtime transport and built-in host without text corruption

Current implementation progress:

- route manifests now carry `meta`, `seo`, `auth`, and `assets`
- the runtime now exposes cache, optimistic state, auth/session, and route-level loading/error helpers
- the server now exposes sitemap/feed/robots and host/session contracts
- `.data` now has concrete `json`, `yaml`, and `db` adapters in this repo's built-in host adapter
- `health`, `status server`, and `test app` now exist as the built-in verification path

### 9. Error and loading model

The language still needs a more explicit framework-level story for:

- `:loading`
- `:error`
- request lifecycle state
- validation error display
- global versus local error handling

### 10. Testing and host mocking

If Brackets targets multiple hosts, we need a test strategy for:

- pure web behavior
- local loopback host behavior
- Tauri host mocking
- C# / WebView2 host mocking or compatibility checks

## Implementation Phases

## Phase 1: Lock The Syntax Contract In Code

Goal:

- make `framework/syntax.js` the single source of truth for the public language

Checklist:

- define the full current language inventory in one central contract table
- split entries into:
  - Datastar-native targets
  - Brackets-only directives
  - review-doc-present items that need caution
- support the locked syntax surface:
  - `[name]`
  - `#name`
  - `@click`, `@input`, `@change`, `@submit`
  - `:state`, `:calc`, `:run`, `:watch`, `:text`, `:html`, `:show`, `:bind`, `:if`, `:each`
  - `:use`, `:props`, `:area`, `:fill`, `:mount`
  - `mutate()`
  - request helpers and mode suffixes
- support `:class.name` and `:set.name` as review-doc-present items with explicit comments in code
- do not silently promote `:loading` and `:error` into fully settled semantics

Acceptance check:

- `syntax.js` clearly shows which syntax compiles straight to Datastar and which syntax remains framework-managed

## Phase 2: Replace Custom Reactivity With Datastar-First Output

Goal:

- stop using the Brackets runtime as the reactive engine

Checklist:

- remove custom `data-brx-state`, `data-brx-text`, `data-brx-show`, `data-brx-bind`, and similar runtime-owned bindings where Datastar has native equivalents
- transform Brackets syntax to Datastar `data-*` attributes wherever possible
- load Datastar in the shell as the live DOM/signal engine
- keep Brackets runtime focused on:
  - route/view resolution
  - layout preservation
  - framework lifecycle wiring
  - scoped vocabulary that Datastar does not provide by itself
- stop using the ad hoc `Function(...)` evaluator as the primary runtime path for basic directives

Acceptance check:

- text binding, state, computed values, effects, input binding, classes, attributes, and backend requests are primarily Datastar-driven, not `runtime.js`-driven

## Phase 3: Clarify The Thin Runtime

Goal:

- keep only the runtime pieces Brackets actually owns

Checklist:

- retain router/layout orchestration
- retain `.view` resolution
- retain `.logic` lifecycle dispatch
- retain `ctx` shape and cleanup support
- retain page/layout preservation logic
- remove custom render/binding machinery that duplicates Datastar
- make direct named actions the default markup-to-logic path
- keep `.logic.run()` only for advanced or framework-triggered tasks

Acceptance check:

- `runtime.js` reads like app-shell coordination, not like a homegrown frontend framework

## Phase 4: Tighten The Server Around The Goals

Goal:

- keep the server small, same-origin, and secure for local folder use

Checklist:

- keep loopback-only default bind
- keep module serving for `.view`, `.logic`, `.api`, `.data`
- keep HTML serving for `.html`
- keep import maps
- keep SPA fallback
- keep optional same-origin proxying
- add or verify:
  - explicit proxy allowlists
  - origin checks on framework endpoints
  - request-size limits
  - strict module target validation for RPC or local adapter calls
  - safe MIME handling
  - baseline security headers
- keep the server usable directly against a local app folder without extra setup
- keep the server small enough that it can act as the local runtime shell for flat-file and SQLite-backed apps without becoming a mandatory opinionated backend framework

Acceptance check:

- a user can point the host at a desktop folder app and run it locally without CORS problems or an external web server

## Phase 5: Narrow RPC And Proxy To Framework-Only Needs

Goal:

- keep transport aligned with Datastar and use custom boundaries only where Brackets adds real value

Checklist:

- use Datastar-native request/response handling for remote `.api` flows where possible
- reserve framework RPC for truly local capabilities such as `.data` adapters or controlled local file-backed operations
- do not make RPC the default app transport model
- document exactly when proxy is appropriate:
  - same-origin remote backend access
  - SSE pass-through
  - desktop/local development without browser cross-origin friction
- document exactly when local data execution is appropriate:
  - reading and writing `.json`
  - reading and writing `.yaml`
  - using `.db` storage such as SQLite through `.data`
  - running a desktop-folder app with no external backend at all

Acceptance check:

- `.api` feels Datastar-aligned
- `.data` feels like framework-local persistence
- neither becomes a generic tunnel that bypasses the intended architecture

## Phase 5A: Implement The Flat-File Local Backend Path

Goal:

- make the local-backend story explicit and first-class without breaking backend agnosticism

Checklist:

- support `.data` modules as the adapter layer for local persistence
- keep the actual storage formats separate from the adapter code:
  - `.json` for simple structured storage
  - `.yaml` for editable config/content storage
  - `.db` for durable local database storage such as SQLite
- make the built-in local host capable of serving a desktop-folder app that uses `.data` to read and write those formats
- keep `.api` available for remote backends in the same app
- make sure local storage access is same-origin and framework-controlled, not browser direct file access

Acceptance check:

- a Brackets app can run from a normal folder and use `.data` to persist to `.json`, `.yaml`, or `.db` without requiring an external backend server

## Phase 6: Secure The HTML And Storage Story

Goal:

- make the framework safe by default without hiding trust boundaries

Checklist:

- document and enforce `:text` as the default for user data
- document and enforce `:html` as trusted-only unless sanitized
- treat local storage, IndexedDB, and local persistence as untrusted client-side state
- avoid storing secrets or auth assumptions in browser storage
- keep backend validation mandatory

Acceptance check:

- the framework docs and defaults do not suggest that browser-held state is trusted

## Phase 7: Add Multi-Host Platform Support To The Contract

Goal:

- make the supported runtime targets and host adapter story explicit before implementation hardens around one environment

Checklist:

- define supported deployment profiles for:
  - web server
  - built-in local loopback host
  - Tauri host
  - C# / WebView2 host
- define the host adapter boundary
- define where native capability access belongs
- keep the core framework contract host-neutral

Acceptance check:

- the same Brackets app model can be explained cleanly across web, local desktop-folder, Tauri, and WebView2 hosts without changing the language contract

## Phase 8: Decide The Worker Strategy

Goal:

- avoid accidental architecture drift around workers and background execution

Checklist:

- define whether Web Workers are optional, supported, or deferred for v1
- define whether Service Workers are optional, supported, or deferred for v1
- define how worker messages are validated
- ensure workers are additive for performance/offline, not foundational for core routing/reactivity

Acceptance check:

- worker support is clear enough that future implementation does not accidentally move the framework core into a worker-based architecture

## Decision Filter

When evaluating a new feature or implementation choice, ask:

1. Does this preserve the no-build workflow?
2. Does this keep HTML as the main browser-facing template format?
3. Does this help the desktop-folder local workflow?
4. Does this compile to Datastar where Datastar already has the primitive?
5. If not, is this truly a Brackets-only concern?
6. Does this keep transport intent separate from result handling?
7. Does this preserve backend agnosticism?
8. Does this respect the `.api` versus `.data` split?
9. Does this keep the core host-neutral across web, Tauri, and WebView2-style hosts?
10. Does this tighten security or loosen it?
11. Does this reduce the custom runtime, or expand it?

If a change fails several of these tests, it is probably moving away from the project goals.

## Immediate Code Priorities

The next concrete work in this repo should be:

1. Tighten [syntax.js](../framework/syntax.js) so the syntax contract stays centralized and Datastar-first.
2. Tighten [runtime.js](../framework/runtime.js) so Datastar owns the reactive binding path and Brackets stays focused on framework-only behavior.
3. Tighten [server.js](../framework/server.js) around allowlists, request limits, and a smaller framework boundary.
4. Design the `.data` execution path so local `.json`, `.yaml`, and `.db` storage works through framework-controlled adapters without breaking backend agnosticism.
5. Keep the router and local host, but make them clearly shell/framework services rather than a replacement frontend runtime.
6. Add a host-adapter contract for Tauri and C# / WebView2-style hosts.
7. Decide and document the worker strategy before worker-like code paths appear ad hoc.

## Done Means

The path forward is aligned when all of this is true:

- authors can work in `.html`, `.view`, `.logic`, `.api`, and `.data` without a build step
- the app runs locally from a normal folder through the built-in loopback host
- there is no need for an external dev server just to avoid CORS
- the same framework can talk to remote backends through `.api` or local storage through `.data`
- flat-file and SQLite-backed local apps work through `.json`, `.yaml`, and `.db` without changing the frontend authoring model
- the same core contract can be hosted by the built-in local server, a normal web server, Tauri, or a C# / WebView2 host adapter
- Datastar is visibly doing the signal, DOM patch, backend request, and SSE work
- Brackets is visibly doing the syntax, structure, layout, routing, lifecycle, and local-host work
