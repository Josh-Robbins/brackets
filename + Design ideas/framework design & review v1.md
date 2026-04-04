# Reactive HTML SPA Framework on Top of Datastar

Source basis: the attached conversation in `Pasted text.txt`.

## Executive summary

The conversation converges on a clear product idea:

- **Not** a React clone
- **Not** a JSX/compiler-first framework
- **Not** a pure server-templating framework like Jinja alone
- **Yes** to a **no-build-step, HTML-native, runtime-interpreted SPA framework**
- **Yes** to using **Datastar as the low-level reactive/patching engine** underneath
- **Yes** to building a **new author-facing syntax, component system, layout system, routing model, and helper layer** on top of it

The final direction is:

> A browser-native reactive framework where authors write HTML with a custom syntax like `[card]`, `#content`, `@click`, and `:state`, while a thin runtime rewrites or interprets that syntax and maps it onto Datastar’s signal, effect, request, and DOM patching behavior.

That gives the project a strong identity:

- HTML-first
- backend-friendly
- SPA-capable
- componentized
- reactive
- no traditional build step required

---

## What the framework is trying to be

The framework aims to combine five ideas:

1. **HTML-first authoring**
   - The author writes normal HTML files, not JSX/TSX
   - The browser can parse the source directly

2. **Reactive UI without a VDOM**
   - Local state, derived state, conditionals, loops, bindings, and event-driven updates
   - Datastar handles the underlying signal + DOM patching model

3. **Real SPA behavior**
   - Persistent shell/layout
   - Routed content swaps into a mount area
   - Browser history integration
   - Partial updates instead of full page reloads

4. **Modular composition through separate HTML pieces/files**
   - `components/`
   - `layouts/`
   - `pages/`
   - possible inline templates too

5. **Easy backend integration**
   - Backend stays the source of truth for persisted data
   - Client state is UI state
   - HTML, state patches, JSON, and SSE all have a place

---

## The most important decisions pulled from the conversation

## 1) Datastar is the engine, not the product

The conversation repeatedly clarified that the new framework should **layer on top of Datastar**, not replace it.

Datastar supplies the lower-level mechanics:

- signal-style reactivity
- HTML patching
- SSE updates
- request actions
- attribute-driven behavior

The new framework supplies the opinionated structure:

- authoring syntax
- component model
- layout composition
- state scoping rules
- router
- helper APIs
- folder conventions

### Why this matters

This keeps the project much smaller and more realistic. Instead of building a whole reactive engine, the framework builds a better author experience over an existing reactive engine.

---

## 2) No build step means HTML-native, not “no processing at all”

A major turning point in the conversation was this distinction:

- If the authoring language is **already valid HTML**, the browser can parse it directly.
- If the framework invents syntax like `{{ name }}` or JSX-like tags with custom semantics, then something must compile/translate/interpret it.

The final direction became:

- **Do not start with a compiler**
- **Do not start with JSX**
- **Do not start with a custom Jinja-like grammar**
- Instead, build a **runtime-interpreted HTML-native language**

### Result

The syntax should be legal HTML that a runtime can scan and process.

That is what made the custom attribute/sigil system possible.

---

## 3) The framework should use its own authoring syntax instead of `data-*`

The conversation explored several authoring styles:

- raw Datastar `data-*`
- parentheses like `(state)`
- brackets like `[state]`
- mixed styles

The final syntax direction became:

- `[name]` for class shorthand
- `#name` for ID shorthand
- `@event="..."` for events
- `:directive="..."` for reactive/template directives

This is the single biggest syntax decision in the whole conversation.

### Final mental model

- `[]` = naming / structure / styling
- `#` = unique target
- `@` = behavior
- `:` = reactivity, templating, and framework directives

Example:

```html
<article [card] :state="{ count: 0 }">
  <button [button] @click="count--">-</button>
  <span :text="count"></span>
  <button [button] @click="count++">+</button>
</article>
```

---

## 4) Repeated things should use classes, not IDs

A long part of the discussion clarified the difference between:

- component/file name
- class name
- actual DOM ID

Key conclusion:

- Repeated components should usually use shared class-like markers such as `[card]`
- IDs should only be used for unique elements or special targets
- File name and ID should **not** always be treated as identical

### Good rule

- `card.html` = component type
- `[card]` = styling/semantic hook
- `#content` = unique mount target

This was an important correction because it prevents invalid duplicate IDs and keeps CSS and patch targeting sane.

---

## 5) Separate HTML files are first-class

The framework should support component composition from separate HTML pieces.

Suggested structure repeatedly converged around:

```text
/components/
  header.html
  footer.html
  card.html
/layouts/
  app.html
/pages/
  home.html
  settings.html
```

The layout file composes the page shell; components fill named areas; pages mount into the main content region.

---

## 6) The SPA shell should stay mounted while page content swaps

A persistent layout shell is central to the design.

Typical shape:

```html
<div [app-layout]>
  <header :area="'header'"></header>
  <main #content :mount></main>
  <footer :area="'footer'"></footer>
</div>
```

Then page composition fills areas and mounts current page content.

The key design principle:

- header/footer/layout persist
- content area swaps
- this creates SPA behavior without turning the whole app into a client-side VDOM app

---

## 7) Final layout composition words: `:area`, `:fill`, `:mount`

The conversation explored several naming options:

- `slot/fill/outlet`
- `region/into/mount`
- `place/to/mount`
- `mount/fill/slot`
- finally **replace `slot` with `area`**

### Final direction

- `:mount` = main routed render target
- `:area="..."` = named placeholder area
- `:fill="..."` = content to place into an area

Example:

```html
<div [app-layout]>
  <header :area="'header'"></header>
  <main #content :mount></main>
  <footer :area="'footer'"></footer>
</div>

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

## 8) Parent, children, and mutation belong in v1, but mostly as expression-scope concepts

The conversation decided that the framework likely **does need** parent/child/mutation in v1, but not necessarily as top-level directives.

Final direction:

- `parent`
- `children`
- `self`
- `root`
- `props`
- `event`
- `mutate()`

These should behave as built-in expression-scope values/helpers.

### Example

```html
<section [modal-body]>
  <h2 :text="parent.title"></h2>
  <button @click="parent.open = false">Close</button>
</section>
```

This is one of the more ambitious parts of the design and will require very clear scope-resolution rules.

---

## 9) `:calc` won over `:derive`

For derived/computed values, the conversation ended up preferring **`:calc`** over names like `:derive`, `:computed`, or `memo`.

Example:

```html
<div :state="{ price: 10, qty: 2 }" :calc="{ total: price * qty }">
  <p :text="total"></p>
