# Brackets Guide

This guide is the practical "build an app from scratch" document for Brackets.

It is written to be usable by:

- developers new to the framework
- experienced web developers evaluating the framework
- AI coding agents that need a clear contract and repeatable workflow

The project rules do not change here:

- no build step
- `.html` is the main authoring surface
- Datastar is the engine
- Brackets adds structure, routing, lifecycle, host, and syntax
- Node is only one built-in host adapter implementation in this repo, not a framework requirement
- the public distribution model is drop-in folder first

Current status:

- keep calling Brackets `v0.95`
- keep syntax locked
- keep Datastar underneath
- use this guide to learn the practical model before reaching for deeper framework internals

## Distribution First

Brackets should be thought of as a portable app folder before it is thought of as a toolchain.

That means:

- you should be able to start from files
- you should be able to move the same app toward desktop or server use
- you should not need a package-manager install path to understand or use the framework

The professional release target is documented in [release.md](C:\Users\joshr\Documents\dev\Brackets\docs\release.md).

## Plugin model

Brackets does not require a plugin API because the framework already exposes normal code surfaces everywhere that matter.

Use these extension paths first:

- `.html` for reusable UI and layouts
- `.logic` for behavior
- `.api` for backend integrations
- `.data` for local storage integrations
- standard browser ESM imports for third-party libraries
- host bridges for desktop or native capabilities

This is a strength, not a missing feature.

A plugin API would add:

- more framework ceremony
- more compatibility rules
- more version friction
- more lock-in around something plain files already solve

### Practical rule

If you want to add capability in Brackets, start by asking:

1. Is it UI?
2. Is it behavior?
3. Is it backend communication?
4. Is it local storage?
5. Is it a host-specific bridge?

Then place it in normal Brackets files instead of reaching for a custom plugin system.

### Example: add a browser library

```js
// app/search.logic
import Fuse from './vendor/fuse.js'

({
  mount({ state }) {
    const fuse = new Fuse([{ name: 'Ada' }, { name: 'Grace' }], { keys: ['name'] })
    state.set({ results: fuse.search('Ada') })
  }
})
```

### Example: add a backend integration

```js
// app/search.api
({
  query({ http }, term) {
    return http.client('/remote/search').get('/query', { term })
  }
})
```

### Example: add a local storage helper

```js
// app/search.data
({
  recent({ storage }) {
    return storage.json('./recent-searches.json').read([])
  }
})
```

This keeps Brackets backend agnostic, portable, and easy to understand for both humans and AI.

## Start With This Mental Model

Brackets apps are made of:

- `.view` for page manifests
- `.html` for pages, layouts, and components
- `.logic` for behavior and routing logic
- `.api` for remote/backend transport
- `.data` for local persistence

The happy path is:

1. Define pages in `views/*.view`
2. Write page/layout/component HTML in `.html`
3. Put behavior in `.logic`
4. Use `.api` for remote systems
5. Use `.data` for local files or local database access

## First practical workflow

For most teams and evaluators, the best first workflow is:

1. Start with one `.view`, one `.html`, and one `.logic`.
2. Add `.data` as soon as state or persistence becomes real.
3. Add `.api` only when the app needs shared authority or external services.
4. Run `check` and `doctor --strict` often instead of waiting for confusion later.
5. Keep files small enough that each one still has one honest job.

## Modern flat-file app model

Brackets is intentionally file-first, but it should still feel like a full application framework.

The modern model is:

- `.view` and `.html` = UI
- `.logic` = app behavior
- `.data` = data model, queries, validation, transforms, and persistence rules
- `.db`, `.json`, and `.yaml` = runtime storage formats
- `.api` = optional remote sync, external services, and shared trusted authority

That means Brackets can stay static in shape while staying dynamic in behavior.

From the user's point of view, the app can still:

- read and write persistent data
- update the UI reactively
- manage routes and state
- perform queries
- validate and transform data
- sync with remote APIs
- work offline

That is a real application model, not a static document model.

### Runtime flow

The intended flow is:

1. `.data` defines the data rules
2. the runtime or host manages `.json`, `.yaml`, and `.db` storage
3. `.logic` reads and writes through `.data`
4. `.view` and `.html` react through Datastar

Datastar makes this a frontend reality.

Transport follows Datastar too:

- `.data` is local-first, but when it moves data into the UI it should preserve Datastar-compatible HTTP and SSE transfer behavior
- `.api` is remote/backend-facing, and it should preserve that same Datastar-compatible HTTP and SSE transfer behavior
- Brackets should not invent a second request or stream model behind those layers

