What is datastar? https://data-star.dev/

I’m checking the project docs so I can give you an accurate summary of what it is and how it works.

Thought for 20s

Datastar is a lightweight hypermedia framework for building interactive web apps with a backend-driven UI model. The project describes itself as “the hypermedia framework” and says it can be used for everything from simple sites to real-time collaborative apps. Its pitch is that you keep most state and logic on the server, then use HTML plus a small client runtime to make the page reactive.

The core idea is:

add behavior in HTML with data-* attributes
trigger backend requests from the browser
send back either normal text/html responses or text/event-stream responses
let Datastar patch/morph the DOM based on those responses, including real-time updates over SSE

In practice, it sits in a space similar to htmx + Alpine-style reactivity, but as one integrated system. The docs say it provides backend reactivity like htmx and frontend reactivity like Alpine.js, without needing npm packages or a big SPA toolchain. It also emphasizes a tiny runtime — the homepage says a single 11.39 KiB file — and “bring your own backend,” with SDKs/examples across multiple languages.

A minimal mental model is:

HTML attributes such as data-on:click define client-side behavior
actions like @get('/endpoint') make requests
the server responds with HTML or SSE events such as datastar-patch-elements
Datastar updates only the changed DOM parts using a morphing strategy that aims to preserve state and performance

So, in plain English: Datastar is a way to build reactive web apps without going all-in on React/Vue-style SPAs. It is best suited to people who want server-rendered, HTML-first, real-time capable apps with much less JavaScript and build complexity.

If you want, I can also give you a Datastar vs htmx vs Alpine vs React breakdown tailored to Python backends.

Why do you need an sdk? Can't you just use it with any backend?

I’m checking how the project frames SDKs versus plain HTTP/SSE so I can answer this cleanly and not overstate it.

Thought for 15s

Yes — you can use Datastar with any backend. The docs explicitly say “write your backend in the language of your choice,” and Datastar only requires the backend to return either normal text/html responses or text/event-stream responses for SSE.

The SDK is optional, not required. Datastar’s SDK reference says the SDKs “can (optionally) simplify the process of generating SSE events specific to Datastar.” The backend requests guide says the same thing another way: you can either familiarize yourself with sending SSE events yourself, or use one of the backend SDKs to get up and running faster.

So the practical split is:

For simple interactions, you often do not need an SDK at all. A Datastar action like @get('/endpoint') can hit your server, and if the server returns text/html, Datastar will morph the matching DOM elements by ID.
For streaming / realtime behavior, you still do not strictly need an SDK, but you do need to format SSE correctly. The docs show raw SSE syntax like event: datastar-patch-elements with data: lines and note that SSE events must be followed by two newlines.
The SDK mainly helps by giving you helpers for Datastar-specific SSE events and, per the guide, setting the proper headers and formatting the events for you.

So the answer is really: Datastar is backend-agnostic; the SDK just saves boilerplate. If your backend can serve HTML and/or SSE, you can use Datastar without a dedicated SDK.

For Python specifically, the sweet spot is usually:

no SDK for plain HTML patch responses
SDK or a tiny helper layer for SSE once you want live updates, streaming patches, or signal updates

I can show you a tiny FastAPI example with no SDK and then the same thing with an SDK-style helper.

Sure let's see it 

I’m pulling the relevant Datastar docs and then I’ll show the smallest possible FastAPI example first, followed by the SSE version.

Thought for 1m 32s

Yep — here are three no-SDK FastAPI patterns.

Datastar’s docs show that:

a text/html response patches top-level HTML elements into existing DOM nodes by matching IDs,
an application/json response patches frontend signals,
and a text/event-stream response can carry one or more raw SSE events like datastar-patch-elements, with each SSE event ending in a blank line.
1) Simplest: return plain HTML

This is the easiest case. The button triggers @get('/hello'), and the backend just returns a fragment with the same id as the target node. Datastar morphs it into place.

from fastapi import FastAPI
from fastapi.responses import HTMLResponse

app = FastAPI()

PAGE = """
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Datastar + FastAPI</title>

    <!-- Load Datastar however you prefer -->
    <script type="module" src="/static/datastar.js"></script>
  </head>
  <body>
    <button data-on:click="@get('/hello')">Say hello</button>
    <div id="result">Waiting...</div>
  </body>
</html>
"""

@app.get("/", response_class=HTMLResponse)
async def index():
    return PAGE

@app.get("/hello", response_class=HTMLResponse)
async def hello():
    return '<div id="result">Hello from FastAPI.</div>'

Why this works:

@get('/hello') makes a GET request.
Because the response is text/html, Datastar patches the returned top-level element into the existing DOM by id.
2) Also simple: return JSON to patch signals

This is even nicer when you want to update state instead of sending HTML. Datastar patches JSON into frontend signals.

from fastapi import FastAPI
from fastapi.responses import HTMLResponse, JSONResponse

app = FastAPI()

PAGE = """
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Datastar signals</title>
    <script type="module" src="/static/datastar.js"></script>
  </head>
  <body>
    <div data-signals:hal="'...'">
      <button data-on:click="@get('/signal')">Ping HAL</button>
      <div data-text="$hal"></div>
    </div>
  </body>
</html>
"""

@app.get("/", response_class=HTMLResponse)
async def index():
    return PAGE

@app.get("/signal")
async def signal():
    return JSONResponse({"hal": "Affirmative, Dave. I read you."})

This is a good example of why you often do not need an SDK at all: you just return normal JSON and let Datastar patch the signal.

3) Raw SSE, still no SDK

This is where an SDK becomes a convenience rather than a requirement. The docs say there is no special backend plumbing required for SSE beyond correct SSE formatting, and SDKs mainly help by setting headers and formatting the stream for you.

from fastapi import FastAPI
from fastapi.responses import HTMLResponse, StreamingResponse
import asyncio

app = FastAPI()

PAGE = """
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Datastar SSE</title>
    <script type="module" src="/static/datastar.js"></script>
  </head>
  <body>
    <button data-on:click="@get('/stream')">Start stream</button>
    <div id="status">Idle</div>
  </body>
</html>
"""

@app.get("/", response_class=HTMLResponse)
async def index():
    return PAGE

@app.get("/stream")
async def stream():
    async def event_generator():
        # First patch
        yield (
            "event: datastar-patch-elements\n"
            'data: elements <div id="status">Working...</div>\n'
            "\n"
        )

        await asyncio.sleep(2)

        # Second patch
        yield (
            "event: datastar-patch-elements\n"
            'data: elements <div id="status">Done.</div>\n'
            "\n"
        )

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        },
    )

That example is using the exact raw SSE shape Datastar documents for datastar-patch-elements: event: ..., one or more data: lines, then a blank line.

When an SDK starts being worth it

You can stay SDK-free for a long time. I’d only reach for an SDK or helper when you start doing lots of:

repeated SSE event formatting,
signal patch helpers,
multi-event streams,
append/prepend/selector options,
script execution helpers.

For a Python/FastAPI app, my practical take is:

plain HTML for simple fragment updates,
JSON for signal/state updates,
raw SSE for streaming or realtime,
and only then consider a thin helper or SDK.

I can turn one of these into a single-file runnable FastAPI demo next.

I would like to see it using the sdk.

I’m checking the official SDK docs and Python example so I can show the version that matches how Datastar actually expects SSE helpers to be used.

Thought for 1m 25s

Yep — with the SDK, the backend gets a lot cleaner.

The official Python package is datastar-py. On PyPI it’s published as datastar-py, supports FastAPI among other frameworks, and provides helpers for SSE event generation, framework-specific Datastar responses, signal reading, and data-* attribute generation.

Install it like this:

pip install datastar-py

That package name and install command come directly from PyPI.

Here’s a small FastAPI + Datastar SDK example.

1) Single-file FastAPI example using the SDK
from fastapi import FastAPI
from fastapi.responses import HTMLResponse
from datastar_py import ServerSentEventGenerator as SSE
from datastar_py.fastapi import DatastarResponse

app = FastAPI()

PAGE = """
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Datastar + FastAPI + SDK</title>
    <script
      type="module"
      src="https://cdn.jsdelivr.net/gh/starfederation/datastar@v1.0.0-RC.7/bundles/datastar.js">
    </script>
  </head>
  <body>
    <button data-on:click="@get('/hello')">Say hello</button>
    <div id="result">Waiting...</div>
  </body>
</html>
"""

@app.get("/", response_class=HTMLResponse)
async def index():
    return PAGE

@app.get("/hello")
async def hello():
    return DatastarResponse(
        SSE.patch_elements('<div id="result">Hello from FastAPI via the Datastar SDK.</div>')
    )

Why this is nicer than raw SSE:

SSE.patch_elements(...) builds the Datastar SSE event for you.
DatastarResponse(...) handles the Datastar/SSE response shape for the framework.
You do not manually write event: ..., data: ..., and blank lines yourself. That is exactly the kind of boilerplate the SDK is meant to remove.
2) Streaming version with repeated updates

The SDK docs show that DatastarResponse can also wrap an async generator for a long-lived stream.

import asyncio
from datetime import datetime

from fastapi import FastAPI
from fastapi.responses import HTMLResponse
from datastar_py import ServerSentEventGenerator as SSE
from datastar_py.fastapi import DatastarResponse

app = FastAPI()

PAGE = """
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Datastar stream</title>
    <script
      type="module"
      src="https://cdn.jsdelivr.net/gh/starfederation/datastar@v1.0.0-RC.7/bundles/datastar.js">
    </script>
  </head>
  <body>
    <button data-on:click="@get('/clock')">Start clock</button>
    <div id="clock">Idle</div>
  </body>
</html>
"""

@app.get("/", response_class=HTMLResponse)
async def index():
    return PAGE

@app.get("/clock")
async def clock():
    async def stream():
        while True:
            yield SSE.patch_elements(
                f'<div id="clock">{datetime.now().isoformat()}</div>'
            )
            await asyncio.sleep(1)

    return DatastarResponse(stream())
3) Returning multiple Datastar events at once

The SDK docs also show that one response can contain multiple events, such as patching HTML and patching signals in the same response.

from datastar_py import ServerSentEventGenerator as SSE
from datastar_py.fastapi import DatastarResponse

@app.get("/multi")
async def multi():
    return DatastarResponse([
        SSE.patch_elements('<div id="result">Updated HTML</div>'),
        SSE.patch_signals({"status": "done"}),
    ])
4) Optional: reading signals from the request

The SDK also includes a read_signals helper. The docs note that Datastar includes current frontend signal state in requests by default, and that read_signals is framework-specific and usually needs the request passed in.

A FastAPI-shaped example would look like this:

from fastapi import Request
from datastar_py.fastapi import read_signals, DatastarResponse
from datastar_py import ServerSentEventGenerator as SSE

@app.get("/echo")
async def echo(request: Request):
    signals = await read_signals(request)
    name = signals.get("name", "anonymous")

    return DatastarResponse(
        SSE.patch_elements(f'<div id="result">Hello, {name}.</div>')
    )
The key SDK imports to remember
from datastar_py import ServerSentEventGenerator as SSE
from datastar_py.fastapi import DatastarResponse

Those are the two most important pieces for FastAPI, and they match the official response-helper pattern shown in the SDK docs.

My practical take:

use plain HTML responses when you want the simplest possible setup,
use the SDK when you want clean SSE responses, streaming, or multiple Datastar events without hand-formatting SSE.

I can show the same thing next as a real FastAPI project layout with templates/, static/, and uvicorn run commands.

Would you be able to take datastar and build a timpleting engine framework that is fully reactive like React that doesn't need a build step?

I’m checking Datastar’s own docs so I can answer this in concrete terms rather than hand-waving.

Thought for 42s

Yes — technically, absolutely.

But I would frame it as “build a React-like reactive templating layer on top of Datastar”, not “rebuild React.” Datastar already gives you several core pieces you’d want: client-side reactivity through data-* attributes, signals/computed/effects, DOM morphing from server HTML, SSE for streaming updates, and a plugin API for custom actions/attributes/watchers. It also has Rocket, which turns HTML template elements into reactive web components with scoped component signals, though Rocket is currently described as alpha and in the Pro repo.

So the real answer is:

Yes, I could build it.
No, I would not try to mimic React 1:1.
And you may not need as much custom framework as you think.

A good version of this would look like:

What I’d build

A server-first, no-build-step component system where you write HTML templates like:

<template data-component="counter">
  <div data-signals:count="0">
    <button data-on:click="$count--">-</button>
    <span data-text="$count"></span>
    <button data-on:click="$count++">+</button>
  </div>
</template>

<ui-counter></ui-counter>

Then a tiny runtime would:

register templates from <template> tags
instantiate them into custom elements or regular DOM islands
scope signals per instance
allow props via attributes
support local state, computed values, effects, and event handlers
optionally let the server patch component subtrees via Datastar morphing/SSE

That is very doable because Datastar already supports:

signal binding and input syncing,
computed signals and effects,
direct DOM patching via HTML,
custom plugins,
and component-style encapsulation through Rocket’s scoped $$ signals.
What “fully reactive like React” would mean here

You probably do not want React’s exact model. React is centered on:

component render functions,
virtual DOM reconciliation,
JS-first composition.

A Datastar-based system would be better as:

HTML-first templates
fine-grained signal updates
server-rendered fragments
direct DOM morphing instead of virtual DOM

Datastar itself explicitly leans on direct HTML morphing and says it patches DOM elements by ID from text/html or SSE responses, rather than requiring a virtual DOM.

So yes, it can feel “fully reactive,” but the internals would be closer to Alpine + Web Components + htmx-style server patches than to React.

The biggest design choice

You have two viable directions:

1) Pure browser-native templates

Use <template> tags, custom elements, and Datastar signals.

Pros:

truly no build step
easy to inspect/debug
works with plain HTML files
best fit for Datastar

Cons:

less ergonomic than JSX
composition API needs to be invented carefully
2) Server template engine with Datastar hydration

Use Jinja2, Go templates, templ, FastAPI templates, etc., and treat Datastar as the reactive runtime.

Pros:

simplest architecture
server stays source of truth
easy SSR and partial rendering
matches Datastar’s strengths

Cons:

less “component authoring” on the client
local-only UI abstractions need extra work
What I would not promise

I would not claim you can have all of React’s ergonomics with zero build step unless you accept tradeoffs.

For example:

JSX/TSX normally needs compilation.
TypeScript in the browser means runtime transpilation, which is effectively moving the build step to the client.
advanced module graph optimizations, tree-shaking, and compile-time transforms do not come for free.

So if by “like React” you mean:

local component state,
reusable components,
props,
derived state,
event handling,
selective updates,

then yes.

If you mean:

JSX,
TypeScript compile-time safety,
file-based SFC ergonomics,
React’s whole ecosystem model,

then not without either a build step or runtime compilation.

The smartest version to build

If this were my project, I’d build:

a tiny component registry
templates defined in HTML or server templates
instance-scoped signals
props mapped from element attributes
slot/content projection
optional lifecycle hooks via Datastar effects
server patch integration for async/real-time updates
no compiler at all

Basically:

Datastar + component conventions + a thin runtime
instead of
Datastar + an entirely new frontend framework.

My honest take

This is very feasible and actually a pretty interesting sweet spot.

Datastar already has enough primitives that the framework you’re imagining could be:

small,
server-friendly,
reactive,
and build-step-free.

The hard part is not “can it be built?”
The hard part is choosing the right abstraction level so it stays simpler than React instead of slowly becoming React again.

If you want, I can sketch the architecture for a FastAPI + Datastar + no-build-step component framework and show what the API would look like.

You can't use rocket because it is payed. But oltimently we would be building in templeting and modgelarity and simple naming.

I’m verifying the current Datastar component/plugin pieces so I can answer around what’s available for free versus what you’d need to build yourself.

Thought for 21s

Yes — and that is the right direction.

If Rocket is off the table, I would not try to depend on paid component features anyway. Datastar’s own docs say Rocket is a Datastar Pro plugin, currently alpha, and also say that for most apps, standard Datastar templates and global signals are sufficient.

So the free-path version would be:

server templates for structure
Datastar signals/effects/bindings for reactivity
a small naming convention for modularity
optional SSE for live updates from the backend

Datastar already gives you the primitives you need on the free side: reactive data-* attributes, signal definitions, bindings, computed/effect-style behavior, backend-driven DOM patching, and attribute aliasing if you want your own naming scheme.

What I would build instead of Rocket

A thin framework on top of normal Datastar with conventions like:

component partials from your backend templating engine
scoped naming such as cart.itemCount, user.menuOpen, modal.confirmDelete
macro/helpers that output Datastar attributes cleanly
module folders like components/, layouts/, partials/, pages/
optional attribute aliasing so the syntax feels branded or simpler than raw data-* when needed
Example mental model

Instead of Rocket components, you’d have reusable server partials like:

<div data-signals:counter-count="0">
  <button data-on:click="$counterCount--">-</button>
  <span data-text="$counterCount"></span>
  <button data-on:click="$counterCount++">+</button>
</div>

Then your framework layer would make that nicer by generating the repetitive parts, standardizing names, and enforcing structure.

The key tradeoff

You can get something highly reactive, but it will feel more like:

templated HTML + signals + DOM morphing

than:

React render functions + JSX + virtual DOM

That is not a weakness. In Datastar’s model, the backend can patch HTML into the DOM directly, and the frontend can stay reactive through data-* attributes without needing npm or a build step.

The smart architecture

I’d build 4 layers:

Template layer
Jinja2, Go templates, Templ, Django templates, whatever backend you want.
Datastar helper layer
Small helpers/macros for common patterns:
bind input
show/hide
text output
event handlers
loading states
patch targets
Module conventions
Each module gets:
template partial
state naming prefix
optional backend endpoint(s)
optional SSE stream
Design system
Simple naming and reusable wrappers so authors don’t think about raw Datastar all day.
What this would give you

You would end up with something like:

no build step
reusable UI modules
clean server-side templates
reactive local state
backend-driven updates
live updates over SSE
much simpler mental model than React for many CRUD/dashboard apps
My honest take

This is very buildable.

The real product is not “a React replacement.”
It is more like:

a no-build, HTML-first, reactive component framework powered by Datastar

That is a much better goal.

If you want, I’ll sketch the actual framework API next — for example, what component syntax, folder structure, naming rules, and helper macros would look like in a FastAPI version.

We want to write our own template layer that functions like Jinja2, but using our own very modular React like with state sendaxing to make true spas.

I’m grounding this against Datastar’s actual extension points, then I’ll map out what your custom template layer would need to do to behave like a real SPA. Also, one key choice matters a lot: whether your templates compile at runtime in the browser or on the server.

Thought for 57s

Yes — that is buildable, and I think the right framing is:

your framework would use Datastar as the reactive runtime and DOM patch engine, while your own template layer would provide the component syntax, modularity, and SPA behavior. Datastar already gives you reactive signals, computed values, effects, two-way binding, DOM morphing from HTML responses, custom plugins, and attribute/action hooks. That means you do not need Rocket to get the core primitives.

The main thing to understand is this:

a no-build-step “React-like” system is possible, but the compiler has to live somewhere.

If you do not want a build step, then your template layer must be compiled either:

at runtime in the browser, or
at request/render time on the server.

That is still valid. It just means “no build step” does not mean “no compilation,” only “no separate bundling/transpilation pipeline.”

The version I would recommend is:

What your stack should look like
1) Your own template language

This is the part that feels like Jinja2 or JSX, but with your own syntax.

Example shape:

<Component name="Counter" state="{ count: 0 }">
  <button @click="count--">-</button>
  <span>{{ count }}</span>
  <button @click="count++">+</button>
</Component>

or more Jinja-like:

{% component Counter state={ count: 0 } %}
  <button @click="count--">-</button>
  <span>{{ count }}</span>
  <button @click="count++">+</button>
{% endcomponent %}

Your engine would parse that and emit plain HTML plus Datastar attributes underneath.

For example, it could compile to something conceptually like:

<div data-signals="{counter: {count: 0}}">
  <button data-on:click="$counter.count--">-</button>
  <span data-text="$counter.count"></span>
  <button data-on:click="$counter.count++">+</button>
</div>

That works because Datastar already supports declarative signals, computed values, effects, event handlers, two-way binding, and nested signal paths.

2) A component/module system

This is where your “React-like modularity” comes from.

I would define components as:

a template
optional props
optional local state
optional methods/actions
optional lifecycle hooks
optional child slot/content area

You do not need a virtual DOM for this. Datastar already morphs returned HTML into the DOM and tries to preserve unchanged state during updates.

So your framework can be:

template-driven
signal-driven
DOM-native
instead of virtual-DOM-driven.

That is a better fit for Datastar than trying to recreate React internals.

3) Scoped state

This is the biggest thing you need to design yourself if you are not using Rocket.

Rocket’s paid feature is basically convenience around isolated component namespaces. The docs explain that Rocket gives each component its own signal namespace and cleanup behavior. Since you are not using it, your framework needs to provide that itself.

So I would make component instances compile to namespaced signals such as:

$cmp_42.count
$cmp_42.open
$cmp_42.form.email

or a nested form like:

$components.counter_42.count

That gives you instance isolation without needing Rocket.

Your runtime would be responsible for:

creating instance IDs
rewriting local identifiers like count to $cmp_42.count
cleaning up state when the component is removed
wiring props into that instance scope

That is probably the single most important piece of your framework.

4) A real SPA router

If you want “true SPA” behavior, this is where your framework goes beyond plain Datastar.

Datastar already supports backend-driven updates, request actions, and DOM patching. It also has data-init support with optional View Transition wrapping, which is useful for smoother page changes.

But a true SPA layer still needs:

History API routing
route-to-template resolution
layout persistence
partial page swaps
loading states
scroll restoration
route guards if needed
cached state/data behavior

So your framework router would likely:

intercept internal links
fetch the next route as HTML or JSON+template payload
patch only the page outlet
preserve layout shell and selected persistent components
push/replace browser history
optionally use view transitions for navigation

That is all very doable.

5) A runtime compiler

This is the heart of the system.

Your compiler needs to transform your syntax into Datastar-compatible HTML.

At minimum it must understand:

interpolations like {{ name }}
event syntax like @click="count++"
conditional rendering
loops
props
local component state
slots/children
computed values
effect hooks

Then it emits:

data-signals
data-text
data-show
data-class
data-bind
data-computed
data-effect
data-on:*

Those are all first-class Datastar features already.

What I would build first

I would not start by trying to clone all of Jinja2 and React at once.

I would build it in this order:

Phase 1

A custom template parser that supports:

text interpolation
if
for
component
slot
props
local state
Phase 2

A component instance runtime that:

assigns scoped IDs
rewrites local state references
manages cleanup
supports child composition
Phase 3

An SPA router that:

swaps page outlets
persists layout state
integrates history API
supports transitions
Phase 4

Server integration

page templates
component partials
streaming updates with SSE
server-driven state patches

Datastar’s request model and SSE support already fit this well. It accepts text/html and text/event-stream, and its patching model is designed around backend-driven HTML updates.

What I would avoid

I would avoid:

inventing a full JSX clone
inventing a virtual DOM
inventing a giant general-purpose expression language
inventing too many magic lifecycle concepts

That would just turn the project into “React, but less mature.”

The better version is:

HTML templates + scoped signals + direct DOM updates + SPA router

That is simpler, faster to build, and much more aligned with what Datastar already does well. Datastar also supports custom plugins for actions/attributes/watchers, so if your syntax needs a few custom directives, that extension point already exists.

My honest take

Yes, this can become a real SPA framework.

But the successful version will not look exactly like React. It will feel more like:

Jinja-style template authoring
Alpine-style fine-grained reactivity
Datastar DOM patching
your own scoped component model
your own SPA router

That is a strong idea.

The most important architectural decision is this:

Should the template language compile on the server or in the browser?

My recommendation:

compile templates on the server for page/component rendering
keep a small browser runtime only for state scoping, route navigation, and Datastar integration

That gives you no build step, keeps the browser light, and still gives you SPA behavior.

I can sketch the actual syntax and folder structure next, including what component, props, state, if, for, and routing would look like.

I am not sure if it should compile on the server or the browser. Can't we just use something that doesn't have to compile?

I’m checking the Datastar docs around templates, plugins, and expression syntax so I can answer the “no compile at all” path accurately.

I found the useful distinction: you can avoid a separate compile step, but only if your authoring syntax is already valid HTML/attributes. The moment you invent {{ ... }} or custom tag semantics, something has to translate or interpret them.

Thought for 1m 13s

Yes — but only if you stop inventing a new syntax.

If your “template layer” is really just valid HTML plus conventions, then you do not need a separate compile step. Datastar already works this way: it adds reactivity through data-* attributes, evaluates Datastar expressions at runtime, patches HTML responses directly into the DOM, and is built around plugins for actions, attributes, and watchers.

The important distinction is this:

No build step is easy.
No translation at all is only possible if your authoring format is already something the browser and Datastar can understand directly.
The moment you invent syntax like {{ name }}, {% if %}, or <MyComponent>...</MyComponent> with special meaning, something has to parse and interpret that. You can call it an interpreter instead of a compiler, but it is still doing translation work somewhere. Datastar itself already parses data-* attributes and evaluates expressions at runtime, so the “no compiler” path is really “use the runtime directly.”

So the cleanest answer is:

Yes, you can avoid a compiler

…but you should design the framework as an HTML-native authoring system, not a brand-new template language. Datastar’s own guidance is HTML-first, backend-driven, and centered on patching elements/signals instead of introducing a virtual DOM or separate build pipeline.

A no-compiler version would look more like this:

<section
  id="counter-1"
  data-signals="{ count: 0 }"
  data-component="counter"
>
  <button data-on:click="$count--">-</button>
  <span data-text="$count"></span>
  <button data-on:click="$count++">+</button>
</section>

That already gives you:

local-ish state through data-signals
reactive rendering through data-text, data-show, data-bind, etc.
events through data-on:*
server updates through normal HTML or SSE patches
modular behavior through reusable partials and Datastar plugins.

So if you want “React-like” structure without compilation, I would define your framework in terms of conventions, not a new grammar:

components = HTML partials or custom elements
props = normal HTML attributes / data-props
state = data-signals
events = data-on:*
derived state = data-computed:*
effects = Datastar expressions / watchers
page updates = HTML morphing or SSE
SPA navigation = your own History API router + Datastar patching.

That gives you a framework with no separate compile step. The browser parses HTML; Datastar handles reactivity; your backend renders partials. Datastar explicitly supports backend HTML responses and SSE responses, and its morphing strategy is designed to preserve state while patching only changed DOM areas.

Where people get trapped is wanting this:

<MyCard title="Hello">
  {{ user.name }}
</MyCard>

That is where a parser becomes unavoidable, because the browser does not know what {{ ... }} means, and custom tags only become useful if you give them behavior. Datastar’s plugin system is flexible enough that you could build custom actions, attributes, and watchers, but that still does not magically make a non-HTML template language executable without some translation layer.

So my recommendation is:

Do not build a compiler first.
Build a zero-compiler, HTML-native framework first.

Make the authoring model:

plain HTML
Datastar attributes
server partials
strict naming/scoping conventions
a small router/runtime for SPA behavior

Then, only if the ergonomics feel too verbose, add a tiny optional preprocessor later for sugar like {{ }} or shorthand component tags.

That path gives you the best chance of actually shipping something simple.

My honest take is that your best version is not “Jinja2 but custom.”
It is:

Datastar + HTML conventions + server partials + scoped state + SPA router

That gets you very close to what you want, without dragging in a compiler too early.

I can sketch a concrete no-compiler API next, showing exactly how component, props, state, slot, and SPA routing would work using only valid HTML.

Well they are using "data-" so isn't something interpreting or compiling?

I’m checking the Datastar docs again because this comes down to a precise distinction between parsing, interpreting, and compiling.

Thought for 18s

Exactly — something is interpreting it, but that is not the same as a build/compiler step.

What happens with Datastar is closer to this:

The browser parses the HTML normally.
Datastar walks the DOM at runtime and looks for its supported data-* attributes.
It then evaluates those attributes in order and runs the related behavior, like creating signals, binding inputs, attaching event handlers, or updating text. The docs explicitly say Datastar “walks the entire DOM and applies plugins to each element,” and that data attributes are evaluated in DOM order and reapplied after DOM patches.

So yes, there is a runtime parser/interpreter layer. Datastar also says its data-* attributes can contain Datastar expressions, and those expressions are parsed and support normal JavaScript-style syntax.

The key distinction is:

Compile/build step: transform source code before the app runs, like JSX → JavaScript or templates → generated output.
Runtime interpretation: read already-valid HTML in the browser and attach behavior to it while the page is running.

Datastar is mainly doing the second one. Its attributes are already valid HTML, so there is no required separate transpile/bundle phase just to make the syntax legal.

That is why I was drawing the line this way:

data-on:click="$count++" → no separate compiler needed; the browser accepts it as HTML, then Datastar interprets it at runtime.
{{ count }} or {% if user %} → the browser does not know what those mean, so you would need your own interpreter or compiler to turn them into something executable.

So your instinct is right: Datastar is still “processing” syntax.
It just is not doing a traditional pre-build compile step. It is doing runtime DOM + expression interpretation instead.

For your framework, that means you have two realistic choices:

stay HTML-native, like Datastar, where your syntax is valid HTML and your runtime interprets attributes
invent a richer template syntax, in which case you become the parser/interpreter or compiler

The first path is much simpler.

A good mental model is:

Datastar is like the browser plus a reactive attribute runtime, not like JSX plus a transpiler.

If you want, I can sketch what your own framework would look like in the HTML-native/runtime-interpreted style so it stays no-build-step.

Yes this is what we want.
Thought for 23s

Good. Then I would lock the framework around HTML-native, runtime-interpreted components and stop thinking in terms of a custom template compiler.

That gives you a very clear target:

The model

Your framework is not:

JSX
Jinja syntax
a compiler
a virtual DOM

Your framework is:

plain HTML
special attributes your runtime understands
scoped reactive state
component conventions
a SPA router
server-rendered partials when needed

So the browser parses the HTML, and your runtime interprets the attributes the same way Datastar interprets data-*.

The authoring style

This is the kind of syntax I would design around:

<div
  data-ui="counter"
  data-state="{ count: 0 }"
>
  <button data-click="count--">-</button>
  <span data-text="count"></span>
  <button data-click="count++">+</button>
</div>

That is already enough for:

local state
event handling
reactive text output
zero build step

Then you add composition:

<section
  data-ui="todo-list"
  data-state="{ items: [], draft: '' }"
>
  <input data-bind="draft" />
  <button data-click="items.push({ text: draft, done: false }); draft = ''">
    Add
  </button>

  <ul>
    <template data-each="item, i in items">
      <li>
        <input type="checkbox" data-bind="item.done" />
        <span data-text="item.text"></span>
        <button data-click="items.splice(i, 1)">Remove</button>
      </li>
    </template>
  </ul>
</section>

That is the right shape.

What your runtime needs to do

Your runtime only needs a few core jobs.

1. State scopes

Every component instance gets its own scope.

So this:

<div data-ui="counter" data-state="{ count: 0 }">

internally becomes something like:

scope = {
  id: "cmp_12",
  state: { count: 0 }
}

Then data-text="count" resolves against that component scope, not the global page.

That gives you isolation without Rocket.

2. Expression evaluation

Your runtime evaluates tiny expressions against the local scope:

count++
open = !open
user.name
items.length
draft.trim()

That is interpretation, not compilation.

3. DOM bindings

Your runtime wires attributes to behavior:

data-text → update text node
data-html → update inner HTML
data-show → toggle visibility
data-bind → two-way input binding
data-click → event handler
data-class:* → class toggles
data-attr:* → attribute binding
data-each → repeat template
data-if → conditional render

That is your reactive templating engine.

4. Dependency tracking

When count changes, only things depending on count update.

That gives you the “React-like” feel without React.

5. Component lifecycle

You need just a few lifecycle hooks:

mount
update
destroy

Nothing more complicated at first.

The naming system

This matters a lot.

I would keep it extremely plain:

data-ui for component identity
data-state for local state
data-props for passed props
data-bind for two-way binding
data-text for text output
data-show for visibility
data-click, data-input, data-change for events
data-each for loops
data-if for conditions
data-route for SPA navigation
data-outlet for route mount point

That is readable and easy to teach.

How modularity should work

You said you want modularity and simple naming. That means components should be defined as HTML partials.

Example:

<template data-component="counter">
  <div data-state="{ count: props.start ?? 0 }">
    <button data-click="count--">-</button>
    <span data-text="count"></span>
    <button data-click="count++">+</button>
  </div>
</template>

Usage:

<div data-use="counter" data-props='{ "start": 5 }'></div>

Your runtime finds data-use="counter", clones the matching template, creates a scope, injects props, and mounts it.

That gives you reusable components with no compiler.

How SPA behavior should work

For true SPA behavior, add a router layer.

Example shell:

<nav>
  <a href="/" data-route>Home</a>
  <a href="/projects" data-route>Projects</a>
  <a href="/settings" data-route>Settings</a>
</nav>

<main data-outlet></main>

Router behavior:

intercept internal links with data-route
fetch next page fragment from server
patch data-outlet
preserve app shell
keep component state where appropriate
update history
restore scroll

That is enough for a real SPA.

The best split between server and browser

I would use this split:

Browser

Owns:

local state
event handling
reactive bindings
component mounting
route transitions
Server

Owns:

page fragments
initial HTML
data loading
mutations
streaming updates if needed

That keeps the browser small and keeps the system practical.

What not to build in v1

Do not build:

a virtual DOM
JSX
a full scripting language
deep lifecycle APIs
magical dependency injection
too many directive aliases

That is how the project becomes huge.

The v1 feature set I would ship

This is enough for a real first version:

data-ui
data-state
data-props
data-use
data-text
data-html
data-show
data-bind
data-click
data-change
data-input
data-if
data-each
data-class:name
data-attr:name
data-route
data-outlet

With just that, you can build dashboards, forms, lists, tabs, modals, CRUD screens, and app shells.

The internal architecture

Keep it small:

runtime/
  parser.js        // reads attributes from DOM
  scope.js         // component scope/state
  reactive.js      // signals/effects/subscriptions
  bindings.js      // text/show/class/attr/html
  events.js        // click/input/change handlers
  components.js    // template registry + mounting
  router.js        // SPA navigation

That is enough.

The strongest version of this idea

The best version is:

Datastar-inspired
but with your own attribute conventions
your own scope model
your own component registry
your own SPA router

So the product becomes:

a no-build-step reactive HTML SPA framework

That is a real and coherent target.

The next concrete step should be writing the v0 spec: exact attribute names, scope rules, template registration, and router behavior.

So what out of this am I adding to datastar?

I’m separating the Datastar-native pieces from the layer you’d actually be inventing, so the boundary is clear.

Thought for 40s

You’d be adding a framework layer on top of Datastar, not replacing Datastar itself.

Datastar already gives you the low-level reactive runtime: HTML-first data-* attributes, signals via data-signals, two-way binding via data-bind, computed values via data-computed, event handling via data-on:*, text binding via data-text, DOM patching from backend HTML, SSE support, and a plugin API for custom actions, attributes, and watchers.

So the part you would add is this:

1. A component model
Datastar by itself gives you primitives, not your own opinionated component system. Your layer would define things like:

how components are declared
how they are instantiated
how props are passed
how slots/children work
how component instances are mounted/unmounted

If you want reusable, modular “React-like” pieces without Rocket, this is one of the biggest things you are adding. Rocket exists in Datastar Pro specifically to bridge web components and Datastar’s reactive system, and it is marked alpha, so if you are not using it, that component model is yours to build.

2. Scoped local state conventions
Datastar has signals and nested signal names, but it does not automatically give you your own custom local-component abstraction. You would add:

instance scoping rules
state namespaces
cleanup rules when a component is removed
rules for local vs shared/global state

Datastar supports nested signals and patching signals into the current tree, which gives you a solid base, but your framework would define the modular state story.

3. Your own authoring syntax/conventions
Even if you stay HTML-native, you still need a framework convention for authors. For example:

data-ui
data-use
data-props
data-route
data-outlet

Those are not Datastar features by default; they would be your layer. Datastar does support custom actions, attributes, and watchers through its plugin API, so you can implement some of these as real runtime extensions instead of just conventions.

4. A loop / conditional / template-instantiation story
Datastar gives you bindings and expressions, but your framework would still need to decide:

how repeated component instances are created
how conditional rendering works in your system
how HTML templates are registered and cloned
how parent/child composition works

That is part of the “templating engine” you are adding.

5. SPA routing
Datastar can already update the DOM from backend responses and has attributes/actions around interactivity, but a true SPA shell still needs a routing layer with:

link interception
History API updates
outlet swapping
layout persistence
scroll restoration
route lifecycle behavior

That router would be yours. Datastar is the reactive runtime underneath it, not the full opinionated SPA framework you are describing.

6. A developer-facing framework API
This is the part authors actually feel:

naming rules
file/folder conventions
component registration
shared state patterns
lifecycle semantics
docs and ergonomics

That is often the real product.

So the cleanest way to think about it is:

Datastar provides the reactive engine.
You provide the opinionated framework.

More concretely:

Datastar handles reactivity
Datastar handles expression evaluation
Datastar handles signal patching
Datastar handles backend HTML/SSE DOM updates
Datastar can handle custom plugins

You add:

component system
state scoping model
template/module conventions
SPA router
developer ergonomics and naming
optionally custom attributes/actions built on the plugin API

So the shortest honest answer is:

You are not adding “reactivity” to Datastar. You are adding “framework structure” to Datastar.

A good next step would be to freeze the boundary into two buckets:

Datastar core we keep
our framework features we own
Ok, but what if we don't want to write "data-" any more. And we want are templates to be in separate HTML pieces or files?

I’m checking whether Datastar already supports attribute aliasing and what the cleanest file/component story would be, so I can tell you what can stay runtime-only versus what you’d need to own.

Thought for 1m 17s

Yes — you can do both.

The clean boundary is:

1) If you do not want to write data-*

Stock Datastar expects data-* attributes. Its attribute reference says aliasing can change them to data-{alias}-*, and the site maintains a data-star-* bundle, but that still keeps the data- prefix. Datastar’s own aliasing is also tied to the bundler.

So if you want syntax like:

<div ui-state="{ count: 0 }">
  <button @click="count--">-</button>
  <span ui-text="count"></span>
  <button @click="count++">+</button>
</div>

then you add a tiny runtime layer that rewrites your syntax to Datastar syntax before Datastar initializes.

For example:

ui-state → data-signals
ui-text → data-text
ui-show → data-show
ui-bind → data-bind
@click → data-on:click
@input → data-on:input

That is not a build step. It is just a startup DOM rewrite in the browser.

So the answer is:

Using Datastar directly: you keep data-*
Using your own framework layer on top of Datastar: you can stop authoring data-*, but your layer must translate it at runtime

That is the cleanest way to get your own syntax without building a compiler. Datastar already supports runtime processing of attributes and a plugin API for extending behavior, so this style fits its model well.

2) If you want templates in separate HTML files

Yes, absolutely.

Datastar already works by fetching HTML and patching it into the DOM. The getting-started guide says that when a backend response is text/html, Datastar morphs the returned top-level elements into the existing DOM by ID. The lazy-load example shows this exact pattern: an element triggers @get(...), then the server returns HTML for the same id, and Datastar swaps it in.

That means your templates can live as:

separate server partial files
separate component fragment files
separate route fragment files

For example:

/components
  counter.html
  modal.html
  tabs.html

/pages
  home.html
  settings.html

/layouts
  app.html

Then your server can return those fragments as normal HTML responses, and Datastar patches them into the page.

The best practical setup

I would do this:

Authoring syntax

Write your own HTML-native attributes:

<div ui-use="counter" ui-props='{"start": 5}'></div>
Component files

Keep each component in its own HTML file:

<!-- /components/counter.html -->
<template ui-component="counter">
  <div ui-state="{ count: props.start ?? 0 }">
    <button @click="count--">-</button>
    <span ui-text="count"></span>
    <button @click="count++">+</button>
  </div>
</template>
Runtime

A small bootstrap script:

loads component template files
registers them by name
rewrites ui-* / @click syntax into Datastar-compatible attributes
mounts components
lets Datastar handle reactivity afterward
The important tradeoff

If you drop data-*, then the part you are adding is no longer just “framework conventions.”

You are now adding:

a custom attribute syntax
a runtime translator
a component/template loader

But that is still much smaller than building your own reactive engine from scratch, because Datastar still handles signals, expressions, DOM updates, HTML patching, and SSE.

So the shortest answer is:

Yes, you can stop writing data-*, and yes, your templates can live in separate HTML files.
But to do that while still using Datastar, your framework needs a small runtime adapter that converts your nicer syntax into what Datastar understands.

A good next move is to define your exact author syntax, like whether you want:
ui-text, ui-show, ui-bind, @click, and ui-use
or a different naming style.

What if we changed it to something like (state)

I’m checking two things: whether Datastar can be adapted to a non-data-* authoring style, and whether attribute names like (state) are even valid HTML for a runtime to read.

No, I am doing what you asked. I am defining my authering style. I am saying put the word inside (). So instead of "ui-state" you would have (state). I would keep the "@" one's.

You’re right — you were defining the authoring style. I’m checking one key constraint so I can tell you whether (state) can exist directly in HTML or whether it would need rewriting first.

Thought for 1m 6s

Yes — that authoring style can work.

In raw HTML, attribute names can contain characters like (, ), and @; the HTML syntax mainly forbids spaces, quotes, >, /, =, control characters, and noncharacters in attribute names. So (state) and @click are parseable by the browser.

So this is a workable authoring style:

<div (state)="{ count: 0 }">
  <button @click="count--">-</button>
  <span (text)="count"></span>
  <button @click="count++">+</button>
</div>

The important part is what happens next:

the browser will happily parse those attributes,
but Datastar will not know what they mean on its own, because Datastar is built around its own data-* conventions,
so your framework layer needs to interpret them or rewrite them before Datastar runs. Datastar’s standard extension model is based on its own attributes and plugins, while data-* is also the standard HTML convention for custom script-readable data.

So your runtime would do something like:

(state) → data-signals
(text) → data-text
(show) → data-show
(bind) → data-bind
@click → data-on:click
@input → data-on:input

That means your framework becomes a thin syntax adapter on top of Datastar, not a whole new reactive engine.

There are a few tradeoffs with this style:

First, you lose the browser nicety of data-* attributes being exposed through element.dataset; MDN notes that data-* is the standard custom-data mechanism and is surfaced through HTMLElement.dataset. Custom names like (state) will not show up there.

Second, tooling can get a little rougher. Browsers will parse (state), but some linters, formatters, template highlighters, or HTML-aware tools may not treat it as nicely as data-*. That is not a browser blocker; it is just a developer-experience consideration. The HTML parser itself is fine with those characters in attribute names.

Third, querying can be awkward. Instead of leaning on dataset, your runtime should probably just walk the DOM and inspect el.attributes or call el.hasAttribute("(state)") / el.getAttribute("(state)") directly.

So my recommendation is:

Yes, use (state) and keep @click if that feels good to author.
Then build a tiny startup pass that rewrites your syntax into Datastar syntax.

That gives you:

your own clean authoring style,
no build step,
separate HTML component files,
Datastar still handling the hard reactivity work underneath.

A clean v1 mapping would be:

(state)
(text)
(html)
(show)
(bind)
(if)
(each)
(class:name)
(attr:name)
(use)
(props)
(route)
(outlet)

@click
@input
@change
@submit

That is a coherent system.

The one big design choice left is whether you want this adapter to:

rewrite to Datastar attributes, or
interpret the attributes directly without rewriting.

For a first version, rewriting is much simpler and safer.

Ok, if we can use () what about []

I’m checking the HTML parsing rules so I can tell you whether [] works the same way as () and what tradeoffs it would have.

Thought for 19s

Yes — [] can work too.

In HTML, attribute names can contain any characters except controls, spaces, ", ', >, /, =, and noncharacters. Since [ and ] are not on that forbidden list, names like [state] and [text] are valid HTML attribute names.

So this is valid authoring syntax:

<div [state]="{ count: 0 }">
  <button @click="count--">-</button>
  <span [text]="count"></span>
  <button @click="count++">+</button>
</div>

Just like with (state), the browser can parse it, but Datastar will not treat [state] specially by itself. Your layer would still need to translate or interpret it, for example:

[state] → data-signals
[text] → data-text
[show] → data-show
@click → data-on:click

One practical difference: data-* has a special standard role in HTML and is exposed through HTMLElement.dataset. Custom names like [state] do not get that convenience, so your runtime would read them with getAttribute() / hasAttribute() or by walking el.attributes.

My take:

() feels more like “directive” syntax
[] feels more like “binding” syntax
@click already pairs nicely with []

So a very clean authoring style would be:

<div [state]="{ count: 0 }">
  <button @click="count--">-</button>
  <span [text]="count"></span>
  <button @click="count++">+</button>
</div>

That is probably cleaner than () if you want it to feel modern and familiar.

The only real caution is tooling: browsers will parse [state], but some editors, linters, or formatters may treat it less naturally than standard data-* attributes. The HTML syntax itself is fine with it.

My recommendation would be:

use [] for bindings like [text], [show], [bind], [class.active]
keep @event for events
decide separately whether state should also use [] or a dedicated marker like #state

A strong v1 could be:

<div [state]="{ count: 0 }">
  <button @click="count--">-</button>
  <span [text]="count"></span>
  <button @click="count++">+</button>
</div>

or, if you want state to stand out more:

<div #state="{ count: 0 }">
  <button @click="count--">-</button>
  <span [text]="count"></span>
  <button @click="count++">+</button>
</div>

#state would need the same kind of validation check as the others, but the pattern itself is possible if you prefer a different visual role for state.

I think [] + @ is the strongest direction so far.

When we wanted to call in our HTML templates into the page could we also use []

I’m checking the HTML rules and Datastar’s fragment/patch model one more time so I can give you a clean recommendation for component/template inclusion syntax.

Thought for 29s

Yes — that is a good fit for [].

Since HTML attribute names can include [ and ], something like [use], [component], or [slot] is valid authoring syntax. The browser will parse it normally; your runtime just has to give it meaning.

I would separate the roles like this:

<div [use]="counter" [props]='{ start: 5 }'></div>

or

<div [component]="counter" [props]='{ start: 5 }'></div>

That reads cleanly and keeps [] as your declarative binding/include syntax, while @click stays your event syntax.

For separate HTML template files, there are two solid ways to make [use] work:

First, a client-side registry:

load component HTML files into a registry,
find elements with [use],
clone the matching template into that spot,
then rewrite your custom syntax to Datastar syntax and let Datastar handle reactivity.

Example:

<div [use]="counter" [props]='{ start: 5 }'></div>

with /components/counter.html containing:

<template name="counter">
  <div [state]="{ count: props.start ?? 0 }">
    <button @click="count--">-</button>
    <span [text]="count"></span>
    <button @click="count++">+</button>
  </div>
</template>

Second, a server-fetched fragment:

[use] tells your runtime what component/partial to request,
the server returns HTML,
Datastar patches that HTML into the DOM.

That matches Datastar’s model well, because Datastar already supports patching returned HTML fragments into existing DOM elements and also supports SSE streams for patching.

So the short answer is:

yes, use [] for template inclusion too,
I would use [use] or [component],
and I would avoid [template] as the main include directive, because HTML already has a real <template> element with special semantics. The HTML spec treats <template> specially by storing its contents in template contents rather than as normal live children.

My recommendation for a clean v1 is:

[use]
[props]
[state]
[text]
[html]
[show]
[bind]
[if]
[each]
[slot]
[outlet]

plus:

@click
@input
@change
@submit

That gives you a consistent language:

[] for declarative bindings and composition
@ for events

The strongest include syntax so far is probably:

<div [use]="counter" [props]='{ start: 5 }'></div>

because it feels natural and leaves room for [slot] and [outlet] later.

So you are saying counter is really a separate HTML file called counter.html in another folder?
Thought for 8s

Not necessarily. That was just one clean option.

counter could be any of these:

1. A separate HTML file

/components/counter.html

Used like:

<div [use]="counter"></div>

2. An inline template already on the page

<template [component]="counter">
  <div [state]="{ count: 0 }">
    <button @click="count--">-</button>
    <span [text]="count"></span>
    <button @click="count++">+</button>
  </div>
</template>

3. A server-rendered partial
Your runtime sees [use]="counter" and asks the server for that component’s HTML.

So counter is really just a component name, and your framework decides where that component lives.

The cleanest mental model is:

[use]="counter" = “mount the component named counter here”
your framework resolves counter
resolution could point to a file, inline template, or server fragment

For a real project, I would usually recommend:

separate HTML files for reusable components
inline templates for tiny one-off components
server partials for data-heavy components

So yes, counter.html in a components folder is a good default, but it is not required.

A nice convention would be:

/components/
  counter.html
  modal.html
  tabs.html
/pages/
  home.html
  settings.html
/layouts/
  app.html

Then:

<div [use]="counter" [props]='{ start: 5 }'></div>

would mean “load the component named counter,” which your runtime resolves to /components/counter.html.

That is probably the best default convention.

So what if I had a header, content area, and a footer. I want all of these in components in a separate folder but I have layout file that dinanicly puts them together how would this work?

I’m grounding this in Datastar’s HTML/patch model, then I’ll map it into the header/content/footer layout you described.

Thought for 42s

Yes — this is exactly where a layout + component registry makes sense.

A clean setup would be:

/components
  header.html
  footer.html
  sidebar.html

/layouts
  app.html

/pages
  home.html
  dashboard.html
  settings.html

Then app.html is your shell, and it decides where the pieces go. Datastar already works well with this because it accepts normal HTML responses and morphs returned top-level elements into existing DOM nodes by matching IDs. It also preserves nested state better when important elements have stable IDs.

Example layouts/app.html:

<div id="app-shell">
  <div id="app-header" [use]="header"></div>

  <main id="app-content" [outlet]></main>

  <div id="app-footer" [use]="footer"></div>
</div>

Example components/header.html:

<div id="app-header-root" [state]="{ mobileMenuOpen: false }">
  <header>
    <button @click="mobileMenuOpen = !mobileMenuOpen">Menu</button>
    <nav [show]="!mobileMenuOpen">...</nav>
  </header>
</div>

Example components/footer.html:

<div id="app-footer-root">
  <footer>© 2026 My App</footer>
</div>

Example pages/home.html:

<div id="page-home">
  <h1>Home</h1>
  <p>Welcome</p>
</div>

How it works in practice:

The browser loads app.html.
Your runtime sees [use]="header" and [use]="footer".
It resolves those names to /components/header.html and /components/footer.html.
It injects those fragments into the matching placeholders.
It sees [outlet] and mounts the current page there, such as /pages/home.html.
Then your adapter rewrites your custom [] and @ syntax into Datastar syntax and lets Datastar handle reactivity and later patches. This last step is your framework layer; the rest is just HTML composition. Datastar’s own core role here is reactive signals, event handling, and HTML/SSE-driven patching.

The important design choice is this:

header and footer should usually stay mounted, while only the content outlet changes.

That gives you SPA behavior:

header state can persist
footer stays stable
only the page content swaps on navigation

That matches Datastar’s strengths, because it is very good at patching only the DOM region you target rather than forcing a full-page rerender. By default, Datastar morphs top-level elements by ID, so stable layout-region IDs are the right anchor points.

So your router would behave like this:

<nav>
  <a href="/" [route]>Home</a>
  <a href="/dashboard" [route]>Dashboard</a>
  <a href="/settings" [route]>Settings</a>
</nav>

When [route] is clicked, your runtime:

fetches the new page fragment
replaces only [outlet]
leaves header/footer alone
updates browser history

That part is your framework, not Datastar itself.

The simplest resolution rule for [use] is:

[use]="header" → /components/header.html
[use]="footer" → /components/footer.html
[use]="card.user-profile" → /components/card/user-profile.html

That gives you modularity without magic.

I would also add one convention:

every component file should have one stable root element with an id.

For example:

<div id="header-component">...</div>

That matters because Datastar’s patching model matches top-level elements by ID, and the docs recommend putting IDs on top-level elements and on inner elements whose state you want preserved.

So the full mental model is:

app.html = shell/layout composer
[use] = mount a named component from /components
[outlet] = mount the current page from /pages
[] and @ = your authoring syntax
your adapter = translates authoring syntax to Datastar syntax
Datastar = handles reactivity and DOM patching underneath

The strongest version of this for v1 is:

<div id="app-shell">
  <div id="header-slot" [use]="header"></div>
  <main id="content-slot" [outlet]></main>
  <div id="footer-slot" [use]="footer"></div>
</div>

That is simple, modular, and scales well.

The next thing to define is whether [use] loads components:

from static files directly in the browser, or
from a backend endpoint that returns the component HTML.
Why can't when we use something with [] it set the I'd to = to the name of the file so all we would need to write would be <div [use]="footer"></div>

I’m checking one Datastar detail and one HTML rule, because the real answer here is less “can’t” and more “what tradeoffs does that create?”

Thought for 22s

Yes — for singletons like header or footer, you absolutely can make [use]="footer" imply an ID automatically.

The reason I was hedging is that Datastar’s default HTML patching matches top-level elements by element ID, and HTML id values are supposed to be unique in the document.

So this is fine:

<div [use]="footer"></div>

Your framework can interpret that as:

load components/footer.html
assign a default mount ID based on the component name
inject the component there

For a singleton layout piece, that can simply become something like:

<div id="footer" [use]="footer"></div>

or your runtime can even set the ID automatically before mounting.

Where it becomes risky is when the same component appears more than once:

<div [use]="card"></div>
<div [use]="card"></div>

If both automatically become id="card", you now have duplicate IDs, and Datastar’s morphing-by-ID model becomes ambiguous. Datastar’s guide explicitly says text/html responses are morphed into the existing DOM based on the element IDs.

So the best rule is:

for layout singletons like header, footer, sidebar: auto-ID from the component name is great
for repeatable components like card, tab, modal, user-row: use the component name as a base, then generate a unique instance ID

For example:

<div [use]="footer"></div>

could become:

<div id="footer"></div>

But:

<div [use]="card"></div>
<div [use]="card"></div>

should become something like:

<div id="card-1"></div>
<div id="card-2"></div>

My recommendation would be:

Good default behavior

[use]="footer"
→ resolve footer.html
→ if no id is present, set id="footer" for singleton layout usage

Safer general behavior

[use]="footer"
→ resolve footer.html
→ if no id is present, set id="footer-<instanceId>"

Best compromise

Let authors omit the ID, but let the framework generate one:

<div [use]="footer"></div>

becomes internally:

<div id="footer__root_1"></div>

and for special layout slots you can let the layout itself provide the stable ID:

<div id="footer" [use]="footer"></div>

That is probably the strongest pattern, because then:

the layout controls stable patch targets
the component system still works for repeated components
Datastar always has unambiguous IDs to morph against

So the real answer is:

Yes, you can auto-set the ID from the file/component name.
I just would not do it as the final universal rule without also handling uniqueness.

For your header/content/footer layout, this is perfectly reasonable:

<div id="header" [use]="header"></div>
<main id="content" [outlet]></main>
<div id="footer" [use]="footer"></div>

And if you want the framework to infer those IDs when omitted, that is a good ergonomic feature.

Because wouldn't the id always be the file name?

I’m checking the HTML ID rule and Datastar’s patching rule together, because the answer is really “sometimes yes, but not always.”

Thought for 16s

Not always.

A file name like footer.html names the component type. An HTML id names a specific element instance in the current document, and HTML requires that id be unique within the document tree.

So this works great for singletons:

<div [use]="footer"></div>

Your framework can safely treat that like:

<div id="footer" [use]="footer"></div>

because there is usually only one footer.

But this breaks down for reusable components:

<div [use]="card"></div>
<div [use]="card"></div>

If both got id="card", you would have duplicate IDs, which is invalid HTML and makes targeting ambiguous.

It also matters because Datastar’s default HTML patching morphs top-level returned elements into the existing DOM based on element IDs, and its docs recommend putting IDs on top-level elements you want morphed.

So the right rule is:

Component name / file name = what to load, like footer
Element id = where this specific mounted instance lives, like footer, card-1, card-2

A good default framework behavior would be:

if [use]="footer" appears once in a layout, auto-set id="footer"
if [use]="card" appears multiple times, auto-generate id="card-1", id="card-2", etc.

So your instinct is right for things like header, footer, sidebar, and main-nav. For those, “ID equals file name” is a great default. It just cannot be the universal rule for every component.

Wouldn't that just render the same card twice? Which would be fine, because maybe you want the same card twice and you just want the content dinamic inside.

I’m checking the HTML ID rule and Datastar’s morphing behavior together, because your idea can work — it just changes how patching and targeting would have to behave.

Thought for 27s

Yes — reusing the same card template twice is totally fine.

The part that cannot be the same twice is the HTML id, not the component file.

So these are two different things:

card.html = the template/type
id="card-1" / id="card-2" = the specific mounted instances in the page

That distinction matters because HTML id values are supposed to be unique within a document, and Datastar’s default HTML patching/morphing matches elements by those IDs.

So this is good:

<div [use]="card" [props]='{ title: "First" }'></div>
<div [use]="card" [props]='{ title: "Second" }'></div>

Your framework can resolve both to the same card.html file, but mount them as different instances, like:

<div id="card-1"></div>
<div id="card-2"></div>

Then both can render the same component structure, just with different dynamic content. That is the normal and correct behavior. Datastar’s docs say the existing DOM must contain the matching element ID for morphing to work, and text/html patches are applied to existing elements based on IDs.

So your intuition is right:

same file twice: yes
same component type twice: yes
same content structure twice: yes
same DOM id twice: no

A good default rule would be:

[use]="footer" in a layout singleton → auto id footer
[use]="card" in repeatable usage → auto ids like card-1, card-2, card-3

That gives you the best of both worlds:

easy authoring
reusable components
dynamic content via props/state
unambiguous Datastar patch targets

So the refined rule should be:

the file name should be the component name, not always the final DOM id.

That is the cleanest model.

Ok so could you give me an example where the id would need to be different than the file name?

I’m pulling the exact HTML/Datastar rules again so I can show a concrete example instead of just describing it abstractly.

Thought for 25s

Yes. The clearest example is when you render the same component more than once on one page.

HTML requires id values to be unique in the document tree, and Datastar patches returned HTML into the existing DOM based on element IDs.

So imagine you have one reusable component file:

/components/card.html

and a page like this:

<div [use]="card" [props]='{ title: "Product A" }'></div>
<div [use]="card" [props]='{ title: "Product B" }'></div>
<div [use]="card" [props]='{ title: "Product C" }'></div>

All three should use the same file name: card.html.

But they cannot all use the same id:

<div id="card"></div>
<div id="card"></div>
<div id="card"></div>

That would duplicate IDs, which is invalid HTML and makes Datastar patch targeting ambiguous.

What you want instead is:

<div id="card-1"></div>
<div id="card-2"></div>
<div id="card-3"></div>

So:

card.html = the component type
card-1, card-2, card-3 = the mounted instances

A more real-world example:

<section>
  <div [use]="user-card" [props]='{ userId: 101 }'></div>
  <div [use]="user-card" [props]='{ userId: 102 }'></div>
  <div [use]="user-card" [props]='{ userId: 103 }'></div>
</section>

Same file:

/components/user-card.html

Different instance IDs:

<div id="user-card-101"></div>
<div id="user-card-102"></div>
<div id="user-card-103"></div>

That is the main case where the ID needs to be different from the file name.

Where filename = id works perfectly is for singletons:

<div [use]="header"></div>
<main [outlet]></main>
<div [use]="footer"></div>

Those can safely become:

<div id="header"></div>
<main id="content"></main>
<div id="footer"></div>

because there is usually only one of each. Datastar’s ID-based morphing fits that pattern very well.

So the best rule is:

singleton components: use file name as ID
repeatable components: use file name as the base, then append a unique instance suffix

A good automatic pattern would be:

header     -> header
footer     -> footer
card       -> card-1, card-2, card-3
user-card  -> user-card-101, user-card-102

That keeps authoring simple while still working with Datastar’s patch model.

If you want, I’ll show you the exact mounting rule your framework should use for [use] so it can auto-generate the right IDs.

I don't understand. What if you wanted the same card more than once on the same page? 

The easiest way to clear this up is to separate “the file/template” from “the actual rendered DOM element on the page.” I’m pulling the exact HTML and Datastar rules so I can show it with a concrete example.

Thought for 25s

Yes — and that is exactly the case where the file stays the same and only the instance IDs change.

Think of it like this:

card.html = the blueprint
each rendered card on the page = a separate instance

So if you want the same card three times, that is normal:

<div [use]="card" [props]='{ title: "A" }'></div>
<div [use]="card" [props]='{ title: "B" }'></div>
<div [use]="card" [props]='{ title: "C" }'></div>

All 3 use the same file: card.html.

But after mounting, the actual DOM should look more like:

<div id="card-1">...</div>
<div id="card-2">...</div>
<div id="card-3">...</div>

The reason is that HTML says an id must be unique within the document, and Datastar’s default morphing behavior patches elements by matching those IDs.

So the answer to your question is:

Yes, you can absolutely use the same card more than once on the same page.
What changes is not the file name.
What changes is the DOM id of each rendered copy.

A simple mental model:

file name = component type
id = specific copy of that component on this page

A real example:

<div [use]="card" [props]='{ productId: 101 }'></div>
<div [use]="card" [props]='{ productId: 102 }'></div>
<div [use]="card" [props]='{ productId: 103 }'></div>

All three use card.html, but your framework might auto-generate:

<div id="card-101">...</div>
<div id="card-102">...</div>
<div id="card-103">...</div>

That way:

same component file
same structure
different dynamic content
valid HTML
Datastar has a unique target for each patch

So your instinct was right: the same card can appear multiple times.
The only thing that cannot be duplicated is the final HTML id.

A good framework rule would be:

if the component appears once, id can default to the file name
if it appears multiple times, auto-generate file-name + unique suffix

That is probably the cleanest version of your system.

I don't understand. You would not want this because your CSS would be attached to one ID.
Thought for 28s

Exactly — and that is why you should not style reusable components by id.

That is the missing distinction:

id = unique internal handle for one specific DOM instance
class / component attribute = what CSS should usually target for reusable UI

So for something like a card component, the CSS should be attached to:

.card
or [component="card"]
or [data-component="card"]

not to #card.

Example:

Author writes
<div [use]="card" [props]='{ title: "A" }'></div>
<div [use]="card" [props]='{ title: "B" }'></div>
<div [use]="card" [props]='{ title: "C" }'></div>
Framework renders
<article id="__card_1" class="card" data-component="card">
  ...
</article>

<article id="__card_2" class="card" data-component="card">
  ...
</article>

<article id="__card_3" class="card" data-component="card">
  ...
</article>
CSS
.card {
  border-radius: 12px;
  padding: 1rem;
  border: 1px solid #ddd;
}

So all 3 cards get the same styling, because the CSS is attached to .card, not the ID.

The ID is only there for things like:

internal framework bookkeeping
patching one specific instance
DOM lookup
focus/anchor behavior
unique targeting when needed

That means your framework can treat IDs as internal implementation details, and authors never need to care about them.

So the better rule is:

never use id as the main styling mechanism for reusable components
use class names or component attributes for styling
let the framework generate unique IDs behind the scenes when needed

For your system, I would do this:

[use]="card" loads card.html
the root of card.html automatically gets:
class="card"
data-component="card"
a generated unique ID like __card_1

That gives you:

reusable CSS
multiple copies on the same page
internal uniqueness
no confusion for the author

So you were right to push back: if CSS depended on one ID, that would be a bad component model.

The fix is not “don’t use different IDs.”
The fix is: IDs are internal; styling is by class or component selector.

A very solid default for your framework would be:

<article class="card" data-component="card" id="__card_1">

