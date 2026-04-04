# Reactive HTML SPA Framework on Top of Datastar

Source basis: the earlier framework review markdown, the prior handoff intro, and the newer lifecycle and `.view` decisions from the latest discussion.

## Executive summary

The framework now has a much more coherent shape.

It is:

- **not** a React clone
- **not** a JSX-first or compiler-first framework
- **not** a VDOM-heavy architecture
- **not** a server-template-only system
- **yes** to a **browser-native, HTML-first reactive SPA framework**
- **yes** to **Datastar as the underlying reactive and patching engine**
- **yes** to a **tiny built-in local server** for same-origin runtime behavior, import maps, and SPA fallback
- **yes** to a **clear branded file model** that is easy to teach and reason about

The current architectural direction is:

> A Datastar-powered reactive framework where authors write normal `.html` markup for pages, layouts, and components, while first-class framework files such as `.view`, `.logic`, `.api`, and `.data` provide structure, behavior, transport, and persistence.

That gives the project a strong identity:

- HTML-first
- SPA-capable
- backend-friendly
- no VDOM
- no mandatory heavy build pipeline
- small same-origin runtime host
- clean file structure
- Datastar underneath, but not exposed as the main public authoring model

---

## Core product idea

The framework combines five major ideas:

1. **HTML-first authoring**
   - authors write normal HTML
   - the browser can parse the markup directly
   - pages, layouts, components, and fragments stay in `.html`

2. **Reactive UI without a VDOM**
   - local state
   - calculated state
   - bindings
   - conditionals
   - list rendering
   - event-driven updates
   - Datastar handles the low-level reactive and patching behavior

3. **Real SPA behavior**
   - persistent shell/layout
   - routed page swaps inside a mount area
   - browser history integration
   - partial page updates

4. **Structured framework files**
   - `.view`
   - `.logic`
   - `.api`
   - `.data`
   - `.html`

5. **Flexible backend and local-data integration**
   - remote APIs through `.api`
   - local JSON/YAML/DB-backed access through `.data`
   - same-origin local host for app files and optional proxy/gateway behavior

---

## Canonical mental model

```text
.view   = what screen exists
.logic  = how the app behaves
.api    = how the app talks to a backend
.data   = how the app talks to local storage/data files
.html   = actual markup/templates/pages/layouts/components
```

This is one of the strongest framework decisions so far because it gives the project a memorable and teachable structure.

---

## What changed in the latest design pass

The biggest decisions now locked in are:

1. The framework uses a **tiny built-in local server**.
2. **`.view` is not an HTML template file**.
3. **`.html` remains the actual markup format**.
4. Routing lives in **`.logic`**, not `.api`.
5. Local persistence gets its own **`.data` layer**.
6. `.view` is now a **declarative screen manifest**.
7. Lifecycle wording should be **clear and simple**, centered on `mount()`, `sync()`, and `run()`.
8. `run()` stays in the design, but it is **not another mount hook**.

---

## Datastar is the engine, not the product

Datastar remains the low-level engine for:

- reactive state and signal-like behavior
- DOM patching
- HTML-driven interaction
- SSE/live updates
- backend-friendly partial updates

The framework layers on top of Datastar and owns:

- public authoring syntax
- component model
- layout system
- router
- file structure
- module resolution conventions
- view contracts
- logic/api/data separation
- lifecycle semantics

### Why this matters

This keeps the project realistic and focused. The framework is an authoring and architecture layer over a proven reactive DOM engine instead of trying to rebuild everything from scratch.

---

## HTML stays HTML

A major clarification from the design discussion:

- `.html` remains the true page/template/layout/component format
- `.view` does **not** replace HTML templates
- the framework continues using HTML and the custom templating syntax already established

### Use `.html` for

- pages
- layouts
- components
- template fragments

### Use `.view` for

- the formal framework View-layer contract
- route metadata
- HTML wiring
- logic wiring
- API/data dependency wiring

---

## File types and responsibilities

### `.view`
The screen/view contract.

A `.view` file defines:

- screen identity
- optional route metadata
- title/meta information
- which page HTML to load
- which layout to use
- which `.logic` file to attach
- which named `.api` and `.data` modules the screen depends on

### `.logic`
Executable application or framework behavior.

Use `.logic` for:

- router engine
- feature behavior
- app startup
- navigation logic
- state orchestration
- runtime coordination
- screen behavior
- layout behavior