</div>
```

This is a clean naming decision and fits the framework tone.

---

## 10) Request/transport verbs were normalized into a clear model

The conversation iterated several times on request helper names.

### Final-ish action helpers

- `read()` = live SSE read channel
- `request()` = advanced one-off read helper, read-only
- `get()` = one-off read
- `create()` = create record
- `update()` = full update
- `patch()` = partial update
- `delete()` = delete record
- `mutate()` = local state mutation

Then response modes became suffixes:

- `.html`
- `.sse`
- `.state`
- `.json`

### Default behavior decided in the conversation

- `read()` -> `.sse`
- `request()` -> `.html`
- `get()` -> `.html`
- `create()` -> `.html`
- `update()` -> `.html`
- `patch()` -> `.state`
- `delete()` -> `.html`

### Override pattern

```html
@click="update.html('/users/12', user)"
@click="patch.state('/users/12', { name: 'Sarah' })"
@click="get.json('/stats')"
:run="read.sse('/events/users')"
```

This ended up being one of the strongest parts of the whole API design.

---

## 11) `request()` should be read-only

An important correction late in the conversation:

- `request()` should **not** be the general mutation API
- it should remain **read-only**
- writes should go through `create()`, `update()`, `patch()`, and `delete()`

That makes the transport model cleaner and supports a more secure mental model.

---

## 12) Security direction for SSE and reads

The conversation settled on several strong security instincts:

- session cookie auth instead of browser-stored bearer tokens
- same-origin by default
- CSRF protection on writes
- read-only live channels
- avoid exposing script execution via SSE by default
- send minimal ambient state/signals to the backend

This is a strong architectural instinct and should absolutely be preserved in the formal docs.

---

## 13) JS should stay natural; do not force template syntax into JS

There was a useful correction later in the discussion:

- HTML gets custom syntax
- JS should remain normal JS
- do **not** overuse `[]` in JS
- reduce nesting with **properties, flatter injected helpers, and local aliases**

This is an extremely important decision for framework ergonomics.

---

## 14) JS helper API should be flatter and property-first

The discussion eventually moved from more nested forms like:

```js
form('contact', ContactForm).data()
browser.timezone()
mutate.set('timezone', browser.timezone())
```

Toward flatter shapes like:

```js
forms.contact.data
forms.contact.valid
browser.timezone
browser.locale
set('timezone', browser.timezone)
```

And then even better through local aliases:

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

This is a very strong direction.

---

## Final syntax snapshot from the conversation

## Structural shorthand

```html
[name]     <!-- class shorthand -->
#name      <!-- id shorthand -->
```

Examples:

```html
<article [card]></article>
<main #content></main>
```

---

## Event syntax

```html
@click="..."
@input="..."
@change="..."
@submit="..."
```

---

## Core directives

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

### Meaning

- `:state` = local reactive state
- `:calc` = derived/calculated values
- `:run` = run initialization / startup action
- `:watch` = side effects when watched values change
- `:text` = text content binding
- `:html` = HTML content binding
- `:show` = show/hide behavior
- `:bind` = two-way binding
- `:if` = conditional rendering/logic
- `:each` = repetition/looping

---

## Template/layout directives

```html
:use=""
:props=""
:area=""
:fill=""
:mount
```

### Meaning

- `:use` = mount/load a named template/component/page
- `:props` = pass props into a template/component
- `:area` = named placeholder area in a layout/component
- `:fill` = content to place into an area
- `:mount` = primary mount point for routed content

---

## Dynamic DOM directives

```html
:class.name=""
:set.name=""
:loading=""
:error=""
```

### Meaning

- `:class.name` = reactive class toggle/binding
- `:set.name` = set a normal HTML attribute dynamically
- `:loading` = loading-state UI binding
- `:error` = error-state UI binding

`set` replaced `attr` late in the conversation because it felt more natural.

---

## Built-in scope values/helpers in expressions

```txt
self
parent
children
root
props
event

mutate()
read()
get()
create()
update()
patch()
delete()
request()
```

### Notes

- `parent`, `children`, `self`, `root`, `props`, and `event` are expression-scope concepts
- `mutate()` is for local state mutation
- `read()` is for live SSE reads
- `request()` is advanced one-off read-only access
- CRUD-like writes use `create/update/patch/delete`

---

## Transport/result modes

```txt
.html
.sse
.state
.json
```

### Default action mapping

```txt
read()    -> read.sse()
request() -> request.html()
get()     -> get.html()
create()  -> create.html()
update()  -> update.html()
patch()   -> patch.state()
delete()  -> delete.html()
```

### Explicit override examples

```html
:run="read.sse('/events/users')"
@click="get.json('/users')"
@click="create.html('/users', form)"
@click="update.state('/users/12', user)"
@click="patch.html('/users/12', partial)"
@click="delete.json('/users/12')"
```

---

## Example language snippet

```html
<section [contacts-page]
         :state="{ contacts: [], form: { name: '', phone: '', business: '' } }"
         :run="get.state('/contacts')">

  <form [contact-form]>
    <input :bind="form.name" />
    <input :bind="form.phone" />
    <input :bind="form.business" />

    <button @click="create.state('/contacts', form)">
      Add Contact
    </button>
  </form>

  <table [contacts-table]>
    <tbody>
      <template :each="contact in contacts">
        <tr>
          <td :text="contact.name"></td>
          <td :text="contact.phone"></td>
          <td :text="contact.business"></td>
        </tr>
      </template>
    </tbody>
  </table>
