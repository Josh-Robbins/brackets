# Brackets Guide

This guide is the practical “build an app from scratch” document for Brackets.

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

## Building Common App Types

### SPA

Use:

- multiple `.view` files
- one shared layout
- route-level `:loading="route"` and `:error="route"`
- `ctx.cache.fetch()` and `ctx.cache.refresh()` for repeat reads
- `ctx.nav.prefetch()` or normal link hover/focus prefetch

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

### YAML

```js
({
  async settings({ storage }) {
    return storage.yaml('@storage/settings.yaml').read({})
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
- do not treat Node-only behavior as part of the public framework contract
- do not bypass Datastar when Datastar already has the primitive

## Build Checklist

Use this checklist for any new app:

1. Create `.view` manifests with `id`, `html`, and `route`.
2. Add `meta`, `seo`, `auth`, and `assets` only where needed.
3. Keep page markup in `.html`.
4. Keep behavior in `.logic`.
5. Use `.api` for remote systems.
6. Use `.data` for local storage.
7. Use `:loading` / `:error` for async UI.
8. Use `ctx.cache` for refresh/revalidation behavior.
9. Use `ctx.auth` and route `auth` for protected flows.
10. Validate before export or deployment.
