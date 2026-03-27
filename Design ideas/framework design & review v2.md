# Reactive HTML SPA Framework on Top of Datastar

Source basis: the attached conversation in `Pasted text.txt`, plus the follow-up design decisions captured in this working markdown update.

## Executive summary

The framework now has a much clearer shape.

It is:

- **not** a React clone
- **not** a JSX/compiler-first framework
- **not** a pure server-templating framework
- **yes** to a **browser-native, HTML-first reactive SPA framework**
- **yes** to using **Datastar as the underlying reactive and patching engine**
- **yes** to a **tiny built-in local server** so the framework can run fast, stay same-origin, support import maps cleanly, and avoid `file://` module limitations
- **yes** to a branded file model that feels structured and easy to teach

The current architecture direction is:

> A Datastar-powered reactive framework where authors write normal `.html` markup for pages, layouts, and components, while first-class framework files such as `.view`, `.logic`, `.api`, and `.data` provide structure, behavior, transport, and persistence.

That gives the project a strong identity:

- HTML-first
- SPA-capable
- backend-friendly
- no VDOM
- no heavy build-first developer experience
- tiny local same-origin runtime host
- clean framework file structure
- Datastar underneath, not exposed as the main public authoring model

---

## What changed in the latest architecture update

The biggest new decisions are these:

1. The framework should use **Option B** from the design discussion:
   - a **tiny built-in local server**
   - fast
   - secure
   - same-origin by default
   - responsible for serving framework files with correct MIME types
   - responsible for SPA routing fallback and import-map support

2. **`.view` is not an HTML template file**
   - `.html` remains the actual markup/template/page/layout/component format
   - `.view` becomes the framework-level **View layer file** in the MVC-like sense

3. The file model is now much clearer:

```text
.view   = what screen exists
.logic  = how the app behaves
.api    = how the app talks to a backend
.data   = how the app talks to local storage/data files
.html   = actual markup/templates/pages/layouts/components
```

4. Routing stays in **`.logic`**, not `.api`
   - `router.logic` is the router engine
   - each `.view` may optionally declare its own route
   - larger apps may also use `/routes/*.logic` for grouped route registration

5. Local persistence gets its own layer:
   - `.data` is code
   - `.json`, `.yaml`, and `.db` are storage files

---

## Core product idea

The framework combines five ideas:

1. **HTML-first authoring**
   - authors write normal HTML
   - the browser can parse the markup directly
   - templates, pages, layouts, and components stay in `.html`

2. **Reactive UI without a VDOM**
   - local state
   - calculated state
   - bindings
   - conditionals
   - list rendering
   - event-driven updates
   - Datastar handles the low-level reactive/patching behavior

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

## The most important decisions

## 1) Datastar is the engine, not the product

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

### Why this matters

This keeps the project realistic and focused. The framework is an authoring and architecture layer over a proven reactive DOM engine instead of trying to invent everything from scratch.

---

## 2) HTML stays HTML

A major clarification from the newer discussion:

- `.html` should remain the true template/page/layout/component format
- `.view` should **not** replace HTML templates
- the framework should continue using HTML and the custom templating syntax already established

### Result

Use `.html` for:

- pages
- layouts
- components
- template fragments

Use `.view` for the formal framework **View layer** contract.

---

## 3) The file model is now a core part of the framework identity

This is the current canonical mental model:

```text
.view   = what screen exists
.logic  = how the app behaves
.api    = how the app talks to a backend
.data   = how the app talks to local storage/data files
.html   = actual markup/templates/pages/layouts/components
```

This is one of the strongest decisions made so far because it gives the framework a memorable, teachable structure.

### Meaning of each file type

#### `.view`
The screen/view contract.

A `.view` file should define things like:

- route metadata
- title/meta information
- which page HTML to load
- which layout to use
- which `.logic` file to attach
- which `.api` or `.data` modules the screen depends on
- optional guards or startup hooks

