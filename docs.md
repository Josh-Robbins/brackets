# Brackets Docs

This is the fast start guide for Brackets.

Use this file first.

Then follow the linked docs when you need more depth, more examples, or more advanced setup.

Those links are relative on purpose so they work:

- inside the Brackets folder
- in editors
- on GitHub after the project is published

Current status:

- Brackets is being kept at `v0.95`
- syntax is locked
- Datastar is the engine
- the current goal is wider production-style testing, not public syntax churn

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

## First hour

If you are brand new to Brackets, do this first:

1. Read this file once from top to bottom.
2. Run `node src/cli.js check demo/app`.
3. Run `node src/cli.js doctor demo/app --strict`.
4. Start the demo host and click through the demo app.
5. Read [docs/guide.md](./docs/guide.md) for practical patterns.
6. Read [docs/reference.md](./docs/reference.md) only when you need the exact contract.

That order keeps the framework approachable without hiding the deeper rules.

## Dynamic app, static shape

Brackets should behave like a real application even when the app starts as plain files in a folder.

That means the framework should absolutely support:

- dynamic UI and app behavior
- local persistence and local database use
- offline and local-first workflows
- optional shared trusted server authority through `.api`

So the boundary is:

- `.view` and `.html` define the UI
- `.logic` defines app behavior
- `.data` defines the model layer, local data rules, queries, validation, transforms, and persistence behavior
- `.db`, `.json`, and `.yaml` hold runtime data
- `.api` is optional remote sync, external services, and shared authority

From the user's point of view, that is still a dynamic framework, not a document site.

### Runtime flow

The intended runtime flow is:

1. `.data` defines how the data behaves
2. the runtime or host manages local storage such as `.json`, `.yaml`, and `.db`
3. `.logic` reads and writes through the `.data` contract
4. `.view` and `.html` react through Datastar

Datastar transfer boundary:

- `.data` is still the local-first model layer, but when it transfers or streams data into the UI it should do that through Datastar-compatible HTTP and SSE behavior
- `.api` is the remote/shared-authority layer, and it should use the same Datastar-compatible HTTP and SSE behavior for backend sync
- Brackets should not invent a separate transport protocol under either layer
- overlapping keyed requests should cancel superseded work without dropping the next request's loading state early
- cached reads should deduplicate overlapping loads and preserve stale data during failed background refreshes
- overlapping transport requests should keep page-level loading and error state aligned with the latest active request
- failed route warming and failed session refreshes should be retryable instead of leaving the runtime stuck in a poisoned state
- protected routes should re-check session state before redirecting when the current session is missing or unauthenticated, so login recovery and paired-backend auth stay reliable
- configured route prefetch should follow navigation, not just the first page load
- redirect loops should fail clearly instead of recursing forever through router hooks or redirect routes
- `notFound()` redirects should choose the final destination before history is updated
- a `notFound()` redirect back to the same path should fall back to the normal not-found view
- live `read()` transport should fail with a clear framework error if SSE is unavailable in the current host
- live `read()` loading should stay active until the SSE stream actually opens
- live SSE failures should surface as clear Brackets transport errors instead of raw browser event objects
- form payload merges should preserve repeated field values instead of collapsing arrays into comma strings
- form requests should also accept direct `FormData` payloads without requiring DOM form lookup first
- local `.json`, `.yaml`, and encrypted storage writes should stay serialized and readable under overlap
- `.db` transactions should stay serialized under overlap so local-first apps keep a dependable model layer
- invalidating cache should prevent older in-flight reads from silently repopulating cleared keys

Datastar-first implementation boundary:

- `:state`, `:calc`, `:run`, `:watch`, `:text`, `:show`, `:bind`, `:class.*`, and `:set.*` should compile to native Datastar attributes
- authored `@event` syntax should land on Datastar `data-on:*`
- simple `read()`, `request()`, `get()`, `create()`, `update()`, `patch()`, `delete()`, and `mutate()` paths should compile to Datastar-native behavior when there is a clean one-to-one fit
- only framework-specific surfaces such as `:use`, `:props`, `:area`, `:fill`, `:mount`, `:if`, `:each`, `:html`, `:loading`, and `:error` should stay on the Brackets-owned side

