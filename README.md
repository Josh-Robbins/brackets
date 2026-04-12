# Brackets

![Brackets](./docs/hero.svg)

Brackets is a no-build, HTML-first, Datastar-powered framework for building fast SPAs, websites, apps, and desktop-style experiences with superhuman speed.

It is built for developers who want less setup, less ceremony, less code, and more momentum.

Current public status:

- `v0.95`
- syntax is locked
- Datastar is the engine
- ready for broader real-world testing
- not yet being called `v1` until more people have tried it in production

## Start Here

- [Docs front page](./docs/index.md)
- [Getting started](./docs/index.md#getting-started)
- [Guide](./docs/guide.md)
- [Reference](./docs/reference.md)

## First Hour

If you are evaluating Brackets for the first time, use this order:

1. Read [Getting started](./docs/index.md#getting-started)
2. Skim [Guide](./docs/guide.md)
3. Start the root CLI entry for your OS.
4. Run `info` and `config show`.
5. Run `run app`, then open the root `index.html` through the built-in host.
6. Run `run app test` to verify the package contract.
7. Read [Reference](./docs/reference.md) only when you want the full contract

## Why Brackets

- No build step.
- HTML stays the main template surface.
- Datastar stays the engine.
- Brackets adds the file model, syntax, routing, layouts, lifecycle, and host story.
- Apps stay portable from desktop folders to servers and paired backends.
- The same app model can work with local files, SQLite, C#, Tauri, .NET, Go, Rust, Python, PHP, Ruby, Java, Node, and other backends.

## Modern Model

Brackets should be taught as a modern application framework with a file-first shape:

- `.view` / `.html` = UI
- `.logic` = app behavior
- `.data` = model code, queries, validation, transforms, and persistence rules
- `.db`, `.json`, `.yaml` = runtime storage formats
- `.api` = optional remote sync, external services, and shared authority

Runtime flow:

1. `.data` defines the data rules
2. the host/runtime manages local storage and database access
3. `.logic` reads and writes
4. `.view` / `.html` reacts through Datastar
5. when two routes share the same layout, Brackets keeps that shell mounted and updates only the `:mount` region

Datastar transfer boundary:

- `.data` stays local-first, but when it moves data into the live UI it should preserve Datastar-compatible HTTP and SSE behavior
- `.api` stays remote/shared-authority-facing, and it should preserve that same Datastar-compatible HTTP and SSE behavior
- Brackets should not invent a second transport model under either layer

Brackets now has a no-build architecture check path too:

- `.logic` should not own direct storage access
- `.logic` should not own direct remote transport
- `.data` should stay local-first
- `.api` should stay remote/backend-facing

That means Brackets can stay portable and static in shape while still being fully dynamic in behavior.

## Product Pillars

### Superhuman speed

- less setup
- less framework ceremony
- fewer files for simple apps
- faster path from idea to working page

### Superhuman reach

- backend agnostic `.api`
- local `.data` with `.json`, `.yaml`, and `.db`
- portable from desktop folder to server to paired backend

### Superhuman clarity

- `.html` for templates
- `.view` for page manifests
- `.logic` for behavior
- root `config.yaml` for human-readable setup

## Core Model

### Public files

- `.view`
- `.logic`
- `.api`
- `.data`
- `.html`
- `.json`
- `.yaml`
- `.db`

### Public syntax

- `[name]`
- `#name`
- `@event="..."`
- `:state`
- `:calc`
- `:text`
- `:show`
- `:bind`
- `:if`
- `:each`
- `:use`
- `:props`
- `:mount`
- `mutate()`
- `read()`
- `request()`
- `get()`
- `create()`
- `update()`
- `patch()`
- `delete()`

### Transport model

- `read()` is the live SSE helper
- `request()`, `get()`, `create()`, `update()`, `patch()`, and `delete()` are HTTP-first helpers
- `.html`, `.sse`, `.state`, and `.json` describe how Datastar should handle the result
- `mutate()` is local state mutation, not transport
- `.data` and `.api` should preserve Datastar-compatible SSE and HTTP transfer when they move data
- `.api` modules also get `http.client(baseUrl)` / `http.resource(baseUrl)` / `http.openapi(baseUrl)`

## Quick Start

The smallest useful Brackets app can be just a few files:

```text
Brackets/
  framework/
  app/
    home/
      home.view
      home.html
      home.logic
  tests/
    test.js
  cli.js
  config.yaml
  index.html
  robots.txt
  README.md
```

Brackets should not force folder ceremony too early. Start small and grow structure only when the app needs it.

## Where Code Goes

This is the shortest way to keep a Brackets app clean:

- `.view` wires the page
- `.html` renders the page
- `.logic` orchestrates behavior
- `.data` owns model rules, queries, validation, transforms, and persistence
- `.api` owns remote/backend transport

If you are unsure where code belongs, put it in the smallest layer that can own it honestly.

## Built-in Host

The root package is the thing the built-in host serves:

- root `index.html` is the entry page
- root `config.yaml` controls runtime, host, and entry behavior
- `entry.folder` decides which folder the host treats as the package entry root
- when an `app/` folder exists, the router, `.view`, `.html`, `.logic`, `.data`, and `.api` layers are discovered from there

The simplest workflow is:

1. Start the root CLI entry for your OS.
2. Run `config show`.
3. Run `run app`.
4. Open the reported local URL.
5. Run `health`, `status server`, and `run app test` when you want to verify the framework.

## Workflow

Inside the root CLI:

- `info` shows the package root, engine path, runtime mode, and entry file
- `config show` shows the live root config
- `run app` starts the built-in Deno host in embedded mode
- `run app dev` starts the built-in host in **dev mode** (file watcher + dev SSE: in-place SPA refresh for app files, full reload when root `index.html`, root config, or core `framework/*.js` changes)
- `status server` shows the current local and network origins
- `health` probes the running host
- `run app test` runs the bundled Deno framework test suite against the current package (`test app` is an alias)

### Windows (CMD)

From the unzipped package folder, use the bundled engine (adjust the path if you use another host platform folder):

```bat
cd path\to\Brackets
framework\host\windows-x64\deno.exe run --allow-read --allow-write --allow-net --allow-run --allow-env cli.js
```

Then use the interactive prompt (for example `run app dev`) or pass the same tokens as CLI arguments.

External mode stays honest too:

- set `runtime: external`
- set `external.origin`
- start your outside host yourself
- then use `status server`, `health`, and `run app test` from the same CLI

## Tests

The built-in verification path is `run app test` from the root CLI.

The package test file is still [`tests/test.js`](./tests/test.js), and `run app test` runs it through the bundled Deno host instead of a separate Node test path. The test suite itself uses **Deno APIs and `jsr:@std/path`** only—it does not import `node:*` modules, so you are not depending on Node.js to run tests (the built-in host still uses Deno’s Node-compat layer internally for `framework/server.js`).

## Distribution

The default Brackets distribution should be a versioned portable `.zip` release.

- download the zip
- unzip it where you want
- open the app folder and start building
- copy that same folder to a server when you are ready to ship

That is the best default because it matches the framework itself:

- no install
- no build step
- no package-manager requirement
- easy desktop-folder use
- easy movement to production

## Documentation

- [Docs Home](./docs/index.md)
- [Getting started](./docs/index.md#getting-started)
- [Guide](./docs/guide.md)
- [Reference](./docs/reference.md)
- [Modern architecture](./docs/guide.md#modern-flat-file-app-model)
- [Checklist](./docs/checklist.md)
- [Docker](./docs/docker.md)
- [Platform](./docs/platform.md)
- [Release](./docs/release.md)
- [Agents](./docs/agents.md)

Repo tooling: the host imports **`jsr:@std/yaml@1.0.12`** directly from [`framework/server.js`](framework/server.js) for `config.yaml` and storage helpers. Run the integration suite with the bundled engine, for example:  
`framework/host/<platform>/deno test tests/test.js --allow-all` (Windows: `deno.exe` in that folder).

## Current State

The current prototype already includes:

- a tiny same-origin host
- Datastar-first syntax transforms
- SPA routing with layout preservation
- hybrid routing from `.view`, `router.logic`, and grouped route logic
- route-level loading and error state hooks
- optimistic state and cache helpers
- `.data` adapters for `.json`, `.yaml`, and `.db`
- built-in live SSE updates for `.data` modules through the same Deno host
- website/runtime endpoints
- host and app contract endpoints
- a branded starter splash with real framework demo assets under `framework/demo/`

What the current quality bar means:

- the built-in Deno package tests are green
- the root CLI `run app test` path is green
- the router, transport, `.data`, and docs now align with the current root-package contract

The main implementation lives in:

- [server.js](C:\Users\joshr\Documents\dev\Brackets\framework\server.js)
- [runtime.js](C:\Users\joshr\Documents\dev\Brackets\framework\runtime.js)
- [syntax.js](C:\Users\joshr\Documents\dev\Brackets\framework\syntax.js)
- [cli.js](C:\Users\joshr\Documents\dev\Brackets\cli.js)
- [test.js](C:\Users\joshr\Documents\dev\Brackets\tests\test.js)