</section>
```

---

## Proposed project structure pulled from the conversation

## Frontend

```text
frontend/
  components/
    header.html
    footer.html
    card.html
  layouts/
    app.html
  pages/
    home.html
    contacts.html
  logic/
    contacts.js
  api/
    contacts.js
  schemas/
    contacts.js
  core/
    app.js
    runtime.js
    router.js
    state.js
    forms.js
    requests.js
    read.js
    helpers.js
```

## Backend

The later conversation implies a backend that can expose:

```text
GET    /contacts
POST   /contacts
PUT    /contacts/:id
PATCH  /contacts/:id
DELETE /contacts/:id
GET    /events/contacts
```

And core backend plumbing like:

```text
backend/
  core/
    server.js
    router.js
    request.js
    response.js
    sse.js
    db.js
    auth.js
    html.js
    state.js
```

## Additional directories

```text
schemas/
  contacts.js
  users.js
  auth.js

core/
  runtime.js
  router.js
  state.js
  forms.js
  requests.js
```

### Separation rule

- `schemas/` = data shapes and contracts
- `core/` = framework/app plumbing

---

## JS helper layer that emerged from the conversation

## Strong helpers

### logic()

Main wrapper for logic files.

```js
export default logic(ctx => ({
  run: () => {},
  create: () => {}
}))
```

### resource()

Used to build or infer CRUD APIs.

```js
export default resource('contacts')
```

But the later direction suggests the framework should often inject a prebuilt `api` object so logic files stay short.

### forms / form helpers

The preferred direction moved toward property-style access:

```js
forms.contact.data
forms.contact.valid
forms.contact.errors
forms.contact.clear()
forms.contact.reset()
forms.contact.patch(values)
```

Later discussion also supported local aliases like:

```js
const contact = forms.contact
```

### browser helper

Property-based, not method-heavy:

```js
browser.timezone
browser.locale
browser.online
browser.visible
browser.now
```

### flat mutation helpers

Instead of deep `mutate.set(...)`, the later direction preferred flatter helpers like:

```js
set(path, value)
merge(path, value)
push(path, value)
remove(path, predicateOrId)
toggle(path)
```

### other helpers explored

- `watch()`
- `task()`
- `route`
- `storage`
- `notify` / `success` / `error`
- `confirm`
- `list()`
- `find()`
- `pick()`

These make sense, but not all of them should be part of the very first release.

---

## Type-safety direction from the conversation

The conversation wanted strong type safety without forcing the whole framework into TS-first authoring.

The emerging strategy was:

- keep app code in `.js`
- encourage arrow functions
- use JSDoc / generated types / schema helpers
- add a schema/type layer

### Proposed helpers

- `schema(name, shape)`
- `types.string()`
- `types.number()`
- `types.boolean()`
- `types.array(schema)`
- `types.object(shape)`
- typed `form()` / `forms.<name>`
- typed `resource()` / injected `api`
- typed `mutate.*` / `set` / `merge` / `push`

This is a good direction, but it is broader than v1. The docs should treat it as a **planned type system**, not the initial must-have runtime.

---

## Detailed review and study of the idea

## What is strong about the idea

### 1) The framework has a real identity

This is not “React but smaller.”

It is:

- HTML-native
- runtime-interpreted
- backend-friendly
- SPA-capable
- Datastar-powered
- syntax-opinionated

That is a real position in the landscape.

### 2) The authoring syntax is memorable

The final shorthand is easy to teach:

- `[card]`
- `#content`
- `@click`
- `:state`

That is genuinely good ergonomically.

### 3) It aligns with the intended no-build-step goal

Because the syntax remains HTML-native, the framework can avoid a traditional compile/bundle step for the core author experience.

### 4) It keeps the backend relevant

This framework does not force all complexity into the browser. That is a big advantage for CRUD apps, admin apps, dashboards, internal tools, and server-centric systems.

### 5) The request/result contract is unusually clear

The split between:

- `read()`
- `request()`
- `get/create/update/patch/delete()`
- `.html/.sse/.state/.json`

is one of the best parts of the design.

### 6) The later “flatten JS helpers” discussion was exactly right

The framework becomes much more usable when JS stays normal and light.

That correction likely saved the design from becoming too clever.

---

## What is risky or still unresolved

### 1) Scope resolution is the hardest part