### `.api`
Remote/backend transport.

Use `.api` for:

- HTTP calls
- SSE/live endpoints
- fetch wrappers
- endpoint contracts
- request/response behavior
- backend resource access

### `.data`
Local persistence and storage adapters.

Use `.data` for:

- JSON-backed repositories
- YAML-backed content/config access
- DB-backed local storage adapters
- normalized local data access interfaces

### `.html`
Actual user interface markup.

Use `.html` for:

- pages
- layouts
- components
- fragments

### Storage formats

- `.json` = simple structured storage
- `.yaml` = human-editable config/content storage
- `.db` = durable local database storage

### Important distinction

- `.data` = code adapter/repository layer
- `.json`, `.yaml`, `.db` = actual stored data files

---

## Keep `.controller` out of v1

Do **not** add:

- `.controller`
- `.cont`
- `.mod`

And do **not** make `.model` mandatory in v1.

### Why

In this framework, “controller” would blur together:

- router behavior
- UI orchestration
- transport logic
- state transitions

Those concerns are already better represented by:

- `.logic`
- `.view`
- `.api`
- `.data`

If a future model-like layer is needed, clearer candidates are:

- `.schema`
- `.state`
- a stronger `.data` contract

---

## Routing belongs in `.logic`, not `.api`

Routing is application behavior, not backend transport.

### Correct split

- `router.logic` = router engine
- each `.view` may optionally declare its own route
- larger apps may also use `/routes/*.logic` for grouped route registration

### Recommended direction

- `router.logic` owns URL listening, history, matching, navigation helpers, redirects, scroll behavior, and not-found handling
- `.view.route` is the default route declaration for most screens
- `/routes/*.logic` is an organizational option for larger apps

### Small-app pattern

```text
/core/router.logic
/views/home.view
/views/settings.view
/views/contacts.view
```

### Larger-app pattern

```text
/core/router.logic
/routes/index.logic
/routes/settings.logic
/routes/contacts.logic
/views/home.view
/views/settings.view
/views/contacts.view
```

---

## Tiny built-in local server

This is now a central design decision.

### Why it matters

Without a local same-origin app host, browser modules become harder to manage cleanly, especially with:

- import maps
- correct module MIME types
- SPA history fallback
- runtime asset loading
- `file://` limitations
- backend proxying

### What the built-in server should do

- bind to loopback by default
- serve framework/app files quickly and securely
- serve `.logic`, `.api`, `.data`, and `.view` as JavaScript modules
- serve `.html` as HTML
- inject or expose an import map
- handle SPA route fallback
- optionally proxy backend calls under the same local origin
- optionally proxy SSE/live channels

### Security direction

The built-in server should favor:

- same-origin by default
- loopback-only access in local mode
- secure defaults for cookies and write protection
- no unnecessary exposure of app internals
- a clean path for proxying backend calls instead of unsafe browser-side workarounds

---

## Import maps are first-class

Import maps should resolve framework modules such as:

- `.view`
- `.logic`
- `.api`
- `.data`
- core runtime modules

Example:

```html
<script type="importmap">
{
  "imports": {
    "@views/": "/app/views/",
    "@logic/": "/app/logic/",
    "@api/": "/app/api/",
    "@data/": "/app/data/",
    "@core/": "/app/core/"
  }
}
</script>
```

### Important distinction

Import maps resolve JavaScript-like framework modules.

HTML files are still loaded as HTML, not treated like JavaScript modules.

So this is good:

```js
import contactsView from '@views/contacts.view'
import contactsApi from '@api/contacts.api'
```

And this stays a runtime HTML load:

```js
const html = await fetch('/app/pages/contacts.html').then(r => r.text())
```

---

## Authoring syntax remains HTML-native

The framework still uses its own compact authoring syntax instead of exposing raw Datastar `data-*` attributes.

### Structural shorthand

```html
[name]     <!-- class shorthand -->
#name      <!-- id shorthand -->
```

### Events

```html
@click="..."
@input="..."
@change="..."
@submit="..."
```

### Core directives

```html
:state=""
:calc=""
:run=""
:watch=""
:text=""
:html=""
:show=""
:bind=""
:if=""
:each=""
```

### Template/layout directives

```html
:use=""
:props=""
:area=""
:fill=""
:mount
```

### Dynamic DOM directives