Example:

```js
export default view({
  id: 'contacts.index',
  route: '/contacts',
  layout: 'app',
  page: '/app/pages/contacts.html',
  logic: '@logic/contacts.logic',
  title: 'Contacts'
})
```

#### `.logic`
Executable application or framework behavior.

Use `.logic` for:

- router engine
- feature behavior
- app startup
- navigation logic
- state orchestration
- guards
- runtime coordination

Examples:

- `router.logic`
- `runtime.logic`
- `contacts.logic`
- `auth.logic`

#### `.api`
Remote/backend transport.

Use `.api` for:

- HTTP calls
- SSE/live endpoints
- fetch wrappers
- endpoint contracts
- request/response modes
- backend resource access

Examples:

- `contacts.api`
- `auth.api`
- `reports.api`

#### `.data`
Local persistence and storage adapters.

Use `.data` for:

- JSON-backed repositories
- YAML-backed content/config access
- DB-backed local storage adapters
- normalized local data access interfaces

Examples:

- `contacts.data`
- `settings.data`
- `projects.data`

#### `.html`
Actual user interface markup.

Use `.html` for:

- `pages/*.html`
- `layouts/*.html`
- `components/*.html`

---

## 4) Do not add `.controller` in v1

The newer discussion clarified that adding `.controller` would likely blur responsibilities instead of helping.

### Why

In this framework, "controller" would overlap with:

- router behavior
- UI orchestration
- transport logic
- state transitions

Those are already better handled by:

- `.logic`
- `.api`
- `.view`

### Recommendation

Do **not** add:

- `.controller`
- `.cont`
- `.mod`

And do **not** make `.model` mandatory in v1.

If a model-like layer is eventually needed, clearer choices are:

- `.data`
- `.schema`
- `.state`

But for now, `.data` is enough.

---

## 5) `.data` is code; `.json`, `.yaml`, and `.db` are storage

This is another important clarification.

### Good rule

- `.data` files are framework/application code
- `.json`, `.yaml`, and `.db` are storage formats

Example layout:

```text
/app
  /data
    contacts.data
    settings.data

  /storage
    contacts.json
    settings.yaml
    app.db
```

### Why this is good

It lets the rest of the framework depend on a stable local-data layer without caring whether the actual storage is:

- JSON
- YAML
- SQLite/DB
- or something else later

---

## 6) Routing belongs in `.logic`, not `.api`

Another key clarification from the recent conversation:

- `router.api` is the wrong mental model
- routing is not backend transport
- routing is application behavior

### Correct split

- `router.logic` = router engine
- each `.view` can optionally declare its route
- large apps can add `/routes/*.logic` for grouped route registration

### Suggested patterns

#### Small app

```text
/core/router.logic
/views/home.view
/views/settings.view
/views/contacts.view
```

#### Larger app

```text
/core/router.logic
/routes/index.logic
/routes/settings.logic
/routes/contacts.logic
/views/home.view
/views/settings.view
/views/contacts.view
```

### Practical guidance

For small apps, a single `router.logic` may be enough.

For larger apps, either:

- break routes into `/routes/*.logic`, or
- let `.view` files declare routes and keep the router thin

The best current direction is:

- `router.logic` owns the router engine
- `.view` can declare route metadata
- `/routes/*.logic` can be used when route registration grows large

---

## 7) The framework should use a tiny built-in local server

This is now a central design decision.

### Why the built-in server matters

Without a local same-origin app host, browser modules become harder to manage cleanly, especially when dealing with:

- import maps
- module MIME types
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
- a clean path for proxying backend calls instead of encouraging unsafe browser-side workarounds

---

## 8) Import maps are first-class

The framework wants clean, easy-to-use import maps.

### Recommendation

Use import maps for JavaScript-like framework files:

- `.view`
- `.logic`
- `.api`
- `.data`
- core framework modules

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

Import maps should resolve framework modules.