Brackets keeps the file model and app structure coherent.

### The fastest way to teach it

Use this one-sentence model first:

Brackets is a modern app framework where `.view` and `.html` define the UI, `.logic` defines behavior, `.data` defines local data rules, `.api` adds shared authority when needed, and Datastar powers the live frontend.

Then expand it in this order:

1. UI
2. behavior
3. model and local data
4. optional remote authority
5. runtime flow

That order makes the framework feel simpler, more modern, and easier to trust.

## Minimal App Shape

```text
my-app/
  views/
    home.view
  pages/
    home.html
  logic/
    home.logic
```

### Example `home.view`

```js
page({
  id: 'home',
  route: '/',
  title: 'Home',
  meta: {
    description: 'Brackets home page'
  },
  seo: {
    changefreq: 'daily',
    priority: 1
  },
  html: '@pages/home.html',
  logic: '@logic/home.logic'
})
```

### Example `home.html`

```html
<main [page] :state="{ count: 0 }">
  <h1 :text="title ?? 'Hello Brackets'"></h1>
  <p :text="count"></p>
  <button @click="mutate('count', count + 1)">Add</button>
</main>
```

### Example `home.logic`

```js
({
  async mount({ state }) {
    state.set({
      title: 'Hello Brackets'
    })
  }
})
```

## Small, clean, type-safe file patterns

The fastest way to keep a Brackets app teachable is to keep each file type narrow.

### `.view`

Preferred pattern:

- only page identity and wiring
- no business logic

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

Preferred pattern:

- only structure, bindings, and named actions
- no model logic

```html
<section [panel] :state="{ saving: false }">
  <h1 :text="profile.name"></h1>
  <button @click="refresh">Refresh</button>
</section>
```

### `.logic`

Preferred pattern:

- orchestration only
- ask `.data` and `.api` to do the real work

```js
({
  async refresh({ data, state }) {
    state.set({ profile: await data.profile.read() })
  }
})
```

### `.data`

Preferred pattern:

- model code
- validation
- transforms
- queries
- persistence rules

```js
function normalizeProfile(input) {
  return {
    name: String(input?.name ?? '').trim()
  }
}

({
  async read({ storage }) {
    const raw = await storage.json('@storage/profile.json').read({})
    return normalizeProfile(raw)
  }
})
```

### `.api`

Preferred pattern:

- remote/backend transfer only
- Datastar-compatible HTTP and SSE semantics

```js
({
  stream({ http }) {
    return http.read('/remote/updates')
  },

  save({ http }, payload) {
    return http.client('/remote/crm').post('/contacts', payload)
  }
})
```

### Teaching test

If you can explain a file in one sentence, it is probably small enough:

- `.view` says what page exists
- `.html` says what the user sees
- `.logic` says what the app does
- `.data` says what the data is
- `.api` says how the app talks outward

### Type-safe file checks

Use the no-build check path as part of the normal workflow:

```powershell
node src/cli.js check demo/app
```

It should catch:

- wrong contract shapes
- duplicate page ids
- route or alias collisions
- self-redirecting routes before they become navigation loops
- multi-route redirect cycles before they become runtime traps
- missing `.html`, `.logic`, `.api`, or `.data` files referenced by a route
- references that point outside the app folder
- layer drift between `.logic`, `.data`, and `.api`

## Building Common App Types

### SPA

Use:

- multiple `.view` files
- one shared layout
- route-level `:loading="route"` and `:error="route"`
- `ctx.cache.fetch()` and `ctx.cache.refresh()` for repeat reads
- `ctx.nav.prefetch()` or normal link hover/focus prefetch

Prefer route targets over raw path strings when the app already knows the route id:

```js
({
  openContact({ nav }, contact) {
    return nav.to({
      id: 'contact',
      params: { id: contact.id },
      query: { tab: 'activity' }
    })
  }
})
```

That keeps router code easier to maintain:

- route ids stay stable
- params stay explicit
- query and hash stay structured
- links, redirects, and prefetch can share the same target shape

### Website

Use:

- route manifests with `meta` and `seo`
- `/sitemap.xml`
- `/feed.xml`
- `/robots.txt`
- `/manifest.webmanifest`
- a portable export folder with `node src/cli.js export <app-root> --out-dir <folder>`

### Local-first app

Use:

- `.data`
- `storage.json(...)`
- `storage.yaml(...)`
- `storage.db(...)`

This is the main path for:

- desktop-folder apps
- offline-capable apps
- local-first applications that do not need a shared server authority for every write

Important boundary:

- local persistence is fine
- trusted shared authority is optional and belongs in `.api`
- local browser-held or machine-held data should still be treated as untrusted for security decisions
- host-managed session cookies should stay local-safe on HTTP and automatically upgrade to `Secure` cookies on HTTPS-style deployments

### Desktop app

Use the same app contract and host it through:

- the built-in loopback host
- a Tauri host adapter
- a WebView2 host adapter

The app model should not change.

## Async and Data Patterns

### Route-level loading and errors

```html
<section :loading="route">Loading page...</section>
<section :error="route">Page failed to load.</section>
```

### Request-level loading and errors

```html
<section :loading="contacts">Loading contacts...</section>
<section :error="contacts">Contacts request failed.</section>
```

### Cached reads

```js
({
  async mount({ cache, api, state }) {
    const contacts = await cache.fetch(
      'contacts',
      () => api.contacts.list(),
      { ttlMs: 5_000, staleMs: 30_000 }
    )

    state.set({ contacts })
  }
})
```

### Refresh and invalidate

```js
({
  async reload({ cache, api, state }) {
    const contacts = await cache.refresh('contacts', () => api.contacts.list())
    state.set({ contacts })
  },

  clearCache({ cache }) {
    cache.invalidate('contacts')
  }
})
```

Modern cache behavior should feel invisible:

- overlapping `cache.fetch()` calls for the same key should deduplicate work
- stale cached values may stay visible while a background refresh retries
- a failed background refresh should not poison the cache or block the next retry
- overlapping transport requests should keep loading/error state aligned with the latest active request
- failed route prefetch or session refresh attempts should clear their in-flight state so the next retry can succeed
- protected routes should re-check session state before redirecting when the current session is missing or stale, so login recovery stays reliable
- configured route prefetch should continue after navigation so warmed routes stay relevant
- redirect loops should fail clearly instead of getting stuck in recursive navigation
- `notFound()` redirects should resolve before history is written, so failed paths do not leave dead entries behind
- a `notFound()` redirect back to the same path should fall back to the normal not-found view instead of acting like a real redirect
- live `read()` calls should fail with a clear framework error if the current host cannot provide SSE
- live `read()` loading should remain visible until the SSE stream actually opens
- live SSE failures should surface as clear Brackets errors instead of opaque browser event objects
- merged form payloads should preserve repeated values for multi-select and repeated field patterns
- direct `FormData` payloads should work for form requests even when no DOM form element is available
- local `.json`, `.yaml`, and encrypted storage writes should serialize cleanly so overlapping writes still leave readable data
- local `.db` transactions should serialize cleanly too, so concurrent writes still produce one coherent durable result
- invalidating cache should stop older in-flight reads from silently writing stale values back into cleared keys

### Optimistic updates

```js
({
  async saveContact(id, ctx) {
    const { state, api } = ctx
    await state.optimistic(
      (current) => ({
        contacts: (current.contacts ?? []).map((item) =>
          item.id === id ? { ...item, saving: true } : item
        )
      }),
      () => api.contacts.save(id)
    )
  }
})
```

## Local Data Patterns

The important modern-model rule is:

- `.data` should own most, and ideally all, model code when that makes sense
- `.data` should own local data rules
- `.data` should own validation, transforms, and query logic
- `.logic` should ask `.data` to do the work
- storage helpers should normally stay inside `.data`

### JSON

```js
({
  async list({ storage }) {
    return storage.json('@storage/items.json').read([])
  },

  async save({ storage }, items) {
    return storage.json('@storage/items.json').write(items)
  }
})
```

### Data model with validation and transforms

```js
// app/contacts.data
function normalizeContact(input) {
  return {
    id: Number(input?.id) || Date.now(),
    name: String(input?.name ?? '').trim(),
    source: String(input?.source ?? 'desktop').trim() || 'desktop'
  }
}

function validContact(contact) {
  return Boolean(contact.name)
}

({
  async list({ storage }) {
    const records = await storage.json('@storage/contacts.json').read([])
    return records.map(normalizeContact).filter(validContact)
  },

  async add({ storage }, input) {
    const nextContact = normalizeContact(input)
    if (!validContact(nextContact)) {
      return this.list({ storage })
    }

    const contacts = await this.list({ storage })
    const next = [...contacts, nextContact]
    await storage.json('@storage/contacts.json').write(next)
    return next
  }
})
```

