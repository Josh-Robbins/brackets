# Brackets Reference

This document captures the current Brackets language surface from the design notes, then explains how each part should behave in general and how it should relate to Datastar.

It is based on:

- `Design ideas/Starting consept.md`
- `Design ideas/framework design & review v1.md`
- `Design ideas/framework design & review v2.md`
- `Design ideas/framework design & review v3.md`
- `Design ideas/framework design & review v4.md`
- `Design ideas/framework design & review v5.md`
- Datastar official docs:
  - [Attributes](https://data-star.dev/reference/attributes)
  - [Actions](https://data-star.dev/reference/actions)
  - [Backend Requests](https://data-star.dev/guide/backend_requests)
  - [SSE Events](https://data-star.dev/reference/sse_events)
  - [Security](https://data-star.dev/reference/security)
- OWASP guidance:
  - [Cross Site Scripting Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html)
  - [Input Validation Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Input_Validation_Cheat_Sheet.html)

## Canonical Summary

This is the compact reference shape the project should stay aligned with.

### File types

| File type | Meaning |
|---|---|
| `.view` | what page exists |
| `.logic` | how the app behaves |
| `.api` | how the app talks to a backend |
| `.data` | how the app defines and talks to local models, storage, and persistence rules |
| `.html` | actual markup/templates/pages/layouts/components |
| `.json` | simple structured storage |
| `.yaml` | human-editable config/content storage |
| `.db` | file-backed database storage |

### Routing

| Item | Meaning |
|---|---|
| `router.logic` | router engine and global router hooks |
| `view.route` | optional route declaration in a `.view` file |
| `/routes/*.logic` | grouped route registration for larger apps |

Brackets routing is intentionally hybrid:

- file-based routing comes from `.view` files
- logic-based routing comes from `router.logic`
- grouped logic-based routing comes from `/routes/*.logic`
- all three can work together in one app without changing Brackets syntax
- when two routes share the same layout, Brackets keeps that shell mounted and updates only the `:mount` region

Router precedence is:

1. `router.logic` route declarations
2. `/routes/*.logic` route declarations
3. `.view` route declarations and file-derived defaults

`router.logic` may also provide global hooks:

- `beforeEach(ctx)` for redirects or route guards
- `afterEach(ctx)` for post-navigation work
- `notFound(ctx)` for redirects or custom not-found behavior

Additive router powers that do not change Brackets syntax:

- `defaults` in `router.logic` for shared layout, meta, auth, assets, params, and preload hints
- `defaults` in `/routes/*.logic` for grouped route policy
- `alias` and `aliases` for alternate route paths
- `redirectTo` for lightweight redirect routes
- `params` for param validation rules
- `preload` for route warming hints such as `render` and `idle`
- route-target helpers so navigation can use route ids plus params/query/hash instead of raw strings

### Page manifest

| Field | Required | Meaning |
|---|---|---|
| `id` | yes | stable page identity |
| `html` | yes | page HTML reference |
| `logic` | no | primary behavior module or inline logic |
| `route` | no | route pattern or path |
| `alias` | no | single alternate route path |
| `aliases` | no | multiple alternate route paths |
| `params` | no | route param validation rules |
| `redirectTo` | no | redirect target for matched route |
| `preload` | no | route preload hint such as `render` or `idle` |
| `title` | no | document/page title |
| `meta` | no | document metadata such as description |
| `seo` | no | SEO/export metadata such as canonical, image, sitemap, and feed hints |
| `auth` | no | route auth requirements and redirect policy |
| `assets` | no | route-level asset hints |
| `layout` | no | layout HTML reference |
| `api` | no | named remote dependencies |
| `data` | no | named local-data dependencies |

Route dependency rule:

- `data` and `api` dependencies are preserved in the discovered route contract
- same-host `.data` and `.api` writes invalidate dependent route renders automatically
- preload-enabled dependent routes are warmed again after those writes so route reuse stays fast

Auth rule:

- built-in route auth checks honor `required`, `public`, and `roles`
- redirect policy prefers `auth.redirectTo`, `auth.login`, or `auth.path`
- role-mismatch redirects prefer `auth.forbidden`, then fall back to `auth.unauthorized`, `auth.redirectTo`, `auth.login`, or `auth.path`
- the runtime re-checks session state once before following an unauthenticated route redirect so recovered same-origin sessions can continue without a dead redirect hop

### No-build type safety

Brackets does not depend on a build step for type safety.

Instead, important framework contracts are validated at runtime:

- `page()` manifests
- root `config.yaml`
- `.logic` module exports
- `.api` and `.data` module exports
- `router.logic` and `/routes/*.logic`
- RPC payloads for `.api` and `.data`

Structured framework errors should prefer:

- `error` for the main message
- `code` for stable programmatic handling
- `requestId` for host-side correlation without leaking the raw stack
- `issues` for field-level contract failures
- `hint` for the next corrective step

This keeps no-build authoring simple while still making bad shapes fail early and clearly.

### Root config

The current root-package host config lives in `config.yaml`.

Important fields:

| Field | Meaning |
|---|---|
| `runtime` | `embedded` for the built-in Deno host, `external` for another host you run yourself |
| `mode` | framework serving mode |
| `engine` | host engine name such as `deno` or `custom` |
| `host` | bind address for the built-in host |
| `port` | bind port for the built-in host |
| `entry.folder` | package folder the host treats as the entry root |
| `entry.route` | first app route used when `entry.autoStart` is enabled |
| `entry.autoStart` | whether the starter hands off into the app route automatically |
| `external.origin` | full origin Brackets should probe in external host mode |

### Context

| Group | Purpose |
|---|---|
| `route` | route params, query, path, and hash |
| `state` | local state reads and writes |
| `action` | current event, element, and input payload |
| `api` | backend transport modules |
| `data` | local model and persistence modules |
| `nav` | navigation helpers |
| `cache` | cache/prefetch/revalidation helpers |
| `auth` | session and CSRF helpers |
| `cleanup()` | lifecycle teardown registration |

Common helper surface inside grouped context:

- `ctx.action.input()` reads the current control value for normal input/change events and the current form payload for submit flows
- `ctx.action.formData()` returns raw multipart-friendly `FormData` for upload flows
- `ctx.action.files(name?)` returns selected files from the active input or form
- repeated form field names stay grouped as arrays when `ctx.action.input()` returns a form payload
- `ctx.nav.to(target)`, `ctx.nav.replace(target)`, and `ctx.nav.redirect(target)` accept either a path string or a route target object
- `ctx.nav.href(target)` builds a stable href from that same target shape
- `ctx.nav.isActive(target)` and `ctx.nav.match(target)` keep active-route checks readable
- `ctx.nav.forward()` mirrors `history.forward()` without breaking the Brackets helper surface
- `ctx.route.href(next?)` builds a new href from the current route id and params
- `ctx.nav.prefetch(target)` warms the next route
- `ctx.nav.download(path, filename?)` triggers a normal download without inventing a separate client API
- `ctx.cache.fetch(...)`, `ctx.cache.refresh(...)`, and `ctx.cache.invalidate(...)` manage Brackets cache state
- `ctx.auth.session()` and `ctx.auth.refresh()` expose session state
- `ctx.auth.authenticated` gives a cheap boolean view of the current in-memory session snapshot
- router hook contexts should expose the same route-aware helpers through `ctx.to`, `ctx.from`, and `ctx.routes`

Session rule:

- `ctx.auth.session()` may reuse a short-lived in-memory session snapshot so repeated reads stay cheap
- `ctx.auth.refresh()` forces a new host session read and updates the active CSRF token when the host rotates it

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

### Runtime rendering

- route changes should preserve the active shell whenever the next route uses the same layout
- in that case Brackets should update only the `:mount` region instead of replacing the whole routed page container
- `read()` stays on the same runtime path so live SSE updates and partial DOM updates work together cleanly

### Route metadata in the document

On client-side navigation, the runtime reconciles the active route into the live document:

| Source | Applied to |
| --- | --- |
| `route.title` | `document.title` |
| `meta.description` | `<meta name="description">` |
| `meta.lang` | `<html lang>` |
| `meta.dir` | `<html dir>` |
| `seo.canonical` | `<link rel="canonical" href>` (absolute URL; relative values resolve against the page origin) |
| `seo.robots` | `<meta name="robots" content>` |

Tags created or updated for routes carry `data-brackets-route` so they stay distinct from any static tags in the entry `index.html`. Restoring the starter shell clears those managed tags and resets `lang` / `dir` to the entry document’s initial values.

The embedded host also injects the same **title**, **description**, **canonical**, **robots**, **lang**, and **dir** values into the **first HTML response** for SPA-style shells (routes matched from the URL path) so **View Source** and non-JS crawlers see the same manifest-driven head data as the live document after hydration.

Other `seo` fields (`feed`, `sitemap`, `alternates`, `changefreq`, `priority`, structured data, and similar) feed **sitemap.xml**, **feed.xml**, and host-side generators; they are not duplicated as arbitrary `<meta>` tags in the runtime unless documented per-field.

### Production-oriented HTTP defaults

The embedded host sends a baseline set of safe response headers on every reply. You can extend or override parts of that set under `security.headers` in `config.yaml`:

| Key | Role |
| --- | --- |
| `contentSecurityPolicy` | Optional `Content-Security-Policy` value. The stock entry HTML uses inline scripts and an import map; a strict policy usually needs nonces or refactors—validate in a staging build. |
| `strictTransportSecurity` | Optional `Strict-Transport-Security` value. Applied only when the connection is HTTPS (`req.socket.encrypted`). |
| `permissionsPolicy` | Optional override for `Permissions-Policy` (defaults still restrict camera, microphone, and geolocation when unset). |
| `htmlDocumentCacheControl` | Optional override for `Cache-Control` on **HTML shell** responses (SPA `index.html`). When unset, the host defaults shells to **`no-store`**. |
| `staticAssetCacheControl` | Optional long-lived `Cache-Control` for **fingerprint-safe static assets** only (for example `.css`, `.js`, images, fonts). HTML, JSON, and API responses are not affected. |

JSON responses from `__brackets` endpoints use `Cache-Control: no-store` so route payloads and RPC results are not cached by shared caches.

**Content-Security-Policy (production):** there is no safe one-size default while the stock entry uses inline scripts and an import map. For production, set `security.headers.contentSecurityPolicy` after testing—often with **nonces** or **hashes** for boot scripts, or by moving inline code to external files. Example starting point (will break until adapted): `default-src 'self'; base-uri 'self'; frame-ancestors 'none'`.

**Local vs production:** loopback development keeps the defaults above. For HTTPS deployments, set `strictTransportSecurity` only after verifying TLS end-to-end. The embedded host already sends **`Secure`** and **`__Host-`** CSRF cookies when `req.socket.encrypted` is true. Tighten `htmlDocumentCacheControl` / `staticAssetCacheControl` when you have hashed asset filenames or a CDN.

**Troubleshooting `POST /__brackets/rpc`:** the host requires a matching **`x-brackets-csrf`** header (see `<meta name="csrf">` after the page loads). Calling `BracketsRuntime.callRpc(...)` from the **browser console** before the shell has a token, or with a stale tab, can fail with **403** or **`fetch` errors**—that is not the same as the in-page **Save** button after a normal load.

### `.api` helper surface

`.api` modules stay backend agnostic by receiving a thin transport helper instead of a backend-framework-specific SDK.

| Helper | Meaning |
|---|---|
| `http.request(method, url, payload?, options?)` | low-level HTTP request helper |
| `http.get/post/put/patch/delete(...)` | common HTTP verbs |
| `http.read(url, options?)` | SSE/read descriptor |
| `http.client(baseUrl, defaults?)` | preconfigured backend client for one backend root |
| `http.resource(baseUrl, defaults?)` | alias of `http.client(...)` |
| `http.openapi(baseUrl, defaults?)` | explicit OpenAPI-oriented client alias |
| `client.operation({...})` | OpenAPI-shaped operation request with path/query/header/cookie/body fields |

Notes:

- `http.client('/remote/api')` should be the low-boilerplate path for `.api` modules talking to one backend root
- `http.openapi('/remote/api').operation({...})` is the explicit OpenAPI-aligned path when an app wants path params, query params, headers, cookies, and request bodies described in one place
- helpers should preserve HTTP-first transport and Datastar-compatible response handling
- `.api` should not assume Node, Express, Next.js, or any other specific backend stack
- OpenAPI defaults now baked into the helper surface include:
  - path params using simple serialization
  - query params using form serialization with explode-by-default
  - header params using simple serialization
  - cookie params using form serialization
  - `GET` and `HEAD` requests rejecting request bodies unless explicitly overridden

### Storage guidance

| Use case | Best fit |
|---|---|
| mock/demo data | `.json` |
| editable config/content | `.yaml` |
| durable local database | `.db` |
| framework local-data adapter and model layer | `.data` |

Datastar transfer rule:

- `.data` remains the local-first model layer
- `.api` remains the remote/shared-authority layer
- both should preserve Datastar-compatible SSE and HTTP transfer when they move data
- Brackets should not invent a separate transport model below them

Optional host capability:

- `storage['[e]json'](...)` for encrypted JSON at rest
- `storage['[e]yaml'](...)` for encrypted YAML at rest
- the built-in Deno host currently uses an authenticated AES-GCM envelope with the key sourced from `security.storage.keyEnv`

### Async/data UX

| Contract | Meaning |
|---|---|
| route-level loading | route transitions can bind to `:loading="route"` |
| route-level errors | route failures can bind to `:error="route"` |
| optimistic state | `ctx.state.optimistic(patch, task)` |
| cache fetch | `ctx.cache.fetch(key, loader, options)` |
| cache refresh | `ctx.cache.refresh(key, loader, options)` |
| cache invalidate | `ctx.cache.invalidate(key)` or `ctx.state.invalidate(key)` |

Notes:

- `ctx.cache.fetch(...)` can keep a cached value hot while refreshing in the background with `staleWhileRevalidate: true`
- route preload hints such as `preload: 'render'` and `preload: 'idle'` warm route renders through the built-in runtime without changing Brackets syntax
- invalidated `preload: 'idle'` routes stay on the idle warm path instead of being forced immediately
- same-host `.data` and `.api` writes now push live `read()` subscribers immediately instead of waiting for the next polling interval
- same-host `.data` and `.api` writes also invalidate dependent route renders and their matching route-cache entries automatically
- same-host `.data` and `.api` reads should not invalidate dependent routes or route-cache entries by default
- older overlapping route/cache fetches should not be able to overwrite a newer payload after a later request has already won
- failed session refreshes do not poison the runtime cache path; later refreshes can still recover cleanly

### Security config

| Setting | Meaning |
|---|---|
| `security.html: sanitize` | sanitize `:html` output before insertion |
| `security.html: trusted` | allow raw `:html` output for intentionally trusted content |
| `security.storage.keyEnv` | host environment variable that provides the encrypted storage key |
| `security.storage.pbkdf2Iterations` | host-side key stretching cost for encrypted local persistence |
| internal POST transport | automatically sends the Brackets CSRF token to the built-in host |

Cookie note:

- plain HTTP local development keeps the CSRF cookie local-safe with `SameSite=Lax`
- HTTPS hosts upgrade the CSRF cookie to a secure host-prefixed cookie when the transport supports it

### Website/runtime contracts

| Contract | Meaning |
|---|---|
| `/sitemap.xml` | sitemap output from route manifests |
| `/feed.xml` | feed output from route manifests |
| `/robots.txt` | robots output with sitemap reference |
| `/__brackets/host` | host capability contract |
| `/.well-known/brackets-host.json` | public host capability contract |
| `/.well-known/brackets-app.json` | public app contract |
| `run app test` | bundled Deno package contract test |

### Final recommendations

1. Keep `.view`, `.logic`, `.api`, `.data`, and `.html` as the public framework file model.
2. Keep `.view` as the page-layer contract, not raw markup.
3. Keep markup in `.html`.
4. Keep routing in `.logic`, not `.api`.
5. Keep `.api` strictly about remote/backend transport.
6. Keep `.data` strictly about the local model layer, persistence rules, and storage access.
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

### Sitemap and feed rules

- `/sitemap.xml` includes public non-redirect routes unless `seo.sitemap` is explicitly `false`
- `/feed.xml` includes routes that opt in with `seo.feed`
- feed items prefer `seo.feed.title`, `seo.feed.summary`, and route `meta.description`
- both outputs prefer `seo.canonical` when present

## Reading This Reference

Brackets is not a second reactive engine. Datastar is the engine. Brackets adds:

- the authoring syntax
- the file model
- scoped vocabulary
- layout and routing conventions
- the tiny same-origin host
- the backend-agnostic app contract

Status labels in this doc mean:

- `Locked`: repeated or explicitly affirmed in the later review docs.
- `Review-doc present`: listed in the later review docs, but the semantics are still thin compared with the locked core.
- `Historical`: appears in earlier exploratory note history, but is not the current preferred public syntax.

## Core Principle

The clean split is:

- Brackets owns scope resolution, authoring ergonomics, manifests, layout composition, and app structure.
- Datastar owns signals, reactive updates, DOM patching, backend requests, and SSE response handling.

That means Brackets syntax should compile to Datastar-native behavior whenever Datastar already has the right primitive.

Brackets is also backend agnostic by design:

- `.api` is the contract for remote/backend transport
- `.data` is the contract for the local model layer, persistence rules, queries, and storage adapters
- `.json`, `.yaml`, and `.db` are storage formats the local side can use without changing the frontend language
- both `.data` and `.api` should preserve Datastar-compatible HTTP and SSE transfer semantics when data crosses into the live UI

Brackets also does not need a framework-owned plugin API.

Reason:

- Brackets apps are already composed from normal files and modules
- `.logic`, `.api`, `.data`, and `.html` are already extension surfaces
- Datastar already covers the engine layer
- browser modules, workers, service workers, host bridges, and backend services can be added directly

So the preferred Brackets model is:

- add normal code to the app
- connect it through the existing file model
- keep the framework contract small

A plugin API would only make this heavier unless there is a truly unavoidable gap, and the current Brackets contract is intentionally designed so that gap should be rare.

## Syntax Families

Brackets converged on a mixed syntax model:

- `[]` for naming and structural shorthand
- `#` for ids
- `@` for behavior
- `:` for reactive, templating, and framework directives

### Structural shorthand

| Syntax | Meaning in Brackets | Datastar relation | Status |
|---|---|---|---|
| `[name]` | Class/style/structure shorthand. `<div [card]>` means "this element carries the `card` name". | Brackets sugar. Datastar does not define this syntax. | `Locked` |
| `#name` | Id shorthand. `<main #content>` means `id="content"`. | Plain HTML sugar, not a Datastar feature. | `Locked` |

## Event Syntax

Brackets keeps event authoring short and HTML-native.

| Syntax | Meaning in Brackets | Datastar relation | Status |
|---|---|---|---|
| `@click` | Handle click behavior. | Compiles naturally to Datastar `data-on:click`. | `Locked` |
| `@input` | Handle input behavior. | Compiles naturally to Datastar `data-on:input`. | `Locked` |
| `@change` | Handle change behavior. | Compiles naturally to Datastar `data-on:change`. | `Locked` |
| `@submit` | Handle form submission behavior. | Compiles naturally to Datastar `data-on:submit`. Datastar prevents native submit by default on that listener. | `Locked` |

General rule:

- Prefer direct named actions for ordinary UI behavior, for example `@click="refresh"` or `@submit="createPost"`.
- Named actions may also take explicit arguments, for example `@click="select(contact.id)"`, as long as Brackets still routes them into `.logic` instead of turning them into a second framework runtime.
- Keep `.logic.run()` for advanced or framework-invoked tasks, not for every normal button click.

Datastar note:

- Datastar already exposes event listeners through `data-on:*`.
- Datastar also exposes `evt` inside event expressions.
- Brackets should preserve that power while making the authoring syntax smaller.
- plain transport calls inside event expressions should compile to Datastar-native actions when there is a clean one-to-one fit

## Core Directives

| Syntax | Meaning in Brackets | Datastar relation | Status |
|---|---|---|---|
| `:state="..."` | Define local scoped state for the element, page, or component. | Maps cleanly to Datastar `data-signals`. Brackets adds scope resolution and plain-name authoring. | `Locked` |
| `:calc="..."` | Define derived, read-only values computed from state. | Maps cleanly to Datastar `data-computed`. Datastar's docs explicitly treat computed values as read-only. | `Locked` |
| `:run="..."` | Run an expression when the element/template becomes live. Useful for setup requests or startup behavior from markup. | Best fit is Datastar `data-init` when this is element-init behavior. It is distinct from `.logic run(payload, ctx)`. | `Locked` |
| `:watch="..."` | Run side effects when referenced values change. | Maps cleanly to Datastar `data-effect`, which Datastar documents as the side-effect hook. | `Locked` |
| `:text="..."` | Bind text content. | Maps directly to Datastar `data-text`. | `Locked` |
| `:html="..."` | Bind HTML content instead of text. | There is no documented free-core `data-html` attribute in the Datastar attributes reference, so Brackets owns this directive and applies a conservative sanitizer unless `security.html: trusted` is set. | `Locked` |
| `:show="..."` | Show or hide an element based on an expression. | Maps directly to Datastar `data-show`. | `Locked` |
| `:bind="..."` | Two-way bind user input to state. | Maps directly to Datastar `data-bind`. | `Locked` |
| `:if="..."` | Conditional rendering. | Locked in the Brackets language. Brackets owns the conditional mount/update behavior while Datastar continues to drive the live DOM underneath. | `Locked` |
| `:each="..."` | Loop/repetition over a collection. | Locked in the Brackets language. Brackets owns the repeated template composition while Datastar keeps the rendered result reactive. | `Locked` |

### Notes on `:run`

There are two different `run` ideas in the notes:

- `:run="..."` in HTML means "do this when this markup becomes live".
- `run(payload, ctx)` in `.logic` means "imperative task entry point".

The review docs are clear that:

- `mount()` is lifecycle
- `sync()` is lifecycle for a preserved instance
- `run()` is intent, not a second mount hook

So these should not be collapsed into one concept.

### Notes on `:html`

This directive needs stricter security rules than `:text`.

- Datastar's security guidance says user input should be escaped and unsafe input should not be trusted.
- OWASP recommends safe sinks like `textContent` for text output and warns against injecting variables into dangerous HTML or script contexts.
- Brackets should therefore document `:html` as trusted-only unless a sanitizer is explicitly configured.

In practice:

- use `:text` for ordinary user data
- use `:html` only for trusted markup, sanitized content, or backend-produced HTML you intentionally treat as markup

## Template And Layout Directives

These directives are where Brackets most clearly adds framework structure above Datastar.

| Syntax | Meaning in Brackets | Datastar relation | Status |
|---|---|---|---|
| `:use="..."` | Load or compose another template/component/layout by name or path. | Framework-level composition. Datastar does not define `data-use`, so Brackets resolves the template through the same host and then lets Datastar run the result. | `Locked` |
| `:props="..."` | Pass inputs into the thing being used. | Framework-level component/layout input contract. Brackets turns these into local signals for the used block so inner Datastar bindings stay simple. | `Locked` |
| `:area="..."` | Declare a named layout placeholder. | Framework-level layout vocabulary. Brackets resolves fills into these areas before the composed DOM keeps running under Datastar. | `Locked` |
| `:fill="..."` | Provide content for a named layout area. | Framework-level layout vocabulary. Brackets moves fill content into matching areas during composition. | `Locked` |
| `:mount` | Mark the primary routed render target. | Framework-level router/layout vocabulary. Datastar then handles the mounted DOM reactively. | `Locked` |

General rule:

- `:mount` is the primary routed page target.
- `:area` and `:fill` are the composition system.
- `:use` and `:props` describe what gets loaded and what inputs it receives.
- for component/template composition, `:props` should become local signals for the used block so inner Datastar bindings can stay simple
- template composition should ignore stale async template resolutions and rerender when the referenced template stamp, props, or fills change
- nested `:use`, `:fill`, `:if`, and `:each` trees should reach a stable composed DOM; inner markup is driven by **Datastar attribute plugins** for those directives, so updates follow **signal and expression dependencies** rather than a separate DOM polling loop

## Dynamic DOM Directives

These items do appear in the later review docs, but they are less fully reasoned than the core language and you explicitly flagged that they may not have been discussed to the same depth.

| Syntax | Meaning in Brackets | Datastar relation | Status |
|---|---|---|---|
| `:class.name="..."` | Toggle or bind a class reactively. | Maps cleanly to Datastar `data-class:name`. | `Review-doc present` |
| `:set.name="..."` | Set a normal HTML attribute reactively. | Maps cleanly to Datastar `data-attr:name`. | `Review-doc present` |
| `:loading="..."` | Surface loading state in markup. | Brackets binds request-state keys to Datastar-native visibility updates instead of inventing a second DOM engine. | `Review-doc present` |
| `:error="..."` | Surface request or validation error state in markup. | Brackets binds request-state keys to Datastar-native visibility and attribute updates for readable request failures. | `Review-doc present` |

Recommendation:

- Keep `:class.name` and `:set.name` in the v1 language reference because they have clear Datastar mappings.
- Keep `:loading` and `:error` on the same request-state path as the router and transport helpers.
- `:loading="name"` and `:error="name"` bind to request state keyed by route or request name and render through Datastar-native visibility and attribute updates.

## Built-In Expression Names And Scope Helpers

These names are part of the public language inventory because they shape how authors think about expressions.

| Name | Meaning in Brackets | Datastar relation | Status |
|---|---|---|---|
| `self` | The current component scope object for the element, when set (see runtime note below). | Same names usually map to `$name` in Datastar-backed expressions via `:state` / signals. | `Locked` |
| `parent` | The nearest **ancestor element** that carries a Brackets component scope (`__bScope`), not the raw DOM parent. | Exposed as a plain object for `window.BracketsRuntime.scope(el)` and compiled `scope(el).parent` in expressions. | `Locked` |
| `children` | Reserved for richer composition; the runtime currently exposes an **empty array** while the public name stays stable. | Prefer Datastar signals and `:each` for child lists. | `Locked` |
| `root` | For scope bridge: **parent scope if any, else the current `self` object**. | Not a full shadow tree walk of every ancestor `:state`. | `Locked` |
| `props` | Same object as **`self`** when props come from `:use` / `:props` (merged object on the host element). | `:props` are applied as local signals via `data-signals` so inner `:text` / `:bind` stay simple. | `Locked` |
| `event` | The current event in author-facing expressions. | Brackets-friendly alias over Datastar's event context. Datastar itself exposes `evt` in `data-on` expressions. | `Locked` |

### Runtime scope bridge (`BracketsRuntime.scope`)

For **Datastar-backed** attributes (`data-text`, `data-show`, `:calc`, etc.), the compiler rewrites helpers like `props.title` to **`window.BracketsRuntime.scope(el).props.title`**. The scope bridge is intentionally small:

- **`self` / `props`** come from the element’s **`__bScope`** (set when `:use` applies `:props`, or when you assign that object in advanced cases).
- **`parent`** is the **`__bScope`** of the nearest ancestor that has one, walking real DOM parents only.
- Ancestor **`:state`** blocks still define Datastar signals on their own nodes; they are **not** merged into this bridge unless that state is also reflected in a **`__bScope`** chain you rely on. For cross-cutting values, prefer **signal names** (`$foo`) or explicit props.

This keeps the engine **Datastar-native** while preserving the author-facing helper names in expressions.

### Scope helper rule

- Helpers are **not** a second reactive store behind Datastar.
- Prefer **`$signal`** paths in markup for values that must track reactively; use **`scope(el)`** for object-style helpers (`route`, `nav`, `session`, etc.) and for **`props` / `self`** on composed components.

## Transport Helpers

These helpers are part of the language, but they do not all mean the same kind of thing.

Important distinction:

- transport intent and result handling are different parts of the contract
- helper names describe the action or channel being used
- result suffixes describe how the response should be handled
- `mutate()` is local state mutation and is not transport at all

### Local mutation helper

| Helper | Meaning in Brackets | Datastar relation | Status |
|---|---|---|---|
| `mutate()` | The official author-facing write helper for local state. It patches or assigns scoped signal values. | Should compile to Datastar signal writes or signal patches. It is not a second store and not a replacement for Datastar reactivity. | `Locked` |

Key rule from the notes:

- `mutate()` is not the reactive engine
- `mutate()` is the author-facing write path
- Datastar still reacts to the resulting signal changes

That means both of these can be conceptually equivalent:

```html
<button @click="qty++">+</button>
<button @click="mutate('qty', qty + 1)">+</button>
```

### Request helpers

| Helper | Meaning in Brackets | Datastar relation | Status |
|---|---|---|---|
| `read()` | Live read channel, usually SSE-oriented. | Should align with Datastar backend requests and SSE response handling, not bypass them. | `Locked` |
| `request()` | Advanced one-off read helper. Read-only. | Should still land on Datastar's request model and response handling. | `Locked` |
| `get()` | One-off read request. | Strong fit with Datastar `@get()`. | `Locked` |
| `create()` | Create a record or resource. | Strong fit with Datastar `@post()` or a framework-chosen create transport. | `Locked` |
| `update()` | Full update of a record or resource. | Strong fit with Datastar `@put()`. | `Locked` |
| `patch()` | Partial update of a record or resource. | Strong fit with Datastar `@patch()`. | `Locked` |
| `delete()` | Delete a record or resource. | Strong fit with Datastar `@delete()`. | `Locked` |

Brackets rule:

- keep remote transport aligned with Datastar's backend action model
- reserve framework-only transport layers for cases Datastar does not already cover, such as local `.data` adapters or same-origin hosting support

Implementation note:

- plain `get('/path')`, `create('/path')`, `update('/path')`, `patch('/path')`, and `delete('/path')` can compile directly to Datastar-native actions when no Brackets-only suffix behavior is being requested
- plain `request('/path')` can compile directly to Datastar-native `@get('/path')` for the same reason
- plain `read('/events')` should stay on the Brackets runtime side so the same syntax can drive backend SSE and built-in flat-file live streams through one helper path
- on form submit, Brackets can add Datastar's `contentType: 'form'` option automatically for the simple one-argument helper path so forms stay terse
- suffix-based or framework-specific transport behavior can still use a thin Brackets bridge as long as Datastar remains the underlying request/response model

### Default transport intent

The default transport intent is:

- `read()` uses an SSE/live channel by default
- `request()` uses HTTP by default
- `get()` uses HTTP by default
- `create()` uses HTTP by default
- `update()` uses HTTP by default
- `patch()` uses HTTP by default
- `delete()` uses HTTP by default
- `mutate()` is local state mutation, not transport

This is the rule that should shape both the docs and the implementation. Brackets names the helper. Datastar then handles the request or stream behavior underneath.

## Backend-Agnostic File Contract

This is one of the main architectural promises in the notes.

| File kind | Role in Brackets |
|---|---|
| `.view` | declarative page manifest |
| `.logic` | app behavior, router behavior, lifecycle behavior |
| `.api` | remote/backend transport |
| `.data` | local persistence and storage adapter layer |
| `.html` | pages, layouts, components, fragments |

Important split:

- `.api` is not routing
- `.api` is not local file persistence
- `.data` is not remote transport
- `.data` should own most model logic when it can
- `.logic` is where routing belongs

### Local storage formats

The later review docs consistently describe these storage formats:

| Format | Meaning in Brackets |
|---|---|
| `.json` | simple structured storage |
| `.yaml` | human-editable config/content storage |
| `.db` | durable local database storage, such as SQLite |

Rule:

- `.data` is the adapter/repository layer
- `.json`, `.yaml`, and `.db` are the actual stored data files
- the current bundled host supports `.json`, `.yaml`, and `.db` today
- live `.data` reads can stream through the built-in SSE host path as well

That keeps Brackets backend agnostic while still making the bundled host genuinely useful for local-first apps.

## Result Mode Suffixes

These suffixes describe the expected result handling path. They do not define the transport by themselves.

| Mode | Meaning in Brackets | Datastar relation | Status |
|---|---|---|---|
| `.html` | Treat the result as HTML/UI patch content. | Datastar natively handles `text/html` patch responses. | `Locked` |
| `.sse` | Treat the result as an SSE/live stream. | Datastar natively handles `text/event-stream`. | `Locked` |
| `.state` | Treat the result as state patch data. | Datastar natively handles `application/json` signal patching. | `Locked` |
| `.json` | Treat the result as JSON data. | Datastar natively handles `application/json`. Brackets can layer its own calling conventions on top. | `Locked` |

### Default transport mapping

The notes and follow-up review corrections lock this interpretation:

- transport and result mode are separate
- `read()` defaults to an SSE/live transport intent
- `request()`, `get()`, `create()`, `update()`, `patch()`, and `delete()` default to HTTP transport intent
- `.html`, `.sse`, `.state`, and `.json` describe how the result should be handled
- simple `mutate("path", value)` expressions should compile toward native Datastar signal assignment when possible
- simple `read("/events")` expressions in transformed markup should compile toward the Brackets live runtime helper
- `mutate()` is local signal/state mutation and has no transport mode

This matters because it keeps Brackets aligned with Datastar's request model:

- helper names describe the request or mutation intent
- response content and suffixes describe the handling path
- the framework should not confuse those two layers again

## Runtime And Lifecycle Vocabulary

### `page(...)`

`page(...)` is the preferred declaration word for a routeable page manifest.

Meaning in Brackets:

- declare page identity
- declare route metadata
- point at page HTML
- optionally point at layout, logic, api, and data

Datastar relation:

- this is framework vocabulary, not Datastar vocabulary
- Datastar becomes relevant after the view is mounted and its HTML is live

Status:

- `Locked`

### `print(...)`

`print(...)` is reserved for render/output work, not manifest declaration.

Meaning in Brackets:

- render or output markup/content

Datastar relation:

- framework vocabulary, not Datastar vocabulary

Status:

- `Locked`

### `ctx`

`ctx` is the canonical runtime context object in `.logic`.

The later review docs converge on a grouped shape:

- `route`
- `state`
- `action`
- `api`
- `data`
- `nav`
- `cleanup()`

Why that matters:

- it keeps the language small
- it avoids a giant helper bag
- it prefers safe destructuring over magic locals

Status:

- `Locked`

### Lifecycle and action contract

| Name | Meaning in Brackets | Datastar relation | Status |
|---|---|---|---|
| `mount(ctx)` | This page or layout became live. Automatic lifecycle hook. | Framework lifecycle above Datastar. Datastar then drives the live DOM reactively. | `Locked` |
| `sync(ctx)` | A preserved instance received new inputs and should update without remounting. | Framework lifecycle above Datastar. | `Locked` |
| `run(payload, ctx)` | Imperative task entry point for advanced actions or framework-invoked tasks. Not automatic on mount. | Framework action contract, not a direct Datastar primitive. | `Locked` |
| named actions | Ordinary UI behavior invoked from markup, such as `refresh(ctx)` or `createPost(ctx)`. | Often triggered by event syntax that compiles to Datastar event listeners. | `Locked` |
| `ctx.cleanup(fn)` | Register teardown logic for the mounted instance. | Framework lifecycle support around Datastar-mounted behavior. | `Locked` |

Critical rule from the notes:

- `mount()` is lifecycle
- `run()` is intent

## Brackets To Datastar Mapping Summary

This is the practical "work with Datastar, not around Datastar" table.

| Brackets surface | Preferred Datastar target |
|---|---|
| `@event` | `data-on:event` |
| `:state` | `data-signals` |
| `:calc` | `data-computed` |
| `:watch` | `data-effect` |
| `:run` | `data-init` when used as markup setup/init behavior |
| `:text` | `data-text` |
| `:show` | `data-show` |
| `:bind` | `data-bind` |
| `:class.name` | `data-class:name` |
| `:set.name` | `data-attr:name` |
| `mutate()` | signal assignment or signal patch |
| `get()/create()/update()/patch()/delete()` | Datastar backend actions and response handling |
| `.html/.sse/.state/.json` | Datastar response content handling |

Harmony rule:

- authored `@event` syntax should always land on Datastar's `data-on:*` event system, including simple named actions such as `@click="refresh"`
- the current native Datastar coverage should include `:state`, `:calc`, `:run`, `:watch`, `:text`, `:show`, `:bind`, `:class.*`, `:set.*`, and plain transport/event expressions
- simple `mutate("path", value)` expressions should compile toward native Datastar signal assignment when possible
- simple `read("/events")` expressions in transformed markup should compile toward the Brackets live runtime helper

Items that are Brackets-first rather than Datastar-native:

- `[name]`
- `#name`
- `:use`
- `:props`
- `:area`
- `:fill`
- `:mount`
- `page()`
- `print()`
- `ctx`
- `mount()/sync()/run()`

Items that are language-locked but need framework implementation above Datastar rather than a direct free-core mapping:

- `:if`
- `:each`
- `:html`
- `:loading`
- `:error`

## Security Notes

### 1. `:text` should be the default for user data

Datastar `data-text` maps to text content, and OWASP specifically recommends safe sinks like `textContent` for text output.

Implication for Brackets:

- ordinary user content should go through `:text`
- documentation should steer people away from `:html` unless they really mean markup

### 2. `:html` must be trusted-only unless sanitized

Datastar's security docs say user input should be escaped and unsafe input should not be trusted. OWASP also warns that inserting dynamic data into HTML contexts incorrectly can lead to XSS.

Implication for Brackets:

- treat `:html` as trusted-only by default
- if a sanitizer is supported, document it explicitly and keep it conservative
- never imply that `:html` is safe for arbitrary untrusted user content

Current framework behavior:

- framework-managed `:html` rendering uses a conservative sanitization pass by default
- transport responses handled as `.html` also follow that same sanitize-vs-trusted policy
- truly trusted markup can still be rendered, but the framework should strip obviously dangerous sinks such as inline event handlers, `javascript:` URLs, and script tags

### 3. Client validation is UX, not security

OWASP is explicit that client-side validation can be bypassed and that server-side validation is required before processing input.

Implication for Brackets:

- `:bind`, `mutate()`, and client-side helpers can improve UX
- they do not remove the need for backend validation
- Datastar signals should never be treated as trusted server truth

### 4. Datastar signals are visible and mutable in the client

Datastar's security reference explicitly says signals are visible in source and can be modified before being sent to the backend.

Implication for Brackets:

- do not store sensitive secrets in client state
- do not trust client signal values without backend validation
- prefer backend-driven truth for permissions, authorization, and protected data

### 5. Framework-only expressions should stay restricted

Not every Brackets directive has a free-core Datastar equivalent. For the framework-managed directives such as `:if`, `:each`, `:html`, `:use`, `:props`, `:area`, and `:fill`, Brackets owns the composition/evaluation layer while Datastar stays the DOM engine underneath.

Implication for Brackets:

- do not fall back to broad `Function(...)` execution for framework-only expressions
- use a restricted evaluator for data access, safe operators, object/array literals, and approved helper calls
- prefer compiling to Datastar-native expressions everywhere else

## Historical Note

`Starting consept.md` contains a larger earlier exploration of `[]`-driven directive syntax such as:

- `[state]`
- `[text]`
- `[show]`
- `[bind]`
- `[use]`
- `[props]`
- `[slot]`
- `[fill]`
- `[outlet]`
- `[attr.foo]`
- `[class.foo]`

That is important history, but the later review docs repeatedly converge on the current mixed syntax model:

- `[]` for structure
- `#` for ids
- `@` for events and behavior
- `:` for directives

So the mixed model is the current public language direction.