That keeps the architecture modern without giving up the portable file-first model.

### Deployment profiles

Brackets should support three clear authority profiles:

- desktop-folder or local-host profile
  `.data` may persist to real local `.json`, `.yaml`, and `.db` files through the built-in host or another host adapter
- static-server profile
  the UI, routing, state, offline behavior, and local-first workflow still work, while shared trusted writes stay optional through `.api`
- paired-backend profile
  `.api` provides shared authority, sync, and external services without changing the app model

The important promise is not "every deployment writes server files directly."

The important promise is:

- the same Brackets app model stays dynamic
- the same app can move from desktop folder to server to paired backend
- Datastar still drives the frontend reality

### Teaching shortcut

When explaining Brackets to a new developer, teach it in this order:

1. `.view` and `.html` define the UI
2. `.logic` defines what the app does
3. `.data` defines the model and local persistence rules
4. `.api` is optional shared authority and remote sync
5. Datastar powers the reactive frontend behavior underneath all of it
6. `.data` and `.api` both preserve Datastar-shaped HTTP and SSE transfer when data moves

That gives people the right model quickly without pulling them into framework internals first.

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

## Where code goes

This is the simplest reliable Brackets rule:

- `.view` says what page exists
- `.html` says what the page looks like
- `.logic` says when the app should do something
- `.data` says what the data is and how it behaves
- `.api` says how the app talks to shared authority or external services

Use that split first.

It keeps apps:

- easier to teach
- easier to test
- easier to move between local-first and backend-connected setups
- easier for AI and humans to reason about

## Config

Brackets supports a simple config file for the host and starter experience.

Preferred files:

- `config/brackets.yaml`
- `config/brackets.json`

Use it for:

- host address
- port number
- HTML trust policy
- encrypted local storage key settings
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

security:
  html: sanitize
  storage:
    keyEnv: BRACKETS_DATA_KEY
    pbkdf2Iterations: 250000

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

`security.html` can be:

- `sanitize` for the safe default
- `trusted` only when the app intentionally wants raw HTML insertion

Encrypted local persistence can use:

- `security.storage.keyEnv` to name the host environment variable that holds the encryption passphrase
- `security.storage.pbkdf2Iterations` to tune host-side key stretching for the built-in encrypted storage helpers

## Encrypted local persistence

Brackets should keep encrypted local persistence as an optional host capability.

This fits the framework principles because:

- it does not change Brackets syntax
- it keeps `.data` as the local persistence contract
- it keeps secrets out of app files
- it works with the built-in host today and can be implemented by other hosts later

Current built-in host path:

- set `BRACKETS_DATA_KEY` in the host environment, or change `security.storage.keyEnv`
- use `storage['[e]json'](...)` or `storage['[e]yaml'](...)` inside `.data`
- keep `.db` encryption host-specific unless the host can provide it safely

Example:

```js
({
  profile({ storage }) {
    return storage['[e]json']('@storage/profile.secure.json').read({})
  },

  saveProfile({ storage }, nextValue) {
    return storage['[e]json']('@storage/profile.secure.json').write(nextValue)
  }
})
```

Short-name note:

- `storage['[e]json'](...)` and `storage['[e]yaml'](...)` are the expressive public names
- `ejson(...)`, `eyaml(...)`, `secureJson(...)`, and `secureYaml(...)` remain compatibility aliases underneath

Security rule:

- encrypted local persistence helps protect data at rest on the machine or in the app folder
- it does not turn local data into trusted shared authority
- auth, authorization, and shared truth should still live in a trusted host or backend when the app needs them
- host-managed session cookies should stay local-safe on plain HTTP and upgrade to `Secure` host cookies automatically on HTTPS deployments

## Type safety without a build step

Brackets treats type safety as a runtime framework feature.

That matters because Brackets is intentionally:

- no build step
- portable-folder first
- backend agnostic