That is probably the cleanest answer.

So we don't use the id to attach CSS anymore?
Thought for 5s

Right — for reusable components, you generally should not use id for CSS.

Use:

classes for reusable styling
optionally component attributes/selectors for framework-level styling
IDs only for unique one-off targets or internal framework behavior

A good rule of thumb:

class="card" → styling
[component="card"] or similar → framework/component targeting
id="__card_1" → internal unique instance handle

So for your framework:

<div [use]="card"></div>
<div [use]="card"></div>
<div [use]="card"></div>

might render to:

<article class="card" component="card" id="__card_1">...</article>
<article class="card" component="card" id="__card_2">...</article>
<article class="card" component="card" id="__card_3">...</article>

Then CSS would be:

.card {
  padding: 1rem;
  border-radius: 12px;
}

That styles all of them.

Use id for CSS only when the thing is truly unique, like:

#app
#header
#footer
#content

So the clean model is:

IDs = unique instances
classes/attributes = reusable styling

That is the direction your framework should take.

I don't understand. What if you don't want them to be different?

I see the confusion now. You’re talking about whether the rendered cards themselves should be treated as the same thing, not about the file name. I’m going to answer it with one concrete card example and separate styling from instance identity.

Thought for 22s

They can be not different visually at all.

What has to be different is only the internal DOM handle, not the appearance, CSS, or even the content.

Think of it like this:

component file = recipe
class = styling category
id = serial number for one physical copy

So you can absolutely have two cards that look identical and even contain the same content:

<div [use]="card"></div>
<div [use]="card"></div>

Your framework could render that to:

<article class="card" component="card" id="__card_1">
  <h3>Title</h3>
  <p>Same content</p>
</article>

<article class="card" component="card" id="__card_2">
  <h3>Title</h3>
  <p>Same content</p>
</article>

Those two cards are the same component, with the same CSS class, and can even have the same content. The only thing that differs is the id, because HTML requires id values to be unique in the document, and Datastar’s default patching matches top-level elements by ID.

So when you say “I don’t want them to be different,” that is fine. They do not need to be different in:

styling
structure
content
component file

They only need different IDs so the browser and Datastar can tell one rendered copy from another. CSS should be attached to the shared class or attribute selector, not the ID. Class selectors are meant to match multiple elements, while an ID selector targets one element.

The clean rule is:

same file: yes
same markup: yes
same CSS: yes
same content: yes
same id: no

A real-world analogy:

both cards can be the same exact “Card” component
but one is copy #1 and one is copy #2 internally

That internal uniqueness is mostly for the framework, not for you as the author.

The simplest way to think about your system is:

<div [use]="card"></div>
<div [use]="card"></div>

means:

“Render the same card component twice.”

Not:

“Make two different cards.”

The framework just quietly gives each rendered copy its own internal ID so patching works correctly.

This makes no sense! You would just write it like this...

#card ( color: green
)


<article class="card">
  <h3>Title</h3>
  <p>Same content</p>
</article>

<article class="card">
  <h3>Title</h3>
  <p>different content</p>
</article>
Thought for 15s

You’re right to push back.

In your example, you would not use id at all.

What you wrote is just normal reusable CSS:

.card {
  color: green;
}
<article class="card">
  <h3>Title</h3>
  <p>Same content</p>
</article>

<article class="card">
  <h3>Title</h3>
  <p>different content</p>
</article>

That is correct.

The issue is this:

#card means id="card"
.card means class="card"`

So if your HTML is:

<article class="card">

then the CSS should be:

.card { color: green; }

not:

#card { color: green; }

The real point is:

For styling repeated components, use classes.
Do not use IDs for styling repeated components.

Where IDs come in is only if the framework needs to uniquely target one specific rendered instance for:

patching
scrolling
focus
lookup
replacing one node and not another

So the corrected model is:

For CSS

Use classes:

<article class="card">...</article>
<article class="card">...</article>
For framework internals, only if needed

Optionally add hidden unique IDs:

<article class="card" id="__card_1">...</article>
<article class="card" id="__card_2">...</article>

Your CSS still stays:

.card { color: green; }

So the answer is:

You were right.
If all you care about is styling and rendering the same component multiple times, you would just use a class and not care about IDs.

The only reason I kept bringing up IDs is because Datastar patches by ID when doing certain DOM updates. But that is a framework/internal concern, not a styling concern.

So your framework should probably follow this rule:

repeated components: styled by class
IDs: only generated internally when patch targeting needs them
authors usually do not think about IDs at all

That is the clean version.

All I am saying is the class and id would always be the same because we always used # and . I erchangably

I see the disconnect now: you’re treating #card and .card as the same naming convention. I’m checking the exact HTML/CSS rules and Datastar’s patching behavior so I can map that cleanly into your framework.

Thought for 58s

Yes — and that is the real correction:

You can use the same base name everywhere, like card, but #card and .card are not interchangeable syntax in CSS.

.card matches elements whose class contains card.
#card matches the element whose id is exactly card.
An id is meant to identify a single element.

So when you say “the class and id would always be the same,” the best interpretation is:

the name can stay the same, but the selector type cannot.

Like this:

<article class="card">...</article>
<article class="card">...</article>
.card {
  color: green;
}

That is perfectly correct.

Where Datastar enters the picture is separate: its patch examples patch returned HTML into existing DOM elements by matching the target element’s id.

So the clean framework rule is:

Author-facing code:

<div [use]="card"></div>
<div [use]="card"></div>

Rendered DOM:

<article class="card" id="__card_1">...</article>
<article class="card" id="__card_2">...</article>

Author CSS:

.card {
  color: green;
}

That means:

you style by .card
the framework may secretly add unique IDs if Datastar needs them
you do not have to think about those IDs

So the answer is: you were right about the styling model. For reusable components, you should think in terms of .card, not #card. The only mistake was treating # and . as the same operator. They can share the same word, like card, but they do different jobs.

If you want, the rule for your framework can simply be:

component name = card
CSS selector = .card
internal runtime ID = hidden/generated only when needed

That keeps your authoring model simple.

You are wrong! The same rendered card id would still be the same if you wanted the same card! And you could have the same card as many times as you want in the same state (id) as you want.

I’m checking the exact HTML rule and Datastar’s targeting model, because there are two separate questions here: what the browser allows versus what’s valid and reliable for updates.

Thought for 23s

I get what you mean now: you’re saying “these are the same kind of card and maybe even the same shared state,” not “style them differently.”

On that narrower point, the browser will still render duplicate IDs. But in HTML, id is defined to be a single identifier that must be unique within the entire document, and its purpose is to identify one element for linking, scripting, or styling.

So the issue is not “can two green cards exist?” They can. The issue is that these two things are different concepts:

component/type identity: “this is a card”
DOM element identity: “this exact node in the page”

If you want two cards that are the same component and even share the same state, that is fine. But giving both the same id="card" makes DOM targeting ambiguous, and Datastar’s default HTML patching works by morphing returned top-level HTML into the existing DOM based on element IDs. It even says the DOM must contain the element with that ID for morphing to work.

So this is the real problem case:

<article id="card" class="card">A</article>
<article id="card" class="card">B</article>

Now ask: when Datastar receives <article id="card">Updated</article>, which one should it patch? That is exactly why duplicate IDs are a bad fit for Datastar’s default morph-by-id model.

What you probably want instead is:

same component name: card
same styling hook: .card
optionally same shared state source
but different DOM instance identity

Example:

<article class="card" data-component="card" id="card-1">A</article>
<article class="card" data-component="card" id="card-2">B</article>

And if both should reflect the same state, they can still do that by binding to the same shared store/signal rather than by sharing the same DOM id. The id is for the node; the state source is a separate concern. The HTML standard and MDN both treat id as a single-element identifier, not a “same-component grouping” mechanism.

So the correction is:

You were right that same card type can appear many times.
You were right that same styling should just use .card.
But same id for multiple rendered copies is still invalid HTML and conflicts with how Datastar’s default patch targeting works.

The clean model for your framework is:

[use]="card" means “mount the card component”
.card styles every card
shared state, if desired, comes from a shared signal/store
unique DOM IDs are generated only for patching/instance targeting when needed

That preserves your authoring style without fighting the browser or Datastar.

Ok, so let's say we wonrnt using any framework, how old you write 3 of the same cards?

I’m going to show it in plain HTML/CSS first, with no framework, because that makes the distinction much easier to see.

Thought for 22s

Like this:

<article class="card">
  <h3>Title</h3>
  <p>First card</p>
</article>

<article class="card">
  <h3>Title</h3>
  <p>Second card</p>
</article>

<article class="card">
  <h3>Title</h3>
  <p>Third card</p>
</article>

And the CSS:

.card {
  color: green;
  border: 1px solid #ccc;
  padding: 1rem;
  border-radius: 12px;
}

That is the normal way to write 3 of the same kind of card in plain HTML/CSS:

same class
no id needed at all

That works because class is meant for reusable styling across multiple elements, while id is meant to identify a single element and must be unique in the document.

So if you are not targeting one exact card for scripting, linking, or patching, you usually just do this:

repeated UI → class="card"
one unique element → id="something-unique"

If later you needed to target one specific card with JavaScript, you could add a unique id or a data attribute to just that one card. But for plain repeated rendering, your example with the shared class is the right pattern.

So in your framework, [use]="card" repeating multiple times should conceptually behave like “render this same card template multiple times with the same class,” not “force authors to think about IDs.”

But you could also do....

#card {
  color: green;
  border: 1px solid #ccc;
  padding: 1rem;
  border-radius: 12px;
}

It's has always been like that! You never needed an ID.

I see the exact mix-up now. I’m checking the CSS selector docs so I can answer this with the shortest possible correction and not talk past you again.

Thought for 17s

You’re right about the first half:

You do not need an id to style repeated cards. A class is the normal way to do that.

But the one thing that is still wrong is this exact pairing:

#card { ... }

with

<article class="card">...</article>

That will not match, because #card is an ID selector and only matches an element with id="card", while .card is a class selector and matches elements with class="card".

So these are the correct pairings:

.card { color: green; }
<article class="card">...</article>
<article class="card">...</article>
<article class="card">...</article>

That is the standard reusable pattern.

And this is the ID version:

#card { color: green; }
<article id="card">...</article>

That targets one element identified by id="card". MDN describes the purpose of id as identifying a single element, and the ID selector matches the element whose id exactly matches the selector value.

So the clean takeaway for your framework is:

repeated components like cards → style with .card
#card only when you actually have id="card"
authors usually should think in terms of class names, not IDs, for reusable pieces.

You were absolutely right that “you never needed an ID” for repeated card styling. The only correction is that in CSS, #card and .card are not interchangeable.

If you want, I’ll rewrite the whole framework idea from this point forward using only class-based component styling so it matches how you actually think about it.

Class and id were always the same back in the day!!!!! There was no id.

I see what you’re getting at now. I’m going to answer this at the level of your authoring model, not keep forcing raw HTML internals into it.

Thought for 48s

I was overcomplicating it.

If by “back in the day” you mean the authoring mental model was just one shared name like card, then yes — that is the model you should use for your framework.

But in actual HTML/CSS, class and id are different things:

class is a list of reusable class names and is what CSS commonly uses to style many elements.
id identifies a single element and must be unique in the document; #card targets id="card", while .card targets class="card".

So for your framework, the right rule is simply:

component name: card
styling hook: .card
author never thinks about IDs

Example:

<div [use]="card"></div>
<div [use]="card"></div>
<div [use]="card"></div>

renders to something conceptually like:

<article class="card">...</article>
<article class="card">...</article>
<article class="card">...</article>

with CSS:

.card {
  color: green;
  border: 1px solid #ccc;
  padding: 1rem;
  border-radius: 12px;
}

That is the model you want.

So the clean takeaway is:

you were right to think in terms of one shared name for the component.
The only correction is that in real CSS, that shared reusable name should be a class selector like .card, not #card.

For your framework, I would stop talking about IDs entirely unless the runtime needs them internally.

Back in the day we never used . We all ways used #

I get where you’re coming from! In the early days of simpler web development, a lot of folks used IDs and styled them directly because each element felt more unique. But as websites grew more complex, using classes became the standard because classes let you reuse styles across multiple elements. IDs are

All I am saying is we never used that!!! We always pared class with #.

I see the disconnect now: you’re talking about your old authoring habit or team convention, not the CSS standard itself. I’m checking the CSS/HTML definitions so I can answer that directly and stop talking past you.

Thought for 15s

Got it — you’re talking about a naming convention you used, not the CSS standard.

If your old habit was “the thing is named card, and we mentally treated that as the selector name,” that is fine as a framework convention. But in actual CSS syntax, #card and .card have never meant the same thing: .card matches elements by their class attribute, while #card matches an element by its id attribute.

So the clean way to map your preference into this framework is:

component name: card
author thinks in one shared name: card
framework decides the actual DOM wiring

That means you can absolutely keep the mental model of “everything is just card,” and your framework can turn that into repeated rendered elements that all share the same reusable styling hook. In HTML/CSS terms, reusable styling belongs on class, while id is for identifying a single element.

So for your framework, I would stop arguing about # versus . at the authoring level and just define one rule:

<div [use]="card"></div>
<div [use]="card"></div>
<div [use]="card"></div>

means “render the card component three times.”

Then your framework can output whatever DOM convention you want under the hood. The important part is that the component name stays card. Reusable CSS in the browser still works through classes, even if your author-facing system hides that detail.

So the real conclusion is:

You were arguing for one shared component name.
And on that point, yes — your framework should absolutely work that way. The browser’s raw # and . rules are just an implementation detail underneath.

Wrong! We didn't always have IDs, we always hand classes. And in the beginning all we had was #. This is how I know your wrong.

I’m checking the original CSS selector docs so I can answer the history point directly, not just argue terminology.

Thought for 24s

I think we’re talking about two different things:

Your personal/team workflow may absolutely have leaned on #name everywhere. I’m not disputing your experience.

But in the CSS language itself, . and # were already different from the beginning. The original CSS1 spec from 1996 includes both “Class as selector” and “ID as selector” as separate concepts, and MDN still defines them the same way today: .card is a class selector, #card is an ID selector.

So the cleanest way to say it is:

If your old convention was “we named things card and thought of that as one selector name,” that’s fine.
But in actual CSS syntax, #card has never meant “class card.” It has meant “the element whose id is card.” .card has meant “elements with class card.”

That’s why I was separating your framework’s authoring model from raw CSS internals.

For your framework, we can just define:

component name = card
authors think in one shared name = card
framework emits whatever DOM/CSS hooks it needs under the hood

So we can stop arguing about # vs . at the framework design level and just say:

<div [use]="card"></div>
<div [use]="card"></div>
<div [use]="card"></div>

means “render the card component three times.”

That matches what you want.

Right me just a regular HTML page with a nav bar.
Thought for 9s

Here’s a simple plain HTML page with a nav bar:

<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Simple Page</title>
  <style>
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      font-family: Arial, sans-serif;
      background: #f4f4f4;
      color: #222;
    }

    nav {
      background: #222;
      padding: 1rem 2rem;
    }

    .nav-container {
      max-width: 1100px;
      margin: 0 auto;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .logo {
      color: #fff;
      font-size: 1.25rem;
      font-weight: bold;
      text-decoration: none;
    }

    .nav-links {
      list-style: none;
      display: flex;
      gap: 1.5rem;
    }

    .nav-links a {
      color: #fff;
      text-decoration: none;
      font-size: 1rem;
    }

    .nav-links a:hover {
      text-decoration: underline;
    }

    main {
      max-width: 1100px;
      margin: 3rem auto;
      padding: 0 2rem;
    }

    h1 {
      margin-bottom: 1rem;
    }

    p {
      line-height: 1.6;
    }
  </style>
</head>
<body>
  <nav>
    <div class="nav-container">
      <a href="#" class="logo">MySite</a>
      <ul class="nav-links">
        <li><a href="#">Home</a></li>
        <li><a href="#">About</a></li>
        <li><a href="#">Services</a></li>
        <li><a href="#">Contact</a></li>
      </ul>
    </div>
  </nav>

  <main>
    <h1>Welcome</h1>
    <p>
      This is a simple HTML page with a navigation bar and a content section.
    </p>
  </main>
</body>
</html>

I can also make it look more modern or add a mobile hamburger menu.

Do you see no where in your HTML do you have "id"!!!! And nav and body don't have a "." In front of it and are associated with the class names!!!! You just proved yourself wrong.
Thought for 9s

Yes — you’re right, and this is the clean correction.

In that HTML page:

nav and body are styled by element selectors
.nav-container, .logo, .nav-links are styled by class selectors
there is no id at all
and the page works perfectly

So the important point is:

You do not need IDs to build or style pages.
I was wrong to keep centering the discussion on IDs.

What that example proves is:

one-off structure can be styled by element names like nav, body, main
reusable pieces can be styled by classes like .card, .nav-links
id is optional, not required

So for your framework, the better rule is:

[use]="card" loads the card component
the rendered component can just have class="card"
the CSS can just use .card
no id is needed unless you specifically want one for some separate reason

That means this is totally valid:

<div [use]="card"></div>
<div [use]="card"></div>
<div [use]="card"></div>

and it could render to:

<article class="card">
  <h3>Title</h3>
  <p>First card</p>
</article>

<article class="card">
  <h3>Title</h3>
  <p>Second card</p>
</article>

<article class="card">
  <h3>Title</h3>
  <p>Third card</p>
</article>

with:

.card {
  color: green;
  border: 1px solid #ccc;
  padding: 1rem;
  border-radius: 12px;
}

That matches what you’ve been saying.

So the corrected framework idea is:

use element selectors where it makes sense
use class selectors for reusable components
do not require IDs as part of the normal authoring model

You were right to call that out.

The point is all the IDs are implied as the same as the class name unless spesafted.
Thought for 28s

Yes — as a framework rule, that works.

What you’re defining is:

the component name is the canonical name
the class name defaults to that same name
the id/logical identity is also assumed to be that same name unless explicitly overridden

So in your system:

<div [use]="card"></div>

would mean:

load card.html
render the card component
treat card as the default name everywhere unless you specify otherwise

That is a perfectly reasonable authoring rule.

So the output could simply be:

<article class="card">
  <h3>Title</h3>
  <p>Content here</p>
</article>

No explicit id needed.

And for layout pieces:

<div [use]="header"></div>
<div [use]="footer"></div>

means:

component name = header / footer
default class = header / footer
default implied identity = header / footer

So yes — the important idea is:

the name is implied everywhere unless specified otherwise.

That is the framework convention.

A clean rule set would be:

[use]="card" → uses card.html
root element gets class="card" by default
same implied name is used for lookup, styling, and component identity
only override when needed, like:
[use]="card" [as]="featured-card"
or [class]="special-card"

So the authoring model becomes very simple:

<div [use]="card"></div>
<div [use]="card"></div>
<div [use]="footer"></div>

and the framework just knows:

card means the card component
footer means the footer component
those names are the defaults unless the author changes them

That is a strong convention and much closer to what you’ve been describing the whole time.

No, not mine in regular HTML. If the id is not defined it stays the same unless defined differently. If it didn't follow this rule by default than CSS and HTML would be crazy to write!

I’m going straight to the HTML/CSS definitions here, because this specific point is about what the browser actually does by default.

Thought for 32s

No — in regular HTML, if an element does not have an id attribute, then it simply has no id. The browser does not automatically make the id equal to the class name, tag name, or anything else. MDN describes id as an attribute used to identify a single element, and CSS #foo only matches an element whose id is actually foo.

What keeps HTML/CSS from being chaotic is that CSS has different selector types for different jobs:

nav is a type selector and matches <nav> elements.
.card is a class selector and matches elements whose class includes card.
#card is an ID selector and matches the element whose id is exactly card.

So in this HTML:

<nav class="main-nav"></nav>
<article class="card"></article>

these selectors match:

nav { ... }        /* matches the <nav> */
.main-nav { ... }  /* matches the <nav> */
.card { ... }      /* matches the <article> */
#card { ... }      /* matches nothing here */

#card matches nothing because there is no id="card" in that markup. That is just how CSS is defined.

And on the HTML side, class and id are separate global attributes: class is a list of class names that can be reused across many elements, while id is for identifying a single element in the document.

So the precise correction is:

if id is omitted, it does not “stay the same”
it just does not exist
CSS still stays manageable because you can target by element name, class, or id, depending on what you want

Your bigger framework idea still works fine, though: you can define a convention where [use]="card" implies the canonical component name is card, and then your framework can choose to emit .card for styling hooks by default. That would be your framework’s rule, not regular HTML’s default behavior.

Yes it does because in your example, . nav-links is   <ul class="nav-links">
Thought for 18s

Right — and that proves the opposite of what you were saying.

.nav-links matches this:

<ul class="nav-links">

because the element has a class of nav-links.

It does not mean the id is also nav-links.

These are different:

<ul class="nav-links"></ul>

matches:

.nav-links { }

But this:

#nav-links { }

would not match that HTML, because there is no:

<ul id="nav-links">

So the actual rule in regular HTML/CSS is:

.name matches class="name"
#name matches id="name"
name matches the tag itself, like nav or body

That is why this worked:

.nav-links { ... }

with:

<ul class="nav-links">

not because an id was implied, but because the class was explicitly there.

So your earlier navbar example breaks down like this:

nav { ... }              // matches <nav>
body { ... }             // matches <body>
.nav-container { ... }   // matches class="nav-container"
.logo { ... }            // matches class="logo"
.nav-links { ... }       // matches class="nav-links"

No IDs involved at all.

The clean correction is:

If class is present, .class-name works.
If id is present, #id-name works.
Nothing is automatically copied from one to the other.

You were right that .nav-links worked because of class="nav-links".
That part is exactly correct.

Your saying .nav-links is an id because it has a "." Well you defined it as a class! So eather it has an implied id that is the same which means your wrong or "." Implyes a class and your still wrong.

I see exactly where the misunderstanding is. I’m going to answer this with one direct rule and one tiny example so we stop looping.

Thought for 33s

You’re right. . implies a class selector, not an ID selector.

So in this pair:

<ul class="nav-links"></ul>
.nav-links { ... }

the . means “match the class attribute,” not “match an implied ID.” MDN defines class selectors as matching elements based on the contents of their class attribute.

And #nav-links would only match this:

<ul id="nav-links"></ul>

because # is an ID selector and matches the id attribute.

So the correction is simple:

.nav-links → class
#nav-links → id
no implied id exists

I was wrong earlier when I kept dragging IDs into the example.

All I am saying is back in the early 2000s we would use # then later just the word but never a "." with our CSS and it always worked with class= so eather it was always implied or # is not for id. Eather way you are wrong.

I’m checking the historical CSS spec directly, because this one comes down to what CSS actually meant at the time versus what might have appeared to work in old browser setups.

Thought for 1m 3s

You’re right that I muddied this, and you were right to call it out.

But on the specific history point, the CSS language itself has always treated these as different selectors:

.card matches class="card"
#card matches id="card"

That was already true in the original CSS1 spec from 1996, which literally has separate sections for “Class as selector” and “ID as selector.”

So this:

#card { color: green; }

does not target:

<div class="card"></div>

under standard CSS rules. It only targets:

<div id="card"></div>

Where I agree with you is this: I was wrong to keep dragging id into the framework discussion. For your framework, the clean authoring model is to think in terms of the component name and the class hook, not id.

So the practical rule for your system should be:

<div [use]="card"></div>
<div [use]="card"></div>
<div [use]="card"></div>

renders cards with a shared styling hook like class="card", and authors do not have to care about IDs.

If old code you remember seemed to make #card work with class="card", then either the element also had id="card", the selector in the real stylesheet was different than remembered, or browser/tooling quirks made it look that way. But that behavior was not the CSS standard.

Id and class always worked with # or just the word, so that would mean the id is implied the same or the HTML that you wrote earlier would not work!

I’m verifying this against the CSS/HTML specs directly so I can answer the exact claim instead of arguing from memory.

Thought for 31s

I see the exact mix-up.

No — standard CSS has never treated #card as matching class="card". The CSS1 spec from 1996 already separates class selectors from ID selectors, and MDN still defines them the same way today: .card matches the class attribute, while #card matches the id attribute exactly.

So these are different:

<div class="card"></div>
<div id="card"></div>
.card { color: green; }   /* matches the first one */
#card { color: green; }   /* matches the second one */

MDN is explicit that the class selector matches elements based on the contents of their class attribute, and the ID selector matches an element based on the value of its id attribute.

Also, HTML does not imply an id from the class name. If an element has no id, then it has no id. The id attribute must be unique in the document, while class is a whitespace-separated list of classes.

What likely made old code “feel” like it worked is that CSS has three different selector kinds that often get mixed together:

nav targets the element/tag
.nav-links targets the class
#nav-links targets the id

So in my earlier example:

<ul class="nav-links"></ul>

this works:

.nav-links { ... }

but this does not match that element:

#nav-links { ... }

because there is no id="nav-links" on it.

So the corrected bottom line is:

# was and is for id
. was and is for class
a bare word like nav is for the element name
no id is implied from class in regular HTML/CSS

If you want, I’ll drop the framework discussion entirely and show a tiny 2000s-style HTML/CSS page with all three selector types side by side so you can see exactly what matches what.

Then how did your CSS work with the HTML you wrote! Be cause you don't define an id!!!!!!
Thought for 12s

Because I didn’t use an ID selector in that example.

The CSS worked for these reasons:

body { ... }
nav { ... }
.nav-container { ... }
.logo { ... }
.nav-links { ... }
.nav-links a { ... }

and the HTML was:

<body>
  <nav>
    <div class="nav-container">
      <a href="#" class="logo">MySite</a>
      <ul class="nav-links">
        ...
      </ul>
    </div>
  </nav>
</body>

So the matches were:

body { ... } matches <body>
nav { ... } matches <nav>
.nav-container { ... } matches <div class="nav-container">
.logo { ... } matches <a class="logo">
.nav-links { ... } matches <ul class="nav-links">

There was no #something selector in that CSS at all.

That is why it worked without any id.

The three selector types are:

nav        /* element selector */
.nav-links /* class selector */
#nav-links /* id selector */

So this works:

<ul class="nav-links"></ul>

with:

.nav-links { ... }

But this would only work:

#nav-links { ... }

if the HTML were:

<ul id="nav-links"></ul>

So the reason my earlier page worked is simply:

I used element selectors and class selectors, not ID selectors.

That’s the whole thing.

Ok, so what are all the IDs for all of these?
Thought for a few seconds

None of them have IDs.

In the HTML I wrote earlier:

<body>
  <nav>
    <div class="nav-container">
      <a href="#" class="logo">MySite</a>
      <ul class="nav-links">
        ...
      </ul>
    </div>
  </nav>
</body>

the IDs are:

<body> → no id
<nav> → no id
<div class="nav-container"> → no id
<a class="logo"> → no id
<ul class="nav-links"> → no id

The CSS worked because I used:

body → element selector
nav → element selector
.nav-container → class selector
.logo → class selector
.nav-links → class selector

So the answer is: there were zero IDs in that example.

So if I had a card element (same as nav-links) why would it need an id spesafted at all??
Thought for 7s

It wouldn’t.

You are right.

A card element, used like nav-links, does not need an id at all if:

you are styling it with a class
you are not uniquely targeting one specific instance
you are not linking to it directly
you are not using it as a special JS/framework patch target

So this is completely normal:

<article class="card">
  <h3>Title</h3>
  <p>First card</p>
</article>

<article class="card">
  <h3>Title</h3>
  <p>Second card</p>
</article>

<article class="card">
  <h3>Title</h3>
  <p>Third card</p>
</article>

with:

.card {
  color: green;
  border: 1px solid #ccc;
  padding: 1rem;
  border-radius: 12px;
}

No id needed.

So for your framework, the normal rule should be:

[use]="card" loads card.html
the root gets class="card" by default
no id is required unless you explicitly want one

That matches exactly what you’ve been saying.

The only time an id would matter is for something special, like:

a unique layout area
an anchor target
a one-off script lookup
a framework patch target

But for normal repeated components like cards, tabs, nav items, lists, panels, and so on: class is enough.

So no you don't need to do this in HTML...

<article class="card" data-component="card" id="card-1">A</article>
<article class="card" data-component="card" id="card-2">B</article>

I’m going to answer this plainly and tie it back to normal HTML, because that’s the real issue you’ve been pointing at.

Thought for 20s

Correct — you do not need to write that.

For normal HTML, this is perfectly fine:

<article class="card">A</article>
<article class="card">B</article>

Use a shared class for repeated styling. An id is only for identifying a single specific element and is supposed to be unique in the document.

So for your framework, a normal repeated component can just render like:

<article class="card">A</article>
<article class="card">B</article>

You would only add something like id, data-component, or another attribute if your framework specifically needs it for routing, patching, lookup, anchors, or some other internal behavior. HTML itself does not require it.

I could also use that same id somewhere else on the page if I wanted it to be the same also. So this means in HTML we don't need to define our IDs as different in less we want them to be different. So we could just use [name] for class="name" and #name for id="name"
Thought for 20s

Yes — for your framework syntax, that is a clean rule:

[name] → class="name"
#name → id="name"

Example authoring:

<article [card]>A</article>
<article [card]>B</article>
<section #main-content></section>

Framework output:

<article class="card">A</article>
<article class="card">B</article>
<section id="main-content"></section>

That part works well.

The only place I need to correct the HTML claim is this:

In real HTML, duplicate ids are not a good default.
Browsers will still render them, but id is supposed to identify one element. So:

<div id="card"></div>
<div id="card"></div>

may appear on screen, but it creates ambiguous behavior for:

JS lookups
anchor links
label/aria relationships
CSS #card
any framework targeting one exact node

So the safe rule is:

use [card] for repeated things
use #card only when you want one specific element to have id="card"

That gives you a really nice mental model:

<header [header]></header>
<main #content></main>
<footer [footer]></footer>

<article [card]>A</article>
<article [card]>B</article>
<article [card]>C</article>

becomes:

<header class="header"></header>
<main id="content"></main>
<footer class="footer"></footer>

<article class="card">A</article>
<article class="card">B</article>
<article class="card">C</article>

So the cleaned-up answer is:

Yes: [name] for class is a strong idea
Yes: #name for id is a strong idea
No: duplicate real HTML ids should not be the default
Yes: repeated components should normally just use [card]

That is probably the best syntax you’ve landed on so far.

And we also have @
Thought for 9s

Yes — that gives you a very clean system:

[name] for class-like/component markers
#name for id
@event for events

So your authoring model could be:

<header [header]>
  <nav [nav]>
    <a [logo] href="/">MySite</a>
    <ul [nav-links]>
      <li><a href="/">Home</a></li>
      <li><a href="/about">About</a></li>
    </ul>
  </nav>
</header>

<main #content>
  <article [card] @click="openCard()">
    <h3 [card-title]>Title</h3>
    <p [card-body]>Body text here.</p>
  </article>

  <article [card] @click="openCard()">
    <h3 [card-title]>Another Title</h3>
    <p [card-body]>More text here.</p>
  </article>
</main>

<footer [footer]>
  Footer text
</footer>

That could map to normal HTML concepts like:

[card] → class="card"
[card-title] → class="card-title"
#content → id="content"
@click="openCard()" → your runtime event binding

So your syntax language becomes:

[] = structure / styling / component markers
# = unique target
@ = behavior

That is actually a strong system because it is easy to read:

“what is this?” → [card]
“is this unique?” → #content
“what does it do?” → @click

A really clean v1 set could be:

[name]          -> class="name"
#name           -> id="name"

@click=""
@input=""
@change=""
@submit=""

And if you want reactive bindings too, you could extend it like:

[state]="{ count: 0 }"
[text]="count"
[show]="isOpen"
[bind]="email"
[if]="loggedIn"
[each]="item in items"
[use]="card"

So the full language becomes:

[card] for class/component naming
[text], [show], [bind], [state] for reactive directives
#content for IDs
@click for events

That is coherent.

The strongest version so far is probably:

<div [card] [state]="{ count: 0 }">
  <button @click="count--">-</button>
  <span [text]="count"></span>
  <button @click="count++">+</button>
</div>

That feels clean, compact, and easy to author.

How could we do dinamic templates?
Thought for 27s

The clean way is to treat a template as just HTML plus a scope.

So “dynamic templates” in your system would mean:

load a template by name
give it props/state
clone it into the page
let your runtime process [ ], #, and @

That means you do not need a compiler. You need a runtime template loader + binder.

A good model would be this.

1. Static template include

Page:

<div [use]="card"></div>

Your runtime reads [use]="card" and loads card.html.

card.html:

<article [card]>
  <h3>Title</h3>
  <p>Body text</p>
</article>

That is the simplest template include.

2. Dynamic template include

You can make the template name itself reactive:

<div [use]="currentTemplate"></div>

with state:

<div [state]="{ currentTemplate: 'card' }">
  <div [use]="currentTemplate"></div>
</div>

Then if currentTemplate changes to "hero", your runtime swaps in hero.html.

So [use] can accept:

a literal template name
or an expression that resolves to one

Example:

<div [state]="{ view: 'profile-card' }">
  <div [use]="view"></div>
</div>
3. Props into templates

You will want props almost immediately.

Page:

<div [use]="card" [props]="{ title: 'Hello', body: 'This is a card.' }"></div>

card.html:

<article [card]>
  <h3 [text]="props.title"></h3>
  <p [text]="props.body"></p>
</article>

Your runtime does this:

load card.html
create a local scope
inject props
bind [text]

So every template gets access to:

props
local [state]
parent state if you allow inheritance
4. Local state inside templates

Templates should be able to define their own state:

counter.html:

<article [counter] [state]="{ count: props.start || 0 }">
  <button @click="count--">-</button>
  <span [text]="count"></span>
  <button @click="count++">+</button>
</article>

Page:

<div [use]="counter" [props]="{ start: 5 }"></div>
<div [use]="counter" [props]="{ start: 10 }"></div>

Now both use the same file, but each mounted copy has its own local state.

That is one of the biggest wins of your system.

5. Conditional templates

You can do this two ways.

Option A: switch the whole template
<div [use]="loggedIn ? 'dashboard' : 'login'"></div>
Option B: use [if] inside a template
<section [if]="loggedIn">
  <h2>Dashboard</h2>
</section>

<section [if]="!loggedIn">
  <h2>Please log in</h2>
</section>

Option A is better when the whole component changes.
Option B is better when only part of the markup changes.

6. Repeating templates

This is where dynamic templates get really powerful.

<div [state]="{ products: [{ name: 'A' }, { name: 'B' }, { name: 'C' }] }">
  <template [each]="product in products">
    <div [use]="product-card" [props]="product"></div>
  </template>
</div>

product-card.html:

<article [product-card]>
  <h3 [text]="props.name"></h3>
</article>

So [each] repeats the template for every item, and [use] mounts a real component for each one.

That gives you React-like repeated rendering without JSX.

7. Slots / content projection

If you want layout templates to assemble other pieces, add slots.

layout.html:

<div [layout]>
  <header [slot]="header"></header>
  <main [slot]="content"></main>
  <footer [slot]="footer"></footer>
</div>

Page:

<div [use]="layout">
  <template [fill]="header">
    <div [use]="header"></div>
  </template>

  <template [fill]="content">
    <div [use]="home-page"></div>
  </template>

  <template [fill]="footer">
    <div [use]="footer"></div>
  </template>
</div>

That lets one template dynamically compose other templates.

This is how your header/content/footer layout should work.

8. Inline templates and file templates

You should support both.

Separate file
<div [use]="card"></div>

loads /components/card.html

Inline
<template #card>
  <article [card]>
    <h3>Inline card</h3>
  </article>
</template>

<div [use]="card"></div>

So [use] first checks:

inline registry
loaded cache
fetch from file

That gives you flexibility.

9. The runtime steps

This is really the whole engine:

scan DOM for [use]
resolve template name
load template HTML
clone it
build local scope from [props] and [state]
process nested bindings:
[text]
[if]
[each]
@click
[show]
[bind]
insert into DOM
watch dependencies and update only what changed

That is your dynamic template system.

10. The syntax I would recommend

This feels consistent with what you’ve been building:

[name]              -> class="name"
#name               -> id="name"

[use]="card"        -> mount named template
[props]="{ ... }"   -> pass props
[state]="{ ... }"   -> local state
[text]="title"      -> text binding
[html]="body"       -> html binding
[show]="open"       -> show/hide
[if]="loggedIn"     -> conditional render
[each]="item in items" -> repetition
[slot]="content"    -> slot target
[fill]="content"    -> slot content

@click="..."
@input="..."
@change="..."
@submit="..."

That is enough for a real first version.

11. A full example

Page:

<div [state]="{ page: 'home-page', user: { name: 'Sarah' } }">
  <div [use]="app-layout">
    <template [fill]="header">
      <div [use]="site-header"></div>
    </template>

    <template [fill]="content">
      <div [use]="page" [props]="{ user: user }"></div>
    </template>

    <template [fill]="footer">
      <div [use]="site-footer"></div>
    </template>
  </div>
</div>

home-page.html:

<section [home-page]>
  <h1>Hello, <span [text]="props.user.name"></span></h1>
</section>

That is dynamic:

the layout is templated
the content template is chosen from state
props are passed in
everything stays HTML-native

The shortest answer is:

Dynamic templates = [use] + [props] + [state] + [if] + [each] + slots.

That gives you a real templating system without a compile step.

I can sketch the exact runtime API next, including how [use], [each], and slots would be implemented.

What about all the ones replaceing data- whatever?

I’m checking Datastar’s attribute list so I can map your [] replacements cleanly instead of hand-waving names that don’t exist.

Thought for 22s

Those are the ones your layer would map.

Datastar already gives you the real runtime primitives: data-signals, data-bind, data-text, data-show, data-computed, data-attr:*, and data-on:*, and those attributes can contain Datastar expressions. Datastar walks the DOM, applies attributes in DOM order, and reapplies them after DOM patches.

So your syntax can simply be a nicer authoring face over those.

A clean mapping would be:

[state]      -> data-signals
[text]       -> data-text
[show]       -> data-show
[bind]       -> data-bind
[html]       -> data-html
[computed]   -> data-computed
[indicator]  -> data-indicator

[attr.foo]   -> data-attr:foo
[class.open] -> data-class:open

@click       -> data-on:click
@input       -> data-on:input
@change      -> data-on:change
@submit      -> data-on:submit

That keeps your language small and readable while still landing on Datastar’s actual feature set. data-bind, data-text, data-show, data-computed, and data-attr:* are all real Datastar attributes, and data-on:* is the standard event hook.

So this:

<div [state]="{ count: 0 }">
  <button @click="count--">-</button>
  <span [text]="count"></span>
  <button @click="count++">+</button>
</div>

would become something like:

<div data-signals="{ count: 0 }">
  <button data-on:click="count--">-</button>
  <span data-text="count"></span>
  <button data-on:click="count++">+</button>
</div>

That is the basic idea: your runtime rewrites the author syntax, then Datastar does the real work. Datastar expressions are evaluated from those attributes, so your values can still be reactive expressions rather than just literals.

I’d separate your syntax into three buckets:

[card]          -> class="card"
#content        -> id="content"

[state]         -> reactive state
[text]          -> reactive output
[show]          -> conditional visibility
[bind]          -> two-way binding
[computed]      -> derived state
[attr.aria-hidden] -> reactive attribute
[class.open]    -> reactive class toggle

@click          -> event binding
@input          -> event binding
@change         -> event binding

That gives you:

[] for structure and reactive directives
# for explicit IDs
@ for behavior

A good v1 list would be:

[name]                -> class="name"
#name                 -> id="name"

[state]="..."
[text]="..."
[html]="..."
[show]="..."
[bind]="..."
[computed:name]="..."
[attr:name]="..."
[class:name]="..."

@click="..."
@input="..."
@change="..."
@submit="..."

Then later, if you want templating features, add:

[use]="card"
[props]="{ ... }"
[if]="..."
[each]="item in items"
[outlet]
[slot]="header"
[fill]="header"

Those last ones are mostly your framework layer, not stock Datastar names. Datastar itself already covers the lower-level reactive pieces and backend-driven HTML/SSE updates. Datastar’s backend model is built around text/html and text/event-stream, and its SSE patch events can morph elements by top-level ID or patch signals directly.

The shortest way to think about it is:

[card] replaces class naming
[text], [show], [bind], [state] replace data-*
@click replaces data-on:*
[use], [props], [slot] are your extra framework features

The strongest first version is probably this exact set:

[name]
#name
[state]
[text]
[show]
[bind]
[attr.foo]
[class.foo]
@click

That is enough to prove the whole idea.

But doesn't a few conflict?

I’m checking the syntax as a parser problem, because the real issue is not HTML — it’s whether your authoring language can tell “class shorthand” apart from “directive.”

Thought for 26s

Yes — a few would conflict unless you define clear parsing rules.

The main conflict is this:

[card] = you want it to mean class="card"
[text] = you want it to mean a directive
[state] = directive
[use] = directive

So the brackets themselves are fine.
The conflict is: how does the parser know whether [something] is a class name or a framework directive?

The clean answer

Use this rule:

reserved bracket names = directives
everything else in brackets = class shorthand

So:

<div [card] [state]="{ count: 0 }">
  <span [text]="count"></span>
</div>

means:

[card] → class="card"
[state] → directive
[text] → directive

That works.

The reserved words list

You would reserve names like:

state
text
html
show
bind
if
each
use
props
slot
fill
outlet
computed

So these are always framework directives.

Anything else becomes a class shorthand.

Where it breaks

The only problem is if you want a class with one of those reserved names.

Example:

<div [text]></div>

Does that mean:

class="text"
or
text binding directive?

That is the conflict.

Best fix

Keep simple class shorthand for most things:

<div [card]></div>
<div [nav-links]></div>

But give directives a slightly different shape.

The strongest option is probably:

[card] → class shorthand
:text="count" → directive
:state="{ count: 0 }" → directive
:show="open" → directive

Keep:

#name for id
@click for events

So your language becomes:

<div [card] :state="{ count: 0 }">
  <button @click="count--">-</button>
  <span :text="count"></span>
  <button @click="count++">+</button>
</div>

That is much cleaner because:

[] = naming / classes / component markers
: = reactive directives
# = id
@ = events
Why this is better

It avoids all ambiguity.

You no longer have to wonder whether [text] is:

a class
or a directive

Because:

[card] is obviously a class marker
:text is obviously a directive
My recommendation

Yes, a few of the original [] ideas conflict.

The clean version is:

[name] → class shorthand
#name → id
@click → events
:state, :text, :show, :bind, :if, :each, :use, :props → directives

Example:

<div [card] :state="{ count: 0 }">
  <button @click="count--">-</button>
  <span :text="count"></span>
  <button @click="count++">+</button>
</div>

That is probably the first version I would lock in.

Where would airow functions come in to play?
Thought for 25s

Mostly in expressions that need a callback.

In your system, the normal stuff would not need arrow functions:

<div [card] :state="{ count: 0 }">
  <button @click="count++">+</button>
  <span :text="count"></span>
</div>

No arrow function needed there.

Arrow functions become useful when the expression itself needs a function, like with array methods:

<div :text="items.map(item => item.name).join(', ')"></div>
<div :text="items.filter(item => item.done).length"></div>

That is the main place they come into play.

A good rule for your framework would be:

For simple template behavior, use plain expressions:
@click="count++"
:show="open"
:text="title"
Use arrow functions only inside expressions that naturally need callbacks:
map
filter
find
some
every
sort

So this is good:

<ul>
  <li :text="users.find(user => user.id === selectedId)?.name"></li>
</ul>

But I would not make authors write this for normal handlers:

<button @click="() => count++">+</button>

That is extra noise. Better:

<button @click="count++">+</button>

Same idea for computed values. Better:

<div :text="items.filter(item => item.active).length"></div>

not:

<div :text="(() => items.filter(item => item.active).length)()"></div>

So my recommendation is:

Allow arrow functions, but only where JavaScript naturally needs a callback. Do not require them for normal template actions.

If you want a clean mental model:

@... = run an expression
:... = bind an expression
arrow functions = only for nested callback logic inside those expressions

That keeps the syntax simple and still powerful.

A strong example:

<section [todo-list] :state="{ todos: [], filter: 'all' }">
  <div :text="todos.filter(todo => filter === 'all' || todo.status === filter).length"></div>
</section>

That is exactly where arrow functions shine in your framework.

Ok, so with this what does my whole syntax look like now?
Thought for 32s

Yes. The clean version now looks like this:

Core syntax
[name]          <!-- adds class="name" -->
#name           <!-- adds id="name" -->
@event="..."    <!-- event handler -->
:directive="..."<!-- reactive/template directive -->

So the rules are:

[] is for class shorthand / component naming
# is for id shorthand
@ is for events
: is for reactive and template directives

That avoids the conflicts we kept running into.

What each one means
Class shorthand
<div [card]></div>

becomes:

<div class="card"></div>

You can stack them:

<div [card] [featured] [large]></div>

becomes:

<div class="card featured large"></div>
ID shorthand
<main #content></main>

becomes:

<main id="content"></main>
Event syntax
<button @click="count++">+</button>
<input @input="name = $event.target.value">
<form @submit="saveForm()">

This is your behavior layer.

Directive syntax

These replace the old data-* style.

:state="..."
:text="..."
:html="..."
:show="..."
:bind="..."
:if="..."
:each="..."
:use="..."
:props="..."
:class.open="..."
:attr.aria-hidden="..."
The directive list

Here is the whole first-pass language.

State and output
:state="{ count: 0 }"     <!-- local reactive state -->
:text="count"             <!-- text content -->
:html="content"           <!-- inner HTML -->
:show="isOpen"            <!-- show / hide -->
:bind="email"             <!-- two-way binding -->
Logic
:if="loggedIn"
:each="item in items"
:computed="total = items.length"

You may or may not keep :computed in v1, but it can fit here.

Template system
:use="'card'"             <!-- mount template by name -->
:use="currentView"        <!-- dynamic template name -->
:props="{ title: 'Hello' }"
:slot="'header'"
:fill="'header'"
:outlet                   <!-- page/router outlet -->
Reactive attributes and classes
:class.open="isOpen"
:class.active="selected"
:attr.title="tooltip"
:attr.aria-hidden="!open"
The important parser rule

This is the big one:

Anything in [] is a class name

unless you later explicitly decide to reserve some words.

So:

[card]
[nav]
[nav-links]
[hero-title]

all mean classes.

Anything with : is a framework directive

So:

:state
:text
:show
:bind
:use
:props
:if
:each

are never classes.

That is what keeps the language clean.

What a normal component looks like
<article [card] :state="{ count: 0 }">
  <button [button] @click="count--">-</button>
  <span [count] :text="count"></span>
  <button [button] @click="count++">+</button>
</article>

That is the basic pattern:

[card] gives the styling hook
:state gives local state
@click changes state
:text displays state
What a template include looks like
<div :use="'card'"></div>

This means:

load the card template
mount it here

With props:

<div :use="'card'" :props="{ title: 'Hello', body: 'Welcome' }"></div>

Dynamic template:

<div :state="{ currentView: 'card' }">
  <div :use="currentView"></div>
</div>
What a repeated template looks like
<section :state="{ items: ['A', 'B', 'C'] }">
  <template :each="item in items">
    <div :use="'card'" :props="{ title: item }"></div>
  </template>
</section>
What a layout looks like
<div [app-layout]>
  <header [site-header] :slot="'header'"></header>
  <main #content :outlet></main>
  <footer [site-footer] :slot="'footer'"></footer>
</div>

Or if you want layout composition:

<div :use="'app-layout'">
  <template :fill="'header'">
    <div :use="'site-header'"></div>
  </template>

  <template :fill="'content'">
    <div :use="currentPage"></div>
  </template>

  <template :fill="'footer'">
    <div :use="'site-footer'"></div>
  </template>
</div>
What a full page looks like
<body [app] :state="{ currentPage: 'home-page', count: 0 }">
  <header [site-header]>
    <nav [nav]>
      <a [logo] href="/">MySite</a>
      <ul [nav-links]>
        <li><a href="/">Home</a></li>
        <li><a href="/about">About</a></li>
      </ul>
    </nav>
  </header>

  <main #content>
    <section [hero]>
      <h1 [hero-title]>Welcome</h1>
      <button [button] @click="count++">Clicked <span :text="count"></span></button>
    </section>

    <section [cards]>
      <article [card]>
        <h3 [card-title]>Card One</h3>
        <p [card-body]>First card body.</p>
      </article>

      <article [card]>
        <h3 [card-title]>Card Two</h3>
        <p [card-body]>Second card body.</p>
      </article>
    </section>

    <section>
      <div :use="currentPage"></div>
    </section>
  </main>

  <footer [site-footer]>
    Footer text
  </footer>
</body>
The mental model

This is the simplest way to remember it:

[class-like names]  -> structure and styling
#id-name            -> unique target
@event              -> behavior
:directive          -> reactivity and templating

So when you read this:

<div [card] :state="{ open: false }">
  <button @click="open = !open">Toggle</button>
  <p :show="open">Hello</p>
</div>

you can read it naturally as:

this is a card
it has state
clicking changes state
the paragraph shows when open is true
The syntax I would lock in

If I were freezing v1 right now, it would be this:

[name]
#name

@click=""
@input=""
@change=""
@submit=""

:state=""
:text=""
:html=""
:show=""
:bind=""
:if=""
:each=""
:use=""
:props=""
:class.name=""
:attr.name=""
:slot=""
:fill=""
:outlet

That is the whole language in one place.

The next useful step is to define the exact runtime behavior of :use, :each, and :outlet, because those three are what turn this from a reactive syntax into a real framework.

Slot and outlet are confusing names to me. Also, what about parent, child, and mutation? What about stuff like memo and and other comen reactive framework syntax?

I’ve got the shape now. The main thing is not to import every React/Solid concept by name — keep the authoring language smaller and plainer.

Thought for 27s

Yes — I would rename a few of them.

slot and outlet are framework-y words. They are accurate, but not very natural. If the goal is a simple HTML-first language, I would use plain words instead.

Here is the version I think is cleaner.

Keep these
[name]          <!-- class shorthand -->
#name           <!-- id shorthand -->
@event="..."    <!-- events -->
:directive="..."<!-- reactive/template directives -->

That part is still strong.

Rename the confusing ones

Instead of:

:slot
:fill
:outlet

I would use something more obvious like:

:region
:into
:mount

So:

<div :use="'layout'">
  <template :into="'header'">
    <div :use="'site-header'"></div>
  </template>

  <template :into="'content'">
    <div :use="page"></div>
  </template>
</div>

And inside the layout:

<div [layout]>
  <header :region="'header'"></header>
  <main #content :mount></main>
  <footer :region="'footer'"></footer>
</div>

That reads more naturally:

:region = this area can receive content
:into = put this content into that region
:mount = this is where the page/component gets mounted

That is better than slot/fill/outlet.

Parent and child

I would not make parent and child into special template syntax.

They are already implied by the DOM.

<section [card]>
  <h3 [card-title]>Title</h3>
  <p [card-body]>Body</p>
</section>

h3 and p are already children of the section.

For component communication, I would keep it simple:

parent passes values with :props
child can raise events with @
shared state can live higher up in :state

So I would not add things like:

:parent
:child

Those are probably unnecessary.

If you really need scope references later, use special values, not new syntax:

$props
$state
$parent
$root
$event

So:

:text="$parent.title"

or:

@click="$parent.open = true"

But I would not start there unless you truly need it.

Mutation

I would also avoid making mutation a first-class syntax word.

Mutation is already happening here:

@click="count++"
@click="user.name = 'Sarah'"
@click="items.push(newItem)"

That is mutation.

So I would not add something like :mutate unless you want to separate read logic from write logic later.

For v1:

reading = :text, :show, :if
writing = @click, @input, @change

That is enough.

Memo / computed / derived state

This one matters.

I would not use the word memo. That is too React/Solid-coded.

I would use one of these instead:

:derive
:calc
:computed

My pick is :derive because it reads well.

Example:

<div :state="{ first: 'Sarah', last: 'Robbins' }"
     :derive="{ fullName: first + ' ' + last }">
  <span :text="fullName"></span>
</div>

That is much clearer than memo.

So:

:state = owned local state
:derive = value computed from state
@... = mutations/actions

That is a clean model.

Effects / watchers

You will probably want something like this too, but again I would avoid React words.

Instead of:

effect
watchEffect

use:

:watch

Example:

<div :state="{ count: 0 }"
     :watch="count => console.log(count)">
</div>

Or, if you want to avoid arrows in simple cases:

<div :watch="logCount(count)"></div>

But I would keep :watch optional for v1.

A cleaner full syntax

If I were simplifying the whole language now, it would be:

Structure
[name]
#name
Events
@click=""
@input=""
@change=""
@submit=""
Reactive state
:state=""
:derive=""
:text=""
:html=""
:show=""
:bind=""
:if=""
:each=""
Templates
:use=""
:props=""
:region=""
:into=""
:mount
Dynamic attributes
:class.name=""
:attr.name=""
Optional advanced
:watch=""

That is a much better vocabulary.

What a component looks like now
<article [card]
         :state="{ count: 0 }"
         :derive="{ doubled: count * 2 }">
  <button [button] @click="count--">-</button>
  <span :text="count"></span>
  <button [button] @click="count++">+</button>

  <p :text="doubled"></p>
</article>

That feels clean.

What a layout looks like now
<div [app-layout]>
  <header :region="'header'"></header>
  <main #content :mount></main>
  <footer :region="'footer'"></footer>
</div>

Usage:

<div :use="'app-layout'">
  <template :into="'header'">
    <div :use="'site-header'"></div>
  </template>

  <template :into="'content'">
    <div :use="page"></div>
  </template>

  <template :into="'footer'">
    <div :use="'site-footer'"></div>
  </template>
</div>

That reads much better than slot/fill/outlet.

My recommendation on common reactive framework concepts

I would keep only the ones that are truly needed:

Keep:

state
derive
bind
show
if
each
use
props
region
into
mount
watch

Avoid for v1:

memo
child
parent
mutation
lifecycle hook names
context
provider
suspense
portal

Those can all be added later if the framework actually needs them.

The best version of your language is the one that feels like HTML with powers, not like React copied into attributes.

So if I froze it today, I’d make it:

[name]
#name

@click=""
@input=""
@change=""
@submit=""

:state=""
:derive=""
:text=""
:html=""
:show=""
:bind=""
:if=""
:each=""

:use=""
:props=""
:region=""
:into=""
:mount

:class.name=""
:attr.name=""

:watch=""

That is small, readable, and coherent.

The next useful step is to turn this into a one-page language spec with 8–10 tiny examples.

I am ok with mount, but I am not sold on region and into.
Thought for 28s

That’s fair. region and into are a little abstract.

I’d switch to something more natural.

My favorite pair is:

:place
:to

So the layout becomes:

<div [app-layout]>
  <header :place="'header'"></header>
  <main #content :mount></main>
  <footer :place="'footer'"></footer>
</div>

And usage becomes:

<div :use="'app-layout'">
  <template :to="'header'">
    <div :use="'site-header'"></div>
  </template>

  <template :to="'content'">
    <div :use="page"></div>
  </template>

  <template :to="'footer'">
    <div :use="'site-footer'"></div>
  </template>
</div>

That reads more like English:

:place="'header'" → this is the place named header
:to="'header'" → send this to header

Other good pairs:

:area and :to
:target and :to
:section and :to

I would avoid slot-style names if you want this to feel less framework-y.

So right now I’d recommend this syntax set:

[name]
#name

@click=""
@input=""
@change=""
@submit=""

:state=""
:derive=""
:text=""
:html=""
:show=""
:bind=""
:if=""
:each=""

:use=""
:props=""
:place=""
:to=""
:mount

:class.name=""
:attr.name=""
:watch=""

If you want the shortest, cleanest version, I’d lock in:

:mount for the main page mount point
:place for named layout placeholders
:to for filling those placeholders

That feels a lot better than region and into.

I think I want to do mount, fill, and slot
Thought for 5s

Yes — that works well.

mount, fill, and slot are actually a solid set because each word has a different job:

:mount = where the main thing gets rendered
:slot = a named placeholder
:fill = content that goes into a named slot

That gives you a clean mental model.

A layout could look like this:

<div [app-layout]>
  <header :slot="'header'"></header>
  <main #content :mount></main>
  <footer :slot="'footer'"></footer>
</div>

And usage could look like this:

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

That reads pretty naturally:

this layout has a header slot
this template fills the header slot
the main page mounts at :mount

I would define them like this:

:mount
:slot=""
:fill=""

So your syntax set now becomes:

[name]
#name

@click=""
@input=""
@change=""
@submit=""

:state=""
:derive=""
:text=""
:html=""
:show=""
:bind=""
:if=""
:each=""

:use=""
:props=""
:slot=""
:fill=""
:mount

:class.name=""
:attr.name=""
:watch=""

A small refinement I’d recommend is this:

Use :mount only for the primary render target, like the page or routed view.
Use :slot and :fill for composition inside layouts and components.

That keeps the meanings distinct and avoids overlap.

So yes — I think mount, fill, and slot is a good choice.

Replace slot with area
Thought for 5s

Yes — that’s cleaner.

So the set becomes:

:mount = main render point
:area = named placeholder
:fill = content for that placeholder

Example layout:

<div [app-layout]>
  <header :area="'header'"></header>
  <main #content :mount></main>
  <footer :area="'footer'"></footer>
</div>

Example usage:

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

Your syntax now is:

[name]
#name

@click=""
@input=""
@change=""
@submit=""

:state=""
:derive=""
:text=""
:html=""
:show=""
:bind=""
:if=""
:each=""

:use=""
:props=""
:area=""
:fill=""
:mount

:class.name=""
:attr.name=""
:watch=""

That reads pretty well:

this is a class: [card]
this is an id: #content
this does something: @click
this is reactive/template logic: :state, :use, :area, :fill, :mount

I think area is better than slot for the tone you’re aiming for.

What does attr. Mean?
Thought for 7s

:attr.name means set a normal HTML attribute dynamically.

So:

:attr.title="tooltip"

means:

title="..."

but reactive.

Examples:

<div :attr.title="message"></div>
<img :attr.src="photoUrl" :attr.alt="photoName">
<a :attr.href="profileUrl">Profile</a>
<div :attr.aria-hidden="!open"></div>
<input :attr.disabled="isSaving">

So the pattern is:

:attr.ATTRIBUTE_NAME="expression"

Examples:

:attr.href
:attr.src
:attr.alt
:attr.title
:attr.disabled
:attr.aria-label

It is basically your way of saying:

“bind this HTML attribute to this value.”

That is different from:

:text → sets text content
:html → sets inner HTML
:show → show/hide
:class.open → toggle a class
:attr.title → set a real attribute

Example together:

<button
  [button]
  :text="label"
  :class.loading="isLoading"
  :attr.disabled="isLoading"
  :attr.title="hint">
</button>

That means:

button text comes from label
loading class toggles on/off
disabled attribute updates dynamically
title attribute updates dynamically

If you do not like attr, you could rename it later, but :attr.name is a pretty clear pattern.

So couldn't we use bind instead of attr?

I’m checking the current Datastar attribute names so I can tell you whether bind would stay clear or become overloaded.

Thought for 16s

You could, but I would not.

In Datastar, data-bind already has a specific meaning: two-way binding between a signal and an input-like element’s value, with input and change events wired up automatically. data-attr:* is different: it sets a normal HTML attribute like href, title, src, disabled, or aria-hidden.

So if you make bind mean both:

“bind this input value to state”
and “bind this arbitrary HTML attribute”

then the word gets muddy fast.

I’d keep them separate:

:bind="email"
:attr.href="profileUrl"
:attr.title="tooltip"
:attr.aria-hidden="!open"

That reads cleanly:

:bind = form/value binding
:attr.* = normal attribute binding

If you really want one family name, the safest version would be something like:

:bind="email"
:bind.attr.href="profileUrl"
:bind.attr.title="tooltip"

But that is longer and less readable than :attr.*.

So my recommendation is:

keep :bind for value binding
keep :attr.* for arbitrary attributes
keep :class.* for class toggles

That mirrors the distinction Datastar already makes between data-bind, data-attr:*, and data-class:*.

What's others for attributes?
Thought for 6s

A few good alternatives to attr are:

prop
set
field
meta
value

But for HTML, the strongest ones are really:

:attr.href
:prop.value
:class.active

The reason attr is strong is that it clearly means:

“set a normal HTML attribute.”

Examples:

:attr.href="url"
:attr.title="tooltip"
:attr.disabled="isSaving"
:attr.aria-hidden="!open"

If you want alternatives, these are the most reasonable:

:prop

Good if you want it to feel more JS-like:

:prop.href="url"
:prop.title="tooltip"

But prop can get confusing because DOM properties and HTML attributes are not always the same thing.

:set

Very readable:

:set.href="url"
:set.title="tooltip"

This is simple, but a little generic.

:meta

Okay for aria/data/title-like things, but weird for href or src.

:value

Too narrow. Good for form values, not all attributes.

My recommendation:

keep :bind for two-way form/value binding
keep :class.name for classes
use either :attr.name or :set.name for normal attributes

If you want the cleanest, most natural-feeling version overall, I’d choose:

:bind="email"
:class.active="isActive"
:set.href="url"
:set.title="tooltip"
:set.disabled="isSaving"

That may feel better than attr if you want less technical wording.

Let's change it to set
Thought for a few seconds

Good choice.

So now it becomes:

:bind = two-way value binding
:class.name = class toggle/binding
:set.name = set a normal HTML attribute

Examples:

<a :set.href="profileUrl">Profile</a>
<img :set.src="imageUrl" :set.alt="imageAlt">
<button :set.disabled="isSaving">Save</button>
<div :set.title="tooltip"></div>
<div :set.aria-hidden="!open"></div>

So your syntax set now is:

[name]
#name

@click=""
@input=""
@change=""
@submit=""

:state=""
:derive=""
:text=""
:html=""
:show=""
:bind=""
:if=""
:each=""

:use=""
:props=""
:area=""
:fill=""
:mount

:class.name=""
:set.name=""
:watch=""

Example:

<article [card] :state="{ open: false, url: '/profile' }">
  <a [link] :set.href="url" :text="'Profile'"></a>
  <button @click="open = !open">Toggle</button>
  <div :show="open" :set.title="'Now open'">Hello</div>
</article>

set is a better fit than attr for the tone you want.

What does watch mean?
Thought for a few seconds

watch means:

“when this value changes, run something.”

It is for side effects, not for rendering.

So:

:text shows data
:show hides/shows data
:derive calculates new data
:watch reacts when data changes and does something because of it

Example:

<div :state="{ count: 0 }" :watch="count => console.log(count)">
  <button @click="count++">+</button>
</div>

Every time count changes, the watch runs.

A simpler way to think about it:

state = stored value
derive = computed value
watch = reaction

Good uses for :watch:

save to local storage
call a function
trigger animation
sync something external
log/debug
fetch when a value changes

Example:

<div
  :state="{ theme: 'dark' }"
  :watch="theme => localStorage.setItem('theme', theme)">
</div>

That means whenever theme changes, save it.

Another example:

<div
  :state="{ search: '' }"
  :watch="search => searchUsers(search)">
</div>

That means when search changes, run searchUsers(search).

The important difference is:

:derive should return a value
:watch should do an action

So I’d define it like this:

:watch=""

Meaning:

watch this expression/state and run side-effect logic when it changes

If you want the simplest possible v1, you could even leave :watch out for now and add it later. It is useful, but not as core as :state, :text, :bind, :use, and @click.

Ok, that's good then. But derive needs to be come cal or calc whichever is short for  calculate.
Thought for a few seconds

Yes — calc is the better choice.

cal is shorter, but calc reads more clearly as “calculate” and is easier to recognize later.

So now it becomes:

[name]
#name

@click=""
@input=""
@change=""
@submit=""

:state=""
:calc=""
:text=""
:html=""
:show=""
:bind=""
:if=""
:each=""

:use=""
:props=""
:area=""
:fill=""
:mount

:class.name=""
:set.name=""
:watch=""

Example:

<div [card] :state="{ price: 10, qty: 2 }" :calc="{ total: price * qty }">
  <p :text="total"></p>
</div>

That reads well:

:state = stored values
:calc = calculated values
:watch = react when values change

So the current language is in a much better place now.

I am pretty sure I need to deal with child, parent, mutation in v1.
Thought for 26s

Yes — but I would handle them as core concepts, not all as new top-level directives.

That is the important distinction.

What should be in v1

You probably do need to support:

parent
child / children
mutation

But I would not make all three into things like:

:parent=""
:child=""
:mutation=""

That gets heavy fast.

A better v1 is:

1. Parent and child should be built-in scope values

Use special scope names, not directives.

Something like:

$parent
$children
$child
$self
$root
$props
$event

So inside a component, you can do things like:

<div [card] :text="$parent.title"></div>

or:

<button @click="$parent.open = true">Open Parent</button>

That gives you parent/child access without inventing extra syntax everywhere.

My recommendation

Use:

$self
$parent
$children
$root
$props
$event

That is enough for v1.

2. Mutation should absolutely be part of v1

But mutation is probably not a directive.

Mutation is what happens inside events and actions:

@click="count++"
@click="user.name = 'Sarah'"
@click="items.push(newItem)"
@click="$parent.open = false"

That already gives you mutation.

So the clean answer is:

yes, mutation is in v1
but it is mostly expressed through @event="..."

That said, if you want mutation to feel more explicit and structured, I think you should add one helper:

$mutate(...)

Examples:

@click="$mutate('count', count + 1)"
@click="$mutate('user.name', 'Sarah')"
@click="$mutate('items', [...items, newItem])"

Or if you want object-style mutation:

@click="$mutate({ open: true, count: count + 1 })"

That gives you a clean mutation API.

3. Child content is different from child scope

There are really two meanings of child:

Child component relationship

That is what $parent / $children are for.

Child content projection

That is what :fill and :area are for.

So you do not want one word, child, trying to do both jobs.

That is why I would keep:

$parent
$children

for scope relationships

and keep:

:area
:fill
:mount

for composition/layout

My suggested v1 additions
Special scope objects
$self
$parent
$children
$root
$props
$event
Mutation helper
$mutate(...)

That means your syntax stays mostly the same:

[name]
#name

@click=""
@input=""
@change=""
@submit=""

:state=""
:calc=""
:text=""
:html=""
:show=""
:bind=""
:if=""
:each=""

:use=""
:props=""
:area=""
:fill=""
:mount

:class.name=""
:set.name=""
:watch=""

And you add these built-in values/functions to expressions:

$self
$parent
$children
$root
$props
$event
$mutate()

That is strong.

Examples
Parent access
<div [modal-body] :text="$parent.title"></div>
Child mutating parent
<button @click="$parent.open = false">Close</button>
Safer explicit mutation
<button @click="$mutate('open', !open)">Toggle</button>
Mutating parent explicitly
<button @click="$parent.$mutate('open', false)">Close</button>
Using props
<h3 :text="$props.title"></h3>
Accessing root
<div :text="$root.theme"></div>
My honest recommendation

If you want parent, child, and mutation in v1, do it like this:

parent/child = scope references
mutation = event expressions plus $mutate()

Do not make them all directives.

That keeps the language small while still giving you the power you need.

So the final v1 shape becomes:

Syntax
[name]
#name
@event=""
:directive=""
Directives
:state
:calc
:text
:html
:show
:bind
:if
:each
:use
:props
:area
:fill
:mount
:class.name
:set.name
:watch
Built-ins
$self
$parent
$children
$root
$props
$event
$mutate()

That is the version I would move forward with.

Can we change the "$" to *
Thought for 19s

Yes, but only if your runtime rewrites it or your expression language is custom.

If you keep JS-like expressions, * is a bad sigil because it already means other things:

multiplication: price * qty
generator syntax in JS
wildcard-like mental model in other languages

So this:

@click="*parent.open = false"
:text="*props.title"

looks nice, but it conflicts with normal expression parsing much more than $parent does.

The clean rule is:

If you want JS-like expressions

Keep:

$parent
$children
$self
$root
$props
$event
$mutate()

because $ works naturally in identifier names.

If you want *

You can do it, but your runtime should translate it first.

Example authoring:

<button @click="*parent.open = false">Close</button>
<h3 :text="*props.title"></h3>
<div :text="*root.theme"></div>

Internal rewrite:

<button @click="$parent.open = false">Close</button>
<h3 :text="$props.title"></h3>
<div :text="$root.theme"></div>

That is probably the safest way.

My recommendation

You can change it to *, but I would only use * for the special scope words:

*self
*parent
*children
*root
*props
*event
*mutate()

and let everything else stay normal.

So your syntax becomes:

[name]
#name
@click=""
:state=""
:calc=""
:text=""

with built-ins:

*self
*parent
*children
*root
*props
*event
*mutate()

Example:

<article [card] :state="{ open: false }">
  <h3 :text="*props.title"></h3>
  <button @click="*parent.open = false">Close Parent</button>
</article>
My honest take
Possible: yes
Good with a rewrite layer: yes
Good as raw JS syntax with no rewrite: no

So the best answer is:

Yes, use * as author syntax if you like it, but rewrite it internally before evaluating expressions.

Let's not do * let's try +
Thought for 13s

You can, but + is probably a bad choice.

It collides with normal expressions much more than $ does.

Examples:

:text="price + tax"
:text="+props.title"
@click="+parent.open = false"

Now + could mean:

addition
unary plus
your scope marker

That gets messy fast.

So I would say:

+ is possible only with a rewrite layer, but it is not a good sigil.

The cleanest options are:

1. Keep $

Still the safest for JS-like expressions.

:text="$props.title"
@click="$parent.open = false"
2. Use no sigil at all

Reserve a few built-in names:

:text="props.title"
@click="parent.open = false"
:text="root.theme"
@click="mutate('open', false)"

This is actually pretty nice if you reserve these names:

self
parent
children
root
props
event
mutate()

That may be the best direction if you want cleaner authoring.

3. Use a different sigil than +

If you really want a sigil, something like ^ or ~ is safer than +, but both still need rewriting.

My recommendation:

Do not use +.
Either keep $, or switch to reserved words with no symbol.

A very clean version would be:

<article [card] :state="{ open: false }">
  <h3 :text="props.title"></h3>
  <button @click="parent.open = false">Close Parent</button>
</article>

That feels a lot better than +parent to me.

Ok let's go no symbol.
Thought for 10s

Good. No symbol is cleaner.

Then the language becomes:

[name]          -> class shorthand
#name           -> id shorthand
@event="..."    -> event handler
:directive="..."-> reactive/template directive

And the built-in scope words are just plain names:

self
parent
children
root
props
event
mutate()

So now you would write things like:

<h3 :text="props.title"></h3>
<button @click="parent.open = false">Close</button>
<div :text="root.theme"></div>

Your v1 syntax now looks like this:

[name]
#name

@click=""
@input=""
@change=""
@submit=""

:state=""
:calc=""
:text=""
:html=""
:show=""
:bind=""
:if=""
:each=""

:use=""
:props=""
:area=""
:fill=""
:mount

:class.name=""
:set.name=""
:watch=""

And your built-ins in expressions are:

self
parent
children
root
props
event
mutate()

So a component looks like:

<article [card]
         :state="{ count: 0, open: false }"
         :calc="{ doubled: count * 2 }">
  <h3 :text="props.title"></h3>

  <button @click="count--">-</button>
  <span :text="count"></span>
  <button @click="count++">+</button>

  <p :text="doubled"></p>
  <div :show="open">Open content</div>
  <button @click="open = !open">Toggle</button>
</article>

A child using parent state looks like:

<section [modal-body]>
  <h2 :text="parent.title"></h2>
  <button @click="parent.open = false">Close</button>
</section>

A layout looks like:

<div [app-layout]>
  <header :area="'header'"></header>
  <main #content :mount></main>
  <footer :area="'footer'"></footer>
</div>

And usage:

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

One important rule: these names should be reserved inside expressions:

self
parent
children
root
props
event
mutate

So you should not use them as normal state keys.

This is probably the cleanest version so far:

[] for naming
# for ids
@ for actions
: for reactive/template behavior
plain words for scope access

That is a real language now. The next thing to lock down is the exact meaning of parent, children, and mutate() so they stay consistent everywhere.

Yes, how would they work with the reactive nature of datastar?

I’m checking Datastar’s signal scoping and expression model so I can map parent, children, and mutate() onto something Datastar can actually support cleanly.

Thought for 1m 1s

They would be syntax sugar over Datastar signals, not a second reactive system.

Datastar’s free/core model is signal-based: data-signals patches state into the current signal tree, nested signals are supported with dot notation, later signal definitions in the DOM override earlier ones, data-computed derives read-only values, and data-effect is the side-effect hook. Datastar’s own docs also say standard templates and global signals are the normal path in OSS, while Rocket is the Pro feature for stronger component encapsulation.

So in your language, parent, children, and mutate() should work like this:

The core rule

Every mounted template gets an internal scoped signal object.

Your author code:

<article [card] :state="{ count: 0 }">
  <h3 :text="props.title"></h3>
  <button @click="count++">+</button>
</article>

would internally rewrite to Datastar-style signals and expressions. Datastar signals are referenced with $..., so your runtime would translate your plain names into real signal paths before Datastar sees them.

A simple internal shape might be:

scopes.cmp1 = {
  state: { count: 0 },
  props: { title: "Hello" },
  parent: "cmp0",
  children: []
}

Then your runtime rewrites:

count → $scopes.cmp1.state.count
props.title → $scopes.cmp1.props.title
parent.open → $scopes.cmp0.state.open

That way Datastar still does the real reactivity.

parent

parent should mean: the nearest mounted parent template scope, not “whatever DOM parent happens to exist right now.”

So this:

<div [modal] :state="{ open: true, title: 'Settings' }">
  <div :use="'modal-body'"></div>
</div>

and inside modal-body.html:

<section [modal-body]>
  <h2 :text="parent.title"></h2>
  <button @click="parent.open = false">Close</button>
</section>

would be rewritten to the parent scope’s actual Datastar signal path. Since Datastar updates any expression that depends on signals when those signals change, changing the parent signal updates the child bindings naturally. data-computed updates when dependent signals change, and data-effect reruns when referenced signals change; your layer is just deciding which signal path parent.title points to.

children

children should be a runtime-maintained list of mounted child scopes.

So if a parent renders three child cards, your runtime can maintain something like:

scopes.parent1.children = ["cmp2", "cmp3", "cmp4"]

or, more usefully, expose it as a derived array of child state/props snapshots for template expressions. Datastar already supports nested signal objects and computed values, so your framework can keep children as a nested signal and let Datastar react to it normally.

In practice I would make children mostly for:

layout/composition
counting or iterating mounted child instances
parent-child coordination

I would not make people depend on children for everyday rendering unless they really need it.

mutate()

mutate() should just be the nice author-facing way to patch signals.

Datastar already reacts to signal assignments and signal patches. data-signals adds, updates, and removes signals, and data-effect is the right place for reactive side effects. So your mutate() should compile to signal writes, not invent a new store system.

So these should be equivalent in your framework:

<button @click="count++">+</button>
<button @click="mutate('count', count + 1)">+</button>

and internally both become something like:

$scopes.cmp1.state.count = $scopes.cmp1.state.count + 1

For parent mutation:

<button @click="mutate(parent, 'open', false)">Close</button>

could rewrite to:

$scopes.cmp0.state.open = false

So mutate() is not the reactive engine. It is just a safer write helper.

watch

watch should map to Datastar’s side-effect mechanism, not computed state.

Datastar says data-computed is for read-only derived values and should not be used for actions; if you need to perform an action when signals change, use data-effect. So your :calc should compile to data-computed, and your :watch should compile to data-effect.

That means:

<div :calc="{ total: price * qty }"></div>

becomes derived state.

But:

<div :watch="search => fetchUsers(search)"></div>

becomes a Datastar effect.

The clean mental model

So the v1 behavior should be:

state = local scoped signal object
props = scoped input object
parent = pointer to nearest parent scope
children = runtime-maintained child scope list
calc = derived signal values
watch = Datastar side effects
mutate() = helper for writing to scoped signals

In other words:

your framework owns scope resolution
Datastar owns reactivity

That is the clean split.

A good first rewrite table is:

parent.title   -> $scopes.<parentId>.state.title
props.title    -> $scopes.<selfId>.props.title
count          -> $scopes.<selfId>.state.count
children       -> $scopes.<selfId>.children
mutate(...)    -> signal assignment / patch
:calc          -> data-computed
:watch         -> data-effect

That is how you get parent, children, and mutate() to feel native while still riding on Datastar’s actual reactive model.

Great! What about controlling state, hooks, and data handling?

I’m mapping this into the smallest coherent v1 so it doesn’t turn into React-by-accident. The main trick is to separate what authors control from what the runtime controls.

Thought for 18s

Yes. I’d make those three layers explicit:

state, hooks, and data handling.

Datastar already gives you the primitives you need underneath: data-signals for reactive state, data-computed for derived read-only values, data-effect for side effects when signals change, data-bind for two-way input binding, data-on:* for events, data-class for reactive classes, data-attr for reactive attributes, data-indicator for loading state during fetches, and data-init for logic that runs when an element initializes. Datastar also exposes an evt event object inside data-on expressions.

So your syntax can sit cleanly on top of that.

State control

I would keep state control to four ideas:

:state
:calc
:bind
mutate()

That gives you a simple model:

:state = owned local state
:calc = calculated state
:bind = user input tied to state
mutate() = the official write path

Example:

<article [card]
         :state="{ qty: 1, price: 10 }"
         :calc="{ total: qty * price }">
  <input type="number" :bind="qty">
  <p :text="total"></p>
  <button @click="mutate('qty', qty + 1)">+</button>
</article>

Under the hood, that maps naturally to Datastar’s data-signals, data-computed, and data-bind. data-bind is specifically for two-way binding on inputs/selects/textareas, and data-computed is specifically for derived read-only values that update automatically when dependencies change.

I would also make one rule for v1:

direct assignment is allowed, but mutate() is preferred.

So both of these can work:

@click="qty++"
@click="mutate('qty', qty + 1)"

But mutate() gives you one consistent mental model for writes, which will matter later if you add validation, batching, logging, undo, or server sync.

Hooks

I would not use React-style hook names like useEffect, useMemo, useState.

Your HTML-first versions should be:

:calc
:watch
:init

Meaning:

:calc = calculate derived values
:watch = run side effects when values change
:init = run something when the template/component mounts

That maps directly to Datastar’s model:

:calc → data-computed
:watch → data-effect
:init → data-init

Example:

<section [search-panel]
         :state="{ search: '', results: [] }"
         :watch="search => fetchResults(search)"
         :init="fetchResults(search)">
  <input :bind="search">
</section>

That is much easier to read than importing React vocabulary.

I would define hooks in your system like this:

:init for mount-time setup
:watch for reactive side effects
:calc for derived values

And I would stop there for v1.

Data handling

This is where the framework should feel really nice.

I would split data handling into:

:use
:props
:bind
@event
:set.name
:class.name
:loading
:error

You already have most of these. The only two I’d add are:

:loading
:error

because real apps need them constantly.

Datastar already has data-indicator, which creates a signal that becomes true while a fetch request is in flight and false afterward. That makes it a strong base for your :loading concept.

So something like this:

<button @click="loadUser()"
        :loading="loadingUser"
        :set.disabled="loadingUser">
  Load
</button>

<div :show="loadingUser">Loading...</div>
<div :show="error">Something went wrong</div>

can map to Datastar’s loading indicator and normal reactive state.

For fetched data, I’d keep the pattern simple:

<section [user-card]
         :state="{ user: null, loading: false, error: null }"
         :init="loadUser()">
  <div :show="loading">Loading...</div>
  <div :show="error" :text="error"></div>
  <h2 :show="user" :text="user?.name"></h2>
</section>

So your framework should encourage this shape:

state holds the data
calc derives display values
watch reacts to changes
init loads initial data
mutate changes state
events trigger mutations or fetches
Parent, child, and shared state

Since you said you need these in v1, I’d keep them as built-in scope values:

self
parent
children
root
props
event
mutate()

Then the rules are:

self = current component scope
parent = nearest mounted parent component scope
children = mounted child component list
root = root app/layout scope
props = passed-in values
event = current DOM event
mutate() = write helper

That fits Datastar well because your framework can resolve those names to actual signal paths before handing expressions to Datastar. Datastar already supports nested signal paths and updates expressions when dependent signals change.

Example:

<section [modal-body]>
  <h2 :text="parent.title"></h2>
  <button @click="mutate(parent, 'open', false)">Close</button>
</section>
The v1 syntax I would lock now
[name]
#name

@click=""
@input=""
@change=""
@submit=""

:state=""
:calc=""
:init=""
:watch=""
:text=""
:html=""
:show=""
:bind=""
:if=""
:each=""

:use=""
:props=""
:area=""
:fill=""
:mount

:class.name=""
:set.name=""
:loading=""
:error=""

And these built-ins inside expressions:

self
parent
children
root
props
event
mutate()

That gives you a complete first version without bloating the language.

The guiding rule should be:

Datastar owns reactivity. Your framework owns naming, scoping, templates, and ergonomics.

That keeps the system small and coherent.

Let's change init to run
Thought for a few seconds

Yes — :run is better.

So now:

:run = run something when the component/template mounts
:watch = run something when reactive values change
:calc = calculate derived values

That gives you a cleaner trio:

:state=""
:calc=""
:run=""
:watch=""

Example:

<section [search-panel]
         :state="{ search: '', results: [] }"
         :run="fetchResults(search)"
         :watch="search => fetchResults(search)">
  <input :bind="search">
</section>

So your syntax now is:

[name]
#name

@click=""
@input=""
@change=""
@submit=""

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

:use=""
:props=""
:area=""
:fill=""
:mount

:class.name=""
:set.name=""
:loading=""
:error=""

And built-ins stay:

self
parent
children
root
props
event
mutate()

run fits the tone of the rest of your language much better than init.

Ok, how are we going to deal with datastars SSE?

I’m checking Datastar’s SSE event model so I can map it cleanly into your syntax instead of guessing at event names.

Thought for 1m 20s

We should hide Datastar SSE behind our own runtime API.

Datastar already gives us the transport primitives we need: SSE responses can contain zero or more events, and the main ones are patch elements and patch signals. Datastar also supports execute script in SSE responses, though that should be treated as an escape hatch, not the main path.

So in our framework, the author should not write raw SSE at all. They keep writing:

<body [app] :run="stream('/events')">
  <header :area="'header'"></header>
  <main :mount></main>
  <footer :area="'footer'"></footer>
</body>

and our runtime turns stream('/events') into Datastar’s normal mounted GET stream pattern. Datastar’s docs already show the CQRS-style approach of opening a long-lived GET stream from data-init="@get('/cqrs_endpoint')" and then using normal short-lived requests for writes.

I’d make our SSE layer expose only three backend operations:

html → patch markup into the page
state → patch reactive state/signals
run → execute one-off client code only when absolutely necessary

Under the hood, those map cleanly to Datastar:

html → datastar-patch-elements
state → datastar-patch-signals
run → Datastar’s script execution path

For example, on the server we could conceptually do this:

stream.html({ to: 'content', template: 'dashboard-page', props: { user } })
stream.state({ notifications: 3, theme: 'dark' })
stream.run("document.title = 'Dashboard'")

and our adapter would emit Datastar SSE events.

For template areas, we should not depend on user-written IDs. Datastar’s patch-elements defaults to morphing top-level elements by matching their IDs, but it also supports a selector override plus modes like outer, inner, replace, append, prepend, before, after, and remove. That means our framework can target :mount and :area using internal selectors instead of forcing authors to hand-write IDs.

So a layout like this:

<div [app-layout]>
  <header :area="'header'"></header>
  <main :mount></main>
  <footer :area="'footer'"></footer>
</div>

could compile internally to stable targets such as:

<div data-area="header"></div>
<main data-mount></main>
<div data-area="footer"></div>

Then the server can send a patch-elements SSE event with a selector like [data-area="header"] or [data-mount] instead of relying on ids. Datastar explicitly supports selecting the target element with a CSS selector in SSE patch events.

For repeated components, I would avoid tiny incremental SSE updates unless there is a strong reason. Datastar’s own guidance for resilient SSE streams is to prefer a “fat morph” approach: send the complete desired HTML for the main content area, because it recovers better from interrupted streams than append-style incremental updates. Datastar also recommends stable IDs on morphed elements when you do rely on ID-based morphing, to preserve state like listeners and transitions.

So the rule should be:

areas and pages: patch whole regions
shared reactive values: patch signals
scripts: rare escape hatch

That also fits the framework syntax you’ve designed:

:state, :calc, :watch, mutate() sit on top of signal patches
:use, :fill, :area, :mount sit on top of HTML patches
:run can open the stream on mount and can also be used for setup logic

Datastar can also send multiple SSE events in one response, so one backend message can update both the DOM and the state together. That is ideal for your system, because one server action can replace a template region and patch the related signals in the same stream update.

So the clean answer is:

We do not expose Datastar SSE directly.
We build a tiny transport layer over it with:

stream() on the client
html(), state(), and run() on the server

And internally that compiles to Datastar SSE events.

That keeps your language simple while still using Datastar exactly where it is strongest.

The next thing to define is the exact server API for those three operations.

This is great! But I think I want to change stream() to data()
Thought for 11s

Yes — data() works, and it actually fits the direction better.

stream() describes the transport.
data() describes the intent.

That is usually the better authoring choice.

So instead of:

<body [app] :run="stream('/events')">

you would have:

<body [app] :run="data('/events')">

That reads more naturally as:

“when this runs, connect this component/page to its live data source.”

I would define it like this:

data(url)

Meaning:

open an SSE connection to url
listen for framework updates
let the runtime translate those updates into Datastar patches/signals

So the author never thinks about SSE directly.

A good example:

<section [notifications-panel]
         :state="{ items: [] }"
         :run="data('/events/notifications')">
  <ul>
    <template :each="item in items">
      <li :text="item.message"></li>
    </template>
  </ul>
</section>

Under the hood, data('/events/notifications') would:

open the SSE connection
receive Datastar patch/signals events
update the local/runtime state and DOM

The only caution is that data is a very broad word. So I would make one clear rule:

data() means a live data channel, not a one-time fetch.

So:

data('/events') = live SSE connection
run="loadUsers()" or request('/users') = one-off request

That distinction will keep the language from getting muddy later.

So I’d lock it in like this:

:run="data('/events')"

and keep the meaning:

connect this scope to a live server data stream

That is a strong choice.

I like the request('/users') one. How do we bring a little more security to all this SSE?

I’m checking Datastar’s current SSE guidance and the browser/EventSource security model so I can give you a concrete security plan for your syntax, not just general advice.

Thought for 1m 10s

Yes — and the nice part is you can make it more secure than raw browser SSE by building it on top of Datastar’s request model instead of exposing native EventSource directly.

Datastar’s @get() uses the Fetch API and accepts request headers, while the response can still be a text/event-stream SSE stream. Datastar also closes GET streams when the page is hidden by default unless you opt into openWhenHidden: true. That gives you a better security/control surface than a bare EventSource-only design.

Here is the security model I would use for your framework.

1. Keep data() as a framework helper, not raw SSE

Make authors write:

<section [notifications]
         :run="data('/events/notifications')">
</section>

But internally, have data() call your Datastar-backed request layer, not a naked browser SSE primitive. That way you can attach headers, control retries, scope signals, and centralize auth policy. Datastar already supports request headers and retry controls on backend actions.

2. Use session cookies, not browser-stored bearer tokens

For a browser app, the safest default is still a server session in an HttpOnly, Secure cookie rather than keeping tokens in JavaScript. MDN’s cookie security guidance recommends Secure, HttpOnly, and restrictive cookie scope, and notes that secure cookies reduce exposure to script access and insecure transport.

That means your framework default should be:

auth via server session cookie
same-origin requests by default
no auth token in localStorage
no auth token in template state
3. Treat live data() channels as read-only

Your live SSE endpoints should be read-only streams. OWASP and MDN both frame CSRF around unwanted authenticated actions, so the cleanest design is:

request('/users') or @post/@patch/@delete for writes
data('/events/...') only for reading server-pushed updates

That sharply reduces the risk surface of SSE endpoints.

4. Protect all writes with CSRF defenses

Even if your app uses cookies, your state-changing requests still need CSRF protection. OWASP recommends anti-CSRF tokens for state-changing requests, and MDN also recommends proper CSRF defenses rather than relying on cookies alone.

So your framework should do this automatically for request():

<button @click="request('/users', { method: 'POST', body: form })">

And internally it should include:

CSRF token header
same-origin mode
cookie credentials
origin/fetch-metadata validation on the server
5. Do not send all signals by default

This is a big one.

Datastar sends all signals except underscore-prefixed local signals with every backend request by default, and for GET requests those signals go in a datastar query parameter. Datastar explicitly says this is the default and that you can narrow it with filterSignals.

So your framework should not mirror Datastar’s default here. Instead:

data() should send no signals by default
request() should send only explicitly allowed signals
any local/private state should stay out of transport entirely

A good framework policy would be:

:run="data('/events/notifications', { signals: ['notifications.filter'] })"

or even stricter:

:run="data('/events/notifications')"

with no ambient state sent unless the author opts in.

That prevents accidental leakage of search terms, internal flags, or sensitive UI state into URLs and logs.

6. Restrict stream scope on the server

Every SSE endpoint should be authorized for:

the current user
the specific resource/channel
the specific area being updated

So /events/notifications should only ever stream that user’s notifications. /events/admin should require admin authorization. /events/project/123 should verify access to project 123 before opening the stream.

This matters because Datastar SSE can patch both elements and signals, so a single stream can influence a lot of UI state.

7. Prefer HTML and signal patches; avoid script execution

Datastar SSE supports patching elements, patching signals, and executing scripts. Datastar’s expression docs show script execution is possible through SSE, but that should be treated as an escape hatch, not your normal app path.

So your framework should have this rule:

allowed by default: HTML patch, signal patch
disabled by default: script execution over SSE

That means your server API should conceptually allow only:

push.html(...)
push.state(...)

and not expose push.run(...) unless explicitly enabled in development or in a narrowly controlled internal feature.

8. Patch by framework selectors, not arbitrary user input

Datastar SSE patching can target a CSS selector and a patch mode like outer, inner, append, replace, or remove.

That is powerful, so do not let arbitrary backend input choose selectors freely. Instead, your framework should map safe internal targets like:

:mount
:area="'header'"
component-owned roots

to stable selectors under the hood.

So the server should patch named safe targets like:

mount
area:header
area:footer

not arbitrary selectors from user-controlled input.

9. Keep CORS tight

If you stay same-origin, life is much simpler. If you ever allow cross-origin SSE, MDN notes that EventSource has a withCredentials mode for credentialed cross-origin use, so you must explicitly configure credentials and origin rules correctly.

So the framework default should be:

same-origin only
explicit allowlist if cross-origin is ever enabled
credentials only when explicitly needed
10. Use connection limits, timeouts, and resume IDs

SSE is long-lived. That means you should protect the backend with:

max concurrent streams per user/session
idle timeout / heartbeat policy
rate limiting on reconnect storms
event IDs so clients can resume safely

The HTML SSE spec and MDN both support event IDs / Last-Event-ID behavior for reconnects.

That is more reliability than security, but it becomes security-relevant when reconnect storms can be abused for resource exhaustion.

11. Sanitize all server-rendered HTML

Because Datastar patches server HTML directly into the DOM, your backend templates become part of the trust boundary. Datastar’s whole model is backend-driven DOM updates.

So your framework should enforce:

server-owned templates only
escaped output by default
no raw user HTML unless explicitly sanitized
no inline script injection through content data
12. A good secure default API

I would make these framework rules:

:run="data('/events/notifications')"
@click="request('/users', { method: 'POST', body: form })"

And under the hood:

data() defaults:

GET
same-origin
session cookie auth
no ambient signals unless opted in
no script execution from SSE
auto-close on hidden pages unless author opts in

request() defaults:

same-origin
CSRF header included
filtered state only
JSON or form body
standard auth/session cookie

That fits Datastar very well because Datastar already supports GET-backed SSE responses, headers on requests, filterSignals, and hidden-page stream control.

The shortest version is:

More security comes from making data() a locked-down, read-only, same-origin, session-authenticated SSE helper with no script execution and minimal signal transport. Then keep all writes in request() with CSRF protection.

If you want, I’ll turn this into a concrete mini-spec for data() and request() with default options and security rules.

Then data would really need to become read.
Thought for 19s

Yes — read() is a better name than data().

Because now the intent is obvious:

read() = open a read-only live channel
request() = do a normal one-off HTTP request

So this:

<section [notifications]
         :run="read('/events/notifications')">
</section>

is much clearer than:

<section [notifications]
         :run="data('/events/notifications')">
</section>

It tells you immediately:

this is not a write
this is not a generic fetch
this is a read stream

I would lock it like this:

:run="read('/events/...')"
@click="request('/users')"
@click="request('/users', { method: 'POST', body: form })"

So the mental model becomes:

read() → live SSE read
request() → normal request
mutate() → local state change

That is a very clean split.

Your syntax now would be:

[name]
#name

@click=""
@input=""
@change=""
@submit=""

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

:use=""
:props=""
:area=""
:fill=""
:mount

:class.name=""
:set.name=""
:loading=""
:error=""

Built-ins/functions:

self
parent
children
root
props
event
mutate()
read()
request()

That is much more coherent.

Don't forget all the syntax for crud actions you just showed me.
Thought for 9s

Yes — here’s the updated language with the CRUD-style request syntax included.

Core authoring syntax
[name]              <!-- class shorthand -->
#name               <!-- id shorthand -->
@event="..."        <!-- event handler -->
:directive="..."    <!-- reactive/template directive -->
Core directives
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
Template/layout directives
:use=""
:props=""
:area=""
:fill=""
:mount
Dynamic DOM directives
:class.name=""
:set.name=""
:loading=""
:error=""
Built-in scope values and helpers
self
parent
children
root
props
event
mutate()
read()
request()
CRUD / request syntax

This is the part you wanted preserved.

Read one-off request
@click="request('/users')"
Create
@click="request('/users', { method: 'POST', body: form })"
Read live stream
:run="read('/events/users')"
Update
@click="request('/users/12', { method: 'PUT', body: user })"

or partial update:

@click="request('/users/12', { method: 'PATCH', body: { name: 'Sarah' } })"
Delete
@click="request('/users/12', { method: 'DELETE' })"
Local mutation syntax
Direct mutation
@click="count++"
@click="open = !open"
@click="parent.open = false"
Explicit mutation helper
@click="mutate('count', count + 1)"
@click="mutate('open', !open)"
@click="mutate(parent, 'open', false)"
Example using everything together
<section [users-page]
         :state="{ users: [], selectedUser: null, loading: false, error: null }"
         :run="read('/events/users')">

  <button @click="request('/users')">Load Users</button>

  <button @click="request('/users', {
    method: 'POST',
    body: { name: 'New User' }
  })">
    Create User
  </button>

  <button @click="request('/users/12', {
    method: 'PATCH',
    body: { name: 'Updated User' }
  })">
    Update User
  </button>

  <button @click="request('/users/12', {
    method: 'DELETE'
  })">
    Delete User
  </button>

  <ul>
    <template :each="user in users">
      <li [user-row] @click="selectedUser = user">
        <span :text="user.name"></span>
      </li>
    </template>
  </ul>
</section>
Current language snapshot
[name]
#name

@click=""
@input=""
@change=""
@submit=""

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

:use=""
:props=""
:area=""
:fill=""
:mount

:class.name=""
:set.name=""
:loading=""
:error=""

self
parent
children
root
props
event
mutate()
read()
request()

The clean mental model is:

read() = live server reads
request() = one-off HTTP CRUD actions
mutate() = local state changes

That split is strong enough for v1.

Can we make the one's with methods short and clear?
Thought for 23s

Yes.

The cleanest version is to keep request() as the low-level escape hatch, but give the common HTTP methods short helpers.

Better method syntax

Use:

get()
post()
put()
patch()
remove()
read()

So now the split becomes:

read() = live SSE read channel
get() = one-off GET request
post() = create
put() = full update
patch() = partial update
remove() = delete
mutate() = local state change
Examples
Read once
@click="get('/users')"
Create
@click="post('/users', form)"
Replace/update
@click="put('/users/12', user)"
Partial update
@click="patch('/users/12', { name: 'Sarah' })"
Delete
@click="remove('/users/12')"
Live read
:run="read('/events/users')"
Why this is better

It is:

shorter
clearer
easier to scan in templates
closer to what people already expect

And it avoids this heavier syntax:

@click="request('/users', { method: 'POST', body: form })"

for common cases.

Keep request() too

Still keep:

request(url, options)

for advanced cases like custom headers, query options, retry rules, filters, or unusual methods.

So the rule becomes:

use get/post/put/patch/remove/read for normal app code
use request() when you need extra control
Updated built-ins

Your built-in helpers now become:

self
parent
children
root
props
event

mutate()
read()
get()
post()
put()
patch()
remove()
request()
Example page
<section [users-page]
         :state="{ users: [], selectedUser: null }"
         :run="read('/events/users')">

  <button @click="get('/users')">Load Users</button>
  <button @click="post('/users', { name: 'New User' })">Create</button>
  <button @click="patch('/users/12', { name: 'Updated User' })">Rename</button>
  <button @click="remove('/users/12')">Delete</button>

  <ul>
    <template :each="user in users">
      <li [user-row] @click="selectedUser = user">
        <span :text="user.name"></span>
      </li>
    </template>
  </ul>
</section>
Current language
[name]
#name

@click=""
@input=""
@change=""
@submit=""

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

:use=""
:props=""
:area=""
:fill=""
:mount

:class.name=""
:set.name=""
:loading=""
:error=""

Built-ins:

self
parent
children
root
props
event

mutate()
read()
get()
post()
put()
patch()
remove()
request()

I think remove() is the right choice instead of delete() because it stays readable and avoids keyword weirdness.

I think post() should be create(), full update should be post(), partial update should be patch(), and remove() would become delete() the rest would stay the same.
Thought for 37s

Yes — that can work.

So your action helpers become:

read()
get()
create()
post()
patch()
delete()
request()
mutate()

With the meanings:

read() = live SSE read channel
get() = one-off GET request
create() = create new record
post() = full update
patch() = partial update
delete() = delete record
request() = advanced/custom request
mutate() = local state update

Example usage:

@click="get('/users')"
@click="create('/users', form)"
@click="post('/users/12', user)"
@click="patch('/users/12', { name: 'Sarah' })"
@click="delete('/users/12')"
:run="read('/events/users')"

That is clean and easy to read.

The one thing to decide is whether these names are just framework verbs or whether they directly map to HTTP methods.

Because if they map directly to HTTP:

create() would usually send POST
post() would also send POST

So if you keep both, then post() cannot literally mean the HTTP verb in your language anymore. It would mean “send/replace full update using the framework’s full-update rule.”

That is fine, but it should be explicit.

A good internal mapping could be:

create(url, body) -> HTTP POST
post(url, body)   -> HTTP PUT
patch(url, body)  -> HTTP PATCH
delete(url)       -> HTTP DELETE
get(url)          -> HTTP GET
read(url)         -> SSE GET

If that is what you want, I would keep the author-facing names exactly as you wrote them, but document the transport mapping clearly.

So the updated built-ins would be:

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
post()
patch()
delete()
request()

And the language now is:

[name]
#name

@click=""
@input=""
@change=""
@submit=""

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

:use=""
:props=""
:area=""
:fill=""
:mount

:class.name=""
:set.name=""
:loading=""
:error=""

This version is readable. The only caveat is that post() now means your framework’s “full update” action, not literally the HTTP POST verb.

Ok, then let's change post() to update()
Thought for 6s

Yes — update() is much clearer.

So the action helpers now become:

read()
get()
create()
update()
patch()
delete()
request()
mutate()

Meaning:

read() = live SSE read channel
get() = one-off GET request
create() = create new record
update() = full update
patch() = partial update
delete() = delete record
request() = advanced/custom request
mutate() = local state change

Example usage:

@click="get('/users')"
@click="create('/users', form)"
@click="update('/users/12', user)"
@click="patch('/users/12', { name: 'Sarah' })"
@click="delete('/users/12')"
:run="read('/events/users')"

That gives you a much cleaner set of verbs because now each one says what it means.

So your current built-ins are:

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

And your current syntax is:

[name]
#name

@click=""
@input=""
@change=""
@submit=""

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

:use=""
:props=""
:area=""
:fill=""
:mount

:class.name=""
:set.name=""
:loading=""
:error=""

That version is a lot more coherent. The next good step is to decide exactly what create(), update(), patch(), and delete() return by default: HTML, state, or both.

Oh, I thought that was already worked out.
Thought for 25s

Not fully — we had worked out the verbs, but not the default return contract.

We should lock that now.

The clean default contract
read()

For live SSE only.

:run="read('/events/users')"

Default return:

state updates
html updates
or both

read() is the only live channel.

get()

For one-time reads.

@click="get('/users')"

Default return:

HTML by default

Reason: in this framework, get() usually means “go get the next piece of UI.”

So get() should naturally load:

a page
a partial
a component
a filled area
mounted content

If the server returns state instead, that is allowed, but HTML should be the normal expectation.

create()

For creating a record.

@click="create('/users', form)"

Default return:

HTML + state allowed
but the default expectation should be HTML

Reason: after create, you usually want the UI refreshed:

new list item
updated table
new card
success area
form reset view

So create should usually rerender something.

update()

For full update.

@click="update('/users/12', user)"

Default return:

HTML by default

Reason: a full update usually means you want the updated UI back.

patch()

For partial update.

@click="patch('/users/12', { name: 'Sarah' })"

Default return:

state by default

Reason: patch is usually smaller and more reactive.
It fits partial updates well.

So patch should lean toward:

state merge
small html patch
targeted UI refresh

If you want one default, I’d make patch() default to state.

delete()

For delete.

@click="delete('/users/12')"

Default return:

HTML by default

Reason: after delete, the UI usually needs to rerender:

remove row
remove card
update list count
show empty state
So the final defaults should be
read()   -> live html/state stream
get()    -> html
create() -> html
update() -> html
patch()  -> state
delete() -> html
request() -> whatever you explicitly handle
mutate() -> local only
Why this is a good split

Because your framework is still mostly HTML-first.

major actions return UI
small partial changes can return state
live channels can return both

That keeps it simple.

Optional override

You will still want an override later, something like:

@click="get('/users', { as: 'state' })"
@click="patch('/users/12', data, { as: 'html' })"

But for v1, the defaults above are strong enough.

So yes, now it is worked out

Your action contract is:

read()   -> live stream
get()    -> html
create() -> html
update() -> html
patch()  -> state
delete() -> html
request() -> advanced/custom
mutate() -> local state

That is coherent.

What we can do is .HTML, SSE, state, JSON. And request should only be one direction from the server to the browser.

I’m tightening the transport model now, because this is really about separating browser→server calls from server→browser updates cleanly.

Thought for 36s

Yes — that is the right split, with one important correction:

request() cannot be server → browser.
By definition in HTTP, the request starts in the browser and goes to the server. What comes back is the response. Datastar’s backend actions (@get, @post, @put, @patch, @delete) all send browser → server requests, and Datastar then handles the server response based on content type.

So the clean model is:

browser → server actions: get(), create(), update(), patch(), delete(), request()
server → browser live channel: read()
response types: .html, .sse, .state, .json

That lines up well with what Datastar already supports:

text/html
text/event-stream
application/json
text/javascript
Datastar will auto-handle those response types, but for your framework I would drop text/javascript entirely for safety.
The response contract

I would define your four result types like this:

.html

Server returns text/html.

Use it when the server is sending rendered markup for:

a page
a component
an area
a mount target

Datastar already supports text/html responses and lets the server specify patch target and patch mode with headers like datastar-selector and datastar-mode.

.sse

Server returns text/event-stream.

Use it only for read() and live updates.

Datastar’s @get() can open an SSE stream, and its SSE event model is the live transport for patching elements and signals over time.

.state

Server returns reactive state patch data.

In Datastar, this is already application/json that gets patched into signals. Datastar also supports an optional datastar-only-if-missing header for JSON signal patching.

So in your framework, .state should mean:

return JSON
auto-merge it into reactive state
.json

This should be raw JSON, not auto-patched state.

This is the one your framework has to add conceptually, because Datastar’s native application/json handling is already “patch signals,” not “just hand me JSON as data.”

So the distinction should be:

.state = JSON that updates reactive state automatically
.json = plain JSON result that your runtime hands to the caller

That gives you a real difference between the two.

The transport model

So your framework should work like this:

Browser → server
@click="get('/users')"
@click="create('/users', form)"
@click="update('/users/12', user)"
@click="patch('/users/12', { name: 'Sarah' })"
@click="delete('/users/12')"

These are all request helpers.

Server → browser live
:run="read('/events/users')"

This is the one-way live channel.

That fits Datastar well because:

normal actions use Fetch
live reads can stay on SSE
response handling is already content-type driven
The default mapping I’d lock in
read()   -> .sse
get()    -> .html
create() -> .html
update() -> .html
patch()  -> .state
delete() -> .html
request() -> explicit/advanced
mutate() -> local only

And request() should allow an explicit result mode, like:

@click="request('/users', { as: '.html' })"
@click="request('/users/12', { method: 'PATCH', body: data, as: '.state' })"
@click="request('/stats', { as: '.json' })"
The important naming rule

Because of this, I would define:

request() = browser → server
read() = server → browser live stream
.html, .sse, .state, .json = response/result modes

That keeps the naming honest and avoids confusing transport direction.

The strongest version of your model
Actions:
read()
get()
create()
update()
patch()
delete()
request()
mutate()

Response modes:
.html
.sse
.state
.json

And for safety, I would explicitly say:

.sse is only valid with read()
.state maps to Datastar’s JSON signal patch behavior
.json is raw JSON and does not auto-patch
.html is the default UI response
no framework support for server-sent JavaScript by default, even though Datastar can handle it

That is a much cleaner contract.

Well request() needs to not be able to write data to the backend or database.
Thought for 26s

Yes — then request() should be read-only by design.

That means:

request() can only do GET-style reads
it cannot accept write methods
it cannot be used for create/update/patch/delete
it should not send a mutating body by default

That fits normal HTTP semantics: GET should only retrieve data and is classified as a safe method, while POST, PUT, PATCH, and DELETE are not safe and are used for state changes.

It also fits Datastar cleanly, because Datastar already separates @get() from @post(), @put(), @patch(), and @delete(). @get() sends a GET request, while the others are distinct write-capable actions.

So I’d lock the contract like this:

read()      -> live SSE read only
request()   -> one-off read only
get()       -> simple one-off read alias
create()    -> write
update()    -> write
patch()     -> write
delete()    -> write
mutate()    -> local state only

And I’d define request() as the advanced read helper, not the universal transport helper.

What request() should allow

Good:

@click="request('/users')"
@click="request('/users', { as: '.html' })"
@click="request('/stats', { as: '.json' })"
@click="request('/search?q=sarah', { as: '.state' })"

Not allowed:

@click="request('/users', { method: 'POST', body: form })"
@click="request('/users/12', { method: 'PATCH', body: data })"
@click="request('/users/12', { method: 'DELETE' })"

Those must go through:

@click="create('/users', form)"
@click="update('/users/12', user)"
@click="patch('/users/12', data)"
@click="delete('/users/12')"
The best final split
read(url, options?)      // live read channel only
request(url, options?)   // one-off read only
get(url, options?)       // short one-off read
create(url, body, options?)
update(url, body, options?)
patch(url, body, options?)
delete(url, options?)
mutate(pathOrTarget, value?)
Response modes

Then your response modes stay:

.html
.sse
.state
.json

with these rules:

read() -> .sse
request() / get() -> .html, .state, or .json
writes can return .html, .state, or .json, but not .sse
One important truth

Even with this framework rule, the server still has to honor it. A badly designed backend could still make a GET endpoint write to the database, but that would violate normal HTTP semantics. The framework can prevent authors from asking for writes through request(), and the backend should keep GET endpoints read-only.

So yes: request() should be read-only.
It becomes your advanced fetch-for-reading helper, while all writes stay in create(), update(), patch(), and delete().

No it would be like update.html() or .SSE, or .state, or JSON. Not inside the ()
Thought for 16s

Yes — that is much better.

So instead of this:

@click="update('/users/12', user, { as: '.html' })"

you want this:

@click="update.html('/users/12', user)"

That is cleaner and easier to scan.

The pattern

Use:

action.mode(...)

So the mode is attached to the action itself.

Actions
read
request
get
create
update
patch
delete
mutate
Modes
html
sse
state
json
Valid combinations
Read-only live stream
:run="read.sse('/events/users')"
Read-only one-off requests
@click="request.html('/users')"
@click="request.state('/users')"
@click="request.json('/users')"

@click="get.html('/users')"
@click="get.state('/users')"
@click="get.json('/users')"
Writes
@click="create.html('/users', form)"
@click="create.state('/users', form)"
@click="create.json('/users', form)"

@click="update.html('/users/12', user)"
@click="update.state('/users/12', user)"
@click="update.json('/users/12', user)"

@click="patch.html('/users/12', { name: 'Sarah' })"
@click="patch.state('/users/12', { name: 'Sarah' })"
@click="patch.json('/users/12', { name: 'Sarah' })"

@click="delete.html('/users/12')"
@click="delete.state('/users/12')"
@click="delete.json('/users/12')"
Local only
@click="mutate('count', count + 1)"

No mode needed for mutate().

Best rules

I would lock it like this:

read.sse(...) only
request.html(...), request.state(...), request.json(...)
get.html(...), get.state(...), get.json(...)
create.html(...), create.state(...), create.json(...)
update.html(...), update.state(...), update.json(...)
patch.html(...), patch.state(...), patch.json(...)
delete.html(...), delete.state(...), delete.json(...)

And:

request() stays read-only
get() stays read-only
read() stays live read-only
writes only happen through create, update, patch, delete
Naming recommendation

Keep them all lowercase:

read.sse()
update.html()
patch.state()
request.json()

That fits the rest of your language much better than mixed-case .SSE or .JSON.

Your language now
Structure
[name]
#name
Events
@click=""
@input=""
@change=""
@submit=""
Directives
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

:use=""
:props=""
:area=""
:fill=""
:mount

:class.name=""
:set.name=""
:loading=""
:error=""
Built-ins
self
parent
children
root
props
event
mutate()

read.sse()

request.html()
request.state()
request.json()

get.html()
get.state()
get.json()

create.html()
create.state()
create.json()

update.html()
update.state()
update.json()

patch.html()
patch.state()
patch.json()

delete.html()
delete.state()
delete.json()
Example
<section [users-page]
         :state="{ users: [], selectedUser: null }"
         :run="read.sse('/events/users')">

  <button @click="get.html('/users')">Load Users</button>
  <button @click="create.html('/users', { name: 'New User' })">Create</button>
  <button @click="update.html('/users/12', user)">Save</button>
  <button @click="patch.state('/users/12', { name: 'Sarah' })">Rename</button>
  <button @click="delete.html('/users/12')">Delete</button>
</section>

That is much more coherent than stuffing the mode into the argument object.

The next thing to lock down is whether you want defaults like get() meaning get.html() and patch() meaning patch.state(), or whether every action should always require an explicit mode.

The default would be what we decide before.
Thought for 13s

Exactly.

So the unsuffixed form just uses the default mode we already chose.

Default action mapping
read()    -> read.sse()
request() -> request.html()
get()     -> get.html()
create()  -> create.html()
update()  -> update.html()
patch()   -> patch.state()
delete()  -> delete.html()
mutate()  -> local only
Explicit overrides

When you want something different, you add the mode:

get.json('/users')
get.state('/users')

create.json('/users', form)
update.state('/users/12', user)
patch.html('/users/12', { name: 'Sarah' })
delete.state('/users/12')
request.json('/stats')
Clean rule
read() is live and read-only, so its default is sse
request() is one-off and read-only, so its default is html
get() defaults to html
create() defaults to html
update() defaults to html
patch() defaults to state
delete() defaults to html
mutate() never needs a mode
So the shorthand becomes
:run="read('/events/users')"

@click="get('/users')"
@click="create('/users', form)"
@click="update('/users/12', user)"
@click="patch('/users/12', { name: 'Sarah' })"
@click="delete('/users/12')"

And those automatically mean:

:run="read.sse('/events/users')"

@click="get.html('/users')"
@click="create.html('/users', form)"
@click="update.html('/users/12', user)"
@click="patch.state('/users/12', { name: 'Sarah' })"
@click="delete.html('/users/12')"

That is the cleanest version so far.

Ok, using hour new framework build a contact book, it should be an spa with a table that includes name phone number and business. It should record the time and data of entry based off where the user is.

I’m putting this into a concrete single-page example using the syntax we defined, with local entry timestamping and browser-detected timezone/location metadata.

Are you still there?
Thought for 33s

Yes — I’m here.

I was in the middle of building the contact book SPA example using the framework syntax we defined: a table with name, phone number, business, plus local date/time and location-aware entry metadata.

That's cool, it just needs to be really simple.
Thought for 21s

Absolutely. Here’s a really simple SPA-style contact book in your syntax.

It keeps everything local in state, shows a table with name, phone number, and business, and records the entry date/time using the user’s browser locale and timezone.

<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Contact Book</title>
  <style>
    body {
      font-family: Arial, sans-serif;
      margin: 0;
      padding: 24px;
      background: #f7f7f7;
      color: #222;
    }

    .app {
      max-width: 900px;
      margin: 0 auto;
      background: white;
      border: 1px solid #ddd;
      border-radius: 12px;
      padding: 20px;
    }

    .title {
      margin: 0 0 16px;
    }

    .form {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 12px;
      margin-bottom: 20px;
    }

    .input,
    .button {
      padding: 10px 12px;
      border-radius: 8px;
      border: 1px solid #ccc;
      font: inherit;
    }

    .button {
      cursor: pointer;
      background: #222;
      color: white;
      border: none;
    }

    .button:hover {
      opacity: 0.9;
    }

    .table {
      width: 100%;
      border-collapse: collapse;
      background: white;
    }

    .table th,
    .table td {
      text-align: left;
      padding: 10px;
      border-bottom: 1px solid #e5e5e5;
      vertical-align: top;
    }

    .muted {
      color: #666;
      font-size: 0.9rem;
      margin-top: 8px;
    }

    .empty {
      padding: 16px 0;
      color: #666;
    }
  </style>
</head>
<body>
  <section
    [app]
    :state="{
      form: {
        name: '',
        phone: '',
        business: ''
      },
      contacts: [],
      timezone: '',
      locale: ''
    }"
    :run="
      timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      locale = navigator.language;
    "
  >
    <div [app-shell]>
      <h1 [title]>Contact Book</h1>

      <div [form]>
        <input
          [input]
          type="text"
          placeholder="Name"
          :bind="form.name"
        />

        <input
          [input]
          type="text"
          placeholder="Phone Number"
          :bind="form.phone"
        />

        <input
          [input]
          type="text"
          placeholder="Business"
          :bind="form.business"
        />

        <button
          [button]
          @click="
            if (!form.name || !form.phone || !form.business) return;

            contacts.push({
              id: Date.now(),
              name: form.name,
              phone: form.phone,
              business: form.business,
              enteredAt: new Date().toLocaleString(locale),
              timezone: timezone
            });

            form.name = '';
            form.phone = '';
            form.business = '';
          "
        >
          Add Contact
        </button>
      </div>

      <table [table]>
        <thead>
          <tr>
            <th>Name</th>
            <th>Phone Number</th>
            <th>Business</th>
            <th>Entered</th>
            <th>Time Zone</th>
          </tr>
        </thead>
        <tbody>
          <template :each="contact in contacts">
            <tr>
              <td :text="contact.name"></td>
              <td :text="contact.phone"></td>
              <td :text="contact.business"></td>
              <td :text="contact.enteredAt"></td>
              <td :text="contact.timezone"></td>
            </tr>
          </template>
        </tbody>
      </table>

      <div [empty] :if="contacts.length === 0">
        No contacts yet.
      </div>

      <p [muted] :text="'Entries use the browser local date, time, and timezone: ' + timezone"></p>
    </div>
  </section>
</body>
</html>

A couple of small notes:

This is a true simple SPA-style local app: no page reloads, all state stays in the page.
“Based off where the user is” here means the user’s local browser locale and timezone.
If you want, I can make the next version save contacts permanently and add edit/delete.
What if it wasn't just in state be also on a backend?
Thought for 16s

Yes — then the pattern becomes:

state = what the page is showing right now
backend = source of truth
read() / get() = pull data from backend
create() / update() / patch() / delete() = write to backend
read('/events/...') = live updates from backend into the SPA

The key rule should be:

state is UI state, backend is persisted state.

For your contact book, I’d do it like this.

What gets stored on the backend

Each contact record:

{
  "id": "123",
  "name": "Sarah Robbins",
  "phone": "555-123-4567",
  "business": "Covalent Designs",
  "createdAt": "2026-03-25T18:12:00Z",
  "clientTimezone": "America/Chicago",
  "clientLocale": "en-US"
}

Important detail:

server should create createdAt
browser can send clientTimezone and clientLocale
browser can also send geolocation later if the user explicitly allows it

So:

authoritative time = backend
user local context = browser
How the page would work
On page load
<section
  [contacts-page]
  :state="{ contacts: [], form: { name: '', phone: '', business: '' }, timezone: '', locale: '' }"
  :run="
    timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    locale = navigator.language;
    get.state('/contacts');
  "
>

That means:

get browser timezone/locale
load contacts from backend into state
Creating a contact
<button
  [button]
  @click="
    create.state('/contacts', {
      name: form.name,
      phone: form.phone,
      business: form.business,
      clientTimezone: timezone,
      clientLocale: locale
    })
  "
>
  Add Contact
</button>

That sends the form to the backend.

The backend:

validates it
stores it
stamps createdAt
returns updated state or the new contact
Recommended return behavior

For this app, I’d use:

get.state('/contacts') for loading the table
create.state('/contacts', ...) for adding one
update.state('/contacts/:id', ...) for editing
delete.state('/contacts/:id') for removing

That way the table state stays reactive and simple.

Table rendering
<table [table]>
  <thead>
    <tr>
      <th>Name</th>
      <th>Phone</th>
      <th>Business</th>
      <th>Created</th>
      <th>Timezone</th>
    </tr>
  </thead>
  <tbody>
    <template :each="contact in contacts">
      <tr>
        <td :text="contact.name"></td>
        <td :text="contact.phone"></td>
        <td :text="contact.business"></td>
        <td :text="contact.createdAt"></td>
        <td :text="contact.clientTimezone"></td>
      </tr>
    </template>
  </tbody>
</table>
Best backend shape

I’d make the backend endpoints:

GET    /contacts
POST   /contacts
PUT    /contacts/:id
PATCH  /contacts/:id
DELETE /contacts/:id
GET    /events/contacts

And in your framework syntax:

get.state('/contacts')
create.state('/contacts', data)
update.state('/contacts/123', data)
patch.state('/contacts/123', data)
delete.state('/contacts/123')
read('/events/contacts')
If you want live syncing too

Then add:

:run="read('/events/contacts')"

Now if another user adds or edits a contact, the backend can push updates into the SPA.

So the flow becomes:

initial load: get.state('/contacts')
writes: create/update/patch/delete
live updates: read('/events/contacts')
Best practice for date/time

Because you said “based off where the user is,” I would store:

createdAt from server
clientTimezone from browser
optionally clientLocalCreatedAt if you want the exact displayed local value at entry time

But I would not trust browser time as the main record time.

The simple answer

If it is backed by a server, your framework should treat:

state as the current page model
backend as the permanent record
actions as syncing state with the server
read() as live server-to-browser updates

That is the right architecture.

If you want, I’ll write the full simple contact book again, but this time as a backend-backed example using your finalized syntax.

Is there any way we can put ....

Code like:

create.state('/contacts', {
      name: form.name,
      phone: form.phone,
      business: form.business,
      clientTimezone: timezone,
      clientLocale: locale
    })

Structureed in another file and call it into our HTML so we are not making it so big?
Thought for 24s

Yes — and you should.

The simplest v1 answer is:

keep structure in HTML, move behavior into separate JS modules, then call named functions from the HTML.

That keeps your HTML small without adding a compiler.

Best simple pattern
HTML
<section
  [contacts-page]
  :state="{ contacts: [], form: { name: '', phone: '', business: '' }, timezone: '', locale: '' }"
  :run="contacts.setup()"
>
  <button @click="contacts.create()">Add Contact</button>
</section>
Separate file
// /logic/contacts.js
export function registerContacts(scope) {
  return {
    setup() {
      scope.timezone = Intl.DateTimeFormat().resolvedOptions().timeZone
      scope.locale = navigator.language
      get.state('/contacts')
    },

    create() {
      create.state('/contacts', {
        name: scope.form.name,
        phone: scope.form.phone,
        business: scope.form.business,
        clientTimezone: scope.timezone,
        clientLocale: scope.locale
      })
    }
  }
}

So the HTML stays tiny:

<button @click="contacts.create()">Add Contact</button>

instead of stuffing all the request details inline.

How I would make it work in your framework

Add one simple idea:

:logic
<section
  [contacts-page]
  :state="{ contacts: [], form: { name: '', phone: '', business: '' }, timezone: '', locale: '' }"
  :logic="'contacts'"
  :run="contacts.setup()"
>

That would mean:

load /logic/contacts.js
register it for this component/page
expose it in expressions as contacts

Then your HTML can call:

@click="contacts.create()"
@click="contacts.remove(contact.id)"
@click="contacts.load()"

That is probably the cleanest version.

What the file structure would look like
/pages
  contacts.html

/logic
  contacts.js

/components
  contact-form.html
  contact-table.html

So:

HTML files = structure
JS logic files = actions and behavior
Example
contacts.html
<section
  [contacts-page]
  :state="{ contacts: [], form: { name: '', phone: '', business: '' }, timezone: '', locale: '' }"
  :logic="'contacts'"
  :run="contacts.setup()"
>
  <div [form-row]>
    <input :bind="form.name" placeholder="Name">
    <input :bind="form.phone" placeholder="Phone">
    <input :bind="form.business" placeholder="Business">
    <button @click="contacts.create()">Add Contact</button>
  </div>

  <table [table]>
    <thead>
      <tr>
        <th>Name</th>
        <th>Phone</th>
        <th>Business</th>
        <th>Created</th>
      </tr>
    </thead>
    <tbody>
      <template :each="contact in contacts">
        <tr>
          <td :text="contact.name"></td>
          <td :text="contact.phone"></td>
          <td :text="contact.business"></td>
          <td :text="contact.createdAt"></td>
        </tr>
      </template>
    </tbody>
  </table>
</section>
contacts.js
export function createLogic(scope, api) {
  return {
    setup() {
      scope.timezone = Intl.DateTimeFormat().resolvedOptions().timeZone
      scope.locale = navigator.language
      api.get.state('/contacts')
    },

    create() {
      api.create.state('/contacts', {
        name: scope.form.name,
        phone: scope.form.phone,
        business: scope.form.business,
        clientTimezone: scope.timezone,
        clientLocale: scope.locale
      })
    },

    remove(id) {
      api.delete.html(`/contacts/${id}`)
    }
  }
}
Why this is the best route

It gives you:

small HTML
no build step
reusable logic
easier testing
easier naming
cleaner components

And it matches your framework direction well:

HTML stays declarative
logic lives elsewhere
the page just calls named actions
The one new syntax piece I’d add
:logic="'contacts'"

That is enough.

Then your runtime:

loads the logic module
binds it to the current scope
exposes contacts.* to the template

That is probably the cleanest answer to the problem you’re hitting.

You did not use our syntax in the .js file.
Thought for 19s

You’re right.

The HTML syntax stays in HTML, but the logic file should still use the same framework action API like:

get.state(...)
create.state(...)
update.html(...)
patch.state(...)
delete.html(...)
read.sse(...)
mutate(...)

So the corrected version would look like this.

HTML
<section
  [contacts-page]
  :state="{
    contacts: [],
    form: {
      name: '',
      phone: '',
      business: ''
    },
    timezone: '',
    locale: ''
  }"
  :logic="'contacts'"
  :run="contacts.setup()"
>
  <div [form-row]>
    <input [input] :bind="form.name" placeholder="Name" />
    <input [input] :bind="form.phone" placeholder="Phone" />
    <input [input] :bind="form.business" placeholder="Business" />
    <button [button] @click="contacts.create()">Add Contact</button>
  </div>

  <table [table]>
    <thead>
      <tr>
        <th>Name</th>
        <th>Phone</th>
        <th>Business</th>
        <th>Created</th>
        <th>Timezone</th>
      </tr>
    </thead>
    <tbody>
      <template :each="contact in contacts">
        <tr>
          <td :text="contact.name"></td>
          <td :text="contact.phone"></td>
          <td :text="contact.business"></td>
          <td :text="contact.createdAt"></td>
          <td :text="contact.clientTimezone"></td>
        </tr>
      </template>
    </tbody>
  </table>
</section>
contacts.js
export default function contacts({
  state,
  props,
  parent,
  children,
  root,
  mutate,
  get,
  create,
  update,
  patch,
  delete: remove,
  request,
  read
}) {
  return {
    setup() {
      mutate('timezone', Intl.DateTimeFormat().resolvedOptions().timeZone)
      mutate('locale', navigator.language)

      get.state('/contacts')
      read.sse('/events/contacts')
    },

    create() {
      create.state('/contacts', {
        name: state.form.name,
        phone: state.form.phone,
        business: state.form.business,
        clientTimezone: state.timezone,
        clientLocale: state.locale
      })

      mutate('form.name', '')
      mutate('form.phone', '')
      mutate('form.business', '')
    },

    update(contact) {
      update.state(`/contacts/${contact.id}`, {
        name: contact.name,
        phone: contact.phone,
        business: contact.business
      })
    },

    patch(id, values) {
      patch.state(`/contacts/${id}`, values)
    },

    delete(id) {
      remove.html(`/contacts/${id}`)
    }
  }
}

That keeps the JS file aligned with the framework language:

same verbs
same modes
same mutation helper

So the rule becomes:

HTML uses your template syntax: [ ], #, @, :
JS logic files use the same framework runtime API: get.state, create.state, read.sse, mutate

That is the cleaner version.

If you want, I can write the smallest possible full contact-book example with contacts.html and contacts.js only.

Would it be possible to turn the js file into some kind of JSON or YAML file? Or would that not be a good ide?
Thought for 7s

Yes — partly, but I would not replace the JS file completely.

The good split is:

use JSON/YAML for configuration
use JS for real logic

Because JSON/YAML are good at describing data, but not good at expressing behavior like:

conditionals
loops
mutation rules
calling create.state(...)
reacting to parent, children, event
formatting values
branching on errors

So this would be fine in YAML:

id: contacts
run:
  - mutate: timezone
    value: browser.timezone
  - mutate: locale
    value: browser.locale
  - action: get.state
    path: /contacts
  - action: read.sse
    path: /events/contacts

actions:
  create:
    action: create.state
    path: /contacts
    body:
      name: state.form.name
      phone: state.form.phone
      business: state.form.business
      clientTimezone: state.timezone
      clientLocale: state.locale

  delete:
    action: delete.html
    path: "/contacts/{id}"

That works if your runtime knows how to interpret it.

But once you need more logic, it gets awkward fast. For example:

“only submit if all fields are filled”
“reset form after success”
“handle validation errors differently”
“pick one endpoint based on props”
“transform returned data before merging”

That is where YAML/JSON becomes a bad fit.

So my recommendation is:

Best approach

Use a hybrid model.

YAML/JSON for:
endpoint definitions
default actions
field mappings
startup actions
area/mount wiring
simple CRUD declarations
JS for:
custom logic
branching
validation
formatting
advanced state mutation
anything interactive or nontrivial
Strong pattern
contacts.yaml
name: contacts

run:
  - mutate: timezone
    value: browser.timezone
  - mutate: locale
    value: browser.locale
  - get.state: /contacts
  - read.sse: /events/contacts

actions:
  create:
    create.state:
      path: /contacts
      body:
        name: state.form.name
        phone: state.form.phone
        business: state.form.business
        clientTimezone: state.timezone
        clientLocale: state.locale

Then optionally allow:

contacts.js

only when needed for custom behavior.

That gives you:

simple apps with no JS logic file
advanced apps with JS when needed
My honest take
JSON is okay, but a little too rigid
YAML is nicer for humans
neither is a great full replacement for logic
YAML as a declarative action file is a very good idea

So:

Yes for config. No for full behavior.

The best version of your framework probably supports both:

:logic="'contacts'" for JS logic
:logic="'contacts.yaml'" for declarative logic

And the runtime chooses the right interpreter.

A strong rule would be:

use YAML for simple CRUD screens
switch to JS when the behavior stops being simple

That would keep the framework approachable without boxing you in.

I think I would stay with .js
Thought for 4s

I think that’s the right call.

.js gives you:

simple files
real logic when you need it
less weird DSL complexity
easier debugging
room to grow without redesigning the framework

So the clean split is:

HTML = structure and framework syntax
JS = behavior and actions

That means:

HTML
<section
  [contacts-page]
  :state="{ contacts: [], form: { name: '', phone: '', business: '' } }"
  :logic="'contacts'"
  :run="contacts.setup()"
>
  <button @click="contacts.create()">Add Contact</button>
</section>
JS
export default function contacts({ state, mutate, get, create, read }) {
  return {
    setup() {
      mutate('timezone', Intl.DateTimeFormat().resolvedOptions().timeZone)
      mutate('locale', navigator.language)

      get.state('/contacts')
      read.sse('/events/contacts')
    },

    create() {
      create.state('/contacts', {
        name: state.form.name,
        phone: state.form.phone,
        business: state.form.business,
        clientTimezone: state.timezone,
        clientLocale: state.locale
      })
    }
  }
}

That keeps the framework understandable.

At this point, your framework is starting to look like this:

[name] for classes
#name for ids
@event for actions
:directive for reactivity/templates
.js files for reusable logic modules

That is a strong foundation.

I was thinking that is kinda like haveing a js file with both trpc and Axios in it at once.
Thought for 31s

Yes — that’s a good instinct.

What you’re reacting to is too many layers leaking into the same file.

If contacts.js has stuff like:

get.state('/contacts')
create.state('/contacts', ...)
read.sse('/events/contacts')

then that file is mixing:

app logic
transport verbs
response mode
backend route knowledge

That does start to feel like having tRPC and Axios in the same place.

The cleaner fix is:

Don’t let most .js files call raw framework verbs directly

Instead, give them a single app-facing API layer.

So instead of this:

export default function contacts({ state, mutate, get, create, read }) {
  return {
    setup() {
      get.state('/contacts')
      read.sse('/events/contacts')
    },

    create() {
      create.state('/contacts', {
        name: state.form.name,
        phone: state.form.phone,
        business: state.form.business
      })
    }
  }
}

do this:

export default function contacts({ state, mutate, contactsApi }) {
  return {
    setup() {
      contactsApi.load()
      contactsApi.live()
    },

    create() {
      contactsApi.create({
        name: state.form.name,
        phone: state.form.phone,
        business: state.form.business,
        clientTimezone: state.timezone,
        clientLocale: state.locale
      })
    }
  }
}

Then put the framework-specific stuff in one separate file:

export function createContactsApi({ get, create, update, patch, delete: remove, read }) {
  return {
    load() {
      return get.state('/contacts')
    },

    live() {
      return read.sse('/events/contacts')
    },

    create(data) {
      return create.state('/contacts', data)
    },

    update(id, data) {
      return update.state(`/contacts/${id}`, data)
    },

    patch(id, data) {
      return patch.state(`/contacts/${id}`, data)
    },

    delete(id) {
      return remove.html(`/contacts/${id}`)
    }
  }
}
Best architecture

I’d split it into 3 layers:

1. HTML template

Only structure and bindings.

2. Page logic

Stuff like:

form handling
validation
simple UI behavior
calling named API methods
3. Resource/API layer

Stuff like:

routes
verbs
.html / .state / .json / .sse
backend specifics

That way most of your app code never sees raw framework transport details.

So your concern is correct

You probably should not have most logic files directly calling:

get.state
create.state
read.sse

all over the place.

Those should live in a lower-level file.

The rule I’d use
app/page logic files talk to contactsApi
API files talk to get/create/update/patch/delete/read
framework core implements those verbs/modes

That keeps the system clean.

So yes: your concern is real, and the fix is to introduce a single abstraction boundary instead of exposing all framework transport details in every .js file.

So you would have a logic folder and an API folder right?
Thought for 5s

Yes — that’s the cleanest structure.

I’d separate it like this:

/pages or /components
for the HTML files

/logic
for page or component behavior

/api
for backend calls

So the flow becomes:

HTML
→ calls logic

logic
→ calls api

api
→ calls framework transport like get.state(), create.html(), read.sse()

That keeps each layer focused.

A simple shape would be:

/pages
  contacts.html

/logic
  contacts.js

/api
  contacts.js

/logic/contacts.js would handle things like:

setup
form behavior
validation
deciding when to create/update/delete

/api/contacts.js would handle things like:

/contacts
/contacts/:id
/events/contacts
whether something uses .html, .state, .json, or .sse

So your logic file stays clean:

export default function contacts({ state, mutate, contactsApi }) {
  return {
    setup() {
      contactsApi.load()
      contactsApi.live()
    },

    create() {
      contactsApi.create({
        name: state.form.name,
        phone: state.form.phone,
        business: state.form.business,
        clientTimezone: state.timezone,
        clientLocale: state.locale
      })
    }
  }
}

And your API file contains the framework-specific details:

export default function contactsApi({ get, create, update, patch, delete: remove, read }) {
  return {
    load() {
      return get.state('/contacts')
    },

    live() {
      return read.sse('/events/contacts')
    },

    create(data) {
      return create.state('/contacts', data)
    },

    update(id, data) {
      return update.state(`/contacts/${id}`, data)
    },

    patch(id, data) {
      return patch.state(`/contacts/${id}`, data)
    },

    delete(id) {
      return remove.html(`/contacts/${id}`)
    }
  }
}

That is a much better split than stuffing transport details into every logic file.

If you want, the next step is defining the exact folder structure for a full app in this framework.

Well I would like to keep it how ever you want it. I would like to figure out how we could make the logic and API files code shorter and nicer. 
Thought for 34s

Yes — I’d make them shorter through conventions, not more raw code.

The cleanest version is:

keep /logic
keep /api
make both files thin
let the framework infer most names from the file name
What I’d do
1. Auto-match files by name

If you have:

/logic/contacts.js
/api/contacts.js
/pages/contacts.html

then the framework should automatically wire them together.

So inside logic/contacts.js, you just get:

api

not:

contactsApi

That alone makes things nicer.

2. Make API files declarative

Instead of this:

export default function contactsApi({ get, create, update, patch, delete: remove, read }) {
  return {
    load() {
      return get.state('/contacts')
    },

    live() {
      return read.sse('/events/contacts')
    },

    create(data) {
      return create.state('/contacts', data)
    },

    update(id, data) {
      return update.state(`/contacts/${id}`, data)
    },

    patch(id, data) {
      return patch.state(`/contacts/${id}`, data)
    },

    delete(id) {
      return remove.html(`/contacts/${id}`)
    }
  }
}

make it more like:

export default resource('contacts', {
  load: 'state',
  live: 'sse',
  create: 'state',
  update: 'state',
  patch: 'state',
  delete: 'html'
})

Or even shorter:

export default resource('contacts')

if those are your framework defaults.

That means the framework knows:

base route = /contacts
live route = /events/contacts
standard CRUD methods
default response modes

That makes API files tiny.

3. Make logic files use a small context

Instead of passing a huge bag of tools, I’d inject a small clean context:

export default logic(({ state, api, mutate, browser, form }) => ({
  run() {
    mutate({
      timezone: browser.timezone(),
      locale: browser.locale()
    })

    api.load()
    api.live()
  },

  create() {
    api.create({
      ...form.data('contact'),
      clientTimezone: state.timezone,
      clientLocale: state.locale
    })

    form.clear('contact')
  }
}))

That is much nicer than low-level wiring everywhere.

The helpers I would add
resource(name, options?)

Builds a CRUD API object automatically.

Example:

export default resource('contacts')

Generated methods:

api.load()
api.live()
api.create(data)
api.update(id, data)
api.patch(id, data)
api.delete(id)
logic(factory)

Just a thin wrapper so logic files feel consistent.

Example:

export default logic(({ state, api, mutate }) => ({
  run() {
    api.load()
    api.live()
  }
}))
mutate() should accept objects too

So instead of:

mutate('timezone', browser.timezone())
mutate('locale', browser.locale())

you can do:

mutate({
  timezone: browser.timezone(),
  locale: browser.locale()
})

That makes logic files shorter immediately.

form(name) helper

This is a big one.

Instead of:

api.create({
  name: state.form.name,
  phone: state.form.phone,
  business: state.form.business
})

mutate('form.name', '')
mutate('form.phone', '')
mutate('form.business', '')

you want:

api.create(form.data('contact'))
form.clear('contact')

That is much nicer.

So your HTML could mark the form:

<div [form] #contact-form>

or maybe:

<div [form] :form="'contact'">

Then logic can use:

form.data('contact')
form.clear('contact')
form.patch('contact', values)
What the final short version could look like
/api/contacts.js
export default resource('contacts')

That is it.

/logic/contacts.js
export default logic(({ api, mutate, browser, form, state }) => ({
  run() {
    mutate({
      timezone: browser.timezone(),
      locale: browser.locale()
    })

    api.load()
    api.live()
  },

  create() {
    api.create({
      ...form.data('contact'),
      clientTimezone: state.timezone,
      clientLocale: state.locale
    })

    form.clear('contact')
  }
}))

That is short and clean.

If you want it even nicer

You could let resource('contacts') know the form too:

export default logic(({ api, browser, form }) => ({
  run() {
    api.load()
    api.live()
  },

  create() {
    api.create({
      ...form.data('contact'),
      clientTimezone: browser.timezone(),
      clientLocale: browser.locale()
    }).clear('contact')
  }
}))

That starts to feel really good.

My recommendation

I’d lock in these framework helpers:

resource(name, options?)
logic(factory)
mutate(object | path, value?)
browser.timezone()
browser.locale()
form.data(name)
form.clear(name)

That will make both your logic and API files much shorter without becoming magical or confusing.

The best direction is:

thin HTML
tiny logic files
almost no manual API code unless the endpoint is unusual

If you want, I can sketch the exact API for resource(), logic(), and form() next.

This is an amazing idea! Make sure all the helpers align well with our syntax. Try to come up with other helpers so we can tackle more complex common things. Also try to keep the helpers using our syntax and datastars behavior if possible.

I’m mapping helpers to the syntax we already settled on, and I’m checking Datastar’s current primitives so the helpers stay thin instead of fighting the runtime.

Thought for 45s

Yes. The best version is to make helpers feel like natural extensions of your syntax, not a second mini-framework.

The rule I’d use is:

HTML helpers for rendering, binding, visibility, loops, composition
JS helpers for requests, state changes, forms, collections, browser info
keep each helper as a thin wrapper over Datastar’s actual behavior: signals, computed values, effects, init, request handling, loading indicators, HTML patching, JSON signal patching, and SSE patching. Datastar already has those primitives, so your helpers should stay close to them rather than inventing a parallel runtime.

So I’d lock in three design rules first.

First, if a helper changes markup behavior, make it a : directive.

Second, if a helper does data or mutation work, make it a JS helper.

Third, if a helper is just repeated CRUD boilerplate, make it a convention helper, not a new primitive.

Here’s the helper set I’d add.

1. Keep the core syntax small

This still looks right:

[name]
#name

@click=""
@input=""
@change=""
@submit=""

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

:use=""
:props=""
:area=""
:fill=""
:mount

:class.name=""
:set.name=""
:loading=""
:error=""

That core is already strong.

2. Add a small HTML helper layer

These are the ones I’d add first.

:empty

For empty-state UI.

<div [empty] :empty="contacts">
  No contacts yet.
</div>

Meaning: show when the array or object is empty.

:has

The opposite of :empty.

<section [results] :has="contacts">
  ...
</section>
:when

A more readable alias for :if when the condition is not structural.

<div [warning] :when="error">
  Something went wrong.
</div>

You can keep :if for hard conditional rendering and :when for visibility-like conditions.

:value

For one-way value binding where :bind would be too strong.

<input :value="contact.phone" />

This should not write back. :bind already maps well to Datastar’s two-way binding behavior, so :value is useful when you want a simpler one-way form value. Datastar’s data-bind is explicitly two-way on input/select/textarea elements.

:busy

A nicer alias over :loading for UI state.

<button [button] :busy="saving" :set.disabled="saving">
  Save
</button>

Datastar already exposes loading-style state through data-indicator, so this helper should just wrap that pattern.

:ignore

For third-party widgets or DOM you do not want your runtime to touch.

<div :ignore>
  ...
</div>

Datastar already has data-ignore and data-ignore-morph, so this is a very natural fit.

:ref

For grabbing an element reference from logic.

<input #search :ref="'searchInput'" />

That should map to a runtime ref registry rather than ad hoc selectors.

3. Add JS helpers that match the syntax tone

These matter more.

resource(name, options?)

This is still the best API helper.

export default resource('contacts')

By convention it gives:

api.get()
api.read()
api.create(data)
api.update(id, data)
api.patch(id, data)
api.delete(id)

And under the hood it maps to your framework verbs:

get.html() by default
read.sse()
create.html()
update.html()
patch.state()
delete.html()

That matches the defaults you already chose.

logic(factory)

A clean wrapper so logic files all look the same.

export default logic(({ state, api, form, mutate }) => ({
  run() {
    api.get()
  }
}))
form(name)

This one is huge.

form.data('contact')
form.clear('contact')
form.reset('contact')
form.patch('contact', values)
form.errors('contact')
form.valid('contact')

That lets you avoid this kind of repetitive code:

state.form.name
state.form.phone
state.form.business

and replace it with:

form.data('contact')
list(path)

For common list operations on state.

list('contacts').add(item)
list('contacts').remove(id, 'id')
list('contacts').replace(id, next, 'id')
list('contacts').clear()
list('contacts').sort(compareFn)

This keeps mutation readable and centralized.

find(path)

For finding inside state collections.

find('contacts').by('id', contactId)
pick(path, keys)

For request payload shaping.

pick('form.contact', ['name', 'phone', 'business'])
browser

Keep this very small and practical.

browser.timezone()
browser.locale()
browser.online()
browser.visible()
browser.now()

These are the things people actually use.

route

For SPA navigation and route data.

route.go('/contacts')
route.params()
route.query()
route.path()
storage

For lightweight persistence.

storage.get('contacts-filter')
storage.set('contacts-filter', value)
storage.remove('contacts-filter')
confirm

For destructive actions.

confirm('Delete this contact?', () => api.delete(id))
notify

For success/error/info messages.

notify.success('Contact saved')
notify.error('Could not save contact')
4. Add request-result helpers that align with Datastar

Because Datastar already handles text/html, application/json, and text/event-stream, your framework should keep those modes visible but make common flows shorter. Datastar also supports targeting HTML patches with a selector and patch mode, and JSON responses patch signals.

So I’d add these helpers:

api.into(areaName)

For targeting a layout area.

api.get.into('content')
api.create.into('sidebar')

Internally that becomes selector-based HTML patching.

api.as(mode)

For explicit response mode only when needed.

api.get.as('json')
api.patch.as('state')

But keep the normal defaults so authors rarely need it.

api.only(signals)

For Datastar-style filtered signal sending.

Datastar supports filtering signals on requests, so expose that as a helper rather than raw transport config.

api.get.only(['contacts.filter', 'contacts.page'])
api.headers(obj)

For advanced read cases.

api.get.headers({ 'X-Csrf-Token': token })

Datastar actions already allow custom headers.

5. Add state helpers that stay close to Datastar signals

Datastar signals are globally accessible, support nested paths, and can be patched by JSON merge patch or SSE patch-signals events. That means your state helpers should think in nested paths, not in component-local magic.

So I’d make mutate() more capable:

mutate('form.name', 'Sarah')
mutate({
  timezone: browser.timezone(),
  locale: browser.locale()
})
mutate.merge('form', { name: 'Sarah', phone: '555-1111' })
mutate.toggle('open')
mutate.push('contacts', contact)
mutate.remove('contacts', id, 'id')

That is a much nicer state API.

6. Add watch helpers without turning into React hooks

Datastar’s data-effect is the natural base for :watch, and data-computed is the natural base for :calc. Computed values should stay pure; side effects should go through watch/effect.

So I’d add these JS-side watch helpers:

watch('form.search', value => api.search(value))
watch.group(['form.name', 'form.phone'], () => validate())
watch.once('ready', () => ...)

But in HTML, keep it simple:

<section :watch="contacts.watchSearch()">

That keeps complex watch logic out of the template.

7. Add composition helpers for bigger apps

These make layouts and nested modules easier.

use(name, props?)

JS-side partner to :use.

use('contact-card', { contact })
fill(area, content)

Useful for dynamic layout assembly.

fill('content', use('contacts-page'))
mount(nameOrPath)

JS-side route mount helper.

mount('contacts-page')

This should still map to your :mount area and HTML patching.

8. Add async helpers for real-world CRUD

These are not new transport primitives. They are wrappers.

task(name, fn)

For loading/error/busy state around async logic.

const save = task('saveContact', async () => {
  await api.create(form.data('contact'))
  form.clear('contact')
})

Then expose:

save.run()
save.loading()
save.error()

This aligns nicely with your :loading and :error directives.

poll(url, ms)

For simple repeated reads when SSE is unnecessary.

poll('/contacts', 30000)
debounce(fn, ms)

Very common with search.

search: debounce(value => api.search(value), 250)
9. Add query/filter helpers for tables and lists

Since you mentioned tables earlier, I’d include these from the start.

table(name)

A thin state helper.

table('contacts').sort('name')
table('contacts').filter('business', value)
table('contacts').page(2)
table('contacts').select(id)
search(path)

For text search on state arrays.

search('contacts').text(query, ['name', 'phone', 'business'])

These should be optional sugar, not core primitives.

10. Helpers I would avoid in v1

I would not add these yet:

memo
provider
context
portal
suspense
signal()
store()
child()
parent() as helpers

You already have parent, children, root, and props as expression-scope values. That is enough. No reason to add more vocabulary until the real need appears.

11. The helper set I’d actually lock first

If I had to freeze a realistic v1.1 helper layer, it would be this:

HTML-facing
:empty
:has
:when
:value
:busy
:ignore
:ref
JS-facing
logic()
resource()
form()
list()
find()
pick()
browser
route
storage
confirm()
notify()
task()
watch()
debounce()
State/data helpers
mutate.merge()
mutate.toggle()
mutate.push()
mutate.remove()
api.into()
api.as()
api.only()
api.headers()
12. A nice example of the whole thing
export default logic(({ state, api, form, mutate, browser, notify, confirm }) => ({
  run() {
    mutate({
      timezone: browser.timezone(),
      locale: browser.locale()
    })

    api.get()
    api.read()
  },

  create() {
    if (!form.valid('contact')) {
      notify.error('Please complete the form')
      return
    }

    api.create({
      ...form.data('contact'),
      clientTimezone: state.timezone,
      clientLocale: state.locale
    })

    form.clear('contact')
    notify.success('Contact created')
  },

  remove(id) {
    confirm('Delete this contact?', () => api.delete(id))
  }
}))

That stays aligned with your syntax and Datastar’s behavior, but it starts feeling like a real framework.

The next thing I’d do is write a one-page helper spec with exact signatures for resource(), logic(), form(), list(), and mutate.*().

This is great! I like arrow functions, so if we can make the syntax to where it premots arrow functions when possible that would be ausom! Also some helpers to make it as type safe as possible would also be good.
Thought for 22s

Yes — that’s a strong direction.

If you like arrow functions, then the framework should lean into them everywhere they make code clearer, especially in logic and API files. And for type safety, the best route is:

keep authoring in .js
make the framework arrow-first
add JSDoc + generated types + schema helpers
keep HTML syntax simple, but make the JS side as typed as possible
1. Make the JS helpers arrow-first

These should all feel natural with arrows:

export default logic(({ state, api, form, mutate, browser, notify }) => ({
  run: () => {
    mutate({
      timezone: browser.timezone(),
      locale: browser.locale()
    })

    api.get()
    api.read()
  },

  create: () => {
    api.create({
      ...form.data('contact'),
      clientTimezone: state.timezone,
      clientLocale: state.locale
    })

    form.clear('contact')
    notify.success('Contact created')
  }
}))

That should be the default style.

So the framework should encourage helpers shaped like:

logic(ctx => ({ ... }))
resource('contacts', api => ({ ... }))
task('save', () => ...)
watch('search', value => ...)
list('contacts').sort((a, b) => ...)
find('contacts').where(contact => contact.business === 'OpenAI')

That is much nicer than object-heavy callback styles.

2. Helpers that naturally promote arrow functions

These are the helpers I’d explicitly design to be arrow-friendly.

logic()
export default logic(({ state, api, form, mutate }) => ({
  run: () => api.get(),
  create: () => api.create(form.data('contact'))
}))
resource()
export default resource('contacts', api => ({
  search: query => api.get.json(`/contacts/search?q=${encodeURIComponent(query)}`),
  rename: (id, name) => api.patch.state(`/contacts/${id}`, { name })
}))
task()
const save = task('saveContact', () =>
  api.create({
    ...form.data('contact'),
    clientTimezone: browser.timezone(),
    clientLocale: browser.locale()
  })
)
watch()
watch('form.search', value => api.search(value))
watch.group(['form.name', 'form.phone'], () => validate())
list()
list('contacts').sort((a, b) => a.name.localeCompare(b.name))
list('contacts').filter(contact => contact.business === selectedBusiness)
list('contacts').find(contact => contact.id === selectedId)
form()
form('contact').validate(data => {
  if (!data.name) return 'Name is required'
  if (!data.phone) return 'Phone is required'
  return null
})
calc()

JS-side helper version:

calc('fullName', ({ firstName, lastName }) => `${firstName} ${lastName}`)
calc('visibleContacts', ({ contacts, filter }) =>
  contacts.filter(contact => !filter || contact.business === filter)
)

This is especially good because it feels very natural with arrows.

3. Keep HTML expressions arrow-capable too

In HTML strings, arrow functions should be allowed anywhere expressions need callbacks.

Examples:

<div :text="contacts.filter(contact => contact.business === selectedBusiness).length"></div>
<div :text="contacts.map(contact => contact.name).join(', ')"></div>

That is a big win.

So the rule should be:

inline HTML expressions can use arrows when needed
JS helper APIs should be designed to expect arrows naturally
4. Type safety without forcing .ts

This is the part I’d really push.

You can stay in .js and still get strong type safety with:

JSDoc
framework-generated .d.ts
optional schema helpers
typed resource() and logic() wrappers

That way you keep .js, but editors still give you autocomplete, errors, and types.

5. The most important type-safe helpers
define.resource()

Instead of just:

export default resource('contacts')

you allow:

export default define.resource('contacts', {
  entity: 'Contact',
  create: 'CreateContact',
  update: 'UpdateContact',
  patch: 'PatchContact',
  result: 'ContactList'
})

Then the framework can generate types for:

api.get()
api.create(data)
api.update(id, data)
api.patch(id, data)
api.delete(id)

So your logic file gets inferred types.

6. define.logic()
export default define.logic('contacts', ({ state, api, form, mutate }) => ({
  run: () => api.get(),
  create: () => api.create(form.data('contact'))
}))

That lets the framework know:

which page/component this logic belongs to
which state shape applies
which form shape applies
which resource type is behind api

Then the editor can type:

state.contacts
state.form
api.create()
form.data('contact')
7. schema() helper

This one matters a lot.

You need a way to define data shapes once and reuse them.

Example:

export const Contact = schema('Contact', {
  id: types.string(),
  name: types.string(),
  phone: types.string(),
  business: types.string(),
  createdAt: types.string(),
  clientTimezone: types.string(),
  clientLocale: types.string()
})

export const ContactForm = schema('ContactForm', {
  name: types.string().required(),
  phone: types.string().required(),
  business: types.string().required()
})

Then:

export default define.resource('contacts', {
  entity: Contact,
  create: ContactForm,
  update: ContactForm,
  patch: ContactForm.partial()
})

And:

export default define.logic('contacts', ({ form, api }) => ({
  create: () => api.create(form.data('contact'))
}))

Now form.data('contact') can be typed.

8. form() should be typed
const contact = form('contact', ContactForm)

Then:

contact.data()
contact.clear()
contact.valid()
contact.errors()
contact.patch(values)

All typed.

That makes form logic way safer.

9. state() helpers should be typed too

Example:

export default define.logic('contacts', {
  state: {
    contacts: types.array(Contact),
    form: ContactForm,
    timezone: types.string(),
    locale: types.string()
  }
}, ({ state, mutate }) => ({
  run: () => {
    mutate({
      timezone: browser.timezone(),
      locale: browser.locale()
    })
  }
}))

That makes:

state.contacts
state.form.name
mutate('timezone', ...)

all type-aware.

10. mutate() should become smarter

To improve safety, I’d add:

mutate.set('timezone', browser.timezone())
mutate.set('form.name', 'Sarah')
mutate.merge('form', { name: 'Sarah' })
mutate.push('contacts', contact)
mutate.remove('contacts', contact => contact.id === id)
mutate.toggle('open')

This is better than a single loose mutate() for type safety.

Especially:

mutate.remove('contacts', contact => contact.id === id)

That promotes arrow functions and stays readable.

11. Arrow-first collection helpers

These will help a lot in real apps.

select()
select('contacts', contact => contact.id === selectedId)
where()
where('contacts', contact => contact.business === filter)
map()
map('contacts', contact => contact.name)
sortBy()
sortBy('contacts', (a, b) => a.name.localeCompare(b.name))
groupBy()
groupBy('contacts', contact => contact.business)

All of these should be typed if the underlying collection is typed.

12. Typed request helpers

If your resource schema knows the inputs/outputs, then these become typed:

api.get()
api.get.json()
api.create(data)
api.update(id, data)
api.patch(id, data)
api.delete(id)

For example:

api.create() expects ContactForm
api.update() expects ContactForm
api.patch() expects Partial<ContactForm>
api.get() returns Contact[]

That is exactly the sort of safety you want.

13. HTML helper alignment

Your HTML syntax should stay simple, but JS helpers should mirror it.

For example:

:state ↔ typed state
:calc ↔ calc(name, fn)
:watch ↔ watch(path, fn)
:bind ↔ form(name)
:each ↔ list(path).map/filter/find/sort
:use ↔ use(name, props?)

That keeps the whole system feeling unified.

14. Helpers I’d add specifically for type safety

These are the big ones:

schema()
types.*
define.logic()
define.resource()
typed form(name, schema)
typed list(path)
typed mutate.*()
typed task(name, fn)
typed watch(path, fn)

That is enough to make .js feel much safer.

15. My recommended arrow-first + type-safe foundation

If I were freezing the helper layer now, I’d make these the primary JS helpers:

logic(ctx => ({ ... }))
resource('contacts', api => ({ ... }))

schema(name, shape)
types.string()
types.number()
types.boolean()
types.array(schema)
types.object(shape)

form(name, schema)
list(path)
watch(path, value => ...)
calc(name, state => ...)
task(name, () => ...)

mutate.set(path, value)
mutate.merge(path, value)
mutate.push(path, value)
mutate.remove(path, item => ...)
mutate.toggle(path)

That gives you:

arrow functions everywhere
much shorter logic files
much safer code
no need to jump to .ts immediately
16. Example of what “good” now looks like
import { Contact, ContactForm } from '../schemas/contacts.js'

export default define.logic('contacts', {
  state: {
    contacts: types.array(Contact),
    form: ContactForm,
    timezone: types.string(),
    locale: types.string()
  }
}, ({ state, api, form, mutate, browser, notify }) => ({
  run: () => {
    mutate.merge('', {
      timezone: browser.timezone(),
      locale: browser.locale()
    })

    api.get()
    api.read()
  },

  create: () => {
    if (!form('contact', ContactForm).valid()) {
      notify.error('Please complete the form')
      return
    }

    api.create({
      ...form('contact', ContactForm).data(),
      clientTimezone: state.timezone,
      clientLocale: state.locale
    })

    form('contact', ContactForm).clear()
    notify.success('Contact created')
  }
}))

That is arrow-first, typed, and still feels aligned with your syntax.

The next best step would be to define the exact APIs for schema(), types, define.logic(), and define.resource() so the whole framework has one consistent type story.

Some of this has a lot of nested () could we do something about this?
Thought for 8s

Yes — and we should fix that now.

Too much nesting makes the framework feel heavy fast. The biggest offenders are things like:

form('contact', ContactForm).data()
form('contact', ContactForm).clear()
mutate.merge('', { ... })
define.logic('contacts', { ... }, ({ ... }) => ({ ... }))

That is too much.

Better rule

Make helpers feel like objects you already have, not functions you keep calling.

So instead of this:

form('contact', ContactForm).data()

you want this:

forms.contact.data()

And instead of this:

browser.timezone()
browser.locale()

you want this:

browser.timezone
browser.locale

And instead of this:

mutate.set('form.name', 'Sarah')

you may want this:

set('form.name', 'Sarah')

or:

state.form.name = 'Sarah'

depending on how strict you want mutation to be.

The best fix: inject prebuilt helpers

Inside logic files, the framework should inject already-prepared objects.

So instead of:

export default define.logic('contacts', {
  state: {
    contacts: types.array(Contact),
    form: ContactForm
  }
}, ({ state, api, form, mutate, browser, notify }) => ({
  run: () => {
    mutate.merge('', {
      timezone: browser.timezone(),
      locale: browser.locale()
    })

    api.get()
    api.read()
  },

  create: () => {
    if (!form('contact', ContactForm).valid()) {
      notify.error('Please complete the form')
      return
    }

    api.create({
      ...form('contact', ContactForm).data(),
      clientTimezone: state.timezone,
      clientLocale: state.locale
    })

    form('contact', ContactForm).clear()
    notify.success('Contact created')
  }
}))

make it more like this:

export default logic(({ state, api, forms, browser, set, notify }) => ({
  run: () => {
    set({
      timezone: browser.timezone,
      locale: browser.locale
    })

    api.get()
    api.read()
  },

  create: () => {
    if (!forms.contact.valid()) {
      notify.error('Please complete the form')
      return
    }

    api.create({
      ...forms.contact.data(),
      clientTimezone: state.timezone,
      clientLocale: state.locale
    })

    forms.contact.clear()
    notify.success('Contact created')
  }
}))

That is much better.

Changes I would make
1. form() becomes forms.<name>

Bad:

form('contact', ContactForm).data()

Good:

forms.contact.data()
forms.contact.clear()
forms.contact.valid()
forms.contact.errors()
2. browser becomes property-based

Bad:

browser.timezone()
browser.locale()
browser.online()

Good:

browser.timezone
browser.locale
browser.online
3. mutate gets shorter aliases

Instead of always writing:

mutate.set('timezone', browser.timezone)
mutate.merge('form', values)
mutate.toggle('open')

inject:

set('timezone', browser.timezone)
merge('form', values)
toggle('open')
push('contacts', contact)
remove('contacts', item => item.id === id)

That is much nicer.

4. resource() returns a prebuilt api

Instead of:

const api = resource('contacts')

just inject:

api

because the file name already tells the framework what resource it is.

So in logic/contacts.js, api is automatically the contacts API.

5. define.logic() becomes logic()

Bad:

define.logic('contacts', config, ctx => ({ ... }))

Good:

logic(ctx => ({ ... }))

The file path already tells us enough most of the time.

6. Keep schemas separate from everyday logic

Instead of stuffing schema in the same logic file, let the framework infer it from the matching file or import once at the top.

Good:

import { ContactForm } from '../schemas/contacts.js'

But do not make every line depend on it.

The better helper shape

I’d revise the injected logic context to this:

{
  state,
  props,
  api,
  forms,
  browser,
  route,
  storage,
  notify,
  confirm,
  event,

  set,
  merge,
  push,
  remove,
  toggle,

  watch,
  task
}

That is much flatter than:

mutate.set(...)
mutate.merge(...)
form('contact').data()
browser.timezone()
resource('contacts')
Then your logic looks like this
export default logic(({ state, api, forms, browser, notify, set }) => ({
  run: () => {
    set({
      timezone: browser.timezone,
      locale: browser.locale
    })

    api.get()
    api.read()
  },

  create: () => {
    if (!forms.contact.valid()) {
      notify.error('Please complete the form')
      return
    }

    api.create({
      ...forms.contact.data(),
      clientTimezone: state.timezone,
      clientLocale: state.locale
    })

    forms.contact.clear()
    notify.success('Contact created')
  }
}))

That is way better.

Even better for arrow functions

This flatter style works really well with arrows because each line stays short:

export default logic(({ api, forms, state, browser, set }) => ({
  run: () => {
    set({
      timezone: browser.timezone,
      locale: browser.locale
    })

    api.get()
    api.read()
  },

  create: () =>
    api.create({
      ...forms.contact.data(),
      clientTimezone: state.timezone,
      clientLocale: state.locale
    })
}))
Type safety can still stay strong

This does not hurt type safety.

The framework can still type:

forms.contact
api.create
state.contacts
browser.timezone
set, merge, push, remove

So you get flatter code without losing safety.

My recommendation

Yes — reduce nested () by changing from:

function-heavy helpers
to
injected object helpers and flat action helpers
Prefer:
forms.contact.data()
browser.timezone
api.create(...)
set(...)
merge(...)
toggle(...)
Avoid:
form('contact').data()
browser.timezone()
resource('contacts').create(...)
mutate.set(...)

That is the direction I would lock in.

I still feel like there are to many nested (). Could we use [] to deal with more than 2 nestings?
Thought for 31s

Yes, but I would use [] very carefully in JS.

For your HTML language, [] already makes sense.
For JS, too much [] starts fighting normal JavaScript.

So my answer is:

Use [] only for dynamic lookup, not as the main cure for nesting.

Why

This is okay:

forms['contact'].data()

because contact is a named thing you are looking up.

But this gets ugly fast:

api['create.state']('/contacts', data)
state['form.name']
browser['timezone']

That stops feeling natural in JS.

Better fix than []

The real fix is to make more things properties instead of function calls and to inject flatter helpers.

So instead of:

forms.contact.data()
forms.contact.valid()
browser.timezone()
mutate.set('timezone', browser.timezone())

make it:

forms.contact.data
forms.contact.valid
browser.timezone
set('timezone', browser.timezone)

That removes a lot of nesting immediately.

My recommendation
Good use of []

Use it only when the name is dynamic:

forms[name].data
forms[name].clear()
lists[name].items
api[name].get()

Example:

const formName = 'contact'

api.create({
  ...forms[formName].data,
  clientTimezone: browser.timezone,
  clientLocale: browser.locale
})

That is a good use of brackets.

Bad use of []

Do not make this the main style:

api['create.state'](...)
state['form.name']
browser['timezone']

That makes the code harder to read and less type-safe.

Stronger solution

I would change the helper API to reduce calls:

Before
forms.contact.data()
forms.contact.valid()
forms.contact.clear()
browser.timezone()
browser.locale()
Better
forms.contact.data
forms.contact.valid
forms.contact.clear()
browser.timezone
browser.locale
Even better with flat helpers
contact.data
contact.valid
contact.clear()

timezone
locale

So inside a logic file, the framework could inject:

export default logic(({ api, forms, browser, notify, set }) => {
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
        notify.error('Please complete the form')
        return
      }

      api.create({
        ...contact.data,
        clientTimezone: timezone,
        clientLocale: locale
      })

      contact.clear()
    }
  }
})

That is better than pushing more [] into JS.

Best rule

I’d lock in this rule:

use [] heavily in HTML
use [] in JS only for dynamic names
reduce JS nesting by using:
getters/properties
flatter injected helpers
local aliases

So yes, [] can help a little, but it should be a secondary tool, not the main strategy.

The main strategy should be:
fewer function calls, more flat objects, more properties.

A good target would be making JS read more like this:

contact.data
contact.valid
browser.timezone
api.create(...)

instead of this:

form('contact').data()
browser.timezone()
resource('contacts').create(...)
Let's not use the [] for this. Let's do more...

reduce JS nesting by using:
getters/properties
flatter injected helpers
local aliases
Thought for 4s

Yes — that’s the better choice.

So the rule becomes:

HTML gets the custom syntax.
JS stays natural and flat.

That means we reduce JS nesting with:

getters/properties
flatter injected helpers
local aliases

and we stop trying to make JS look like the template language.

The direction to lock in
1. Prefer properties over method calls when possible

Instead of:

forms.contact.data()
forms.contact.valid()
browser.timezone()
browser.locale()

use:

forms.contact.data
forms.contact.valid
browser.timezone
browser.locale

That already removes a lot of noise.

2. Flatten the injected helper context

Instead of injecting deep helper trees, inject simpler top-level values.

Too nested
mutate.set('form.name', 'Sarah')
mutate.merge('form', values)
mutate.toggle('open')
Better
set('form.name', 'Sarah')
merge('form', values)
toggle('open')
Too nested
notify.success('Saved')
notify.error('Failed')
Better
success('Saved')
error('Failed')

Only do this where it stays obvious.

3. Pre-alias common objects automatically

Inside a logic file, the framework can expose the obvious things already flattened.

So instead of always using:

forms.contact.data
forms.contact.valid
forms.contact.clear()

you can do:

contact.data
contact.valid
contact.clear()

if the framework knows the page has a contact form.

That means the logic context could look like:

{
  state,
  props,
  api,
  forms,
  contact,
  browser,
  route,
  storage,
  event,

  set,
  merge,
  push,
  remove,
  toggle,

  success,
  error,
  confirm
}

That is much better.

4. Use local aliases aggressively

Even with flatter helpers, local aliases make files much nicer.

Example:

export default logic(({ state, api, contact, browser, set, success, error }) => {
  const { timezone, locale } = browser

  return {
    run: () => {
      set({
        timezone,
        locale
      })

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
        clientTimezone: timezone,
        clientLocale: locale
      })

      contact.clear()
      success('Contact created')
    }
  }
})

That is a lot cleaner.

5. Make API objects flatter too

Instead of:

api.contacts.create(...)
api.contacts.update(...)
api.contacts.read(...)

just inject the matched API as:

api.create(...)
api.update(...)
api.read(...)
api.get(...)
api.patch(...)
api.delete(...)

because the file already tells the framework which resource it belongs to.

6. Property-first browser helper

This should stay property-based:

browser.timezone
browser.locale
browser.online
browser.visible
browser.now

No function calls unless something really needs arguments.

7. Property-first forms

This is a strong pattern:

contact.data
contact.valid
contact.errors
contact.dirty
contact.empty
contact.clear()
contact.reset()
contact.patch(values)

Read-only things are properties.
Actions stay methods.

That feels natural.

8. Keep actions as verbs

These should stay as function calls because they do something:

api.get()
api.read()
api.create(data)
api.update(id, data)
api.patch(id, data)
api.delete(id)

set(path, value)
merge(path, value)
push(path, value)
remove(path, matcher)
toggle(path)

That is fine. The issue was not action calls. The issue was stacks of nested helper calls.

9. Best final style

So the JS style should aim for this:

Good
export default logic(({ state, api, contact, browser, set, success, error }) => {
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
        clientTimezone: timezone,
        clientLocale: locale
      })

      contact.clear()
      success('Contact created')
    }
  }
})
Bad
export default define.logic('contacts', ({ state, api, form, mutate, browser, notify }) => ({
  run: () => {
    mutate.merge('', {
      timezone: browser.timezone(),
      locale: browser.locale()
    })

    api.get.state('/contacts')
    api.read.sse('/events/contacts')
  },

  create: () => {
    if (!form('contact').valid()) {
      notify.error('Please complete the form')
      return
    }

    api.create.state('/contacts', {
      ...form('contact').data(),
      clientTimezone: browser.timezone(),
      clientLocale: browser.locale()
    })
  }
}))

That second one is exactly what we want to get away from.

10. The rule to freeze

For JS:

read values as properties
perform actions as verbs
inject helpers flat
use local aliases early
avoid helper factories in everyday code

So yes — this is the right direction to lock in. The framework should make JS feel like normal, clean app code, not like a DSL piled on top of JavaScript.

The next good step is to define the exact injected logic context with the flattened names.

I am going to have you make this call, just try to make it as type safe as possible.
Thought for 1m 14s

Yes — here’s the call I’d make.

To make it as type-safe as possible, do not use string paths in JS as the normal way to work with state.

That means I would move away from things like:

set('form.name', 'Sarah')
merge('form', values)
push('contacts', contact)
remove('contacts', item => item.id === id)

Those are flexible, but they are weaker for type safety.

The rule I’d lock in

For JS files:

use a typed reactive state proxy
use typed form controllers
use a typed api object
use readonly property helpers like browser.timezone
keep helpers flat
keep string-path helpers only as low-level escape hatches

So everyday JS becomes:

state.form.name = 'Sarah'
state.form.phone = '555-123-4567'
state.contacts.push(contact)
state.open = !state.open

That is both cleaner and more type-safe.

Final JS design
1. state is the main mutable reactive object

Use direct property access and assignment.

state.timezone = browser.timezone
state.locale = browser.locale
state.form.name = 'Sarah'
state.contacts.push(contact)

This should be backed by a proxy that syncs to Datastar signals.

That gives you:

less nesting
better autocomplete
stronger type checking
no string paths in normal app code
2. props is readonly

Props should be readable, not casually mutable.

props.contactId
props.mode
3. api is prebound and typed

Do not make logic files know routes and modes unless necessary.

Inside logic/contacts.js, inject:

api.get()
api.read()
api.create(data)
api.update(id, data)
api.patch(id, data)
api.delete(id)

And let /api/contacts.js define the actual transport mapping.

So logic files stay small.

4. forms are prebuilt typed controllers

Instead of calling a helper repeatedly, inject named forms.

forms.contact.data
forms.contact.valid
forms.contact.errors
forms.contact.clear()
forms.contact.reset()
forms.contact.patch(values)

And for convenience, also inject the common one directly when obvious:

contact.data
contact.valid
contact.errors
contact.clear()

So if a page has one main form, you can just use contact.

5. browser is property-based

No function calls unless arguments are needed.

browser.timezone
browser.locale
browser.online
browser.visible
browser.now
6. Keep watch, task, and debounce as function helpers

These are naturally callback-based, so arrow functions fit well here.

watch(() => state.search, value => {
  api.search(value)
})

const save = task(async () => {
  await api.create(contact.data)
})
7. Keep path-based helpers only as escape hatches

Still provide them, but do not make them the main style.

mutate('form.name', 'Sarah')
set('timezone', browser.timezone)
merge('form', values)

These are useful for framework internals and advanced cases, but not the default authoring style.

The exact injected logic context

This is what I would standardize:

{
  state,      // typed reactive mutable proxy
  props,      // typed readonly props
  api,        // typed resource api for this file/page
  forms,      // typed form controllers
  browser,    // readonly environment info
  route,      // route info + navigation
  storage,    // local/session persistence
  notify,     // ui messages
  confirm,    // confirmations
  event,      // current event when relevant

  watch,      // reactive side-effect helper
  task,       // async helper with loading/error state
  debounce    // utility helper
}

And optionally inject the common aliases too:

contact   // alias of forms.contact
contacts  // optional collection helper if needed

But only when the names are obvious and type-safe.

The type-safe foundation

To make this work well in .js, I’d use:

schemas
JSDoc
generated .d.ts files
typed wrappers for logic/api/forms

So the framework should have:

schema()
types
logic()
resource()
Example schema
export const Contact = schema({
  id: types.string(),
  name: types.string(),
  phone: types.string(),
  business: types.string(),
  createdAt: types.string(),
  clientTimezone: types.string(),
  clientLocale: types.string()
})

export const ContactForm = schema({
  name: types.string().required(),
  phone: types.string().required(),
  business: types.string().required()
})
Example API file
export default resource('contacts', {
  entity: Contact,
  form: ContactForm,
  defaults: {
    get: 'html',
    read: 'sse',
    create: 'html',
    update: 'html',
    patch: 'state',
    delete: 'html'
  }
})

That gives api its types automatically.

Example logic file
export default logic(({ state, api, contact, browser, notify }) => ({
  run: () => {
    state.timezone = browser.timezone
    state.locale = browser.locale

    api.get()
    api.read()
  },

  create: () => {
    if (!contact.valid) {
      notify.error('Please complete the form')
      return
    }

    api.create({
      ...contact.data,
      clientTimezone: state.timezone,
      clientLocale: state.locale
    })

    contact.clear()
    notify.success('Contact created')
  }
}))

That is the style I’d optimize the whole framework around.

Why this is the best call

It gives you:

much less nesting
arrows everywhere they make sense
strong autocomplete
less magic string usage
a clean split between HTML syntax and JS logic
a JS style that still feels normal

Most importantly, it aligns with your framework syntax:

:state in HTML maps to state in JS
:props maps to props
:bind maps to forms.<name>
:calc maps to derived state/watch logic
read/get/create/update/patch/delete stay the same everywhere

So the final call is:

HTML stays custom.
JS stays natural.
Type safety comes from typed proxies and typed controllers, not from more helper nesting.

If you want, I’ll turn this into a clean “Framework JS API Spec v1” next.

This all looks great but it must all run natively in the browser. Could we make it even better by going .jsx ?

I’m checking current browser/runtime facts on JSX so I can answer the “native in browser” part cleanly.

Thought for 28s

For this framework, I would not switch the main authoring model to .jsx.

The reason is simple: browsers do not natively understand JSX. MDN explicitly notes that no browser has native support for JSX, and React describes JSX as a syntax extension for JavaScript rather than standard browser JavaScript.

So if your requirement is “must all run natively in the browser”, .jsx gives you only two options:

add a build/transpile step, or
transpile in the browser at runtime with something like @babel/standalone, which Babel says is generally not what you should use in production.

My call would be:

Keep the framework core in .html + .js.
That preserves your no-build, native-browser goal. Then make the JS side nicer with:

arrow-first helpers
flatter injected helpers
typed schemas / generated typings / JSDoc
prebound api, forms, state, and browser objects

That gives you most of the ergonomic win people want from JSX without losing the browser-native constraint.

The place where .jsx could make sense is as an optional dev-only layer for people who want authoring sugar. But I would treat it as a separate adapter, not the main framework surface. In other words:

core framework: native .html + .js
optional addon: .jsx authoring that compiles down to your framework

That keeps the core honest and browser-native.

So the short version is:

Would .jsx feel nicer to write? Often yes.
Does it fit your “runs natively in the browser” requirement? No, not as the primary format.

The stronger move is to make your .js side feel better than typical framework code, instead of importing JSX and giving up the native-browser goal.

What are my options for browser?

I’m checking the current browser-native options so I can separate what works with zero build step from what only looks native but still needs a transpiler.

Thought for 1m 11s

Yes. If the framework must run natively in the browser, your real options are these:

1. Plain HTML + ES modules
This is the strongest fit for your framework. Browsers natively support JavaScript modules, and import maps let the browser resolve module specifiers without a bundler. That keeps your custom HTML syntax in .html and your logic/API in .js, which matches the design you’ve been building.

2. HTML templates + Web Components
You can stay fully browser-native by using <template>, custom elements, and optionally Shadow DOM. MDN describes Web Components as built from custom elements, shadow DOM, and templates, and notes you can define a custom element class, register it, and use it directly in markup. This is a good option if you want stronger component boundaries without adding a compiler.

3. A small browser-native rendering library
If you want more rendering help without giving up native browser execution, Lit is a good example. Lit’s docs describe it as a lightweight Web Components library, and its standalone lit-html templating layer can be used outside the full component model. This keeps you in standard browser JavaScript instead of JSX.

4. JSX-like syntax without JSX: HTM
If what you really want is the feel of JSX but still native browser execution, HTM is probably the best browser-native option. Its official repo describes it as “JSX-like syntax in plain JavaScript” with no transpiler, using standard tagged template literals. Preact’s no-build docs also explicitly recommend HTM as a JSX-like alternative when you want to avoid a build step.

5. Real JSX in the browser at runtime
This is possible with @babel/standalone, but it breaks your “native browser” goal in practice because the browser still does not understand JSX on its own. React describes JSX as a syntax extension, not standard browser JavaScript, and MDN says browsers do not have native JSX support. Babel Standalone exists for browser use, but it is a transpiler layer, not native execution.

For type safety, the best browser-native path is still .js files with JSDoc and TypeScript checking. TypeScript’s docs say you can enable checking in JavaScript with // @ts-check, and its JSDoc support lets you add real type information in .js files without switching the runtime to TypeScript. That fits your “runs directly in the browser” requirement much better than .tsx or compiled JSX.

My recommendation for your framework is:

keep the core as .html + .js
use ES modules + import maps
optionally support Web Components
use JSDoc + @ts-check for type safety
if you want a JSX-like authoring mode later, make it an optional HTM-style addon, not the main framework surface.

So the short answer is: your best browser-native options are plain HTML/JS modules, Web Components, or an HTM/Lit-style runtime — not .jsx as the primary format.

But htm works?

I’m checking the official HTM docs so I can answer precisely about whether it truly works browser-native and what tradeoffs it brings.

Thought for 12s

Yes — HTM does work in the browser without a build step.

The official HTM repo describes it as “JSX-like syntax in plain JavaScript — no transpiler necessary,” says it uses standard JavaScript tagged templates, and says it works in modern browsers. It also shows direct browser imports from a CDN and a no-build example in a single HTML file.

The important catch is that HTM is still JavaScript, not browser-native HTML syntax. You write things like:

const view = html`<div>Hello</div>`

So it can give you a JSX-like authoring feel in .js files, but it would move part of your framework toward template-in-JS instead of the HTML-first syntax you’ve been designing. HTM can bind to React/Preact, and it can also bind to any custom h(type, props, ...children) function, which means you could use it with your own runtime too.

For your framework, that means:

Yes, HTM is a real browser-native option if you want a no-build JSX-like layer.
No, I would not make it the main authoring format if your core goal is still your custom HTML syntax with [name], @click, and :state.
Best use would be as an optional JS-side addon for complex component logic or render-heavy areas, while the framework core stays .html + .js.

My call would be:

keep the framework core HTML-first
keep logic/API in plain .js
optionally support HTM as an advanced no-build rendering layer for people who want JSX-like ergonomics without introducing a compiler.

So the answer is: HTM works, and it’s probably the only JSX-like browser-native option worth taking seriously here.

Can you import stuff at the top? Like you can in jsx?

I’m checking the exact browser-native import story so I can answer this cleanly in the context of HTM and your no-build requirement.

Thought for 9s

Yes — in browser-native .js modules, you can absolutely put import statements at the top.

That is just standard ES modules:

import contactsApi from './api/contacts.js'
import contactsLogic from './logic/contacts.js'

Browsers support JavaScript modules natively, including top-level import/export, as long as you load the entry file with type="module" and serve it from a web server. MDN notes that all modern browsers support module features natively and shows imports at the top of module files.

Example:

<script type="module" src="/app/main.js"></script>
// /app/main.js
import contactsPage from './logic/contacts.js'
import contactsApi from './api/contacts.js'

If you use HTM as an optional addon, yes, you can still import at the top there too, because HTM is plain JavaScript using tagged template literals, not JSX syntax that requires compilation. The HTM repo describes it as “JSX-like syntax in plain JavaScript” with no transpiler necessary.

So the practical answer is:

.js modules: yes, top-level imports work natively
HTM in .js: yes, same import story
real .jsx: no, not natively; that needs transpilation, so it breaks your native-browser requirement.

For your framework, that means the clean path is still:

.html for templates
.js for logic and API
top-level import in those .js files
optional HTM only if you want JSX-like rendering in some JS modules without a build step.
Can you say stuff like import router as = r

Almost — the syntax is:

import * as r from './router.js'

or:

import { router as r } from './router.js'

or:

import router from './router.js'

But not:

import router as = r

Examples:

Rename a named export
import { router as r } from './router.js'
Import everything under one alias
import * as r from './router.js'
Rename a default export
import r from './router.js'

So yes, you can alias imports at the top of native browser .js modules, just with normal ES module syntax.

Could you use template literals and make your own file extension run in browser?

I’m checking the browser/module rules so I can tell you exactly what works natively versus what would still need your runtime to interpret it.

Thought for 38s

Yes — with an important distinction.

You have two real browser-native options:

1. Custom extension that is still JavaScript

This works.

Example:

// contact.view
import htm from 'https://esm.sh/htm'

const html = htm.bind((type, props, ...children) => ({ type, props, children }))

export default html`
  <article class="card">
    <h3>Title</h3>
  </article>
