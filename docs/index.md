# Brackets Docs

![Brackets](./hero.svg)

Brackets is a no-build, HTML-first, Datastar-powered framework for fast SPAs, websites, apps, and desktop-style experiences.

Use this page as the public documentation front door on GitHub.

Current status:

- `v0.95`
- syntax locked
- Datastar underneath
- ready for broader production-style evaluation

## Start Here

- [Getting started](../docs.md)
- [Guide](./guide.md)
- [Reference](./reference.md)
- [Agents](./agents.md)

## Best Learning Path

If you want the smoothest path in:

1. [Getting started](../docs.md)
2. [Guide](./guide.md)
3. Run `config show` and `info`
4. Run `health` and `test app`
5. [Reference](./reference.md)

## Learn The Model

If you want to understand how Brackets is meant to work before you build:

- [Dynamic app, static shape](../docs.md#dynamic-app-static-shape)
- [Modern flat-file app model](./guide.md#modern-flat-file-app-model)
- [Platform contracts](./platform.md)

## Why Brackets

- No build step.
- HTML stays the main template surface.
- Datastar stays the engine.
- Brackets adds routing, layouts, lifecycle, app structure, and portable hosting.
- The same app model can work with local files, SQLite, C#, Tauri, .NET, Go, Rust, Python, PHP, Ruby, Java, Node, and other backends.

## Learn By Goal

### Build a simple website

- [Getting started](../docs.md#simple-website)
- [Guide: website patterns](./guide.md#website-and-seo-patterns)

### Build a fast SPA

- [Getting started](../docs.md#spa)
- [Guide: SPA](./guide.md#building-common-app-types)
- [Guide: async and data patterns](./guide.md#async-and-data-patterns)

### Connect any backend

- [Getting started](../docs.md#backend-connected-app)
- [Guide: remote API patterns](./guide.md#remote-api-patterns)
- [Reference: `.api` helper surface](./reference.md#api-helper-surface)

### Build local-first with files or SQLite

- [Getting started](../docs.md#local-first-app)
- [Guide: local data patterns](./guide.md#local-data-patterns)
- [Reference: storage guidance](./reference.md#storage-guidance)

### Understand the modern architecture

- [Getting started: dynamic app, static shape](../docs.md#dynamic-app-static-shape)
- [Guide: modern flat-file app model](./guide.md#modern-flat-file-app-model)
- [Platform: local data and authority profiles](./platform.md#4-local-data-contract)

### Ship to production

- [Docker](./docker.md)
- [Platform](./platform.md)
- [Release](./release.md)

## Core Concepts

### File model

- `.view`
- `.logic`
- `.api`
- `.data`
- `.html`
- `.json`
- `.yaml`
- `.db`

### Runtime model

- `page(...)`
- `mount(ctx)`
- `sync(ctx)`
- `run(payload, ctx)`
- named actions
- grouped `ctx`

### Syntax

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

## Documentation Map

- [Getting started](../docs.md)
- [Guide](./guide.md)
- [Reference](./reference.md)
- [Checklist](./checklist.md)
- [Platform](./platform.md)
- [Docker](./docker.md)
- [Release](./release.md)
- [Agents](./agents.md)