```html
:class.name=""
:set.name=""
:loading=""
:error=""
```

### Meaning

- `[]` = naming / structure / styling shorthand
- `#` = unique target
- `@` = behavior
- `:` = reactive, templating, and framework directives

Example:

```html
<article [card] :state="{ count: 0 }">
  <button [button] @click="count--">-</button>
  <span :text="count"></span>
  <button [button] @click="count++">+</button>
</article>
```

---

## Separate HTML files remain first-class

Suggested structure:

```text
/components/
  header.html
  footer.html
  card.html

/layouts/
  app.html
  auth.html

/pages/
  home.html
  settings.html
  contacts.html
```

This keeps the framework feeling like “HTML with powers” instead of “JavaScript disguised as HTML.”

---

## Layout composition vocabulary

The layout system still centers on:

- `:mount` = primary routed render target
- `:area="..."` = named placeholder area
- `:fill="..."` = content that fills an area

Example layout:

```html
<div [app-layout]>
  <header :area="'header'"></header>
  <main #content :mount></main>
  <footer :area="'footer'"></footer>
</div>
```

Example composition:

```html
<div :use="'app-layout'">
  <template :fill="'header'">
    <div :use="'site-header'"></div>
  </template>

  <template :fill="'content'">
    <div :use="page"></div>
  </template>

  <template :fill="'footer'">
    <div :use="'site-footer'"></div>
  </template>
</div>
```

---

## Request and transport model

### Action helpers

- `read()` = live SSE read channel
- `request()` = advanced one-off read helper, read-only
- `get()` = one-off read
- `create()` = create record
- `update()` = full update
- `patch()` = partial update
- `delete()` = delete record
- `mutate()` = local state mutation

### Response/result modes

- `.html`
- `.sse`
- `.state`
- `.json`

### Defaults

- `read()` -> `.sse`
- `request()` -> `.html`
- `get()` -> `.html`
- `create()` -> `.html`
- `update()` -> `.html`
- `patch()` -> `.state`
- `delete()` -> `.html`

### Override examples

```html
:run="read.sse('/events/users')"
@click="get.json('/stats')"
@click="update.html('/users/12', user)"
@click="patch.state('/users/12', { name: 'Sarah' })"
```

### Important rule

`request()` stays read-only.

Writes go through:

- `create()`
- `update()`
- `patch()`
- `delete()`

---

## JS should stay natural and flat

### Good direction

- HTML gets the framework syntax
- JS stays normal JS
- use flatter helpers
- prefer property-first APIs
- use local aliases
- do not force template sigils into JS

Examples:

```js
forms.contact.data
forms.contact.valid
browser.timezone
browser.locale
```

Instead of:

```js
form('contact').data()
browser.timezone()
```

Example logic style:

```js
export default logic(({ api, contact, browser, set, success, error, state }) => {
  const { timezone, locale } = browser

  return {
    run: () => {
      set({ timezone, locale })
      api.get()
      api.read()
    },

    create: () => {
      if (!contact.valid) {
        error('Please complete the form')
        return
      }

      api.create({
        ...contact.data,
        clientTimezone: state.timezone,
        clientLocale: state.locale
      })

      contact.clear()
      success('Contact created')
    }
  }
})
```

---

## `.view` spec for v1

A `.view` file is a **declarative screen manifest**.

It answers one question:

> What screen is this, and what resources does it need?

A `.view` should not become a controller and should not contain business logic.

### `.view` rules for v1

1. A `.view` exports exactly one `view(...)` object.
2. A `.view` is declarative metadata.
3. A `.view` may declare a route.
4. A `.view` points to exactly one page `.html`.
5. A `.view` may point to one layout `.html`.
6. A `.view` points to one primary `.logic` module.
7. A `.view` may declare named `.api` and `.data` dependencies for injection.
8. A `.view` does not perform fetches, mutations, or DOM work directly.

### Recommended `.view` shape

```js
export default view({
  id: 'contacts.index',
  route: '/contacts',
  title: 'Contacts',

  page: '@pages/contacts.html',
  layout: '@layouts/app.html',
  logic: '@logic/contacts.logic',

  api: {
    contacts: '@api/contacts.api'
  },

  data: {
    settings: '@data/settings.data'
  }
})
```

### Required fields

- `id`
- `page`
- `logic`

### Optional fields

- `route`
- `title`
- `layout`
- `api`
- `data`

