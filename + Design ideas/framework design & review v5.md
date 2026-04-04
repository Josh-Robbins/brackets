# Reactive HTML SPA Framework on Top of Datastar

Source basis: the earlier framework review markdown, the prior handoff intro, the lifecycle and `.view` decisions from the latest discussion, the syntax simplification decisions around `page()`, `print()`, inline logic, plain-object files, and the newly locked `ctx` direction.

---

## Executive summary

The framework now has a much clearer and more coherent shape.

It is:

- **not** a React clone
- **not** a JSX-first or compiler-first framework
- **not** a VDOM-heavy architecture
- **not** a server-template-only system
- **yes** to a **browser-native, HTML-first reactive SPA framework**
- **yes** to **Datastar as the underlying reactive and patching engine**
- **yes** to a **tiny built-in local server** for same-origin runtime behavior, import maps, and SPA fallback
- **yes** to a **clear branded file model** that is easy to teach and reason about
- **yes** to a **much flatter authoring surface** with less wrapper ceremony
- **yes** to a **small, elegant context model** based on grouped capabilities instead of a giant helper bag

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
- flatter, more human authoring syntax
- grouped and readable logic context

---

## Core product idea

The framework combines six major ideas:

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

6. **A small, readable behavior model**
   - canonical `ctx` runtime object
   - grouped capabilities such as `state`, `route`, and `nav`
   - safe destructuring for cleaner author code
   - no invisible magic locals

---

## Canonical mental model

```text
.view   = what page exists
.logic  = how the app behaves
.api    = how the app talks to a backend
.data   = how the app talks to local storage/data files
.html   = actual markup/templates/pages/layouts/components
```

This remains one of the strongest framework decisions so far because it gives the project a memorable and teachable structure.

---

## Locked decisions

The biggest decisions now locked in are:

1. The framework uses a **tiny built-in local server**.
2. **`.view` is not an HTML template file**.
3. **`.html` remains the actual markup format**.
4. Routing lives in **`.logic`**, not `.api`.
5. Local persistence gets its own **`.data` layer**.
6. `.view` is a **declarative page manifest**.
7. Lifecycle wording should be **clear and simple**, centered on `mount()`, `sync()`, and `run()`.
8. `run()` stays in the design, but it is **not another mount hook**.
9. The public authoring surface should be **much flatter** than `export default logic(() => ({}))`.
10. **`page()`** is the preferred declaration word for a routeable UI unit.
11. **`print()`** is reserved for render/output work, not manifest declaration.
12. Framework files should support **plain-object authoring with minimal ceremony**.
13. Small logic may live **inline in `.view`**, while larger behavior may live in a separate `.logic` file.
14. Arrow functions should remain welcome in the framework, but they should not force extra nesting.
15. The canonical runtime context name is **`ctx`**.
16. The framework should reduce `ctx.` noise through **safe destructuring**, not magic injection.
17. Context capabilities should be **grouped into small named spaces**, not exposed as a loose helper bag.
18. **No invisible top-level locals** such as bare `api`, bare `set`, or bare `query` should appear by default in v1.

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
- context shape and behavior ergonomics

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

- the formal framework page-layer contract
- route metadata
- HTML wiring
- logic wiring
- API/data dependency wiring

---

## File types and responsibilities

### `.view`
The page contract.

A `.view` file defines:

- page identity
- optional route metadata
- title/meta information
- which page HTML to load
- which layout to use
- which `.logic` file to attach, if any
- which named `.api` and `.data` modules the page depends on
- optional inline logic for smaller pages

### `.logic`
Executable application or framework behavior.

Use `.logic` for:

- router engine
- feature behavior
- app startup
- navigation logic
- state orchestration
- runtime coordination
- page behavior
- layout behavior
- larger action collections that should live outside the manifest

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
- `.view.route` is the default route declaration for most pages
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
- avoid extra wrapper ceremony in framework files

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

### Current syntax direction

The public authoring surface should move away from shapes like:

```js
export default logic(({ api, set, route }) => ({
  async mount() {},
  sync() {},
  async run() {}
}))
```

And toward plain-object authoring with optional helper wrapping only when it clearly adds value.