HTML files should still be loaded as HTML, not treated like JavaScript modules.

So this is good:

```js
import contactsView from '@views/contacts.view'
import contactsApi from '@api/contacts.api'
```

And this is still a runtime HTML load:

```js
const html = await fetch('/app/pages/contacts.html').then(r => r.text())
```

---

## 9) The syntax remains HTML-native

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

## 10) Separate HTML files remain first-class

The framework still treats separate HTML pieces as a major part of composition.

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

### Why this matters

This keeps the authoring surface simple and keeps the framework feeling like "HTML with powers" rather than "a JavaScript framework disguised as attributes."

---

## 11) Layout composition still centers on `:area`, `:fill`, and `:mount`

This remains the strongest layout vocabulary from the earlier design discussion.

### Final direction

- `:mount` = primary routed render target
- `:area="..."` = named placeholder area
- `:fill="..."` = content that fills an area

Example:

```html
<div [app-layout]>
  <header :area="'header'"></header>
  <main #content :mount></main>
  <footer :area="'footer'"></footer>
</div>
```

And composition:

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

## 12) The request and transport model remains strong

The request helper model is still one of the best parts of the framework.

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

## 13) Parent/child scope helpers still need a precise spec

The scope-related built-ins are still promising, but they remain one of the hardest runtime design problems.

Planned expression-scope values/helpers:

- `self`
- `parent`
- `children`
- `root`
- `props`
- `event`

These are powerful, but they need precise rules for:

- repeated templates
- nested component scopes
- route/layout scope boundaries
- cleanup and lifecycle

This is still one of the most important spec items before implementation gets deep.

---

## 14) JS should stay natural and flat

This remains a critical design rule.

### Good direction

- HTML gets the framework syntax
- JS stays normal JS
- use flatter helpers
- prefer property-first APIs
- use local aliases
- do not try to force template sigils into JS

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

And then in logic files:

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

## Example `.view`

```js
export default view({
  id: 'contacts.index',
  route: '/contacts',
  layout: 'app',
  page: '/app/pages/contacts.html',
  logic: '@logic/contacts.logic',
  title: 'Contacts'
})
```

## Example `.logic`

```js
export default logic(({ api, state, set }) => ({
  run() {
    set({ loading: true })
    api.get()
  }
}))
```

## Example `.api`

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

## Example `.data`

```js
export default data(({ storage }) => ({
  list: () => storage.json('/app/storage/contacts.json').read(),
  save: records => storage.json('/app/storage/contacts.json').write(records)
}))
```

## Example `.html`

```html
<section [contacts-page]
         :state="{ contacts: [], form: { name: '', phone: '' } }"
         :run="get.state('/contacts')">
  <form [contact-form]>
    <input :bind="form.name" />
    <input :bind="form.phone" />
    <button @click="create.state('/contacts', form)">Add Contact</button>
  </form>
</section>
```

---

## Updated documentation summary

## Canonical description

**A no-build-step reactive HTML SPA framework built on top of Datastar, with a tiny built-in local server and a structured file model.**

It lets authors write normal HTML for pages, layouts, and components, while using `.view`, `.logic`, `.api`, and `.data` files to define screens, behavior, remote transport, and local persistence. A small runtime interprets the framework syntax, maps it onto Datastar’s reactive DOM behavior, and provides SPA routing, composition, and backend integration without requiring a VDOM-heavy architecture.

---

## Core philosophy

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

### Later

- stronger route auto-discovery
- typed schema system
- editor tooling
- precise keyed `:each` semantics
- more advanced scope helpers
- richer build-time validation without requiring a build step

---

## Cheat sheet

## File types

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

## Routing

| Item | Meaning |
|---|---|
| `router.logic` | router engine |
| `view.route` | optional route declaration in a `.view` file |
| `/routes/*.logic` | grouped route registration for larger apps |

## Syntax

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

## Transport helpers

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

## Storage guidance

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