### Guidance

Use `.view.route` as the default route declaration for most screens.

Use `/routes/*.logic` when route registration becomes large or needs grouping.

---

## `.logic` contract for v1

`.logic` remains the executable behavior layer, but the lifecycle wording is now clearer.

### Public hooks

- `mount(ctx)`
- `sync(ctx)` optional
- `run(payload, ctx)` optional
- cleanup is returned from `mount()`

### Meaning

- `mount()` = this screen or layout became live
- `sync()` = the same mounted instance received new route inputs or other runtime inputs
- `run()` = an imperative task or action entry point

### Critical rule

**`mount()` is lifecycle. `run()` is intent.**

That means:

- `mount()` is automatic
- `sync()` is automatic when the same instance is preserved
- `run()` is not a second mount hook
- `run()` is not automatically called just because something mounted

### Recommended `.logic` shape

```js
export default logic((ctx) => ({
  mount() {
    return () => {}
  },

  sync(next) {},

  run(payload) {}
}))
```

### Example

```js
export default logic(({ api, route, set }) => ({
  async mount() {
    set({ loading: true })

    const contacts = await api.contacts.list()

    set({
      loading: false,
      contacts,
      selectedId: route.query.id ?? null
    })

    const stopLive = api.contacts.readLive?.()

    return () => {
      stopLive?.()
    }
  },

  sync({ route, set }) {
    set({
      selectedId: route.query.id ?? null
    })
  },

  async run() {
    set({ refreshing: true })
    const contacts = await api.contacts.list()
    set({ refreshing: false, contacts })
  }
}))
```

---

## Full lifecycle specification

The lifecycle should feel understandable in plain language:

- a layout becomes live
- a page becomes live
- the same live instance may be synced with new inputs
- an imperative task may be run
- cleanup happens when the instance is removed or replaced

### Public lifecycle vocabulary

| Purpose | Public name | Meaning |
|---|---|---|
| instance becomes active | `mount()` | setup for a live layout or page |
| same active instance gets new inputs | `sync()` | respond without remounting |
| explicit task/action | `run()` | do the thing on demand |
| stop side effects | returned cleanup function | tear down work started by `mount()` |

### Runtime vocabulary

| Runtime phrase | Meaning |
|---|---|
| mount layout | create and activate a layout instance |
| mount view | create and activate a page/view instance |
| sync layout | update preserved layout inputs without remounting |
| sync view | update preserved view inputs without remounting |
| unmount view | remove the current page/view instance |
| unmount layout | remove the current layout instance |
| dispose instance | runtime cleanup of an instance after cleanup has run |

### Core lifecycle rules

1. `mount()` is the automatic setup hook.
2. `mount()` may return a cleanup function.
3. `sync()` is optional and only runs when the same mounted instance is preserved.
4. `run()` is optional and imperative.
5. `run()` is not a lifecycle substitute for `mount()`.
6. Cleanup runs before an instance is removed or replaced.
7. Preserved layouts do not remount when only the page changes.
8. A page may remount even when the layout stays preserved.

---

## Lifecycle spec table

| Phase | Trigger | Runtime action | Hook(s) | Notes |
|---|---|---|---|---|
| Boot runtime | app start | create runtime, router, import-map context, service registry | none | framework-level startup |
| Resolve route | initial URL or navigation | match URL to a `.view` | none | `router.logic` owns matching |
| Load view manifest | matched route | import `.view` file | none | resolves screen metadata |
| Resolve dependencies | matched view | load page HTML, optional layout HTML, `.logic`, `.api`, `.data` | none | `.view` remains declarative |
| Compare layout | before render | decide whether layout is preserved or replaced | none | same layout should stay mounted |
| Mount layout | first render or layout change | render layout HTML and activate layout scope | `layout.mount()` | layout cleanup may be registered |
| Mount page/view | first render, page change, or remount | render page HTML into `:mount` target and activate page scope | `view.mount()` | page cleanup may be registered |
| Sync layout | preserved layout gets new inputs | update layout scope without remount | `layout.sync()` optional | no layout cleanup or remount |
| Sync page/view | same preserved page/view gets new inputs | update page scope without remount | `view.sync()` optional | used for route param/query changes when instance is preserved |
| Run logic task | explicit action or framework-invoked task | invoke imperative logic task | `run()` optional | not automatic on mount |
| Unmount page/view | page replaced or removed | run page cleanup, remove page DOM, dispose page instance | cleanup from `view.mount()` | layout may remain mounted |
| Unmount layout | layout replaced or app shutdown | run layout cleanup, remove layout DOM, dispose layout instance | cleanup from `layout.mount()` | happens after page cleanup |
| Shutdown | app stop or full teardown | release runtime resources | none | internal runtime concern |

