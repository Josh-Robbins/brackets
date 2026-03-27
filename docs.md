# Brackets Docs

This is the fast start guide for Brackets.

Use this file first.

Then follow the linked docs when you need more depth, more examples, or more advanced setup.

Those links are relative on purpose so they work:

- inside the Brackets folder
- in editors
- on GitHub after the project is published

## What Brackets is

Brackets is:

- no build step
- HTML-first
- powered by Datastar
- backend agnostic
- portable-folder first

You should be able to:

- drop Brackets into a folder
- start building right away
- keep your app as normal files
- copy that same app to a server later
- connect it to any backend when needed

## Start here

The smallest useful Brackets app can be just a few files in `app/`.

Example:

```text
Brackets/
  framework/
    demo/
  app/
    home.view
    home.html
    home.logic
  config/
    brackets.json
  tests/
  index.html
  robots.txt
  README.md
  LICENSE
```

You do not need to create folders inside `app/` unless the app grows enough to need them.

## Config

Brackets supports a simple config file for the host and starter experience.

Preferred files:

- `config/brackets.yaml`
- `config/brackets.json`

Use it for:

- host address
- port number
- splash title
- splash tagline
- accent and panel colors
- starter chips and hints
- generated logo and favicon styling

Example:

```yaml
server:
  host: 127.0.0.1
  port: 4173

branding:
  name: Brackets
  title: Brackets is ready
  tagline: Everything is working and ready to start building from.
  accent: "#c4512c"
  accentSoft: "#f6b48f"
  canvas: "#f7efe3"
  panel: "#fffaf4"
  ink: "#1f1a17"
  muted: "#6c6257"

splash:
  enabled: true
  chips:
    - No build step
    - Datastar engine
    - Backend agnostic
  hints:
    - Edit files in app/
    - Adjust settings in config/brackets.yaml
    - Use framework/docs.md and framework/agents.md when you need help
```

Brackets uses this to shape the first-run splash page and generate:

- `/framework/demo/splash.html`
- `/framework/demo/logo.svg`
- `/framework/demo/favicon.svg`

The startup page is meant to feel alive and reassuring: clear readiness status, obvious next steps, and a polished first impression before you write your first page.

## Minimal example

### `app/home.view`

```js
page({
  id: 'home',
  route: '/',
  html: '@app/home.html',
  logic: '@app/home.logic'
})
```

### `app/home.html`

```html
<main [page] :state="{ count: 0 }">
  <h1>Hello Brackets</h1>
  <p :text="count"></p>
  <button @click="mutate('count', count + 1)">Add</button>
</main>
```

### `app/home.logic`

```js
({
  mount({ state }) {
    state.set({ count: 0 })
  }
})
```

## Basic paths

### Simple website

Use:

- `.view`
- `.html`
- optional `.logic`
- `robots.txt`
- page `title`, `meta`, and `seo`

Read more:

- [Website guide](docs/guide.md#building-common-app-types)
- [SEO and website patterns](docs/guide.md#website-and-seo-patterns)

### SPA

Use:

- multiple `.view` files
- optional shared layout
- `:loading`
- `:error`
- `ctx.cache`
- `ctx.nav.prefetch()`

Read more:

- [SPA patterns](docs/guide.md#spa)
- [Async and data patterns](docs/guide.md#async-and-data-patterns)

### Backend-connected app

Use:

- `.api`
- `http.client(baseUrl)`
- `http.openapi(baseUrl).operation({...})`
- Datastar-aligned transport helpers

Read more:

- [Remote API patterns](docs/guide.md#remote-api-patterns)
- [Reference: transport helpers](docs/reference.md#transport-helpers)
- [Docker and backend deployment](docs/docker.md)

### Local-first app

Use:

- `.data`
- `.json`
- `.yaml`
- `.db`

Read more:

- [Local data patterns](docs/guide.md#local-data-patterns)
- [Reference: storage guidance](docs/reference.md#storage-guidance)

### Desktop app

Use the same app model.

Only the host changes.

Read more:

- [Platform contracts](docs/platform.md)
- [Release model](docs/release.md)

### Docker and production

Use Docker when you want:

- a portable local dev stack
- a reverse-proxied backend
- mounted writable storage
- a cleaner production deployment path

Read more:

- [Docker guide](docs/docker.md)
- [Release model](docs/release.md)
- [Platform contracts](docs/platform.md)

## Docker setup

Brackets works well with Docker because Brackets is already file-first.

That means:

- your app can stay as normal files
- the Brackets folder can be mounted directly into a container
- the same folder can be copied into production
- a backend can run beside it without changing the Brackets app model

The main rule stays the same:

- no build step
- no frontend bundling requirement
- keep the app as files

### Local Docker dev

For local development, the best default is:

- mount the Brackets folder into a web server container
- keep app files read-only when possible
- mount writable storage separately if needed
- keep backend traffic on the same origin through a reverse proxy

Example `compose.yaml`:

```yaml
services:
  web:
    image: caddy:2-alpine
    ports:
      - "8080:80"
    volumes:
      - ./:/srv:ro
      - ./ops/Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy-data:/data
      - caddy-config:/config

volumes:
  caddy-data:
  caddy-config:
```

Example `ops/Caddyfile`:

```text
:80 {
  root * /srv
  try_files {path} /index.html
  file_server
}
```

This works well for:

- simple websites
- SPAs
- frontend-only apps
- apps that do not need writable local `.data` inside the container

### Docker with writable local data

If the app uses `.json`, `.yaml`, or `.db`, keep writable storage separate from the main app files.

Prefer:

- app files mounted read-only
- `app/storage` or another explicit storage path mounted writable

Example:

```yaml
services:
  web:
    image: caddy:2-alpine
    ports:
      - "8080:80"
    volumes:
      - ./:/srv:ro
      - ./app/storage:/srv/app/storage
      - ./ops/Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy-data:/data
      - caddy-config:/config

volumes:
  caddy-data:
  caddy-config:
```

Use this for:

- `.json` storage
- `.yaml` config/content
- `.db` SQLite files

### Docker with a backend

For backend-connected apps, keep Brackets on the same origin as the backend whenever possible.

The best default is:

- serve Brackets from one web container
- proxy backend traffic through `/api` or `/remote`
- keep `.api` pointed at same-origin paths

Example `compose.yaml`:

```yaml
services:
  web:
    image: caddy:2-alpine
    ports:
      - "8080:80"
    volumes:
      - ./:/srv:ro
      - ./ops/Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy-data:/data
      - caddy-config:/config
    depends_on:
      - backend

  backend:
    image: your-backend-image:latest
    expose:
      - "8080"
    environment:
      APP_ENV: development

volumes:
  caddy-data:
  caddy-config:
```

Example `ops/Caddyfile`:

```text
:80 {
  root * /srv
  try_files {path} /index.html
  file_server

  handle_path /api/* {
    reverse_proxy backend:8080
  }
}
```

That lets Brackets use:

- `/api/users`
- `/api/posts`
- `/api/auth/session`

without hard-coding backend origins into app code.

### Docker with SSE

If your backend uses SSE with Datastar:

- keep the SSE endpoint same-origin when possible
- proxy it through the same web container
- do not buffer the stream
- preserve `text/event-stream`

In Brackets, prefer:

- `read('/api/stream')`
- or `.api` methods wrapping the same path

## Production setup

The clean production shape is:

1. finish the Brackets app as plain files
2. validate the app
3. export or assemble the release folder
4. serve that folder from a web container or reverse proxy
5. run the backend in a separate container if needed
6. mount writable storage separately
7. keep frontend and backend on one public origin
8. terminate TLS at the edge

### Production `compose.yaml`

```yaml
services:
  web:
    image: caddy:2-alpine
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./release:/srv:ro
      - ./ops/Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy-data:/data
      - caddy-config:/config
    depends_on:
      - backend

  backend:
    image: your-backend-image:stable
    restart: unless-stopped
    expose:
      - "8080"
    environment:
      APP_ENV: production
      DATABASE_URL: ${DATABASE_URL}
      SESSION_SECRET: ${SESSION_SECRET}
    volumes:
      - backend-data:/var/lib/app

volumes:
  caddy-data:
  caddy-config:
  backend-data:
```

### Production reverse proxy example

```text
example.com {
  root * /srv
  try_files {path} /index.html
  file_server

  handle_path /api/* {
    reverse_proxy backend:8080
  }

  header {
    X-Content-Type-Options "nosniff"
    X-Frame-Options "DENY"
    Referrer-Policy "strict-origin-when-cross-origin"
  }
}
```

### Production rules

Use these defaults:

- keep app code immutable
- keep writable data outside the immutable app folder
- keep secrets out of Brackets files
- use same-origin backend routing when possible
- protect state-changing routes with CSRF defenses
- enable strong response headers
- keep writable mounts minimal
- back up `.json`, `.yaml`, and `.db` data

### Connecting any backend in production

Brackets should work with:

- C#
- Rust
- Go
- Python
- PHP
- Ruby
- Java
- Node
- .NET
- custom services behind a reverse proxy

The rule is simple:

- Brackets frontend stays the same
- `.api` stays the transport contract
- Docker or the server wiring decides where `/api` goes

## Security notes for Docker and production

Keep these security rules:

- serve Brackets and the backend through one origin when possible
- do not rely on permissive CORS as the normal solution
- keep CSRF protection on state-changing routes
- keep security headers enabled
- keep secrets in environment or a secret store
- do not make storage world-writable
- do not put trusted secrets into client state

Useful references:

- [Docker guide](docs/docker.md)
- [Release model](docs/release.md)
- [Platform contracts](docs/platform.md)

## Core rules

1. Keep `.html` as the main template surface.
2. Keep Datastar as the engine.
3. Keep `.api` for remote/backend transport.
4. Keep `.data` for local persistence.
5. Do not introduce a build step.
6. Do not force folder ceremony too early.

## Learn the language

Read these next:

- [Reference](docs/reference.md)
- [Guide](docs/guide.md)
- [Checklist](docs/checklist.md)

The syntax you will use most often:

- `[name]`
- `#name`
- `@event="..."`
- `:state="..."`
- `:text="..."`
- `:show="..."`
- `:bind="..."`
- `:if="..."`
- `:each="..."`
- `:use="..."`
- `:props="..."`
- `:mount`
- `mutate()`
- `read()`
- `request()`
- `get()`
- `create()`
- `update()`
- `patch()`
- `delete()`

## For advanced work

When you need more than the basics, use these:

- [Full guide](docs/guide.md)
- [Docker guide](docs/docker.md)
- [Platform details](docs/platform.md)
- [Release details](docs/release.md)
- [Framework reference](docs/reference.md)
- [AI build instructions](docs/agents.md)

## Examples

Use these as living examples that can grow over time and work well on GitHub:

- [Demo app](demo/app)
- [Demo remote backend](demo/remote)
- [Guide examples](docs/guide.md)

## For AI agents

If an AI is helping build or modify a Brackets app, point it to:

- [agents.md](docs/agents.md)

That file tells the AI:

- how to start small
- how to scale up safely
- how to keep Datastar as the engine
- how to connect any backend
- how to avoid unnecessary framework ceremony
