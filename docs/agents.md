# Brackets Agents

This file is the AI operating manual for Brackets.

If an AI agent is pointed at this file, it should be able to:

- understand what Brackets is
- understand how Brackets is distributed
- create a Brackets app from a nearly empty folder
- grow that app from a simple website into a complex SPA, web app, local-first app, or desktop app
- connect that app to any backend without changing the Brackets model
- stay aligned with Datastar instead of competing with it

Use this document as an execution contract, not as loose advice.

Before going deep, also read:

- [docs.md](../docs.md) for the simple start path
- [guide.md](./guide.md) for step-by-step examples
- [reference.md](./reference.md) for the language contract
- [platform.md](./platform.md) for host and deployment expectations

## Core identity

Brackets is:

- a no-build framework
- an HTML-first framework
- a Datastar-powered framework
- a backend-agnostic framework
- a portable-folder framework

Brackets is not:

- a React clone
- a Next.js clone
- a JSX framework
- a package-manager-first framework
- a Node-required framework

Datastar is the engine.

Brackets adds:

- the file model
- the syntax layer
- the page manifest contract
- the router/layout/lifecycle contract
- the tiny same-origin host when needed
- the local `.data` contract
- the backend-agnostic `.api` contract

## Plugin guidance

Do not assume Brackets needs a plugin API.

In Brackets, most things a framework would call a plugin are just:

- a `.logic` module
- a `.api` module
- a `.data` module
- a reusable `.html` file
- a browser ESM import
- a worker or service worker
- a host bridge

Preferred AI behavior:

1. solve the problem with normal Brackets files first
2. use standard browser modules or backend services second
3. only propose a framework-level plugin mechanism if a clear repeated gap remains after those two paths

## Non-negotiable rules

1. Do not introduce a build step.
2. Do not replace Datastar with a second reactive engine.
3. Keep `.html` as the main template surface.
4. Keep `.view`, `.logic`, `.api`, `.data`, and `.html` as the public file model.
5. Keep `.api` for remote/backend transport.
6. Keep `.data` for local persistence.
7. Treat Node in this repo as one built-in host adapter implementation, not as a framework requirement.
8. Prefer the simplest possible app structure first.
9. Add folders only when the app actually benefits from them.
10. Compile to Datastar whenever Datastar already has the primitive.
11. Do not invent a plugin API when normal Brackets files or browser modules solve the problem.

## Distribution model

The normal Brackets user should not have to install anything.

The expected distribution shape is a portable zip:

1. Download `Brackets.zip`.
2. Unzip it anywhere.
3. Open the folder.
4. Build inside `app/`.
5. Copy the same folder to a server when ready.

The starter should stay minimal:

```text
Brackets/
  framework/
  app/
  config/
  tests/
  index.html
  robots.txt
  README.md
  LICENSE
```

Do not force extra folders inside `app/`.

The user may start with:

- one `.html` file
- one `.view` file
- one `.logic` file
- no folders at all inside `app/`

Only introduce folders such as `views/`, `pages/`, `layouts/`, `components/`, `logic/`, `api/`, `data/`, or `storage/` when the app becomes large enough to need them.

For the human-facing start path, send people to [docs.md](../docs.md) first.

## What each top-level part means

### `framework/`

Contains Brackets framework files needed by the app.

Minimum direction:

- `datastar.js`
- `runtime.js`
- `syntax.js`
- `docs.md`
- `agents.md`
- `demo/`

This folder should contain framework/runtime knowledge, not user app code.

### `app/`

This is the user's app workspace.

It can contain:

- flat files directly
- optional folders later
- pages, layouts, components, route logic, `.api`, `.data`, and storage files

Do not assume the app must begin with nested folders.

If the user asks for examples or a practical path forward, prefer linking them to:

- [docs.md](../docs.md)
- [guide.md](./guide.md)
- [demo/app](../demo/app)

If the user asks about Docker, production deployment, or backend pairing, prefer these sections in [docs.md](../docs.md):