So instead of depending on a compile step to catch bad shapes, Brackets validates important contracts when they are loaded and used.

First-class runtime contracts include:

- `page()` manifests
- `config/brackets.yaml` and `config/brackets.json`
- `.logic`, `.api`, and `.data` module exports
- `router.logic` and `/routes/*.logic`
- RPC payloads for `.api` and `.data`
- duplicate page ids and route path collisions

Use the CLI check when you want a no-build type report with file and line locations:

```powershell
node src/cli.js check demo/app
node src/cli.js check demo/app --json
```

It should catch things like:

- wrong field types
- bad module export shapes
- duplicate page ids
- route and alias collisions
- self-redirecting route definitions
- multi-route redirect cycles
- not-found redirects that would otherwise leave dead history entries
- missing `.html`, `.logic`, `.api`, and `.data` references
- references that try to escape outside the app root
- architecture drift between `.logic`, `.data`, and `.api`

When something is wrong, Brackets should return structured errors, not just vague crashes.

That means framework errors can include:

- `error`
- `code`
- `issues`
- `hint`

This is the no-build tradeoff done the right way:

- keep authoring simple
- keep syntax locked
- keep Datastar as the engine
- still fail early with useful contract errors

Recommended everyday quality loop:

```powershell
node src/cli.js check app
node src/cli.js doctor app --strict
node --test tests/test.js
```

That is the shortest path to a serious Brackets app without introducing a build step.

## Write small, clean, type-safe files

Brackets works best when each file type stays focused and small.

Preferred shape:

- `.view` stays declarative
- `.html` stays presentational
- `.logic` stays orchestration-first
- `.data` stays model-first
- `.api` stays transport-first

That gives you smaller files, clearer runtime errors, and better `check` diagnostics without needing a build step.

### Small `.view`

Keep `.view` focused on page identity and wiring:

```js
page({
  id: 'home',
  route: '/',
  html: '@app/home.html',
  logic: '@app/home.logic'
})
```

Good rule:

- put page identity, route, layout, meta, `api`, and `data` wiring here
- do not put business logic here

### Small `.html`

Keep `.html` focused on structure and bindings:

```html
<main [page] :state="{ count: 0 }">
  <h1 :text="title"></h1>
  <p :text="count"></p>
  <button @click="increment">Add</button>
</main>
```

Good rule:

- prefer `:text`, `:show`, `:bind`, and named actions
- do not hide model code inside markup

### Small `.logic`

Keep `.logic` focused on orchestration and user intent:

```js
({
  async mount({ data, state }) {
    state.set({ contacts: await data.contacts.list() })
  },

  async saveContact({ data, state, action }) {
    const contacts = await data.contacts.add(action.input() ?? {})
    state.set({ contacts })
  }
})
```

`ctx.action.input()` should stay friendly for normal forms: repeated field names should come through as arrays instead of being flattened away.

Good rule:

- `.logic` decides when to load, save, refresh, and navigate
- `.logic` should not own validation, normalization, queries, or storage code when `.data` can own them

### Small `.data`

Keep `.data` focused on the model:

```js
function normalizeContact(input) {
  return {
    id: Number(input?.id) || Date.now(),
    name: String(input?.name ?? '').trim()
  }
}

function validContact(contact) {
  return Boolean(contact.name)
}

({
  async list({ storage }) {
    const records = await storage.json('@storage/contacts.json').read([])
    return records.map(normalizeContact).filter(validContact)
  }
})
```

Good rule:

- `.data` should own most, and ideally all, model code when that makes sense
- keep validation, transforms, queries, and persistence rules here

### Small `.api`

Keep `.api` focused on remote/backend transport:

```js
({
  list({ http }) {
    return http.client('/remote/crm').get('/contacts')
  }
})
```

Good rule:

- keep backend paths, headers, OpenAPI operations, and remote sync here
- do not mix local storage rules into `.api`

### Type-safe teaching rule

If a file starts getting hard to explain in one sentence, it probably owns too much.

Teach the files like this:

- `.view`: what page exists
- `.html`: what the user sees
- `.logic`: what the app does
- `.data`: what the data is
- `.api`: how the app talks outward

