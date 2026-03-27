# Brackets

Brackets is a no-build, HTML-first, Datastar-powered framework for building fast SPAs, websites, apps, and desktop-style experiences with superhuman speed.

It is built for developers who want less setup, less ceremony, less code, and more momentum.

## Why Brackets

- No build step.
- HTML stays the main template surface.
- Datastar stays the engine.
- Brackets adds the file model, syntax, routing, layouts, lifecycle, and host story.
- Apps stay portable from desktop folders to servers and paired backends.
- The same app model can work with local files, SQLite, C#, Tauri, .NET, Go, Rust, Python, PHP, Ruby, Java, Node, and other backends.

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
- `config/brackets.yaml` or `config/brackets.json` for human-readable setup

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
- `.api` modules also get `http.client(baseUrl)` / `http.resource(baseUrl)` / `http.openapi(baseUrl)`

## Quick Start

The smallest useful Brackets app can be just a few files:

```text
Brackets/
  framework/
    demo/
  app/
    home.view
    home.html
    home.logic
  config/
    brackets.yaml
  tests/
    test.js
  index.html
  robots.txt
  README.md
  LICENSE
```

Brackets should not force folder ceremony too early. Start small and grow structure only when the app needs it.

## Demo

Run the mock remote backend:

```powershell
node demo/remote/server.js
```

Run the framework host:

```powershell
node src/cli.js demo/app --port 4173 --proxy /remote=http://127.0.0.1:4174
```

Open:

```text
http://127.0.0.1:4173
```

## Workflow

Validate an app:

```powershell
node src/cli.js validate demo/app
```

Export an app:

```powershell
node src/cli.js export demo/app --out-dir dist
```

The exported folder is the deployment artifact.

## Tests

```powershell
node --test tests/test.js
```

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
- [Getting started](./docs.md)
- [Guide](./docs/guide.md)
- [Reference](./docs/reference.md)
- [Checklist](./docs/checklist.md)
- [Docker](./docs/docker.md)
- [Platform](./docs/platform.md)
- [Release](./docs/release.md)
- [Agents](./docs/agents.md)

## Current State

The current prototype already includes:

- a tiny same-origin host
- Datastar-first syntax transforms
- SPA routing with layout preservation
- route-level loading and error state hooks
- optimistic state and cache helpers
- `.data` adapters for `.json`, `.yaml`, and `.db`
- SEO/export endpoints
- debug and schema endpoints
- a branded starter splash with real framework demo assets under `framework/demo/`

The main implementation lives in:

- [server.js](C:\Users\joshr\Documents\dev\Brackets\src\server.js)
- [runtime.js](C:\Users\joshr\Documents\dev\Brackets\src\runtime\runtime.js)
- [syntax.js](C:\Users\joshr\Documents\dev\Brackets\src\syntax.js)
- [data-adapters.js](C:\Users\joshr\Documents\dev\Brackets\src\data-adapters.js)
- [tooling.js](C:\Users\joshr\Documents\dev\Brackets\src\tooling.js)