- [Docker setup](../docs.md#docker-setup)
- [Production setup](../docs.md#production-setup)

### `config/`

Optional framework/app configuration.

Use for:

- app settings
- route defaults
- host options
- auth/session config
- export rules
- starter branding and splash settings

Preferred config files:

- `config/brackets.yaml`
- `config/brackets.json`

The config should stay human-readable and easy to edit.

Use it to control:

- local host address and port
- starter branding
- splash title, tagline, chips, and hints
- generated `/framework/demo/logo.svg` and `/framework/demo/favicon.svg`
- the starter page at `/framework/demo/splash.html`

### `tests/`

Optional but encouraged.

Tests should stay simple and flat by default.

### Root files

- `index.html` is the obvious entry point
- `robots.txt` is the default website root file
- `README.md` explains how to use the starter
- `LICENSE` defines distribution terms

Other top-level files may be added later only when needed.

## Public file model

| File type | Meaning |
|---|---|
| `.view` | what page exists |
| `.logic` | how the app behaves |
| `.api` | how the app talks to a backend |
| `.data` | how the app talks to local storage/data files |
| `.html` | actual markup/templates/pages/layouts/components |
| `.json` | simple structured storage |
| `.yaml` | human-editable config/content storage |
| `.db` | file-backed database storage |

## How to start a new app

When asked to create a new Brackets app, prefer the smallest valid shape.

Smallest sensible starting point:

```text
app/
  home.view
  home.html
  home.logic
```

Example:

```js
page({
  id: 'home',
  route: '/',
  html: '@app/home.html',
  logic: '@app/home.logic'
})
```

```html
<main [page] :state="{ count: 0 }">
  <h1>Hello Brackets</h1>
  <p :text="count"></p>
  <button @click="mutate('count', count + 1)">Add</button>
</main>
```

```js
({
  mount({ state }) {
    state.set({ count: 0 })
  }
})
```

Do not generate extra structure unless the app actually needs it.

## When to add more structure

Add folders only when the app becomes large enough that flat files are no longer clear.

Good reasons to add folders:

- more than a few pages
- more than one shared layout
- reusable components
- multiple route groups
- more than one backend integration
- more than one local data adapter
- larger storage surface

Good optional folder names:

- `views/`
- `pages/`
- `layouts/`
- `components/`
- `logic/`
- `routes/`
- `api/`
- `data/`
- `storage/`

These are conventions, not requirements.

## Page manifest contract

Use `page(...)`.

Minimum:

```js
page({
  id: 'home',
  route: '/',
  html: '@app/home.html'
})
```

Allowed fields:

- `id`
- `html`
- `logic`
- `route`
- `title`
- `meta`
- `seo`
- `auth`
- `assets`
- `layout`
- `api`
- `data`

## Runtime context contract

Use `ctx` as the canonical runtime object name.

Groups:

- `route`
- `state`
- `action`
- `api`
- `data`
- `nav`
- `cache`
- `auth`
- `cleanup()`

Use grouped destructuring when helpful.

Do not invent hidden magic globals.

## Lifecycle contract

Use:

- `mount(ctx)`
- `sync(ctx)`
- `run(payload, ctx)`
- named actions
- returned cleanup or `ctx.cleanup(...)`

Rules:

- `mount()` is setup
- `sync()` is preserved-instance update
- `run()` is an explicit advanced task entry point
- named actions are the normal UI path

## Syntax contract

Use this public Brackets syntax:

- `[name]`
- `#name`
- `@event="..."`
- `:state="..."`
- `:calc="..."`
- `:run="..."`
- `:watch="..."`
- `:text="..."`
- `:html="..."`
- `:show="..."`
- `:bind="..."`
- `:if="..."`
- `:each="..."`
- `:use="..."`
- `:props="..."`
- `:area="..."`
- `:fill="..."`
- `:mount`
- `:class.name="..."`
- `:set.name="..."`
- `:loading="..."`
- `:error="..."`

Also use the built-in expression helpers and names:

- `self`
- `parent`
- `children`
- `root`
- `props`
- `event`
- `mutate()`
- `read()`
- `request()`
- `get()`
- `create()`
- `update()`
- `patch()`
- `delete()`

## Datastar harmony rules

Always prefer Brackets syntax compiling to Datastar behavior.

Preferred mapping:

- `@event` -> Datastar `data-on:*`
- `:state` -> Datastar `data-signals`
- `:calc` -> Datastar `data-computed`
- `:watch` -> Datastar `data-effect`
- `:run` -> Datastar `data-init` when it is init-like markup behavior
- `:text` -> Datastar `data-text`
- `:show` -> Datastar `data-show`
- `:bind` -> Datastar `data-bind`
- `:class.name` -> Datastar `data-class:name`
- `:set.name` -> Datastar `data-attr:name`
- request helpers -> Datastar request/response model
- `read()` -> Datastar SSE model

Brackets should stay framework-first only where Datastar does not already define the feature cleanly:

- `:use`
- `:props`
- `:area`
- `:fill`
- `:mount`
- `:if`
- `:each`
- `:html`
- `:loading`
- `:error`
- `page()`
- `print()`
- router/layout/lifecycle contracts

## Async and data rules

For async UI, prefer:

- `:loading="route"` for route transitions
- `:loading="<request-key>"` for request-local loading
- `:error="route"` for route failures
- `:error="<request-key>"` for request failures

For data, prefer:

- `ctx.cache.fetch(key, loader, options)`
- `ctx.cache.refresh(key, loader, options)`
- `ctx.cache.invalidate(key)`
- `ctx.state.optimistic(patch, task)`

Do not force developers to hand-roll booleans and ad hoc loading state if Brackets already has the contract.

## Transport and backend rules

Brackets must be backend agnostic.

That means AI agents should generate app code that works with:

- simple flat-file backends
- custom servers
- REST backends
- SSE backends
- OpenAPI-described backends
- Tauri-connected backends
- C# / WebView2 host-connected backends
- PHP, Python, Go, Ruby, Rust, .NET, Java, or other server stacks

Do not generate backend assumptions such as:

- Express-only middleware shapes
- Next.js route handlers as a framework requirement
- Node-specific filesystem calls in browser code
- React server/client boundaries

### `.api`

Use `.api` for remote/backend transport only.

Prefer:

- `http.client(baseUrl)` for one backend root
- `http.resource(baseUrl)` as an alias
- `http.openapi(baseUrl).operation({...})` for explicit OpenAPI-style requests

Use low-level `http.request(...)` only when needed.

### `.data`

Use `.data` for local persistence only.

Prefer:

- `storage.json(...)`
- `storage.yaml(...)`
- `storage.db(...)`

Do not mix local file persistence into `.api`.

Do not mix remote backend transport into `.data`.

## Install and host rules

Remember the user should not have to install Brackets like a normal framework.

Primary path:

- unzip the Brackets folder
- start building immediately

Local/dev path:

- use the tiny same-origin host only when needed
- use it for local `.data`, same-origin browser loading, and no-CORS local work

Production path:

- copy the same folder to a server
- point the address/domain at it
- pair with an installed backend only when needed

Desktop path:

- use the same app contract with a desktop host
- built-in host, Tauri, or WebView2-style host adapters are all valid

The app model should not change.

## Security rules

Always prefer secure defaults.

Use:

- `:text` by default
- `:html` only for trusted or sanitized content
- `ctx.auth.session()` for session checks
- route `auth` for protected routes
- CSRF-aware transport flows
- backend validation for all real security decisions

Do not:

- trust client state as server truth
- store secrets in client signals
- treat client validation as security
- use direct unsafe HTML insertion for untrusted content

## Website and SEO rules

Use route manifest fields:

- `title`
- `meta`
- `seo`
- `assets`

Important fields:

- `meta.description`
- `meta.lang`
- `meta.dir`
- `seo.canonical`
- `seo.alternates`
- `seo.changefreq`
- `seo.priority`
- `seo.structuredData`
- `assets.themeColor`
- `assets.icons`

Support:

- `robots.txt`
- `sitemap.xml`
- `feed.xml`
- `manifest.webmanifest`
- optional `service-worker.js`

## Uploads, downloads, and files

Uploads should prefer normal HTML forms plus transport helpers.

Use:

- `<form enctype="multipart/form-data">`
- `@submit="create(...)"` when that fits
- `ctx.action.formData()`
- `ctx.action.files(name?)`

Downloads should prefer:

- normal links
- backend responses with `Content-Disposition`
- `ctx.nav.download(path, filename?)` when imperative behavior is needed

## Developer tooling rules

AI agents should know these built-in tools exist:

- validation
- export
- host inspection
- page manifest schema
- debug inspection

Useful endpoints and helpers:

- `/__brackets/debug`
- `/__brackets/host`
- `/__brackets/schema/page-manifest.json`
- `window.__BRACKETS_DEVTOOLS__.inspect()`

## What to generate for common app types

### Simple website

Generate:

- a small number of `.view` files
- `.html` pages
- optional `.logic` only when behavior is needed
- root `robots.txt`
- route metadata for SEO

Do not over-structure it.

### SPA

Generate:

- routeable `.view` files
- shared layout only if needed
- route-level loading/error states
- cache/prefetch behavior
- named actions in `.logic`

### Backend-connected web app

Generate:

- `.view`
- `.html`
- `.logic`
- `.api`

Keep the backend contract in `.api`.

### Local-first app

Generate:

- `.view`
- `.html`
- `.logic`
- `.data`
- `.json`, `.yaml`, or `.db` as needed

### Desktop app

Generate the same app contract as web.

Only the host path changes.

## What not to do

Do not:

- introduce React patterns
- introduce Next.js-specific architecture
- turn templates into JS components by default
- create a second router outside Brackets
- build a custom store that competes with Datastar signals
- require npm setup to understand the app
- require a backend just to run a basic Brackets app
- require nested folders for small apps

## AI completion checklist

When an AI agent creates or edits a Brackets app, the result should:

1. stay no-build
2. stay HTML-first
3. keep Datastar as the engine
4. preserve the Brackets syntax contract
5. preserve the `.api` versus `.data` split
6. stay backend agnostic
7. avoid unnecessary folder ceremony
8. remain easy to copy from desktop to server
9. use secure defaults
10. remain teachable to a human developer

## Final instruction

If there is a conflict between:

- adding more framework ceremony
- and keeping Brackets simpler, flatter, more portable, and more Datastar-aligned

choose the simpler, flatter, more portable, more Datastar-aligned path.