## Plugins and extensions

Brackets does not need a framework-owned plugin API.

That is intentional.

Why:

- the app is already made of normal files
- `.html`, `.logic`, `.api`, and `.data` are already extension points
- Datastar already provides the reactive engine and request model
- browser modules, CSS, Web Components, workers, service workers, and backend services can already be added directly
- a plugin API would add framework ceremony, versioning friction, and lock-in where normal code already works

In Brackets, most things people call a plugin are just:

- another `.logic` file
- another `.api` file
- another `.data` file
- another `.html` component or layout
- a normal browser module imported by your app
- a backend service connected through `.api`
- a host bridge for desktop or native features

That means the easiest path is also the most powerful path:

- drop the code into `app/`
- import it with normal ESM
- connect it through `.logic`, `.api`, `.data`, or HTML
- keep building

You only need more structure when the app grows enough to want it.

### How to add capabilities without a plugin API

Add a browser helper:

```js
// app/format.logic
import { formatDistanceToNow } from './vendor/date.js'

({
  mount({ state }) {
    state.set({
      updatedLabel: formatDistanceToNow(new Date())
    })
  }
})
```

Add a remote integration:

```js
// app/crm.api
({
  listContacts({ http }) {
    return http.client('/remote/crm').get('/contacts')
  }
})
```

Add local storage behavior:

```js
// app/preferences.data
({
  load({ storage }) {
    return storage.json('./preferences.json').read({})
  }
})
```

Add reusable UI:

```html
<!-- app/card.html -->
<article [card]>
  <h2 :text="props.title"></h2>
  <div :html="props.body"></div>
</article>
```

Then use it normally:

```html
<section :use="'./card.html'" :props="{ title: 'Ready', body: trustedBody }"></section>
```

### When shared code should live outside one app

If something is meant to be reused across many apps, prefer:

- a copied or vendored module folder
- a shared backend service
- a host integration layer
- a documented Brackets pattern in the public docs

That keeps Brackets simple for app authors while still making advanced reuse possible.

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
- optional `router.logic`
- optional `/routes/*.logic`
- optional shared layout
- `:loading`
- `:error`
- `ctx.cache`
- `ctx.nav.prefetch()`

Read more:

- [SPA patterns](docs/guide.md#spa)
- [Async and data patterns](docs/guide.md#async-and-data-patterns)

### Routing

Brackets routing can stay simple or become very powerful without changing syntax.

You can use:

- file-based routing with `.view` files
- global router control with `app/router.logic`
- grouped logic-based route registration with `app/routes/*.logic`

These can work together in one app.

Recommended shape:

- use `.view` for the normal page path
- use `router.logic` for guards, redirects, and router-wide policy
- use `/routes/*.logic` when a larger app needs grouped route declarations

Additive router powers:

- `defaults` for shared route policy
- `alias` and `aliases` for alternate paths
- `redirectTo` for lightweight redirects
- `params` for param validation
- `preload` for route warming hints
- route-target navigation helpers so code can use route ids plus params/query/hash instead of raw strings everywhere

Preferred navigation style:

```js
ctx.nav.to({
  id: 'contact',
  params: { id: contact.id },
  query: { tab: 'notes' },
  hash: 'activity'
})
```

Also available:

- `ctx.nav.href(target)`
- `ctx.nav.isActive(target)`
- `ctx.nav.match(target)`
- `ctx.nav.forward()`
- `ctx.route.href(next?)` for the current route
- `ctx.route.isActive(next?)` for current-route checks
- router hooks also receive route-aware `to.href()`, `from?.href()`, and route metadata with aliases

Read more:

- [Reference: routing](docs/reference.md#routing)
- [Guide: route patterns](docs/guide.md#spa)

CLI superpower:

- `node src/cli.js routes app --generate` scans your HTML files and creates missing `.view` files for you
- it respects existing `.view` files instead of overwriting them
- it works with loose app structure, so you do not have to create `pages/` or `views/` folders first
- use `--dry-run` to preview what it would generate

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