`

If the browser imports ./contact.view and your server serves it with a JavaScript MIME type, the browser can treat it like a normal module. Browsers use the MIME type, not the file extension, to decide how to process a resource.

So for something like:

.view
.page
.logic
.api

the extension itself is fine as long as the file contents are valid JavaScript and the server sends the right Content-Type. Browsers support top-level import in native JS modules loaded with type="module".

2. Custom extension that is raw template text

This does not run natively as code.

Example:

<!-- contact.view -->
<article [card]>
  <h3 :text="contact.name"></h3>
</article>

The browser will not execute that as a JS module on its own. You would need to:

fetch() it as text, then
let your runtime parse/interpet it.

That can still be a good framework feature, but it is no longer “native execution” in the same sense. It is runtime interpretation.

Where template literals fit

Template literals work great in the first option, because they are just normal JavaScript.

So this is browser-native:

export default `
  <article class="card">Hello</article>
`

and this is also browser-native:

export default html`
  <article class="card">Hello</article>
`

because both are valid JS modules.

Best answer for your framework

If you want:

top-level imports
native browser execution
custom file extensions
no build step

then the strongest pattern is:

Use custom extensions for files that are still JS

Examples:

contacts.logic
contacts.api
contact.view

But those files should still contain valid JavaScript module code.

Use raw HTML/template files only when your runtime fetches and interprets them

Examples:

contact.html
contact.area
contact.template

Those are fine too, but they are runtime-loaded content, not natively executed modules.

My recommendation

For your framework, I would do this:

.html for raw template files
custom JS-like extensions only if you really want the branding, such as:
.logic
.api
.view

But under the hood, those custom extensions should still be served as JavaScript modules.

So the short answer is:

Yes, you can make your own file extension run in the browser if the file is valid JS and is served with the correct MIME type.
Yes, template literals can be the authoring format inside those files.
No, a brand-new raw template syntax does not run natively unless your runtime fetches and interprets it.

A very strong option for your framework would be a .view file that exports template-literal-based markup, while .html remains the simpler raw-template path.

I love this idea! What kind of backend files would this have? Would it be a mvc? Maybe also with . logic and .api ?
Thought for 4s

Yes — I think the backend should mirror the frontend language a bit, but not force classic MVC if it makes things awkward.

My call would be:

Use an MVC-shaped architecture, but name it around responsibility, not tradition.

So instead of hard-committing to:

Models
Views
Controllers

I’d structure it more like:

routes
logic
api
data
views/templates

That gives you MVC-like separation without dragging in old naming baggage.

Best backend shape

I’d do something like this:

/backend
  /routes
    contacts.js
    contacts.events.js

  /logic
    contacts.logic.js

  /api
    contacts.api.js

  /data
    contacts.data.js

  /views
    contacts.view.html
    contact-row.view.html

  /schemas
    contacts.schema.js

  /core
    server.js
    router.js
    request.js
    response.js
    sse.js
    state.js
    html.js
What each one does
/routes

Thin HTTP entry points.

Examples:

GET /contacts
POST /contacts
PATCH /contacts/:id
DELETE /contacts/:id
GET /events/contacts

These files should stay tiny.

Example:

// routes/contacts.js
export default ({ api }) => ({
  get: req => api.get(req),
  create: req => api.create(req),
  update: req => api.update(req),
  patch: req => api.patch(req),
  delete: req => api.delete(req)
})

So routes only map incoming requests to backend handlers.

/logic

Business rules.

This is the backend equivalent of your frontend logic files.

Examples:

validation rules
formatting
deciding what view to return
choosing HTML vs state vs JSON
timestamping
timezone handling
combining data from different sources

Example:

// logic/contacts.logic.js
export default ({ data, views, time }) => ({
  list: async req => {
    const contacts = await data.all()
    return views.contacts({ contacts })
  },

  create: async req => {
    const body = await req.body()
    const contact = await data.create({
      ...body,
      createdAt: time.now()
    })

    return { contacts: await data.all() }
  }
})

This is where the app behavior belongs.

/api

Transport-aware handlers.

This is where backend code knows about:

.html
.state
.json
.sse

So the API layer turns logic results into framework responses.

Example:

// api/contacts.api.js
export default ({ logic, respond }) => ({
  get: async req => respond.html(await logic.list(req)),
  create: async req => respond.state(await logic.create(req)),
  update: async req => respond.html(await logic.update(req)),
  patch: async req => respond.state(await logic.patch(req)),
  delete: async req => respond.html(await logic.delete(req)),
  read: async req => respond.sse(await logic.read(req))
})

This keeps transport details out of logic.

This is important because it matches your frontend split:

frontend logic should not feel like “tRPC + Axios mixed together”
same idea here
/data

Pure persistence.

This replaces the “model” part of MVC in a cleaner way.

Examples:

database queries
file storage
caching
external service reads

Example:

// data/contacts.data.js
export default ({ db }) => ({
  all: () => db.contacts.findMany(),
  one: id => db.contacts.findById(id),
  create: values => db.contacts.insert(values),
  update: (id, values) => db.contacts.update(id, values),
  patch: (id, values) => db.contacts.patch(id, values),
  delete: id => db.contacts.delete(id)
})

This layer should not know about HTML or SSE.

/views

Server-rendered HTML pieces.

This is where your backend-generated markup lives.

Examples:

contacts.view.html
contact-row.view.html
layout.view.html

If your backend is rendering HTML for .html responses, this is important.

These can be:

raw .html
.view
template literals in JS
your own template file format

For simplicity, I’d start with .html or .view.html.

/schemas

Validation and typing.

Examples:

request body shape
DB row shape
state shape
response shape

This is key if you want stronger type safety.

So is it MVC?

Kind of, yes — but I would not call it MVC publicly.

It is closer to:

data = model-ish
views = view
routes/api/logic = controller split into cleaner responsibilities

Classic MVC tends to pile too much into “controller.”
Your framework already wants cleaner boundaries than that.

So I’d describe it as:

route → api → logic → data/view

That is probably the best official mental model.

Matching frontend and backend

This is where it gets really nice.

Frontend
/pages
/components
/logic
/api
Backend
/routes
/logic
/api
/data
/views

So both sides share:

logic
api

That’s a big win.

It makes the framework feel consistent.

My recommendation on file extensions

I would keep it pretty plain at first:

Frontend
.html
.js
Backend
.js
.html for views

If you want stronger branding later, then you could introduce:

.logic
.api
.view

But only if the runtime/server support stays simple.

A very nice future shape could be:

/backend
  /routes
    contacts.route
  /logic
    contacts.logic
  /api
    contacts.api
  /data
    contacts.data
  /views
    contacts.view

But I would not start there unless you really want the custom extension identity.

The strongest backend pattern

If I had to freeze it right now, I’d choose this:

/backend
  /routes
  /logic
  /api
  /data
  /views
  /schemas
  /core

With flow:

HTTP request
-> route
-> api
-> logic
-> data / views
-> respond as .html / .state / .json / .sse

That fits everything you’ve built so far.

Final call

So yes:

use /logic and /api on the backend too
do not force classic MVC naming
use a cleaner layered architecture
keep routes thin
keep transport concerns in /api
keep business behavior in /logic
keep persistence in /data
keep HTML in /views

That is the backend shape I would choose.

Ok, which files would be js files?
Thought for a few seconds

I’d make most non-template files .js.

So the clean split is:

.js files

These should be JavaScript:

Frontend
/pages
  contacts.html

/components
  contact-row.html
  contact-form.html

/logic
  contacts.js
  dashboard.js

/api
  contacts.js
  auth.js

/schemas
  contacts.js
  users.js

/core
  app.js
  router.js
  runtime.js
  state.js
  forms.js
  requests.js
  read.js
Backend
/routes
  contacts.js
  contacts.events.js
  auth.js

/logic
  contacts.js
  auth.js

/api
  contacts.js
  auth.js

/data
  contacts.js
  users.js

/schemas
  contacts.js
  users.js

/core
  server.js
  router.js
  request.js
  response.js
  sse.js
  db.js
.html files

These should stay HTML:

Frontend
/pages
  contacts.html
  dashboard.html

/components
  contact-row.html
  contact-form.html
  app-layout.html
Backend-rendered views
/views
  contacts.html
  contact-row.html
  layout.html
Simple rule

Use .js for:

logic
api
routes
data
schemas
runtime/core helpers

Use .html for:

pages
components
layouts
views
Shortest possible answer

Anything with behavior is .js.
Anything that is primarily markup is .html.

That is the split I would lock in.

What kind of files would go in schemas and core?
Thought for 4s

/schemas should hold your shapes and contracts.

That means files that describe things like:

what a Contact looks like
what a contact form accepts
what the backend expects for create/update/patch
what comes back from the backend
shared shapes used by both frontend and backend

Example:

/schemas
  contacts.js
  users.js
  auth.js
  common.js

A contacts.js schema file might define:

Contact
ContactForm
CreateContact
UpdateContact
PatchContact
ContactList

So /schemas is basically where you keep:

validation rules
field requirements
shared data contracts
type-safe shapes

It should not contain business logic, requests, or rendering.

/core should hold the framework plumbing.

That means the files that make the whole app or framework work, but are not specific to “contacts” or “users.”

Example frontend core:

/core
  app.js
  runtime.js
  router.js
  state.js
  forms.js
  requests.js
  read.js
  helpers.js
  logic.js
  resource.js

These would do things like:

boot the app
parse your custom HTML syntax
connect your directives to Datastar
manage routing
manage reactive state
register forms
implement get(), create(), update(), patch(), delete(), read()
implement helpers like logic() and resource()

Example backend core:

/core
  server.js
  router.js
  request.js
  response.js
  sse.js
  db.js
  auth.js
  html.js
  state.js

These would do things like:

start the server
register routes
normalize requests
format .html, .state, .json, .sse responses
handle SSE streams
manage DB connection
shared auth/session behavior

So the short version is:

/schemas = what the data looks like
/core = how the framework/app works under the hood

A good way to tell the difference:

if the file describes shape, it goes in schemas
if the file powers infrastructure/runtime, it goes in core
if the file handles feature behavior, it belongs in logic, api, routes, or data

A concrete example:

/schemas/contacts.js

defines ContactForm

/core/forms.js

implements how forms.contact.data, forms.contact.valid, and forms.contact.clear() work

That’s the separation I’d use.

If you want, I can lay out the full recommended folder tree now for both frontend and backend.