Then `.logic` stays simpler:

```js
({
  async addContact({ data, state, action }) {
    const next = await data.contacts.add(action.input() ?? {})
    state.set({ contacts: next })
  }
})
```

Preferred split:

- `.data` decides what a valid record is
- `.data` decides how records are normalized
- `.data` decides how records are queried or persisted
- `.logic` decides when the user is asking for those actions
- `.view` and `.html` decide how that state is shown

### Encrypted JSON

```js
({
  async profile({ storage }) {
    return storage['[e]json']('@storage/profile.secure.json').read({})
  },

  async saveProfile({ storage }, nextValue) {
    return storage['[e]json']('@storage/profile.secure.json').write(nextValue)
  }
})
```

### YAML

```js
({
  async settings({ storage }) {
    return storage.yaml('@storage/settings.yaml').read({})
  }
})
```

### Encrypted YAML

```js
({
  async secrets({ storage }) {
    return storage['[e]yaml']('@storage/secrets.secure.yaml').read({})
  }
})
```

### SQLite-style `.db`

```js
({
  async recent({ storage }) {
    const db = storage.db('@storage/app.db')
    await db.exec('create table if not exists notes (id integer primary key, title text)')
    return db.all('select * from notes order by id desc')
  }
})
```

Encrypted local persistence notes:

- `storage['[e]json'](...)` and `storage['[e]yaml'](...)` are additive host capabilities for protecting local data at rest
- the built-in host uses a host-managed key from `BRACKETS_DATA_KEY` by default
- keep that key out of app files and out of client state
- `.db` encryption should stay host-specific unless the host can provide it safely

## Remote API Patterns

### Simple backend root

```js
({
  list({ http }) {
    return http.client('/remote/api').get('contacts')
  }
})
```

### OpenAPI-shaped operation

```js
({
  show({ http }, id) {
    return http.openapi('/remote/api').operation({
      method: 'GET',
      path: '/contacts/{id}',
      pathParams: { id },
      query: { include: ['notes', 'tags'] }
    })
  }
})
```

## Auth and Session Patterns

Use:

- `ctx.auth.session()`
- `ctx.auth.authenticated`
- route manifest `auth`

### Protected route example

```js
page({
  id: 'account',
  route: '/account',
  html: '@pages/account.html',
  logic: '@logic/account.logic',
  auth: {
    required: true,
    redirectTo: '/login'
  }
})
```

### Checking session in logic

```js
({
  async mount({ auth, nav }) {
    const session = await auth.session()
    if (!session.authenticated) {
      await nav.redirect('/login')
    }
  }
})
```

## Website and SEO Patterns

Use `meta`, `seo`, and `assets` in `.view`.

```js
page({
  id: 'blog',
  route: '/blog',
  title: 'Blog',
  meta: {
    description: 'Latest articles',
    lang: 'en'
  },
  seo: {
    canonical: '/blog',
    changefreq: 'daily',
    priority: 0.8,
    structuredData: {
      '@context': 'https://schema.org',
      '@type': 'Blog'
    }
  },
  assets: {
    themeColor: '#0f172a',
    icons: [
      { src: '/app/icons/icon-192.png', sizes: '192x192', type: 'image/png' }
    ]
  },
  html: '@pages/blog.html'
})
```

## Accessibility Defaults

Prefer:

- semantic HTML first
- `:set.aria-*` for stateful ARIA attributes
- visible labels for controls
- button/link semantics instead of `div` click handlers
- `:text` over `:html` for user content

Example:

```html
<button
  @click="mutate('open', !open)"
  :set.aria-expanded="open ? 'true' : 'false'">
  Toggle
</button>
```

Validation now audits a few common accessibility risks:

- clickable non-interactive containers
- missing `alt` text on images
- `:html` usage that should be treated as trusted-only

## Internationalization

Current simple contract:

- use `meta.lang`
- use `meta.dir` for right-to-left or other directional pages
- use `seo.alternates` for alternate language links
- store dictionaries in `.json`, `.yaml`, or remote `.api`

Example:

```js
page({
  id: 'docs-es',
  route: '/es/docs',
  title: 'Documentacion',
  meta: {
    lang: 'es',
    dir: 'ltr'
  },
  seo: {
    canonical: '/es/docs',
    alternates: [
      { lang: 'en', href: '/docs' },
      { lang: 'es', href: '/es/docs' }
    ]
  },
  html: '@pages/docs.html'
})
```