### Preferred logic style

```js
{
  async mount(ctx) {
  },

  sync({ state, route }) {
  },

  async refresh({ api, state }) {
  }
}
```

### Authoring rule

Arrow functions should remain a first-class style in the framework, but they should not force top-level nesting. The framework should support arrows naturally **inside** object-based files.

---

## `page()` and `print()` vocabulary

The framework now has a clearer public vocabulary.

### `page()`
Use `page()` for the declarative manifest of a routeable UI unit.

Good uses:

```js
page({
  id: 'home',
  route: '/',
  html: './home.html'
})
```

Why it works:

- sounds declarative
- feels web-native
- maps well to routing
- fits a manifest or contract

### `print()`
Use `print()` for render/output work.

Good uses:

```js
print('<h1>Hello</h1>')
```

```js
return print('./home.html')
```

Why it works:

- sounds like output
- sounds like render/send markup
- does **not** imply route declaration

### Important rule

Do **not** overload `print()` to also declare pages.

The split should stay:

- `page()` = declare a page
- `print()` = render/output helper

---

## File authoring style for v1

The framework should support **both** of these styles:

1. a helper-based explicit style
2. a minimal bare-object style

That gives the framework a clean beginner path and a clean low-ceremony path.

### Helper-based page style

```js
page({
  id: 'home',
  route: '/',
  html: './home.html'
})
```

### Bare-object page style

```js
{
  id: 'home',
  route: '/',
  html: './home.html'
}
```

### Recommendation

Support both. Keep the runtime and tooling smart enough to understand both, but bias the docs toward the style that proves clearest in practice.

A good likely split is:

- `page({ ... })` for explicitness, validation, and tooling
- bare `{ ... }` for maximum simplicity and minimal ceremony

### Export rule

Framework-identity files should not require `export default` as the normal authoring surface.

A `.view` file is already a page manifest.
A `.logic` file is already logic.
A `.api` file is already API transport.
A `.data` file is already a data adapter.

The loader can provide the wrapping/export behavior.

---

## `.view` spec for v1

A `.view` file is a **declarative page manifest**.

It answers one question:

> What page is this, and what resources does it need?

A `.view` should not become a controller and should not contain business logic beyond small inline page behavior where that improves simplicity.

### `.view` rules for v1

1. A `.view` declares exactly one page manifest.
2. A `.view` is primarily declarative metadata.
3. A `.view` may declare a route.
4. A `.view` points to exactly one page `.html`.
5. A `.view` may point to one layout `.html`.
6. A `.view` may point to one primary external `.logic` module.
7. A `.view` may instead include small inline logic.
8. A `.view` may declare named `.api` and `.data` dependencies for injection.
9. A `.view` does not perform fetches, mutations, or DOM work directly.

### Recommended `.view` shapes

Helper style:

```js
page({
  id: 'contacts.index',
  route: '/contacts',
  title: 'Contacts',

  html: '@pages/contacts.html',
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

Minimal style:

```js
{
  id: 'contacts.index',
  route: '/contacts',
  title: 'Contacts',
  html: '@pages/contacts.html',
  layout: '@layouts/app.html',
  logic: '@logic/contacts.logic',
  api: {
    contacts: '@api/contacts.api'
  },
  data: {
    settings: '@data/settings.data'
  }
}
```

Inline-logic style:

```js
page({
  id: 'home',
  route: '/',
  html: '@pages/home.html',

  logic: {
    mount({ state }) {
      state.set({ title: 'Hello' })
    }
  }
})
```

### Required fields

- `id`
- `html`

### Optional fields

- `route`
- `title`
- `layout`
- `logic`
- `api`
- `data`

### Guidance

Use `.view.route` as the default route declaration for most pages.

Use `/routes/*.logic` when route registration becomes large or needs grouping.

Use inline `logic` when page behavior is tiny.

Use an external `.logic` file when page behavior is larger, shared, or worth isolating.

---

## The `ctx` design direction

This is now a core simplification decision.

### The problem to avoid

`ctx` should **not** become a giant dump-everything bag of unrelated helpers.

If the framework exposes too many loose top-level values such as:

- `set`
- `query`
- `params`
- `event`
- `input`
- `redirect`
- `nav`
- `api`
- `data`

then `.logic` starts to feel wider and heavier than it needs to be.

### The design goal

The context should feel more like a **small stable object with clear grouped spaces**.

That means:

- `ctx` stays the canonical runtime object
- most author code can avoid repeated `ctx.` by destructuring
- grouped spaces stay readable and type-friendly
- the framework avoids invisible local injection magic

### Canonical naming rule

Use **`ctx`** as the official runtime name.

Do **not** standardize on:

- `c`
- `x`
- hidden framework-injected locals

### Ergonomic rule

The framework should solve prefix fatigue with **safe destructuring**, not runtime magic.

Good:

```js
{
  async mount({ state, api, route }) {
    state.set({ loading: true })

    const contacts = await api.contacts.list()

    state.set({
      loading: false,
      contacts,
      selectedId: route.query('id')
    })
  }
}
```

Also good:

```js
{
  async mount(ctx) {
    ctx.state.set({ loading: true })
  }
}
```

Not recommended:

```js
{
  async mount() {
    set({ loading: true })
    const contacts = await api.contacts.list()
  }
}
```

### Public rule

Show explicit `ctx` first in runtime docs if needed, but allow destructuring as a first-class authoring style.

A strong docs pattern is:

```js
mount(ctx) {}
mount({ state, route, api }) {}
```

---

## Canonical `ctx` shape for v1

The v1 context should stay small and grouped.

```ts
type Ctx = {
  route: {
    path: string
    hash: string
    params: Record<string, string>
    queryAll(): Record<string, string | string[]>
    param(name: string): string | undefined
    query(name: string): string | undefined
  }

  state: {
    get(): Record<string, unknown>
    set(patch: Record<string, unknown>): void
    replace(next: Record<string, unknown>): void
  }

  action: {
    event: Event | null
    el: Element | null
    input(): unknown
  }

  api: Record<string, unknown>
  data: Record<string, unknown>

  nav: {
    to(path: string): void
    replace(path: string): void
    back(): void
  }

  cleanup(fn: () => void): void
}
```

### Why this shape works

It groups behavior into small readable spaces:

- `route` = routing inputs
- `state` = state reads and writes
- `action` = current event context
- `api` = backend transport
- `data` = local persistence
- `nav` = navigation helpers
- `cleanup()` = lifecycle teardown registration

### What should stay out of root `ctx` in v1

Do **not** place these as loose root properties by default:

- `set`
- `query`
- `params`
- `event`
- `el`
- `input`
- `print`
- `mutate`
- `view`
- `layout`
- `app`

Those either belong in grouped spaces, belong in global/runtime helpers, or expose too much internal machinery.

---

## `.logic` contract for v1

`.logic` remains the executable behavior layer, but the lifecycle wording is now clearer and the file shape is much flatter.

### Public hooks

- `mount(ctx)`
- `sync(ctx)` optional
- `run(payload, ctx)` optional
- named actions such as `refresh(ctx)` or `save(ctx)`
- cleanup may be returned from `mount()`
- cleanup may also be registered through `ctx.cleanup()`

### Meaning

- `mount()` = this page or layout became live
- `sync()` = the same mounted instance received new route inputs or other runtime inputs
- `run()` = an imperative task or advanced action entry point
- named actions = ordinary page behavior authors call from markup

### Critical rule

**`mount()` is lifecycle. `run()` is intent.**

That means:

- `mount()` is automatic
- `sync()` is automatic when the same instance is preserved
- `run()` is not a second mount hook
- `run()` is not automatically called just because something mounted
- normal UI actions should prefer direct named actions where possible

### Recommended `.logic` shape

Method style:

```js
{
  async mount(ctx) {
    const { state, api, route } = ctx

    state.set({ loading: true })

    const contacts = await api.contacts.list()

    state.set({
      loading: false,
      contacts,
      selectedId: route.query('id') ?? null
    })
  },

  sync({ state, route }) {
    state.set({
      selectedId: route.query('id') ?? null
    })
  },

  async refresh({ api, state }) {
    state.set({ refreshing: true })
    const contacts = await api.contacts.list()
    state.set({ refreshing: false, contacts })
  },

  async run(payload, ctx) {
  }
}
```

Arrow-friendly style:

```js
{
  mount: async ({ state, api, route, cleanup }) => {
    state.set({ loading: true })

    const contacts = await api.contacts.list()

    state.set({
      loading: false,
      contacts,
      selectedId: route.query('id') ?? null
    })

    const stop = api.contacts.read?.()

    cleanup(() => {
      stop?.()
    })
  },

  sync: ({ state, route }) => {
    state.set({
      selectedId: route.query('id') ?? null
    })
  },

  refresh: async ({ api, state }) => {
    state.set({ refreshing: true })
    const contacts = await api.contacts.list()
    state.set({ refreshing: false, contacts })
  }
}
```

### Authoring preference

Use grouped destructuring for readability:

```js
refresh({ api, state }) {}
save({ action, api, state, nav }) {}
sync({ route, state }) {}
```

That is the main answer to “how do we avoid `ctx.` everywhere?”

---

## Direct actions vs `run()`

The cleaner authoring model is:

- `mount()` for setup
- `sync()` for preserved-instance updates
- direct named actions for normal UI behavior
- `run()` for advanced or imperative cases

### Preferred markup style

```html
<button @click="refresh">Refresh</button>
<form @submit="createPost">
```

### Preferred logic style

```js
{
  async refresh({ api, state }) {
  },

  async createPost({ action, api, nav }) {
    const form = action.input()
  }
}
```

### Keep `run()` for

- dynamic action dispatch
- explicit framework-invoked tasks
- advanced plugin use cases
- edge cases where direct named actions are not enough

---

## Full lifecycle specification

The lifecycle should feel understandable in plain language:

- a layout becomes live
- a page becomes live
- the same live instance may be synced with new inputs
- an imperative task may be run
- direct named actions may be invoked
- cleanup happens when the instance is removed or replaced

### Public lifecycle vocabulary

| Purpose | Public name | Meaning |
|---|---|---|
| instance becomes active | `mount()` | setup for a live layout or page |
| same active instance gets new inputs | `sync()` | respond without remounting |
| explicit advanced task | `run()` | do the thing on demand |
| ordinary UI action | named action | `refresh`, `save`, `createPost`, etc. |
| stop side effects | returned cleanup function or `ctx.cleanup()` | tear down work started by `mount()` |

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
3. `mount()` may also register cleanup through `ctx.cleanup()`.
4. `sync()` is optional and only runs when the same mounted instance is preserved.
5. `run()` is optional and imperative.
6. Direct named actions are the default for ordinary UI behavior.
7. `run()` is not a lifecycle substitute for `mount()`.
8. Cleanup runs before an instance is removed or replaced.
9. Preserved layouts do not remount when only the page changes.
10. A page may remount even when the layout stays preserved.

---

## Lifecycle spec table

| Phase | Trigger | Runtime action | Hook(s) | Notes |
|---|---|---|---|---|
| Boot runtime | app start | create runtime, router, import-map context, service registry | none | framework-level startup |
| Resolve route | initial URL or navigation | match URL to a `.view` | none | `router.logic` owns matching |
| Load page manifest | matched route | import `.view` file | none | resolves page metadata |
| Resolve dependencies | matched view | load page HTML, optional layout HTML, `.logic`, `.api`, `.data` | none | `.view` remains mostly declarative |
| Compare layout | before render | decide whether layout is preserved or replaced | none | same layout should stay mounted |
| Mount layout | first render or layout change | render layout HTML and activate layout scope | `layout.mount()` | layout cleanup may be registered |
| Mount page/view | first render, page change, or remount | render page HTML into `:mount` target and activate page scope | `view.mount()` | page cleanup may be registered |
| Sync layout | preserved layout gets new inputs | update layout scope without remount | `layout.sync()` optional | no layout cleanup or remount |
| Sync page/view | same preserved page/view gets new inputs | update page scope without remount | `view.sync()` optional | used for route param/query changes when instance is preserved |
| Run advanced logic task | explicit advanced action or framework-invoked task | invoke imperative logic task | `run()` optional | not automatic on mount |
| Run direct action | user event or explicit binding | invoke named page/layout action | named action | preferred for normal UI work |
| Unmount page/view | page replaced or removed | run page cleanup, remove page DOM, dispose page instance | cleanup from `view.mount()` or `ctx.cleanup()` | layout may remain mounted |
| Unmount layout | layout replaced or app shutdown | run layout cleanup, remove layout DOM, dispose layout instance | cleanup from `layout.mount()` or `ctx.cleanup()` | happens after page cleanup |
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
8. Resolve inline logic or import its `.logic` module if present.
9. Import its named `.api` and `.data` modules.
10. Render layout HTML if needed.
11. Render page HTML into the layout `:mount` target.
12. Activate directives and reactive scope wiring.
13. Create layout logic context if a layout logic instance exists.
14. Call layout `mount()`.
15. Store returned layout cleanup and registered layout cleanup if present.
16. Create page logic context.
17. Call page `mount()` if defined.
18. Store returned page cleanup and registered page cleanup if present.

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
12. Call next page `mount()` if defined.
13. Store returned cleanup and registered cleanup.
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
12. Call next layout `mount()` if defined.
13. Load next page HTML and logic dependencies.
14. Render next page into the next layout `:mount` target.
15. Call next page `mount()` if defined.

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
- the next resolved logic target is different
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
page({
  id: 'contacts.index',
  route: '/contacts',
  title: 'Contacts',
  html: '@pages/contacts.html',
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

### Example inline `.view` logic

```js
page({
  id: 'home',
  route: '/',
  html: '@pages/home.html',
  logic: {
    mount({ state }) {
      state.set({ title: 'Hello' })
    }
  }
})
```

### Example `.logic`

```js
{
  async mount({ api, route, state, cleanup }) {
    state.set({ loading: true })

    const contacts = await api.contacts.list()

    state.set({
      loading: false,
      contacts,
      selectedId: route.query('id') ?? null
    })

    const stop = api.contacts.read?.()

    cleanup(() => {
      stop?.()
    })
  },

  sync({ route, state }) {
    state.set({
      selectedId: route.query('id') ?? null
    })
  },

  async refresh({ api, state }) {
    state.set({ refreshing: true })
    const contacts = await api.contacts.list()
    state.set({ refreshing: false, contacts })
  }
}
```

### Example `.api`

```js
{
  list: ({ http }) => http.get('/contacts'),
  create: ({ http }, body) => http.post('/contacts', body),
  update: ({ http }, id, body) => http.put(`/contacts/${id}`, body),
  patch: ({ http }, id, body) => http.patch(`/contacts/${id}`, body),
  remove: ({ http }, id) => http.delete(`/contacts/${id}`),
  read: ({ http }) => http.sse('/events/contacts')
}
```

### Example `.data`

```js
{
  list: ({ storage }) => storage.json('/app/storage/contacts.json').read(),
  save: ({ storage }, records) => storage.json('/app/storage/contacts.json').write(records)
}
```

### Example page `.html`

```html
<section [contacts-page]
         :state="{ contacts: [], loading: false, refreshing: false, selectedId: null }">
  <h1 :text="'Contacts'"></h1>

  <button @click="refresh">Refresh</button>

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

**A no-heavy-build reactive HTML SPA framework built on top of Datastar, with a tiny built-in local server, a structured file model, and a grouped context model for clean page logic.**

It lets authors write normal HTML for pages, layouts, and components while using `.view`, `.logic`, `.api`, and `.data` files to define pages, behavior, remote transport, and local persistence. A small runtime interprets the framework syntax, maps it onto Datastar’s reactive DOM behavior, and provides SPA routing, composition, and backend integration without requiring a VDOM-heavy architecture.

### Core philosophy

1. HTML first
2. Datastar underneath
3. Tiny local same-origin app host
4. SPA behavior without a VDOM
5. Structured and branded framework files
6. JS stays normal and flat
7. Backend-friendly and local-data-friendly
8. Keep v1 small and coherent
9. Prefer flatter authoring over wrapper-heavy ceremony
10. Keep `ctx` small, grouped, and readable

---

## What should be in v1

### Must-have

- built-in local server
- import map support
- `.view`, `.logic`, `.api`, `.data`
- `.html` pages/layouts/components
- `router.logic`
- optional route declaration in `.view`
- `page()` and/or bare-object page authoring
- inline logic for simple pages
- external `.logic` files for larger pages
- plain-object logic authoring
- arrow-function-friendly action authoring
- `print()` as render/output helper
- `:state`, `:calc`, `:text`, `:html`, `:show`, `:bind`, `:if`, `:each`
- `:use`, `:props`, `:area`, `:fill`, `:mount`
- request helpers and result modes
- flat JS helper layer
- grouped `ctx` model with `state`, `route`, `action`, `api`, `data`, `nav`, and `cleanup()`
- lifecycle support for `mount()` and `sync()`
- imperative logic actions through `run()`
- direct named actions from markup
- cleanup returned from `mount()` or registered through `ctx.cleanup()`
- layout preservation across same-layout route changes

### Later

- stronger route auto-discovery
- typed schema system
- editor tooling
- precise keyed `:each` semantics
- more advanced scope helpers
- richer validation without requiring a heavy build step
- formal action dispatch rules between markup and advanced logic entry points

---

## Cheat sheet

### File types

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

### Routing

| Item | Meaning |
|---|---|
| `router.logic` | router engine |
| `view.route` | optional route declaration in a `.view` file |
| `/routes/*.logic` | grouped route registration for larger apps |

### Page manifest

| Field | Required | Meaning |
|---|---|---|
| `id` | yes | stable page identity |
| `html` | yes | page HTML reference |
| `logic` | no | primary behavior module or inline logic |
| `route` | no | route pattern or path |
| `title` | no | document/page title |
| `layout` | no | layout HTML reference |
| `api` | no | named remote dependencies |
| `data` | no | named local-data dependencies |

### Context

| Group | Purpose |
|---|---|
| `route` | route params, query, path, and hash |
| `state` | local state reads and writes |
| `action` | current event, element, and input payload |
| `api` | backend transport modules |
| `data` | local persistence modules |
| `nav` | navigation helpers |
| `cleanup()` | lifecycle teardown registration |

### Lifecycle

| Hook | Purpose |
|---|---|
| `mount()` | automatic setup when an instance becomes live |
| `sync()` | automatic update when the same instance is preserved |
| `run()` | explicit advanced task entry point |
| named action | ordinary UI action |
| returned cleanup / `ctx.cleanup()` | teardown for work started by `mount()` |

### Syntax

| Purpose | Syntax | Example |
|---|---|---|
| Class shorthand | `[name]` | `<div [card]>` |
| ID shorthand | `#name` | `<main #content>` |
| Event | `@event="..."` | `<button @click="save">` |
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
2. Keep `.view` as the page-layer contract, not raw markup.
3. Keep markup in `.html`.
4. Keep routing in `.logic`, not `.api`.
5. Keep `.api` strictly about remote/backend transport.
6. Keep `.data` strictly about local persistence/storage access.
7. Ship the tiny local server early because it unlocks the rest of the design cleanly.
8. Use import maps for framework modules.
9. Keep JS flat and normal.
10. Keep Datastar as the engine, not the public authoring surface.
11. Use `page()` for declarative page manifests.
12. Use `print()` for render/output helpers.
13. Support plain-object authoring and optional helper-based authoring.
14. Remove `export default` as required ceremony from framework-identity files.
15. Allow inline logic for simple pages and external `.logic` files for larger pages.
16. Use `mount()` and `sync()` as lifecycle hooks.
17. Keep `run()` as an imperative advanced task hook, not a second setup hook.
18. Prefer direct named actions for ordinary UI behavior.
19. Preserve layouts across same-layout route changes.
20. Keep `ctx` as the canonical runtime object name.
21. Solve `ctx.` fatigue with grouped destructuring, not hidden magic locals.
22. Keep the v1 `ctx` shape small, grouped, and teachable.
23. Keep v1 small, coherent, and teachable.