`parent`, `children`, `self`, `root`, `props`, and local state are powerful, but they create a hard runtime problem:

- What exactly counts as a parent scope?
- How does a repeated template instance resolve `parent`?
- Are children live, derived, or snapshots?
- How are scopes cleaned up?
- How are expressions rewritten internally?

This needs a precise spec very early.

### 2) `:each` needs a keyed identity story

Any repeated-render system eventually needs clear rules for:

- keying
- stable identity
- DOM reuse
- preserving local state inside repeated children

If this is vague, list rendering becomes fragile.

### 3) `:if` vs `:show` needs precise semantics

The docs should distinguish:

- `:if` = structural mount/unmount
- `:show` = visibility toggle

Without that distinction, authors will get unpredictable behavior.

### 4) `:run`, `:watch`, `:calc`, and request helpers can overlap

The runtime needs clear rules for which of these are:

- pure
- side-effecting
- initialization-only
- rerun-on-dependency-change
- once-per-mount

Otherwise templates become surprising.

### 5) The no-build-step promise still requires a real runtime transform layer

Even without a traditional build step, the framework still has to:

- scan the DOM
- resolve `[name]`, `#name`, `@event`, and `:directive`
- map them to runtime behaviors
- maybe rewrite expressions or paths
- resolve templates/components/layouts

That is fine, but the docs should say this honestly.

### 6) Editor/tooling support will matter

Custom HTML syntax like `[card]` and `:state` is legal and readable, but formatters, syntax highlighters, linting, and autocomplete will matter a lot. This is not a blocker, but it is a product requirement.

### 7) Type safety in HTML expressions is still unsolved

The JS side can become nicely typed. The HTML expression side is harder.

You will eventually need:

- expression validation
- schema-aware hints
- route/props/state awareness
- editor tooling

That should be treated as a future feature.

---

## What should be in v1 versus later

## V1 core

### Syntax

- `[name]`
- `#name`
- `@event`
- `:state`
- `:calc`
- `:text`
- `:html`
- `:show`
- `:bind`
- `:if`
- `:each`
- `:use`
- `:props`
- `:area`
- `:fill`
- `:mount`
- `:class.name`
- `:set.name`

### Built-ins

- `props`
- `parent`
- `self`
- `root`
- `event`
- `mutate()`
- `read()`
- `get()`
- `create()`
- `update()`
- `patch()`
- `delete()`
- `request()`

### Runtime systems

- DOM scanning
- directive interpretation
- component/template registry
- layout composition
- route mount system
- request helper layer
- state patching

### JS helper layer

- `logic()`
- injected `api`
- `forms.<name>`
- `browser`
- `set/merge/push/remove/toggle`

---

## V1.1 or later

- `children`
- `:watch`
- `:loading`
- `:error`
- `task()`
- `route`
- `storage`
- `notify/confirm`
- typed schema system
- editor tooling
- stronger keyed list semantics
- advanced composition helpers

---

## Recommended documentation summary for the framework

## Canonical description

**A no-build-step reactive HTML SPA framework built on top of Datastar.**

It lets you write HTML with a compact authoring syntax for classes, IDs, events, reactivity, templating, and routing. A small runtime interprets that syntax, maps it onto Datastar’s signal and DOM patch model, and lets you compose SPAs from layouts, pages, and components without adopting JSX or a VDOM.

---

## Core philosophy

1. HTML first
2. Browser-native authoring
3. Server-friendly architecture
4. SPA behavior without a VDOM
5. Small author-facing syntax
6. Thin runtime over Datastar
7. JS stays normal and flat

---

## Authoring rules

### 1. Structure

Use bracket shorthand for classes.

```html
<div [card] [featured]></div>
```

### 2. Unique targets

Use `#` shorthand for IDs.

```html
<main #content></main>
```

### 3. Events

Use `@event` for behavior.

```html
<button @click="count++">Add</button>
```

### 4. Reactive/template behavior

Use `:directive` for reactivity and composition.

```html
<div :state="{ count: 0 }">
  <span :text="count"></span>
</div>
```

---

## Component model

A component is a reusable HTML template that can be loaded with `:use` and configured with `:props`.