## Offline and PWA Basics

Current no-build path:

- generated `/manifest.webmanifest`
- optional `/service-worker.js` at the app root, auto-registered when available on a trustworthy origin
- static export support

The demo app includes a copyable no-build `service-worker.js` example.

If a host adapter or deployment adds a service worker, Brackets should use it as an add-on, not as a core framework requirement.

## Uploads and Downloads

Uploads should prefer normal forms and Datastar-aligned request helpers instead of a separate client library.

Example upload form:

```html
<form @submit="create('/remote/api/uploads')" enctype="multipart/form-data">
  <label for="avatar">Avatar</label>
  <input id="avatar" name="avatar" type="file" accept="image/*" />
  <button type="submit">Upload</button>
</form>
```

In page logic, the current action context now exposes:

- `ctx.action.input()` for ordinary form/object reads
- `ctx.action.formData()` when the exact multipart payload matters
- `ctx.action.files(name?)` for direct file access

`ctx.action.input()` should preserve repeated field names as arrays, so ordinary forms stay clean without dropping values.

Router helpers should stay small and readable too:

- `ctx.nav.to(target)`
- `ctx.nav.replace(target)`
- `ctx.nav.redirect(target)`
- `ctx.nav.prefetch(target)`
- `ctx.nav.href(target)`
- `ctx.nav.isActive(target)`
- `ctx.nav.match(target)`
- `ctx.nav.forward()`
- `ctx.route.href(next?)`

Router hooks should get the same cleaner model:

- `beforeEach(ctx)` can use `ctx.to.href()` and `ctx.from?.href()`
- grouped `ctx.routes` entries should expose aliases and stable `href(...)` builders

Downloads should prefer:

- backend responses with `Content-Disposition`
- or Brackets static/app files with `?download=1` or `?download=<filename>`

Example:

```html
<a href="/app/files/report.pdf?download=quarterly-report.pdf">Download report</a>
```

For imperative downloads, use:

```js
({ exportCsv({ nav }) {
  nav.download('/app/files/export.csv', 'contacts.csv')
} })
```

## Devtools and Editor Support

Brackets now exposes:

- `window.__BRACKETS_DEVTOOLS__.inspect()` for a runtime snapshot
- `/__brackets/debug` for host/runtime inspection
- `/__brackets/schema/page-manifest.json` for editor or AI schema validation

The static export now also includes:

- `framework/runtime.js`
- `framework/datastar.js`
- `framework/syntax.js`
- `framework/docs.md`
- `framework/agents.md`
- `config/brackets.json`
- `tests/test.js`
- `manifest.webmanifest` when present
- `service-worker.js` when present

## Validation and Export

Validate:

```powershell
node src/cli.js validate demo/app
```

Validation returns issues plus warnings for accessibility and i18n gaps.

Export:

```powershell
node src/cli.js export demo/app --out-dir dist
```

The exported folder is the portable deployment artifact. It now includes:

- route HTML shells
- `framework` runtime files
- `config/brackets.json`
- `tests/test.js`
- `manifest.webmanifest` when present
- `service-worker.js` when present
- `README.md` when present
- `LICENSE` when present

## What An App Should Not Do

- do not invent a build step
- do not move the main template model into JS components
- do not put routing logic into `.api`
- do not put remote backend logic into `.data`
- do not put storage helpers directly into `.logic` when `.data` should own them
- do not put direct `fetch(...)` or backend helper calls into `.logic` when `.api` should own them
- do not keep validation and record-shaping logic in `.logic` when `.data` can own the model instead
- do not treat Node-only behavior as part of the public framework contract
- do not bypass Datastar when Datastar already has the primitive

## Build Checklist

Use this checklist for any new app:

1. Create `.view` manifests with `id`, `html`, and `route`.
2. Add `meta`, `seo`, `auth`, and `assets` only where needed.
3. Keep page markup in `.html`.
4. Keep behavior and UI orchestration in `.logic`.
5. Put model code, validation, transforms, queries, and persistence rules in `.data` whenever possible.
6. Use `.api` for remote systems.
7. Use `.data` for local storage.
8. Use `:loading` / `:error` for async UI.
9. Use `ctx.cache` for refresh/revalidation behavior.
10. Use `ctx.auth` and route `auth` for protected flows.
11. Validate before export or deployment.