---

## Exact call order

### Initial app load

1. Start runtime.
2. Start `router.logic`.
3. Read current URL.
4. Match URL to a `.view`.
5. Import the `.view` manifest.
6. Load its page HTML.
7. Load its optional layout HTML.
8. Import its `.logic` module.
9. Import its named `.api` and `.data` modules.
10. Render layout HTML if needed.
11. Render page HTML into the layout `:mount` target.
12. Activate directives and reactive scope wiring.
13. Create layout logic context if a layout logic instance exists.
14. Call layout `mount()`.
15. Store returned layout cleanup if present.
16. Create page logic context.
17. Call page `mount()`.
18. Store returned page cleanup if present.

### Navigate to a new page in the same layout

1. Match new URL.
2. Resolve next `.view`.
3. Compare current layout and next layout.
4. Preserve current layout instance.
5. Run current page cleanup.
6. Remove current page DOM.
7. Dispose current page instance.
8. Load next page HTML and next page logic dependencies.
9. Render next page into existing layout `:mount` target.
10. Activate directives for the new page.
11. Create next page logic context.
12. Call next page `mount()`.
13. Store returned cleanup.
14. Optionally call layout `sync()` if the preserved layout receives updated inputs.

### Navigate to a page with a different layout

1. Match new URL.
2. Resolve next `.view`.
3. Detect layout change.
4. Run current page cleanup.
5. Remove current page DOM.
6. Dispose current page instance.
7. Run current layout cleanup.
8. Remove current layout DOM.
9. Dispose current layout instance.
10. Load next layout HTML.
11. Render next layout.
12. Call next layout `mount()`.
13. Load next page HTML and logic dependencies.
14. Render next page into the next layout `:mount` target.
15. Call next page `mount()`.

### Same-instance sync

A sync should happen only when the runtime intentionally preserves the current instance.

Typical examples:

- route params changed but the runtime keeps the same page instance
- route query changed and the same page remains mounted
- a preserved layout receives new view-level metadata or injected values

Call order:

1. Update route/input context.
2. Patch relevant reactive scope values.
3. Call `sync()` on the preserved instance if defined.
4. Do not run cleanup.
5. Do not remount DOM.

---

## When to `sync()` vs remount

This needs a clear default rule.

### Default remount rule

Remount the page instance when:

- the next `.view.id` is different
- the next `.logic` module is different
- the runtime explicitly decides the route change represents a different screen identity

### Default sync rule

Sync the current page instance when:

- the current `.view.id` is the same
- the current page instance is intentionally preserved
- route params, query, or hash changed
- the runtime decides this is the same screen with new inputs

### Layout preservation rule

Preserve the layout instance when:

- the current layout reference and next layout reference are the same
- the runtime has not been told to force a layout remount

This is a core SPA rule:

> Same layout = preserve the shell.

That keeps nav bars, sidebars, and shell-level state alive across page swaps.

---

## Page logic vs layout logic

The same lifecycle model should apply at both levels.

### Layout logic

Use layout logic for:

- shell-level subscriptions
- global nav behavior
- shell state
- layout-scoped watchers
- layout-wide actions

### Page logic

Use page logic for:

- screen-level data loading
- route-bound behavior
- page-specific subscriptions
- page-scoped state
- page actions

### Important rule

When switching between pages in the same layout:

- page logic cleanup runs
- page instance is replaced
- layout logic stays mounted
- layout `mount()` does not rerun
- layout `sync()` may run if needed

---

## Role of `run()`

`run()` stays in the design, but it has a specific purpose.

### `run()` is for

- one-off task execution
- reload/retry
- special action pipelines
- explicit logic actions
- framework-invoked tasks that are not lifecycle

### `run()` is not for

- replacing `mount()`
- acting as a second setup hook
- automatically running just because the view mounted

### Good mental model

- `mount()` = this became live
- `sync()` = this stayed live but changed
- `run()` = do the task

---

## Scope helpers still need a precise spec

Planned expression-scope values/helpers still need tighter rules:

- `self`
- `parent`
- `children`
- `root`
- `props`
- `event`

These are promising, but they still need precise behavior for:

- repeated templates
- nested component scopes
- route/layout scope boundaries
- lifecycle cleanup boundaries

---

## Canonical project structure

```text
app/
  views/
    home.view
    contacts.view
    settings.view

  logic/
    router.logic
    home.logic
    contacts.logic
    settings.logic

  routes/
    index.logic
    contacts.logic
    settings.logic

  api/
    contacts.api
    auth.api

  data/
    contacts.data
    settings.data

  pages/
    home.html
    contacts.html
    settings.html

  layouts/
    app.html
    auth.html

  components/
    site-header.html
    site-footer.html
    contact-card.html

  storage/
    contacts.json
    settings.yaml
    app.db

  core/
    runtime.logic
    router.logic
    view.logic
    datastar.logic
    state.logic
```

### Notes

- `routes/` is optional
- `storage/` is optional
- `.view`, `.logic`, `.api`, and `.data` are framework-identity files
- `.html` remains the actual UI markup format

---

## Example files

### Example `.view`

```js
export default view({
  id: 'contacts.index',
  route: '/contacts',
  title: 'Contacts',
  page: '@pages/contacts.html',
  layout: '@layouts/app.html',
  logic: '@logic/contacts.logic',
  api: {
    contacts: '@api/contacts.api'
  },
  data: {
    settings: '@data/settings.data'
  }
})
```

### Example `.logic`

```js
export default logic(({ api, route, set }) => ({
  async mount() {
    set({ loading: true })

    const contacts = await api.contacts.list()

    set({
      loading: false,
      contacts,
      selectedId: route.query.id ?? null
    })

    const stop = api.contacts.read?.()

    return () => {
      stop?.()
    }
  },

  sync({ route, set }) {
    set({
      selectedId: route.query.id ?? null
    })
  },

  async run() {
    set({ refreshing: true })
    const contacts = await api.contacts.list()
    set({ refreshing: false, contacts })
  }
}))
```

### Example `.api`

```js
export default api(({ http }) => ({
  list: () => http.get('/contacts'),
  create: body => http.post('/contacts', body),
  update: (id, body) => http.put(`/contacts/${id}`, body),
  patch: (id, body) => http.patch(`/contacts/${id}`, body),
  remove: id => http.delete(`/contacts/${id}`),
  read: () => http.sse('/events/contacts')
}))
```

### Example `.data`

```js
export default data(({ storage }) => ({
  list: () => storage.json('/app/storage/contacts.json').read(),
  save: records => storage.json('/app/storage/contacts.json').write(records)
}))
```

### Example page `.html`

```html
<section [contacts-page]
         :state="{ contacts: [], loading: false, refreshing: false, selectedId: null }">
  <h1 :text="'Contacts'"></h1>

  <button @click="run()">Refresh</button>

  <div :if="loading">Loading...</div>

  <ul :if="!loading">
    <template :each="contact in contacts">
      <li :text="contact.name"></li>
    </template>
  </ul>
</section>
```

---

## Updated documentation summary

### Canonical description

**A no-heavy-build reactive HTML SPA framework built on top of Datastar, with a tiny built-in local server and a structured file model.**

It lets authors write normal HTML for pages, layouts, and components while using `.view`, `.logic`, `.api`, and `.data` files to define screens, behavior, remote transport, and local persistence. A small runtime interprets the framework syntax, maps it onto Datastar’s reactive DOM behavior, and provides SPA routing, composition, and backend integration without requiring a VDOM-heavy architecture.

### Core philosophy

1. HTML first
2. Datastar underneath
3. Tiny local same-origin app host
4. SPA behavior without a VDOM
5. Structured and branded framework files
6. JS stays normal and flat
7. Backend-friendly and local-data-friendly
8. Keep v1 small and coherent

---

## What should be in v1

### Must-have

- built-in local server
- import map support
- `.view`, `.logic`, `.api`, `.data`
- `.html` pages/layouts/components
- `router.logic`
- optional route declaration in `.view`
- `:state`, `:calc`, `:text`, `:html`, `:show`, `:bind`, `:if`, `:each`
- `:use`, `:props`, `:area`, `:fill`, `:mount`
- request helpers and result modes
- flat JS helper layer
- lifecycle support for `mount()` and `sync()`
- imperative logic actions through `run()`
- cleanup returned from `mount()`
- layout preservation across same-layout route changes

