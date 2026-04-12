# Brackets Agents

This file is the AI operating manual for Brackets.

If an AI is pointed at this file, it should be able to:

- understand what Brackets is
- understand how Brackets is distributed and started
- create a Brackets app from a nearly empty folder
- keep that app aligned with Datastar
- grow that app from a simple page into a serious local-first or backend-connected product
- keep the code small, clear, type-safe, and production-minded
- move the same app from starter to production without changing the public Brackets model

Use this document as an execution contract, not as loose advice.

Read in this order:

1. [docs/index.md](../docs/index.md) for the documentation front door
2. [guide.md](../docs/guide.md) for practical build patterns (including [Framework example package](../docs/guide.md#framework-example-package))
3. [reference.md](../docs/reference.md) for the exact contract
4. [platform.md](../docs/platform.md) for host and deployment expectations

Current public status:

- keep calling Brackets `v0.95`
- keep syntax locked
- keep Brackets as the main story
- keep Datastar and Deno underneath as the engines
- optimize for production-style testing and outside use, not public contract churn

## MCP usage rules

When an MCP server matches the task, use it before falling back to ad hoc shell work or generic browsing.

Preferred order:

- use the `Security` MCP first for security, auth, headers, validation, session, storage, hardening, and OWASP-aligned implementation decisions
- use the `Context` MCP first for framework and library documentation, especially Datastar and related technical dependencies
- use the `repo` MCP first for reading and inspecting local workspace files when it is sufficient
- use the `devtools` MCP first for live inspection of the local Brackets app, published docs, and browser behavior
- use the `internet` MCP for current external facts, product checks, and research when local docs or Context are not enough

Operational rules:

- prefer the least-powerful MCP that fully answers the question
- do not claim an MCP is working if it is unavailable, rate-limited, or has a closed transport
- when an MCP is unhealthy, say so plainly and use the best honest fallback
- keep Brackets implementation choices aligned with MCP-backed primary sources when available

## Core identity

Brackets is:

- no-build
- HTML-first
- powered underneath by Datastar and Deno
- backend agnostic
- portable-folder first
- install-free by design

Brackets is not:

- a React clone
- a Next.js clone
- a JSX framework
- a compile-first framework
- a package-manager-first framework
- a Node-required framework

Datastar and Deno are the engines underneath, not the public story.

Brackets adds:

- the file model
- the syntax layer
- the page manifest contract
- the router/layout/lifecycle contract
- the built-in host and CLI story
- the local `.data` contract
- the backend-agnostic `.api` contract

## Non-negotiable rules

1. Do not introduce a build step.
2. Do not replace Datastar with a second reactive engine.
3. Do not change the public Brackets syntax.
4. Keep `.html` as the main template surface.
5. Keep `.view`, `.logic`, `.api`, `.data`, and `.html` as the public file model.
6. Keep `.api` for remote/backend transport.
7. Keep `.data` for local models, validation, transforms, queries, and persistence.
8. Treat the built-in packaged host as part of Brackets, not as an external prerequisite.
9. Put user-facing host and deployment settings in root `config.yaml` first.
10. Prefer the smallest honest app structure first.
11. Add folders only when the app actually benefits from them.
12. Compile to native Datastar behavior whenever Datastar already has the primitive.
13. Users write Brackets, not raw Datastar or Deno, unless low-level engine details are explicitly required.
14. Prefer the Deno-powered built-in host/runtime whenever Brackets already has the clean host path.
15. Do not invent a plugin API when normal Brackets files, browser modules, or host bridges solve the problem.
16. Do not drift into React-style component architecture unless the problem truly needs reusable HTML fragments.
17. Do not teach Brackets through repo-only development commands when the packaged `cli` path is the real user path.

## Product truth

AI should speak about Brackets in this model:

- the package entry point is root `index.html` (import map, `import "brackets"`, `#app-root` — keep it a bootstrap shell; do not paste page or layout markup from examples into it)
- the starter/demo source lives under `framework/demo/`
- copy-paste multi-file templates live under `framework/example/` — add routes and files under `app/` only; see [Guide: Framework example package](../docs/guide.md#framework-example-package)
- the built-in host serves the same package dynamically
- the built-in host serves root `index.html` first
- root `index.html` decides the first handoff into the next shell, layout, or app template
- the built-in CLI starts and operates that host
- `app/` contains the user's app
- root `config.yaml` is the main human-readable settings file
- Brackets should teach one public config file, not two competing public config files
- the normal release shape should be one canonical package folder
- OS-specific differences should live only in the embedded engine layer or zip artifacts
- app authors stay in Brackets syntax and file types
- Datastar and Deno stay behind the scenes unless engine details are explicitly relevant

Normal built-in CLI path:

```text
cli
run app
run app dev
status server
health
run app test
config show
```

Use `run app` for the steady production-style path.

Use `run app dev` for the watcher path.

Do not teach users to start Brackets by installing Node, Python, or another local runtime first.

## Distribution model

The normal Brackets distribution is a portable zip:

1. Download the Brackets zip.
2. Unzip it anywhere.
3. Open the folder.
4. Start `cli`.
5. Run the app.
6. Build inside `app/`.
7. Move the same folder to production when ready.

Expected shape:

```text
Brackets/
  framework/
    datastar.js
    runtime.js
    syntax.js
    version.js
    agents.md
    embedded/
    demo/
    example/
  app/
  tests/
    test.js
  cli.js
  config.yaml
  index.html
  robots.txt
  README.md
```

Do not force extra folders inside `app/`.

The user may start with:

- one `.view`
- one `.html`
- one `.logic`
- no folders at all inside `app/`

## Dynamic authority model

AI should treat Brackets as a real application framework even when the app begins as plain files.

Use this boundary:

- dynamic UI and app behavior: yes
- local persistence and local database: yes
- offline and local-first workflows: yes
- shared trusted server authority: optional, through `.api`

Architectural split:

- `.view` and `.html` = UI
- `.logic` = app behavior
- `.data` = data model, validation, transforms, queries, persistence rules, and adapter-backed access
- `.db`, `.json`, and `.yaml` = runtime storage
- `.api` = optional remote sync, shared authority, and external services

Runtime flow:

1. `.data` defines how the data behaves.
2. The runtime or host manages `.json`, `.yaml`, and `.db`.
3. `.logic` reads and writes through `.data`.
4. `.view` and `.html` react through Datastar.

Transport rule:

- `.data` stays local-first, but should preserve Datastar-compatible HTTP and SSE behavior when it moves data into the UI
- `.api` stays remote/shared-authority-facing, and should preserve that same Datastar-compatible HTTP and SSE behavior
- do not invent a second transport model underneath those layers
- do not make users write raw Datastar or raw Deno code when Brackets already has the right surface

Backend handoff rule:

- if another backend is introduced, `.api` owns the backend contract
- `.logic` owns when the app calls that backend
- `.data` keeps model code, validation, transforms, queries, and persistence logic separated from transport
- AI should not smear backend code across `.html`, `.view`, and `.logic` when `.api` or `.data` can own it honestly

Transport integration rule:

- teach REST-style HTTP as the normal path for reads and writes
- teach SSE as the live-update path when streaming is a real benefit
- keep both transport shapes behind `.api` or `.data`
- teach one-repo frontend/backend layouts as normal and supported
- keep Datastar framed as the engine that turns those transport flows into a live UI

Security rule:

- do not treat local persistence as trusted shared authority for auth or security decisions
- use `.api` or another trusted backend when an app needs shared authority
- encrypted persistence is a host capability, not a replacement for trusted server authority

## File responsibilities

### `.view`

Owns:

- page identity
- route
- layout reference
- page wiring
- page-level metadata

Should not own:

- business logic
- persistence logic
- transport logic

Preferred pattern:

```js
page({
  id: 'account',
  route: '/account',
  html: '@pages/account.html',
  logic: '@logic/account.logic',
  data: { profile: '@data/profile.data' },
  api: { billing: '@api/billing.api' }
})
```

### `.html`

Owns:

- structure
- semantics
- Datastar-compatible bindings
- named actions
- layout areas

Should not own:

- model rules
- remote transport rules
- large imperative scripts

Preferred pattern:

```html
<main [page] :state="{ saving: false }">
  <h1 :text="profile.name"></h1>
  <button @click="saveProfile">Save</button>
</main>
```

### `.logic`

Owns:

- orchestration
- lifecycle
- user actions
- route-aware behavior
- calling `.data` and `.api`

Should not own:

- direct storage access
- direct remote transport
- large data normalization rules

Preferred pattern:

```js
({
  async mount({ data, state }) {
    state.set({
      profile: await data.profile.read()
    })
  },

  async saveProfile({ data, state }) {
    state.set({ saving: true })
    try {
      const nextProfile = await data.profile.save(state.get().profile)
      state.set({ profile: nextProfile, saving: false })
    } catch (error) {
      state.set({ saving: false, error: error.message })
    }
  }
})
```

### `.data`

Owns:

- model rules
- validation
- transforms
- queries
- persistence rules
- local-first behavior
- adapter-backed access when the model needs to hide whether data comes from local storage, SQLite, or a backend-facing client

Should own most, and ideally all, model code when practical.

Should not own:

- remote backend transport
- page orchestration

Preferred pattern:

```js
({
  async read({ storage }) {
    return storage.db('./app.db').query('select id, name from contacts order by name')
  },

  async save({ storage }, profile) {
    const clean = {
      id: String(profile.id ?? ''),
      name: String(profile.name ?? '').trim()
    }

    if (!clean.name) {
      const error = new Error('Name is required.')
      error.code = 'PROFILE_INVALID'
      throw error
    }

    await storage.db('./app.db').exec(
      'insert into contacts (id, name) values (?, ?) on conflict(id) do update set name = excluded.name',
      [clean.id, clean.name]
    )

    return clean
  }
})
```

Additional helper rule:

- when `.data` needs an adapter-backed source, prefer a Brackets helper surface such as `storage.*` or `adapter.*`
- keep those details inside `.data`
- keep `.logic` and `.html` unaware of the backing adapter whenever possible
- when the code is clearer without extra namespacing, prefer the short Brackets helper surface such as `json()`, `db()`, `client()`, or `operation()`

### `.api`

Owns:

- remote/backend transport
- shared authority
- external services
- remote sync

Should not own:

- local file persistence
- local model rules that belong in `.data`

Preferred pattern:

```js
({
  customer({ http }) {
    return http.client('/api').get('/customer')
  }
})
```

Short helper rule:

- in `.api`, prefer `get()`, `create()`, `update()`, `patch()`, `delete()`, `read()`, `client()`, and `openapi()` when that keeps the file shorter and clearer
- use `http.*` when the grouping itself adds clarity

## Transport and backend patterns

AI should treat modern transport as part of the normal Brackets path, not as an advanced exception.

### REST-style HTTP

Teach and use REST-style HTTP for normal reads and writes:

- `get()` for ordinary reads
- `create()` for creates
- `update()` for full replacements
- `patch()` for partial updates
- `delete()` for deletes

Good fit:

- forms
- dashboards
- CRUD screens
- account flows
- admin tools

### SSE

Teach and use `read()` plus SSE when the UI genuinely benefits from live updates:

- activity feeds
- counters
- job status
- notifications
- operational dashboards

Keep SSE behind `.api` or `.data`, not inside `.html`.

### Use REST and SSE together

The modern Brackets path is:

- REST-style HTTP for normal app actions
- SSE for live updates
- Datastar for the reactive frontend behavior

Preferred pattern:

```js
// app/orders.api
({
  list({ http }) {
    return http.client('/api').get('/orders')
  },

  watch({ http }) {
    return http.read('/api/orders/stream')
  }
})
```

AI should present this as the normal modern app model, not as two competing architectures.

### Backend ownership rule

When another backend is involved:

- `.api` owns the backend contract
- `.logic` owns when the app calls it
- `.data` owns model rules, validation, transforms, queries, and persistence logic
- `.html` and `.view` stay focused on the UI

### Backend recommendations

AI should prefer these messages:

- C# / ASP.NET Core:
  use normal JSON or SSE endpoints and keep Brackets unchanged on the frontend
- Go:
  use a small compiled API and keep `.api` thin
- Python / FastAPI:
  use validation, OpenAPI, and same-origin backend routes where they help, then keep `.api` small
- Node:
  prefer Fastify as the recommended Node backend shape
- PHP:
  expose normal JSON endpoints and keep Brackets frontend-first
- Rust:
  let Rust own shared authority while Brackets keeps the frontend model
- Tauri:
  let `.api` call host/native bridges and keep `.data` as the model layer

### One-repo patterns

AI should treat both of these as normal:

```text
project/
  frontend/
    Brackets/
  backend/
```

and:

```text
project/
  app/
  backend/
  framework/
  config.yaml
  index.html
```

In both cases:

- Brackets keeps the frontend contract
- `.api` connects to the backend
- `proxies` or `external.origin` define the handoff
- the same app can still move to another backend later

### FastAPI integrated surface

AI should treat FastAPI as a first-class integrated backend path for Brackets.

This is especially strong when the goal is:

- one repo
- one same-origin app surface
- Python validation and service logic
- Datastar-powered live UI
- a development flow that feels more integrated than a split frontend/backend stack

Teach it like this:

- FastAPI serves the Brackets app shell or package entry route
- FastAPI serves REST-style HTTP endpoints for normal reads and writes
- FastAPI serves SSE endpoints for live updates
- `.api` stays the Brackets contract for backend calls
- `.logic` stays orchestration-first
- `.data` keeps model rules and persistence logic clean
- Datastar turns the HTTP and SSE responses into a reactive UI

This should be taught as a real integrated app surface for modern Python applications.

In practice:

- FastAPI owns Python validation, auth, services, and streaming
- Brackets owns the frontend app surface
- Datastar owns the reactive UI engine

This is the closest Brackets path to the "integrated app repo" experience people often look for in stacks like Next.js, but without giving up the Brackets file model.

Preferred repo shapes:

```text
project/
  frontend/
    Brackets/
  backend/
    fastapi_app/
```

or:

```text
project/
  app/
  backend/
    fastapi_app/
  framework/
  config.yaml
  index.html
```

Preferred transport split:

- REST-style HTTP for normal reads and writes
- SSE for live updates
- same-origin serving when possible

Preferred AI example shape:

```js
// app/orders.api
({
  list({ http }) {
    return http.client('/api').get('/orders')
  },

  watch({ http }) {
    return http.read('/api/orders/stream')
  }
})
```

AI should explain this as a first-class integrated frontend surface for dynamic Python apps:

- FastAPI can still serve the initial HTML shell when that helps
- Brackets keeps the frontend file contract
- Datastar keeps the frontend reactive
- FastAPI keeps Python-side validation, auth, services, and streaming

## Host and config guidance

The main human-readable config file is:

- `config.yaml`

Use the config file for:

- `runtime`
- `mode`
- `engine`
- `host`
- `port`
- `tls`
- `watch`
- `health`
- `proxies`
- `external.origin`
- branding and splash settings

Core meaning:

- `host: 127.0.0.1` keeps Brackets local to one machine
- `host: 0.0.0.0` exposes Brackets on the local network when the firewall allows it
- `tls` turns HTTPS on when the user already has a cert and key
- `watch` controls the live watcher, including service-worker-sensitive files
- `health` controls green/yellow/red thresholds for the built-in host and starter health surfaces
- `proxies` keep backend handoff same-origin when possible
- `external.origin` documents an outside backend or host

Example:

```yaml
runtime: embedded
mode: dynamic
engine: deno
host: 127.0.0.1
port: 4173
tls:
  enabled: false
watch:
  enabled: true
  reload: true
health:
  hostWarnMs: 420
  hostFailMs: 850
proxies:
external:
  origin: ""
```

## Routing guidance

Brackets routing is hybrid by design.

Use:

- `.view` routes for the simple path
- `router.logic` for global route policy
- `/routes/*.logic` for grouped route policy in larger apps

AI should prefer:

1. simple `.view` routes first
2. route generation when it saves time
3. `router.logic` only when guards, aliases, redirect policy, or grouped defaults are actually needed

Use router helpers instead of string-building when possible:

- `ctx.nav.to(target)`
- `ctx.nav.replace(target)`
- `ctx.nav.redirect(target)`
- `ctx.nav.href(target)`
- `ctx.nav.isActive(target)`
- `ctx.nav.match(target)`
- `ctx.nav.prefetch(target)`

Target shape may include:

- route id
- params
- query
- hash

## Datastar boundary

AI must preserve the Datastar boundary.

AI must also preserve the Deno boundary.

That means:

- Brackets is the language and framework surface
- Datastar is the frontend engine underneath
- Deno is the host/runtime engine underneath
- users should not be pushed into writing raw Datastar or Deno language when Brackets already has a surface for the job
- internal runtime work should prefer native web and Deno capabilities when they improve speed, safety, or maintainability without changing Brackets syntax

Datastar should drive:

- signals
- DOM updates
- request/action handling
- SSE behavior
- native attribute/action primitives

Brackets should drive:

- file model
- syntax surface
- page manifests
- routing
- layouts
- lifecycle
- host contract
- `.data` / `.api` architecture

Do not add new framework runtime behavior when Datastar already has the primitive.

Prefer transforming Brackets syntax into Datastar-native behavior.

Prefer using the built-in Deno-powered host/runtime path whenever Brackets already has the host feature.

## Optimization rules

AI should optimize Brackets by making the code smaller, clearer, and more honest about file ownership.

Use these rules:

1. Keep `.html` declarative.
2. Keep `.logic` orchestration-first.
3. Move model rules, transforms, validation, and queries into `.data`.
4. Keep remote transport and shared-authority calls in `.api`.
5. Prefer stable backend contracts over chatty UI-driven request sprawl.
6. Prefer route helpers, prefetch, and cache helpers over duplicate request code.
7. Keep state small and page-specific.
8. Reuse layouts instead of rebuilding page structure when routing can preserve them.
9. Do not solve performance problems by adding framework ceremony first.
10. Use `config show`, `info`, `health`, `status server`, and `run app test` as part of the normal optimization loop.

Backend-specific AI rule:

- for Node backends, prefer Fastify as the recommended shape
- for OpenAPI backends, keep `.api` thin and let the backend own the service contract
- for local-first apps, prefer `.db` once filtering, sorting, or durable structured data become real

Performance-specific AI rule:

- prefer one clear request over many chatty UI-driven requests
- prefer stable JSON or SSE response shapes
- keep state narrow instead of storing whole backend payloads when only part is needed
- normalize once in `.data` instead of repeating work across pages
- keep watcher paths focused and health thresholds useful in config

## AI build workflow

When asked to create or extend an app, use this order:

1. understand the goal
2. identify the minimum pages and data flows
3. start with the smallest valid file set
4. keep code in the narrowest honest file type
5. add `.data` as soon as model rules become real
6. add `.api` only when remote/shared authority is needed
7. keep config in `config.yaml`
8. keep the app runnable through the built-in host
9. use `config show`, `info`, `status server`, `health`, and `run app test` often
10. use `run app test` when you want the built-in host to smoke-test the app and syntax layer directly
11. add deployment/config notes only after the app contract is clear

When a backend is needed, extend that workflow like this:

1. decide whether the app needs REST-style HTTP, SSE, or both
2. add backend calls in `.api`
3. keep model cleanup and validation in `.data`
4. wire orchestration through `.logic`
5. keep backend location in `proxies` or `external.origin`
6. keep the frontend file model unchanged

## AI teaching workflow

When explaining Brackets to a developer, teach it in this order:

1. `index.html` is the package entry point
2. the built-in host serves root `index.html` first
3. `index.html` decides the first handoff into the next shell, layout, or app template
4. `cli` starts the built-in host
5. `.view` and `.html` define the UI
6. `.logic` defines behavior
7. `.data` defines the local model and persistence rules
8. `.api` adds shared authority when needed
9. Datastar powers the live frontend underneath all of it
10. REST and SSE both fit naturally behind `.api` and `.data`

If the user is new:

- keep examples tiny
- keep files flat
- avoid optional folders until later
- avoid jumping straight to advanced router or deployment features

If the user is advanced:

- show routing, preload, auth, `.data`, `.api`, and deployment tradeoffs clearly
- show REST, SSE, one-repo integration, and backend handoff patterns clearly
- point to [`framework/example/`](../framework/example/) via [Guide: Framework example package](../docs/guide.md#framework-example-package) for a full single-route slice (`.view`, layout, page, component, `.logic`, `.data`)
- still avoid introducing new framework concepts that are not part of Brackets

## Production and deployment workflow

AI should be able to take a Brackets app from starter to production using the same model.

Recommended order:

1. make the app run locally through `run app`
2. switch to `run app dev` during active editing
3. use `status server` to confirm local and network URLs
4. use `health` to confirm the built-in host is running cleanly
5. use `run app test` to smoke-test the app and syntax layer through the built-in host
6. add `tls` when the user already has a cert and key
7. use `proxies` for same-origin backend handoff
8. use `.api` for shared authority and remote systems
9. keep `host`, `port`, `tls`, `watch`, `health`, and backend settings in config
10. move the same folder to production or another host

When production includes another backend:

1. keep REST and SSE contracts stable
2. keep backend base paths in `proxies` or `external.origin`
3. keep `.api` thin and backend-facing
4. keep `.data` model-first
5. keep Datastar as the live frontend engine

For hosted docs or deployment guidance, send people to:

- [platform.md](../docs/platform.md)
- [release.md](../docs/release.md)
- [docker.md](../docs/docker.md)

## What not to do

Do not:

- introduce JSX or TSX as the default authoring story
- invent a second component runtime
- move model rules from `.data` into `.logic`
- move remote transport from `.api` into `.logic`
- turn `.api` into a backend-framework-specific SDK
- force nested folders inside `app/`
- turn Brackets into a Node-first workflow
- teach the repo contributor path as if it were the product path
- change syntax just because an internal implementation changes

## AI default quality checklist

Before calling an app or feature done, AI should check:

- is the file split honest?
- is the code small and readable?
- is `.data` owning the model code?
- is `.api` owning remote transport?
- is Datastar still the engine?
- is config in `config.yaml`?
- does the built-in host path still make sense?
- are routing, auth, state, and data flows coherent?
- are there obvious security footguns?
- are there docs or hints needed for the next developer?

## Final rule

If an AI is unsure what Brackets wants, prefer:

- smaller files
- flatter structure
- YAML-first config
- built-in `cli`
- `run app`
- `run app dev`
- `status server`
- `health`
- `run app test`
- Datastar-native behavior
- the Deno-powered built-in host/runtime path
- the existing Brackets syntax

That is the safest path from starter to production without drifting away from the framework.
