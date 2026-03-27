# Brackets Docs

Brackets is a no-build, HTML-first, Datastar-powered framework for fast SPAs, websites, apps, and desktop-style experiences.

Use this page as the documentation home on GitHub.

## Start Here

- [Getting started](../docs.md)
- [Guide](./guide.md)
- [Reference](./reference.md)

## What Makes Brackets Different

- No build step.
- HTML stays the main template surface.
- Datastar stays the engine.
- Brackets adds the file model, syntax, routing, lifecycle, and host story.
- Apps stay portable from desktop folders to servers and paired backends.

## Learn By Goal

### Build a simple website

- [Getting started](../docs.md#simple-website)
- [Guide: website patterns](./guide.md#website)

### Build a fast SPA

- [Getting started](../docs.md#spa)
- [Guide: SPA](./guide.md#spa)
- [Guide: async and data patterns](./guide.md#async-and-data-patterns)

### Connect any backend

- [Getting started](../docs.md#backend-connected-app)
- [Guide: remote API patterns](./guide.md#remote-api-patterns)
- [Reference: `.api` helper surface](./reference.md#api-helper-surface)

### Build local-first with files or SQLite

- [Getting started](../docs.md#local-first-app)
- [Guide: local data patterns](./guide.md#local-data-patterns)
- [Reference: storage guidance](./reference.md#storage-guidance)

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

## Product Pillars

### Superhuman speed

Brackets is meant to reduce setup, reduce ceremony, and reduce the amount of code needed for common app work.

### Superhuman reach

Brackets is backend agnostic and should work with local files, SQLite, C#, Tauri, .NET, Go, Rust, Python, PHP, Ruby, Java, Node, and other backends through the same frontend contract.

### Superhuman clarity

The framework should stay teachable:

- HTML is still HTML
- config stays in YAML or JSON
- app files stay normal files
- structure grows only when the app needs it

## Documentation Map

- [Getting started](../docs.md)
- [Guide](./guide.md)
- [Reference](./reference.md)
- [Checklist](./checklist.md)
- [Platform](./platform.md)
- [Docker](./docker.md)
- [Release](./release.md)
- [Agents](./agents.md)

## For AI Builders

If an AI is helping with Brackets, start with:

- [Agents](./agents.md)

Then use:

- [Getting started](../docs.md)
- [Guide](./guide.md)
- [Reference](./reference.md)