### Later

- stronger route auto-discovery
- typed schema system
- editor tooling
- precise keyed `:each` semantics
- more advanced scope helpers
- richer validation without requiring a heavy build step
- formal action dispatch rules between markup and `.logic.run()`

---

## Cheat sheet

### File types

| File type | Meaning |
|---|---|
| `.view` | what screen exists |
| `.logic` | how the app behaves |
| `.api` | how the app talks to a backend |
| `.data` | how the app talks to local storage/data files |
| `.html` | actual markup/templates/pages/layouts/components |
| `.json` | simple structured storage |
| `.yaml` | human-editable config/content storage |
| `.db` | file-backed database storage |

### Routing

| Item | Meaning |
|---|---|
| `router.logic` | router engine |
| `view.route` | optional route declaration in a `.view` file |
| `/routes/*.logic` | grouped route registration for larger apps |

### View manifest

| Field | Required | Meaning |
|---|---|---|
| `id` | yes | stable screen identity |
| `page` | yes | page HTML reference |
| `logic` | yes | primary behavior module |
| `route` | no | route pattern or path |
| `title` | no | document/screen title |
| `layout` | no | layout HTML reference |
| `api` | no | named remote dependencies |
| `data` | no | named local-data dependencies |

### Lifecycle

| Hook | Purpose |
|---|---|
| `mount()` | automatic setup when an instance becomes live |
| `sync()` | automatic update when the same instance is preserved |
| `run()` | explicit action/task entry point |
| returned cleanup | teardown for work started by `mount()` |

### Syntax

| Purpose | Syntax | Example |
|---|---|---|
| Class shorthand | `[name]` | `<div [card]>` |
| ID shorthand | `#name` | `<main #content>` |
| Event | `@event="..."` | `<button @click="save()">` |
| Local state | `:state="..."` | `<section :state="{ open: false }">` |
| Calculated values | `:calc="..."` | `<div :calc="{ total: price * qty }">` |
| Text binding | `:text="..."` | `<span :text="count">` |
| HTML binding | `:html="..."` | `<div :html="content">` |
| Show/hide | `:show="..."` | `<div :show="open">` |
| Two-way bind | `:bind="..."` | `<input :bind="form.name">` |
| Conditional | `:if="..."` | `<section :if="loggedIn">` |
| Loop | `:each="..."` | `<template :each="item in items">` |
| Load component/template | `:use="..."` | `<div :use="'card'">` |
| Props | `:props="..."` | `<div :use="'card'" :props="{ title: 'Hi' }">` |
| Layout area | `:area="..."` | `<header :area="'header'">` |
| Fill area | `:fill="..."` | `<template :fill="'header'">` |
| Mount target | `:mount` | `<main :mount>` |
| Reactive class | `:class.name="..."` | `<div :class.open="open">` |
| Reactive attribute | `:set.name="..."` | `<a :set.href="url">` |

### Transport helpers

| Helper | Meaning |
|---|---|
| `read()` | live SSE read |
| `request()` | advanced one-off read-only request |
| `get()` | one-off read |
| `create()` | create record |
| `update()` | full update |
| `patch()` | partial update |
| `delete()` | delete record |
| `mutate()` | local state mutation |

### Storage guidance

| Use case | Best fit |
|---|---|
| mock/demo data | `.json` |
| editable config/content | `.yaml` |
| durable local database | `.db` |
| framework local-data adapter | `.data` |

---

## Final recommendations

1. Keep `.view`, `.logic`, `.api`, `.data`, and `.html` as the public framework file model.
2. Keep `.view` as the View-layer contract, not raw markup.
3. Keep markup in `.html`.
4. Keep routing in `.logic`, not `.api`.
5. Keep `.api` strictly about remote/backend transport.
6. Keep `.data` strictly about local persistence/storage access.
7. Ship the tiny local server early because it unlocks the rest of the design cleanly.
8. Use import maps for framework modules.
9. Keep JS flat and normal.
10. Keep Datastar as the engine, not the public authoring surface.
11. Use `mount()` and `sync()` as lifecycle hooks.
12. Keep `run()` as an imperative task hook, not a second setup hook.
13. Preserve layouts across same-layout route changes.
14. Keep v1 small, coherent, and teachable.