```html
<div :use="'contact-card'" :props="{ name: 'Sarah' }"></div>
```

Components should usually live in separate files in `components/`.

---

## Layout model

A layout defines named areas and a primary mount region.

```html
<div [app-layout]>
  <header :area="'header'"></header>
  <main #content :mount></main>
  <footer :area="'footer'"></footer>
</div>
```

Pages or templates fill those areas with `:fill`.

---

## Request model

### Live read

```html
:run="read('/events/contacts')"
```

### One-off read

```html
@click="get('/contacts')"
@click="request('/stats')"
```

### Writes

```html
@click="create('/contacts', form)"
@click="update('/contacts/12', contact)"
@click="patch('/contacts/12', partial)"
@click="delete('/contacts/12')"
```

### Response mode overrides

```html
@click="get.json('/contacts')"
@click="patch.state('/contacts/12', partial)"
@click="update.html('/contacts/12', contact)"
```

---

## State model

State is declared with `:state` and calculated with `:calc`.

```html
<section :state="{ price: 10, qty: 2 }"
         :calc="{ total: price * qty }">
  <p :text="total"></p>
</section>
```

Use `:bind` for two-way input state.

```html
<input :bind="form.name" />
```

Use `:show` for visibility and `:if` for structure.

```html
<div :show="open">Visible while open</div>
<section :if="loggedIn">Only mounted when logged in</section>
```

---

## Detailed cheat sheet

## Syntax cheat sheet

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
| Init/run | `:run="..."` | `<section :run="get('/contacts')">` |
| Watch/effect | `:watch="..."` | `<div :watch="syncTheme(theme)">` |
| Loading state | `:loading="..."` | `<button :loading="saving">` |
| Error state | `:error="..."` | `<div :error="loadError">` |

---

## Built-in expression names

| Name | Meaning |
|---|---|
| `self` | current component/template scope |
| `parent` | parent template scope |
| `children` | child scopes/instances |
| `root` | root app scope |
| `props` | passed-in props |
| `event` | current event object |
| `mutate()` | local state mutation helper |
| `read()` | live SSE read |
| `request()` | advanced one-off read |
| `get()` | standard one-off read |
| `create()` | create record |
| `update()` | full update |
| `patch()` | partial update |
| `delete()` | delete record |

---

## Action defaults

| Action | Default mode |
|---|---|
| `read()` | `.sse` |
| `request()` | `.html` |
| `get()` | `.html` |
| `create()` | `.html` |
| `update()` | `.html` |
| `patch()` | `.state` |
| `delete()` | `.html` |

---

## Mode override examples

```html
:run="read.sse('/events/contacts')"
@click="get.json('/contacts')"
@click="create.html('/contacts', form)"
@click="update.state('/contacts/12', contact)"
@click="patch.state('/contacts/12', partial)"
@click="delete.html('/contacts/12')"
```

---

## Small example: counter

```html
<article [counter] :state="{ count: 0 }" :calc="{ doubled: count * 2 }">
  <button [button] @click="count--">-</button>
  <span :text="count"></span>
  <button [button] @click="count++">+</button>
  <p :text="doubled"></p>
</article>
```

---

## Small example: layout

```html
<div [app-layout]>
  <header :area="'header'"></header>
  <main #content :mount></main>
  <footer :area="'footer'"></footer>
</div>
```

---

## Small example: page composition

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

## Small example: logic file style

```js
export default logic(({ api, forms, browser, set, success, error, state }) => {
  const contact = forms.contact
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

## Final recommendations

1. Freeze the v1 syntax now.
2. Keep v1 small.
3. Treat Datastar as the runtime engine, not the public API.
4. Define scope rules before adding more helpers.
5. Keep JS helper APIs flat and property-first.
6. Treat the type system as phase two unless it is easy to bolt on.
7. Write a real spec for `:each`, `parent`, `children`, and `:mount` before implementation.
8. Build one real demo app early: contacts, notes, or tasks.
9. Avoid reintroducing React concepts unless the framework truly needs them.
10. Keep the language feeling like “HTML with powers,” not “JS framework disguised as attributes.”

