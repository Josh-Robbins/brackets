// Uses Deno + @std/path only (no node: imports). Interacts with: ../framework/server.js, ../framework/syntax.js
import { dirname, join, resolve } from 'jsr:@std/path@1';
import { createServer } from '../framework/server.js';
import { transformHtmlSyntax } from '../framework/syntax.js';

const repoRoot = resolve(import.meta.dirname, '..');

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}\nExpected: ${expected}\nReceived: ${actual}`);
  }
}

function assertDeepEqual(actual, expected, message) {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(`${message}\nExpected: ${expectedJson}\nReceived: ${actualJson}`);
  }
}

async function readSseEvent(reader, decoder = new TextDecoder()) {
  let buffer = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) {
      throw new Error('SSE stream ended before the next event arrived.');
    }

    buffer += decoder.decode(value, { stream: true });
    const boundary = buffer.indexOf('\n\n');
    if (boundary === -1) {
      continue;
    }

    const rawEvent = buffer.slice(0, boundary);
    buffer = buffer.slice(boundary + 2);
    const event = { event: 'message', data: '' };
    for (const line of rawEvent.split('\n')) {
      if (line.startsWith('event:')) {
        event.event = line.slice('event:'.length).trim();
      } else if (line.startsWith('data:')) {
        const next = line.slice('data:'.length).trimStart();
        event.data = event.data ? `${event.data}\n${next}` : next;
      }
    }
    return event;
  }
}

async function getSessionSecurity(url) {
  const response = await fetch(`${url}/__brackets/session`, {
    headers: {
      Accept: 'application/json'
    }
  });
  const payload = await response.json();
  const setCookie = response.headers.get('set-cookie') ?? '';
  const cookie = setCookie.split(';')[0];
  return {
    status: response.status,
    payload,
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'x-brackets-csrf': payload.csrfToken,
      ...(cookie ? { Cookie: cookie } : {})
    }
  };
}

async function withServer(appRoot, run) {
  const instance = await createServer({
    appRoot,
    host: '127.0.0.1',
    port: 0
  });

  try {
    await run(instance);
  } finally {
    await instance.close();
  }
}

async function withDevServer(appRoot, run) {
  const instance = await createServer({
    appRoot,
    host: '127.0.0.1',
    port: 0,
    devMode: true
  });

  try {
    await run(instance);
  } finally {
    await instance.close();
  }
}

async function readNextDevSseEvent(reader, decoder = new TextDecoder()) {
  while (true) {
    const ev = await readSseEvent(reader, decoder);
    if (ev.event === 'spa' || ev.event === 'fullReload') {
      return ev;
    }
  }
}

async function writeText(filePath, source) {
  await Deno.mkdir(dirname(filePath), { recursive: true });
  await Deno.writeTextFile(filePath, source);
}

Deno.test('framework syntax compiler maps the documented Brackets language to Datastar and runtime targets', () => {
  const output = transformHtmlSyntax([
    '<section [card] #hero',
    '  :state="{ count: 1 }"',
    '  :calc="{ doubled: count * 2, feed: read(\'/events.state\') }"',
    '  :run="mutate(\'count\', count + 1)"',
    '  :watch="mutate(\'count\', count + 2)"',
    '  :text="count"',
    '  :show="count > 0"',
    '  :bind="$form.name"',
    '  :text="props.title"',
    '  :class.ready="self.count > 0"',
    '  :set.data-route="route.path"',
    '  :class.active="count > 1"',
    '  :set.href="\'/docs\'"',
    '  :loading="route"',
    '  :error="route"',
    '  @pointerdown="request(\'/search\')"',
    '  @click="get(\'/posts\')"',
    '  @submit="create(\'/posts\', { title: count })"',
    '  @keydown="update(\'/posts/1\', { title: count })"',
    '  @keyup="patch(\'/posts/1\', { title: count })"',
    '  @dblclick="delete(\'/posts/1\')"',
    '  @focus="nav.to(\'/next\')"',
    '  @blur="event.target.value"',
    '  @input="mutate(\'count\', count + 1)">',
    '  <span :html="htmlBlock"></span>',
    '</section>'
  ].join(' '));

  assert(output.includes('class="card"'), '[name] should compile to a normal class attribute');
  assert(output.includes('id="hero"'), '#name should compile to a normal id attribute');
  assert(output.includes('data-signals="{ count: 1 }"'), ':state should compile to Datastar signals');
  assert(output.includes('data-computed="{ doubled: () => ($count * 2), feed: () => (window.BracketsRuntime.read(\'/events.state\')) }"'), ':calc should compile each value as a callable per Datastar computed object format');
  assert(output.includes('data-init="$count = $count + 1"'), ':run should compile mutate() to a Datastar-native write');
  assert(output.includes('data-effect="$count = $count + 2"'), ':watch should compile simple mutate() effects through Datastar-native writes');
  assert(output.includes('data-text="$count"'), ':text should compile to Datastar text binding');
  assert(output.includes('data-text="window.BracketsRuntime.scope(el).props.title"'), 'documented props helper should work inside Datastar-backed expressions');
  assert(output.includes('data-show="$count > 0"'), ':show should compile to Datastar visibility');
  assert(output.includes('data-bind="form.name"'), ':bind should keep the bound path simple');
  assert(output.includes('data-class:ready="window.BracketsRuntime.scope(el).self.count > 0"'), 'documented self helper should work inside Datastar-backed expressions');
  assert(output.includes('data-attr:data-route="window.BracketsRuntime.scope(el).route.path"'), 'documented route helper should work inside Datastar-backed expressions');
  assert(output.includes('data-class:active="$count > 1"'), ':class.name should compile to Datastar dynamic classes');
  assert(output.includes('data-attr:href="\'/docs\'"'), ':set.name should compile to Datastar dynamic attributes');
  assert(output.includes('data-show="window.BracketsRuntime.requestState.loading(&quot;route&quot;)"'), ':loading should compile to Brackets request-state visibility');
  assert(output.includes('data-attr:title="window.BracketsRuntime.requestState.message(&quot;route&quot;) || \'\'"'), ':error should expose a readable request-state message');
  assert(output.includes('data-on:pointerdown="@get(\'/search\')"'), 'plain request() should compile to the Datastar-native read action');
  assert(output.includes('data-on:click="@get(\'/posts\')"'), 'plain get() should stay on the Datastar-native request path');
  assert(output.includes('data-on:submit="@post(\'/posts\', { title: $count })"'), 'plain create() should compile to the Datastar-native create action');
  assert(output.includes('data-on:keydown="@put(\'/posts/1\', { title: $count })"'), 'plain update() should compile to the Datastar-native update action');
  assert(output.includes('data-on:keyup="@patch(\'/posts/1\', { title: $count })"'), 'plain patch() should compile to the Datastar-native patch action');
  assert(output.includes('data-on:dblclick="@delete(\'/posts/1\')"'), 'plain delete() should compile to the Datastar-native delete action');
  assert(output.includes('data-on:focus="window.BracketsRuntime.scope(el).nav.to(\'/next\')"'), 'documented nav helper should work inside event expressions');
  assert(output.includes('data-on:blur="evt.target.value"'), 'documented event helper should map cleanly to Datastar event context');
  assert(output.includes('data-on:input="$count = $count + 1"'), 'plain mutate() actions should stay on the Datastar-native signal path');
  assert(output.includes('data-b-html="$htmlBlock"'), ':html should stay on the framework runtime path');
});

Deno.test('framework action helpers follow the documented control, form, and file behavior', async () => {
  const runtimeSource = await Deno.readTextFile(join(repoRoot, 'framework', 'runtime.js'));
  const start = runtimeSource.indexOf('function resolveActionElement');
  const end = runtimeSource.indexOf('function currentRouteState');
  assert(start !== -1 && end !== -1 && end > start, 'runtime should keep the action helper block in a readable function section');
  const snippet = runtimeSource.slice(start, end);

  class FakeFormData {
    constructor(form, submitter) {
      this._entries = Array.isArray(form?.__entries) ? [...form.__entries] : [];
      if (submitter?.name) {
        this._entries.push([submitter.name, submitter.value ?? '']);
      }
    }

    *entries() {
      yield* this._entries;
    }

    [Symbol.iterator]() {
      return this.entries();
    }
  }

  const helpers = new Function('FormData', 'File', `${snippet}; return { currentActionValue, currentFormData, filesForAction };`)(FakeFormData, File);
  const form = {
    __entries: [
      ['title', 'Brackets'],
      ['tag', 'router'],
      ['tag', 'runtime'],
      ['avatar', new File(['avatar'], 'avatar.png', { type: 'image/png' })]
    ]
  };
  const closestForm = (selector) => (selector === 'form' ? form : null);
  const textInput = {
    tagName: 'INPUT',
    type: 'text',
    name: 'title',
    value: 'Brackets',
    closest: closestForm
  };
  const fileInput = {
    tagName: 'INPUT',
    type: 'file',
    name: 'avatar',
    files: [new File(['avatar'], 'avatar.png', { type: 'image/png' })],
    closest: closestForm
  };
  const submitButton = {
    tagName: 'BUTTON',
    type: 'submit',
    name: 'intent',
    value: 'save',
    form,
    closest: closestForm
  };

  assertEqual(
    helpers.currentActionValue({ type: 'input', target: textInput }, textInput),
    'Brackets',
    'ctx.action.input() should read the active control value for normal input events'
  );

  const submitValue = helpers.currentActionValue({ type: 'submit', target: submitButton, submitter: submitButton }, submitButton);
  assertDeepEqual(
    {
      title: submitValue.title,
      tag: submitValue.tag,
      intent: submitValue.intent
    },
    {
      title: 'Brackets',
      tag: ['router', 'runtime'],
      intent: 'save'
    },
    'ctx.action.input() should return a form payload with repeated names preserved as arrays on submit'
  );

  const formData = helpers.currentFormData({ type: 'submit', target: submitButton, submitter: submitButton }, submitButton);
  const entries = Array.from(formData.entries());
  assert(entries.some(([key, value]) => key === 'intent' && value === 'save'), 'ctx.action.formData() should include the active submitter');

  const activeFiles = helpers.filesForAction({ type: 'change', target: fileInput }, fileInput);
  assertEqual(activeFiles.length, 1, 'ctx.action.files() should read selected files from the active input');
  assertEqual(activeFiles[0].name, 'avatar.png', 'ctx.action.files() should preserve the selected file details');
});

Deno.test('framework serves the root entry from config.yaml and exposes the docs-aligned contracts', async () => {
  await withServer(repoRoot, async ({ url, host }) => {
    const expectedEntryFolder = 'framework/demo';
    const expectedEntryPoint = '/framework/demo/index.html';
    const root = await fetch(url);
    const html = await root.text();
    assertEqual(root.status, 200, 'configured entry folder index.html should be served at /');
    assert(html.includes('<!doctype html>'), 'root response should be HTML');
    assert(
      html.includes('id="app-root"') && html.includes('framework/demo'),
      'response should be the configured entry folder index (demo shell + import map)'
    );
    assertEqual(root.headers.get('x-content-type-options'), 'nosniff', 'root response should disable content-type sniffing');
    assertEqual(root.headers.get('x-frame-options'), 'DENY', 'root response should block framing');
    assertEqual(root.headers.get('referrer-policy'), 'strict-origin-when-cross-origin', 'root response should send the expected referrer policy');

    const configResponse = await fetch(`${url}/config.yaml`);
    const configJsonResponse = await fetch(`${url}/config.json`);
    const configText = await configResponse.text();
    const configJson = await configJsonResponse.json();
    assertEqual(configResponse.status, 200, 'root yaml config endpoint should be available');
    assert(configText.includes('entry:'), 'root yaml config should include the entry section');
    assertEqual(configJsonResponse.status, 200, 'json compatibility config endpoint should still be available');
    assertEqual(configJson.entry.folder, expectedEntryFolder, 'config.json should echo entry.folder from config.yaml');

    const yamlResponse = await fetch(`${url}/config/brackets.yaml`);
    const yaml = await yamlResponse.text();
    assertEqual(yamlResponse.status, 200, 'yaml config endpoint should be available');
    assert(yaml.includes('entry:'), 'yaml config should include the entry section');
    assert(yaml.includes(`folder: ${expectedEntryFolder}`), 'yaml config should describe the configured package entry folder');

    const hostResponse = await fetch(`${url}/.well-known/brackets-host.json`);
    const hostContract = await hostResponse.json();
    assertEqual(hostResponse.status, 200, 'host contract should be available');
    assertEqual(hostContract.distribution.entryFolder, expectedEntryFolder, 'host contract should report the configured package entry folder');
    assertEqual(host.distribution.entryPoint, expectedEntryPoint, 'server should report entry point derived from entry.folder');
    assertEqual(hostResponse.headers.get('cross-origin-opener-policy'), 'same-origin', 'host contract should include the opener policy');
    assertEqual(hostResponse.headers.get('cross-origin-resource-policy'), 'same-origin', 'host contract should include the resource policy');

    const appResponse = await fetch(`${url}/.well-known/brackets-app.json`);
    const appContract = await appResponse.json();
    assertEqual(appResponse.status, 200, 'app contract should be available');
    assert('routes' in appContract, 'app contract should expose routes even when the app folder is missing');

    const runtimeResponse = await fetch(`${url}/framework/runtime.js`);
    const runtimeSource = await runtimeResponse.text();
    assertEqual(runtimeResponse.status, 200, 'runtime script should be available');
    assert(runtimeSource.includes('mutate(path, value)'), 'runtime should expose mutate() for transformed syntax');
    assert(runtimeSource.includes('read(target, options = {})'), 'runtime should expose read() for transformed syntax');
    assert(runtimeSource.includes('request(target, options = {})'), 'runtime should expose request() for transformed syntax');
    assert(runtimeSource.includes('SESSION_CACHE_TTL_MS = 5000'), 'runtime should bound cached session reuse with a short TTL');
    assert(runtimeSource.includes("credentials: 'same-origin'"), 'runtime transport should stay on same-origin credentials for host/session requests');

      const serverSource = await Deno.readTextFile(join(repoRoot, 'framework', 'server.js'));
      assert(serverSource.includes('__Host-brackets_csrf'), 'server should support secure host-prefixed CSRF cookies on HTTPS hosts');
      assert(serverSource.includes('function routeAuthStatus'), 'server should compute auth status explicitly instead of inferring it ad hoc');
      assert(serverSource.includes('function methodLooksMutating'), 'server should distinguish reads from writes before invalidating route/cache state');
    });
});

Deno.test('framework honors entry.folder and serves that folder index.html first', async () => {
  const tempRoot = await Deno.makeTempDir({ prefix: 'brackets-entry-folder-' });

  try {
    await writeText(join(tempRoot, 'config.json'), JSON.stringify({
      host: '127.0.0.1',
      port: 0,
      entry: {
        folder: 'site',
        route: '/',
        autoStart: false
      }
    }, null, 2));

    await writeText(join(tempRoot, 'site', 'index.html'), '<!doctype html><html><body><h1>Entry folder works</h1></body></html>');

    await withServer(tempRoot, async ({ url }) => {
      const root = await fetch(url);
      const html = await root.text();
      assertEqual(root.status, 200, 'entry-folder root should be served');
      assert(html.includes('Entry folder works'), 'configured entry folder should control the served index.html');

      const hostResponse = await fetch(`${url}/.well-known/brackets-host.json`);
      const hostContract = await hostResponse.json();
      assertEqual(hostContract.distribution.entryFolder, 'site', 'host contract should report the configured entry folder');
      assertEqual(hostContract.distribution.entryPoint, '/site/index.html', 'host contract should report the configured entry file');
    });
  } finally {
    await Deno.remove(tempRoot, { recursive: true });
  }
});

Deno.test('flat app view without manifest layout does not double-compose page as layout', async () => {
  const tempRoot = await Deno.makeTempDir({ prefix: 'brackets-flat-view-' });

  try {
    await writeText(join(tempRoot, 'config.json'), JSON.stringify({
      host: '127.0.0.1',
      port: 0,
      entry: {
        folder: '.',
        route: '/',
        autoStart: false
      }
    }, null, 2));

    await writeText(join(tempRoot, 'index.html'), '<!doctype html><html><body><div id="root"></div></body></html>');
    await writeText(join(tempRoot, 'app', 'home', 'home.view'), [
      'page({',
      "  id: 'home',",
      "  route: '/',",
      "  title: 'Flat',",
      "  html: '@app/home/home.html',",
      '})'
    ].join('\n'));
    await writeText(join(tempRoot, 'app', 'home', 'home.html'), '<div id="flat-route-sentinel" class="once">Flat route page</div>');

    await withServer(tempRoot, async ({ url }) => {
      const contract = await fetch(`${url}/.well-known/brackets-app.json`).then((response) => response.json());
      const home = contract.routes.find((r) => r.route === '/');
      assert(home, 'contract should include / route');
      assertEqual(home.layoutPath, null, 'flat view should not infer layout from page html path');

      const renderPayload = await fetch(`${url}/__brackets/render?path=%2F`).then((response) => response.json());
      assertEqual(renderPayload.ok, true, 'render should succeed');
      assertEqual(renderPayload.layoutPath, null, 'render payload should not report a layout path');
      const sentinelCount = (renderPayload.html.match(/flat-route-sentinel/g) ?? []).length;
      assertEqual(sentinelCount, 1, 'page markup should appear once in rendered html');
    });
  } finally {
    await Deno.remove(tempRoot, { recursive: true });
  }
});

Deno.test('framework discovers routes and wires html, .data, and .api through the built-in host', async () => {
  const tempRoot = await Deno.makeTempDir({ prefix: 'brackets-app-contract-' });

  try {
    await writeText(join(tempRoot, 'config.json'), JSON.stringify({
      host: '127.0.0.1',
      port: 0,
      entry: {
        folder: '.',
        route: '/',
        autoStart: false
      }
    }, null, 2));

    await writeText(join(tempRoot, 'index.html'), await Deno.readTextFile(join(repoRoot, 'index.html')));
    await writeText(join(tempRoot, 'app', 'views', 'home.view'), [
      'page({',
      "  id: 'home',",
      "  route: '/home',",
      "  html: '@app/pages/home.html',",
      "  logic: '@app/logic/home.logic',",
      "  layout: '@app/layouts/app.html',",
      "  data: ['contacts'],",
      "  api: ['remote'],",
      "  preload: 'render',",
      "  meta: { description: 'Framework home route' },",
      "  seo: { canonical: '/home', feed: { title: 'Framework home update', summary: 'Framework home summary', updatedAt: '2026-01-02T03:04:05.000Z' } },",
      "  assets: { scripts: ['/static/home.js'] }",
      '})'
    ].join('\n'));
    await writeText(join(tempRoot, 'app', 'views', 'details.view'), [
      'page({',
      "  id: 'details',",
      "  route: '/details',",
      "  html: '@app/pages/details.html',",
      "  layout: '@app/layouts/app.html',",
      "  seo: { sitemap: false }",
      '})'
    ].join('\n'));
    await writeText(join(tempRoot, 'app', 'layouts', 'app.html'), [
      '<section class="shell">',
      '  <header :area="\'hero\'"><h2>Default hero</h2></header>',
      '  <header>Shell</header>',
      '  <main :mount></main>',
      '</section>'
    ].join('\n'));
    await writeText(join(tempRoot, 'app', 'components', 'card.html'), [
      '<article class="card">',
      '  <h2 :text="title"></h2>',
      '  <div :area="\'body\'">Default body</div>',
      '</article>'
    ].join('\n'));
    await writeText(join(tempRoot, 'app', 'pages', 'home.html'), [
      '<main [page] :state="{ title: \'Framework route\', items: [{ name: \'Ada\' }, { name: \'Grace\' }], visible: true, htmlBlock: \'<strong>Trusted</strong>\' }">',
      '  <template :fill="\'hero\'"><p :text="title"></p></template>',
      '  <h1 :text="title"></h1>',
      '  <section :if="visible">',
      '    <div :html="htmlBlock"></div>',
      '  </section>',
      '  <template :each="item, row in items">',
      '    <p :text="item.name"></p>',
      '  </template>',
      '  <section :use="\'card\'" :props="{ title: title }">',
      '    <template :fill="\'body\'"><p :text="title"></p></template>',
      '  </section>',
      '  <p :loading="route">Loading route</p>',
      '  <p :error="route">Route error</p>',
      '  <button @click="get(\'/api/posts\')">Load</button>',
      '  <button @click="mutate(\'title\', title + \' now\')">Update</button>',
      '  <section :calc="{ feed: read(\'/events.state\') }"></section>',
      '</main>'
    ].join('\n'));
    await writeText(join(tempRoot, 'app', 'logic', 'home.logic'), [
      '({',
      '  mount() {',
      '    return null;',
      '  }',
      '})'
    ].join('\n'));
    await writeText(join(tempRoot, 'app', 'pages', 'details.html'), [
      '<main [page] :state="{ title: \'Details route\', visible: true }">',
      '  <template :fill="\'hero\'"><p :text="title"></p></template>',
      '  <h1 :text="title"></h1>',
      '</main>'
    ].join('\n'));
    await writeText(join(tempRoot, 'app', 'data', 'contacts.data'), [
      '({',
      '  list() {',
      "    return [{ id: 1, name: 'Ada' }];",
      '  },',
      '  save(next) {',
      "    return [{ id: 2, name: next?.name ?? 'Grace' }];",
      '  }',
      '})'
    ].join('\n'));
    await writeText(join(tempRoot, 'app', 'api', 'remote.api'), [
      '({',
      '  ping() {',
      "    return { ok: true, transport: 'same-origin' };",
      '  },',
      '  touch() {',
      "    return { ok: true, mutated: true, transport: 'same-origin' };",
      '  }',
      '})'
    ].join('\n'));

    await withServer(tempRoot, async ({ url }) => {
      const appResponse = await fetch(`${url}/.well-known/brackets-app.json`);
      const appContract = await appResponse.json();
      assertEqual(appResponse.status, 200, 'app contract should be available');
      assertEqual(appContract.routes.length, 2, 'route discovery should find the authored .view manifests');
      assert(appContract.routes.some((route) => route.route === '/home'), 'route discovery should keep the /home manifest');
      assert(appContract.routes.some((route) => route.route === '/details'), 'route discovery should keep the /details manifest');
      const homeRoute = appContract.routes.find((route) => route.route === '/home');
      assertEqual(homeRoute.preload, 'render', 'route contracts should preserve preload metadata');
      assertEqual(homeRoute.meta.description, 'Framework home route', 'route contracts should preserve route meta');
      assertEqual(homeRoute.seo.canonical, '/home', 'route contracts should preserve route seo');
      assertEqual(homeRoute.assets.scripts[0], '/static/home.js', 'route contracts should preserve route assets');
      assertEqual(homeRoute.data[0], 'contacts', 'route contracts should preserve local data dependencies');
      assertEqual(homeRoute.api[0], 'remote', 'route contracts should preserve remote api dependencies');

      const renderResponse = await fetch(`${url}/__brackets/render?path=%2Fhome`);
      const renderPayload = await renderResponse.json();
      assertEqual(renderResponse.status, 200, 'route rendering should work through the host');
      assertEqual(renderPayload.route.layoutPath, '/app/layouts/app.html', 'route payload should expose the current layout path');
      assertEqual(renderPayload.layoutPath, '/app/layouts/app.html', 'render payload should expose the current layout path for partial updates');
      assert(renderPayload.html.includes('data-b-mount'), 'rendered layout should preserve the mount marker for partial route swaps');
      assert(renderPayload.mountHtml.includes('data-signals='), 'render payload should include the transformed mounted fragment');
      assert(renderPayload.html.includes('data-signals='), 'route HTML should be transformed into Datastar-compatible markup');
      assert(renderPayload.html.includes('data-b-if="$visible"'), ':if should remain on the framework runtime path');
      assert(renderPayload.html.includes('data-b-html="$htmlBlock"'), ':html should remain on the framework runtime path');
      assert(renderPayload.html.includes('data-b-each="item, row in $items"'), ':each should remain on the framework runtime path');
      assert(renderPayload.html.includes(`data-b-use="'card'"`), ':use should remain on the framework runtime path');
      assert(renderPayload.html.includes('data-b-props="{ title: $title }"'), ':props should remain on the framework runtime path');
      assert(renderPayload.html.includes('data-b-area="hero"'), ':area should remain on the framework runtime path');
      assert(renderPayload.html.includes('data-b-fill="hero"'), ':fill should remain on the framework runtime path');
      assert(renderPayload.html.includes('data-show="window.BracketsRuntime.requestState.loading(&quot;route&quot;)"'), ':loading should compile to Datastar-backed request-state visibility');
      assert(renderPayload.html.includes('data-show="window.BracketsRuntime.requestState.hasError(&quot;route&quot;)"'), ':error should compile to Datastar-backed request-state visibility');
      assert(renderPayload.html.includes('data-attr:title="window.BracketsRuntime.requestState.message(&quot;route&quot;) || \'\'"'), ':error should expose the request error message as a Datastar-backed attribute');
      assert(renderPayload.html.includes('data-on:click="@get(\'/api/posts\')"'), 'plain get() should compile to a Datastar-native action');
      assert(renderPayload.html.includes('data-on:click="$title = $title + \' now\'"'), 'plain mutate() should compile to a Datastar-native signal write');
      assert(renderPayload.html.includes("data-computed=\"{ feed: () => (window.BracketsRuntime.read('/events.state')) }\""), 'plain read() expressions should compile to the Brackets live runtime helper');

      const sitemap = await fetch(`${url}/sitemap.xml`).then((response) => response.text());
      assert(sitemap.includes('<loc>http://127.0.0.1:'), 'sitemap should render absolute route URLs');
      assert(sitemap.includes('/home</loc>'), 'sitemap should include public routes');
      assert(!sitemap.includes('/details</loc>'), 'sitemap should skip routes that opt out');

      const feed = await fetch(`${url}/feed.xml`).then((response) => response.text());
      assert(feed.includes('<title>Framework home update</title>'), 'feed should include routes that opt into feed output');
      assert(feed.includes('Framework home summary'), 'feed should include route feed summaries');
      assert(feed.includes('/home</link>'), 'feed should include the route canonical URL');

      const detailsPayload = await fetch(`${url}/__brackets/render?path=%2Fdetails`).then((response) => response.json());
      assertEqual(detailsPayload.layoutPath, '/app/layouts/app.html', 'same-layout routes should expose the shared layout path');
      assert(detailsPayload.html.includes('Details route'), 'same-layout route render should include the next route content');
      assert(detailsPayload.mountHtml.includes('Details route'), 'same-layout route render should expose the mounted fragment for partial swaps');
      assert(detailsPayload.html.includes('data-b-area="hero"'), 'same-layout route render should preserve layout areas for partial layout updates');

      const templatePayload = await fetch(`${url}/__brackets/template?ref=card&from=app/pages/home.html`).then((response) => response.json());
      assertEqual(templatePayload.ok, true, 'template endpoint should resolve framework template references');
      assertEqual(templatePayload.path, '/app/components/card.html', 'template endpoint should resolve component fallbacks');
      assert(typeof templatePayload.stamp === 'string' && templatePayload.stamp.length > 0, 'template endpoint should expose a stable template stamp for runtime reuse');
      assert(templatePayload.html.includes('data-b-area="body"'), 'template endpoint should return transformed template markup');

      const runtimeSource = await fetch(`${url}/framework/runtime.js`).then((response) => response.text());
      assert(runtimeSource.includes('auth: createAuthApi()'), 'runtime should expose auth helpers that match the docs');
      assert(runtimeSource.includes('get authenticated()'), 'runtime auth helpers should expose ctx.auth.authenticated for quick session checks');
      assert(runtimeSource.includes('download(target, filename)'), 'runtime nav helpers should expose download()');
      assert(runtimeSource.includes('async function applyFrameworkDirectives'), 'runtime should apply framework directives (:if, :each, :use, :html, …)');
      assert(runtimeSource.includes('async function fetchFrameworkTemplate'), 'runtime should resolve framework templates through the built-in host');
      assert(runtimeSource.includes('__bUseRequestToken'), 'framework template composition should guard against stale async template resolutions');
      assert(runtimeSource.includes('templateStamp: templatePayload.stamp'), 'framework template composition should include the template stamp in its rerender signature');
      assert(runtimeSource.includes("element.removeAttribute('data-signals')"), 'framework template composition should clear stale prop signals when props are removed');
      assert(runtimeSource.includes('function beginRequestEntry'), 'runtime should guard request state with request tokens');
      assert(runtimeSource.includes('MAX_NAVIGATION_REDIRECTS = 12'), 'runtime should guard redirect loops');
      assert(runtimeSource.includes('navigationSequence'), 'runtime should track navigation sequencing for partial route updates');
      assert(runtimeSource.includes('function scheduleRoutePreloads'), 'runtime should honor documented route preload hints');
      assert(runtimeSource.includes('function schedulePreloadTargets'), 'runtime should share preload scheduling between initial and invalidated route warming');
      assert(runtimeSource.includes('routeTableCache'), 'runtime should cache route matcher tables instead of rebuilding them on every navigation');
      assert(runtimeSource.includes('staleWhileRevalidate'), 'runtime cache helpers should support stale-while-revalidate refreshes');
      assert(runtimeSource.includes('applyRuntimeInvalidation'), 'runtime should apply same-host invalidation after module writes');
      assert(runtimeSource.includes("'x-brackets-csrf'"), 'runtime RPC should send the active CSRF token');
      assert(runtimeSource.includes('sessionRetryAttempted'), 'runtime should retry protected-route session recovery once before redirecting');
      assert(runtimeSource.includes('scope(element = null, event = null)'), 'runtime should expose a scope bridge for Datastar-backed expressions');
      assert(runtimeSource.includes('function applyRouteDocumentHead'), 'runtime should reconcile route meta and seo into document head');
      assert(runtimeSource.includes('function patchSharedLayoutAreas'), 'runtime should patch same-layout area fills during partial route swaps');
      assert(runtimeSource.includes('async optimistic(patch, task)'), 'runtime state helpers should expose optimistic updates');
      assert(runtimeSource.includes('runtimeValuesEqual'), 'optimistic state rollback should compare the live value before reverting over newer state');
      assert(runtimeSource.includes('requestToken = nextCacheToken()'), 'route and cache fetches should guard against older async work overwriting newer payloads');
      assert(runtimeSource.includes('renderFrameworkIf('), 'runtime should render data-b-if via framework passes');
      assert(runtimeSource.includes('observeFrameworkDom('), 'runtime should observe DOM for framework directive attributes');
      assert(runtimeSource.includes('invalidate(key)'), 'runtime state helpers should expose cache invalidation');
      assert(runtimeSource.includes('self: locals'), 'scope bridge should expose the documented self helper');
      assert(runtimeSource.includes('parent: null'), 'scope bridge should expose the documented parent helper');
      assert(runtimeSource.includes('children: []'), 'scope bridge should expose the documented children helper');
      assert(runtimeSource.includes('root: locals'), 'scope bridge should expose the documented root helper');
      assert(runtimeSource.includes('props: {}'), 'scope bridge should expose the documented props helper');
      assert(runtimeSource.includes('event: null'), 'scope bridge should expose the documented event helper');

      const sessionSecurity = await getSessionSecurity(url);
      const sessionPayload = sessionSecurity.payload;
      assertEqual(sessionSecurity.status, 200, 'session endpoint should be available for runtime auth helpers');
      assert('authenticated' in sessionPayload, 'session payload should expose auth state');
      assert(typeof sessionPayload.csrfToken === 'string' && sessionPayload.csrfToken.length > 0, 'session payload should expose the active CSRF token');
      const csrfHeaders = sessionSecurity.headers;

      const dataResponse = await fetch(`${url}/__brackets/rpc`, {
        method: 'POST',
        headers: csrfHeaders,
        body: JSON.stringify({
          kind: 'data',
          module: 'contacts',
          method: 'list',
          args: [],
          route: {
            path: '/home',
            query: {},
            hash: ''
          }
        })
      });
      const dataPayload = await dataResponse.json();
      assertEqual(dataResponse.status, 200, '.data RPC should run through the host');
      assertEqual(dataPayload.result[0].name, 'Ada', '.data RPC should return the module result');
      assertEqual(dataPayload.invalidate.write, false, '.data reads should not be treated as mutating invalidations');
      assertEqual(dataPayload.invalidate.routes.length, 0, '.data reads should not invalidate dependent routes');

      const dataWriteResponse = await fetch(`${url}/__brackets/rpc`, {
        method: 'POST',
        headers: csrfHeaders,
        body: JSON.stringify({
          kind: 'data',
          module: 'contacts',
          method: 'save',
          args: [{ name: 'Grace' }],
          route: {
            path: '/home',
            query: {},
            hash: ''
          }
        })
      });
      const dataWritePayload = await dataWriteResponse.json();
      assertEqual(dataWriteResponse.status, 200, '.data write RPC should run through the host');
      assertEqual(dataWritePayload.result[0].name, 'Grace', '.data write RPC should return the module result');
      assertEqual(dataWritePayload.invalidate.write, true, '.data writes should be reported as mutating invalidations');
      assertEqual(dataWritePayload.invalidate.module, 'contacts', '.data RPC should report the written module for invalidation');
      assert(dataWritePayload.invalidate.routes.includes('/home'), '.data RPC should invalidate routes that depend on the written data module');

      const apiResponse = await fetch(`${url}/__brackets/rpc`, {
        method: 'POST',
        headers: csrfHeaders,
        body: JSON.stringify({
          kind: 'api',
          module: 'remote',
          method: 'ping',
          args: [],
          route: {
            path: '/home',
            query: {},
            hash: ''
          }
        })
      });
      const apiPayload = await apiResponse.json();
      assertEqual(apiResponse.status, 200, '.api RPC should run through the host');
      assertEqual(apiPayload.result.transport, 'same-origin', '.api RPC should return the module result');
      assertEqual(apiPayload.invalidate.write, false, '.api reads should not be treated as mutating invalidations');
      assertEqual(apiPayload.invalidate.routes.length, 0, '.api reads should not invalidate dependent routes');

      const apiWriteResponse = await fetch(`${url}/__brackets/rpc`, {
        method: 'POST',
        headers: csrfHeaders,
        body: JSON.stringify({
          kind: 'api',
          module: 'remote',
          method: 'touch',
          args: [],
          route: {
            path: '/home',
            query: {},
            hash: ''
          }
        })
      });
      const apiWritePayload = await apiWriteResponse.json();
      assertEqual(apiWriteResponse.status, 200, '.api write RPC should run through the host');
      assertEqual(apiWritePayload.invalidate.write, true, '.api writes should be reported as mutating invalidations');
      assert(apiWritePayload.invalidate.routes.includes('/home'), '.api RPC should invalidate routes that depend on the written api module');

      const csrfFailureResponse = await fetch(`${url}/__brackets/rpc`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'x-brackets-csrf': 'bad-token'
        },
        body: JSON.stringify({
          kind: 'data',
          module: 'contacts',
          method: 'list',
          args: [],
          route: {
            path: '/home',
            query: {},
            hash: ''
          }
        })
      });
      const csrfFailurePayload = await csrfFailureResponse.json();
      assertEqual(csrfFailureResponse.status, 403, 'RPC should reject requests with a bad CSRF token');
      assertEqual(csrfFailurePayload.code, 'BRACKETS_CSRF_MISMATCH', 'RPC CSRF failures should return a stable framework error code');
      assert(typeof csrfFailurePayload.requestId === 'string' && csrfFailurePayload.requestId.length > 0, 'RPC CSRF failures should include a request id');

      const largePayload = JSON.stringify({
        kind: 'data',
        module: 'contacts',
        method: 'list',
        args: [],
        route: {
          path: '/home',
          query: {},
          hash: ''
        },
        pad: 'x'.repeat((1024 * 1024) + 128)
      });
      const oversizedResponse = await fetch(`${url}/__brackets/rpc`, {
        method: 'POST',
        headers: csrfHeaders,
        body: largePayload
      });
      const oversizedPayload = await oversizedResponse.json();
      assertEqual(oversizedResponse.status, 413, 'oversized RPC bodies should be rejected');
      assert(oversizedPayload.error.includes('Request body exceeded'), 'oversized RPC rejection should explain the request limit');
      assertEqual(oversizedPayload.code, 'BRACKETS_REQUEST_ERROR', 'oversized RPC rejection should return a stable framework error code');
    });
  } finally {
    await Deno.remove(tempRoot, { recursive: true });
  }
});

Deno.test('framework encrypted storage works for real through .data modules', async () => {
  const tempRoot = await Deno.makeTempDir({ prefix: 'brackets-secure-storage-' });
  const previousKey = process.env.BRACKETS_DATA_KEY;
  process.env.BRACKETS_DATA_KEY = 'brackets-test-storage-key';

  try {
    await writeText(join(tempRoot, 'config.json'), JSON.stringify({
      host: '127.0.0.1',
      port: 0,
      entry: {
        folder: '.',
        route: '/',
        autoStart: false
      },
      security: {
        storage: {
          keyEnv: 'BRACKETS_DATA_KEY',
          pbkdf2Iterations: 1000
        }
      }
    }, null, 2));

    await writeText(join(tempRoot, 'index.html'), '<!doctype html><html><body>secure</body></html>');
    await writeText(join(tempRoot, 'app', 'data', 'profile.data'), [
      '({',
      '  async save({ storage }, nextValue) {',
      "    return storage['[e]json']('@storage/profile.secure.json').write(nextValue);",
      '  },',
      '  async load({ secureJson }) {',
      "    return secureJson('@storage/profile.secure.json').read({ theme: 'light' });",
      '  }',
      '})'
    ].join('\n'));

    await withServer(tempRoot, async ({ url }) => {
      const sessionSecurity = await getSessionSecurity(url);
      const writeResponse = await fetch(`${url}/__brackets/rpc`, {
        method: 'POST',
        headers: sessionSecurity.headers,
        body: JSON.stringify({
          kind: 'data',
          module: 'profile',
          method: 'save',
          args: [{ theme: 'dark', token: 'secret-value' }],
          route: {
            path: '/',
            query: {},
            hash: ''
          }
        })
      });
      assertEqual(writeResponse.status, 200, 'encrypted storage write RPC should succeed');
      await writeResponse.arrayBuffer();

      const rawStorage = await Deno.readTextFile(join(tempRoot, 'app', 'storage', 'profile.secure.json'));
      assert(!rawStorage.includes('secret-value'), 'encrypted storage should not write plaintext values to disk');
      assert(rawStorage.includes('"cipher": "aes-256-gcm"'), 'encrypted storage should write an authenticated encryption envelope');

      const readPayload = await fetch(`${url}/__brackets/rpc`, {
        method: 'POST',
        headers: sessionSecurity.headers,
        body: JSON.stringify({
          kind: 'data',
          module: 'profile',
          method: 'load',
          args: [],
          route: {
            path: '/',
            query: {},
            hash: ''
          }
        })
      }).then((response) => response.json());

      assertEqual(readPayload.result.theme, 'dark', 'encrypted storage should decrypt the stored payload');
      assertEqual(readPayload.result.token, 'secret-value', 'encrypted storage should preserve the original stored payload');
    });
  } finally {
    if (previousKey === undefined) {
      delete process.env.BRACKETS_DATA_KEY;
    } else {
      process.env.BRACKETS_DATA_KEY = previousKey;
    }
    await Deno.remove(tempRoot, { recursive: true });
  }
});

Deno.test('framework .db storage works for real through .data modules', async () => {
  const tempRoot = await Deno.makeTempDir({ prefix: 'brackets-db-' });

  try {
    await writeText(join(tempRoot, 'config.json'), JSON.stringify({
      host: '127.0.0.1',
      port: 0,
      entry: {
        folder: '.',
        route: '/',
        autoStart: false
      }
    }, null, 2));

    await writeText(join(tempRoot, 'index.html'), '<!doctype html><html><body>db</body></html>');
    await writeText(join(tempRoot, 'app', 'data', 'prefs.data'), [
      '({',
      '  async save({ db }, nextValue) {',
      "    return db('@storage/prefs.db').write(nextValue);",
      '  },',
      '  async load({ db }) {',
      "    return db('@storage/prefs.db').read({ theme: 'light' });",
      '  }',
      '})'
    ].join('\n'));

    await withServer(tempRoot, async ({ url }) => {
      const sessionSecurity = await getSessionSecurity(url);
      const writeResponse = await fetch(`${url}/__brackets/rpc`, {
        method: 'POST',
        headers: sessionSecurity.headers,
        body: JSON.stringify({
          kind: 'data',
          module: 'prefs',
          method: 'save',
          args: [{ theme: 'dark', density: 'compact' }],
          route: {
            path: '/',
            query: {},
            hash: ''
          }
        })
      });
      assertEqual(writeResponse.status, 200, '.db write RPC should succeed');
      await writeResponse.arrayBuffer();

      const readPayload = await fetch(`${url}/__brackets/rpc`, {
        method: 'POST',
        headers: sessionSecurity.headers,
        body: JSON.stringify({
          kind: 'data',
          module: 'prefs',
          method: 'load',
          args: [],
          route: {
            path: '/',
            query: {},
            hash: ''
          }
        })
      }).then((response) => response.json());

      assertEqual(readPayload.result.theme, 'dark', '.db read should return the stored value');
      assertEqual(readPayload.result.density, 'compact', '.db read should preserve the stored payload');
    });
  } finally {
    await Deno.remove(tempRoot, { recursive: true });
  }
});

Deno.test('framework live SSE can stream .data changes from flat-file storage', async () => {
  const tempRoot = await Deno.makeTempDir({ prefix: 'brackets-live-' });

  try {
    await writeText(join(tempRoot, 'config.json'), JSON.stringify({
      host: '127.0.0.1',
      port: 0,
      entry: {
        folder: '.',
        route: '/',
        autoStart: false
      }
    }, null, 2));

    await writeText(join(tempRoot, 'index.html'), '<!doctype html><html><body>live</body></html>');
    await writeText(join(tempRoot, 'app', 'data', 'contacts.data'), [
      '({',
      '  async list({ json }) {',
      "    return json('@storage/contacts.json').read([]);",
      '  },',
      '  async save({ json }, nextValue) {',
      "    return json('@storage/contacts.json').write(nextValue);",
      '  }',
      '})'
    ].join('\n'));
    await writeText(join(tempRoot, 'app', 'storage', 'contacts.json'), JSON.stringify([{ id: 1, name: 'Ada' }], null, 2));

    await withServer(tempRoot, async ({ url }) => {
      const sessionSecurity = await getSessionSecurity(url);
      const response = await fetch(`${url}/__brackets/live.state?kind=data&module=contacts&method=list&intervalMs=5000`);
      assertEqual(response.status, 200, 'live data endpoint should respond');
      assertEqual(response.headers.get('content-type'), 'text/event-stream; charset=utf-8', 'live data endpoint should be SSE');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      const opened = await readSseEvent(reader, decoder);
      assertEqual(opened.event, 'open', 'first SSE event should announce stream open');

      const first = await readSseEvent(reader, decoder);
      const firstPayload = JSON.parse(first.data);
      assertEqual(firstPayload[0].name, 'Ada', 'first SSE payload should stream the current flat-file value');

      const writeLiveResponse = await fetch(`${url}/__brackets/rpc`, {
        method: 'POST',
        headers: sessionSecurity.headers,
        body: JSON.stringify({
          kind: 'data',
          module: 'contacts',
          method: 'save',
          args: [[{ id: 1, name: 'Ada' }, { id: 2, name: 'Grace' }]],
          route: {
            path: '/',
            query: {},
            hash: ''
          }
        })
      });
      await writeLiveResponse.arrayBuffer();

      let timeoutId = null;
      const second = await Promise.race([
        readSseEvent(reader, decoder),
        new Promise((_, reject) => {
          timeoutId = setTimeout(() => reject(new Error('live SSE should push updates without waiting for the next poll interval')), 1200);
        })
      ]).finally(() => {
        if (timeoutId !== null) {
          clearTimeout(timeoutId);
        }
      });
      const secondPayload = JSON.parse(second.data);
      assertEqual(secondPayload.length, 2, 'live SSE should emit again when the flat-file data changes');
      assertEqual(secondPayload[1].name, 'Grace', 'live SSE should stream the updated flat-file value');

      await reader.cancel();
      await response.body.cancel().catch(() => null);
    });
  } finally {
    await Deno.remove(tempRoot, { recursive: true });
  }
});

Deno.test('framework hybrid router gives router.logic and grouped logic routes precedence over .view routes', async () => {
  const tempRoot = await Deno.makeTempDir({ prefix: 'brackets-router-' });

  try {
    await writeText(join(tempRoot, 'config.json'), JSON.stringify({
      host: '127.0.0.1',
      port: 0,
      entry: {
        folder: '.',
        route: '/',
        autoStart: false
      }
    }, null, 2));

    await writeText(join(tempRoot, 'index.html'), '<!doctype html><html><body><div id="brackets-root"></div></body></html>');
    await writeText(join(tempRoot, 'app', 'router.logic'), [
      '({',
      '  routes: [',
      '    {',
      "      id: 'home',",
      "      route: '/home',",
      "      html: '@app/pages/router-home.html'",
      '    },',
      '    {',
      "      id: 'private',",
      "      route: '/private',",
      "      redirectTo: '/login'",
      '    },',
      '    {',
      "      id: 'secure',",
      "      route: '/secure',",
      "      html: '@app/pages/router-home.html',",
      "      auth: { required: true, redirectTo: '/login' }",
      '    },',
      '    {',
      "      id: 'admin',",
      "      route: '/admin',",
      "      html: '@app/pages/router-home.html',",
      "      auth: { required: true, roles: ['admin'], forbidden: '/forbidden', login: '/login' }",
      '    },',
      '    {',
      "      id: 'forbidden',",
      "      route: '/forbidden',",
      "      html: '@app/pages/forbidden.html'",
      '    },',
      '    {',
      "      id: 'login',",
      "      route: '/login',",
      "      html: '@app/pages/login.html'",
      '    }',
      '  ],',
      '  beforeEach() { return null; },',
      '  afterEach() { return null; },',
      "  notFound() { return '/login'; }",
      '})'
    ].join('\n'));
    await writeText(join(tempRoot, 'app', 'routes', 'reports.logic'), [
      '({',
      '  routes: [',
      '    {',
      "      id: 'reports',",
      "      route: '/reports',",
      "      html: '@app/pages/reports.html'",
      '    }',
      '  ]',
      '})'
    ].join('\n'));
    await writeText(join(tempRoot, 'app', 'views', 'home.view'), [
      'page({',
      "  id: 'home-view',",
      "  route: '/home',",
      "  html: '@app/pages/view-home.html'",
      '})'
    ].join('\n'));
    await writeText(join(tempRoot, 'app', 'pages', 'router-home.html'), '<main><h1>Router logic home</h1></main>');
    await writeText(join(tempRoot, 'app', 'pages', 'view-home.html'), '<main><h1>View home</h1></main>');
    await writeText(join(tempRoot, 'app', 'pages', 'reports.html'), '<main><h1>Grouped reports</h1></main>');
    await writeText(join(tempRoot, 'app', 'pages', 'forbidden.html'), '<main><h1>Forbidden page</h1></main>');
    await writeText(join(tempRoot, 'app', 'pages', 'login.html'), '<main><h1>Login page</h1></main>');

    await withServer(tempRoot, async ({ url }) => {
      const appContract = await fetch(`${url}/.well-known/brackets-app.json`).then((response) => response.json());
      assertEqual(appContract.router.logicUrl.includes('router.logic'), true, 'app contract should expose router.logic to the runtime');
      assertEqual(appContract.router.hooks.beforeEach, true, 'app contract should report router beforeEach support');
      assertEqual(appContract.routes[0].id, 'home', 'router.logic routes should take precedence over file routes');

      const homePayload = await fetch(`${url}/__brackets/render?path=%2Fhome`).then((response) => response.json());
      assert(homePayload.html.includes('Router logic home'), 'router.logic route rendering should beat the file route for the same path');
      assert(!homePayload.html.includes('View home'), 'view route should not win when router.logic declares the same route');

      const reportsPayload = await fetch(`${url}/__brackets/render?path=%2Freports`).then((response) => response.json());
      assert(reportsPayload.html.includes('Grouped reports'), 'grouped route logic should register renderable routes');

      const redirectPayload = await fetch(`${url}/__brackets/render?path=%2Fprivate`).then((response) => response.json());
      assertEqual(redirectPayload.redirectTo, '/login', 'logic route redirectTo should be preserved by the render endpoint');

      const securePayload = await fetch(`${url}/__brackets/render?path=%2Fsecure`).then((response) => response.json());
      assertEqual(securePayload.redirectTo, '/login', 'auth-protected routes should redirect unauthenticated requests');
      assertEqual(securePayload.authStatus, 'unauthorized', 'auth-protected route redirects should report the auth failure status');

      const adminPayload = await fetch(`${url}/__brackets/render?path=%2Fadmin`).then((response) => response.json());
      assertEqual(adminPayload.redirectTo, '/login', 'unauthenticated requests should still follow the login redirect before role evaluation');
      assertEqual(adminPayload.authStatus, 'unauthorized', 'unauthenticated requests should report unauthorized before role evaluation');

      const runtimeSource = await fetch(`${url}/framework/runtime.js`).then((response) => response.text());
      assert(runtimeSource.includes("callRouterHook('beforeEach'"), 'runtime should call router beforeEach hooks');
      assert(runtimeSource.includes("callRouterHook('notFound'"), 'runtime should call router notFound hooks');

      const serverSource = await Deno.readTextFile(join(repoRoot, 'framework', 'server.js'));
      assert(serverSource.includes('auth.forbidden ?? auth.unauthorized'), 'server should prefer forbidden redirect targets before unauthorized fallbacks for role mismatches');
    });
  } finally {
    await Deno.remove(tempRoot, { recursive: true });
  }
});

Deno.test('dev reload SSE is enabled when watch.enabled and watch.reload are true', async () => {
  const tempRoot = await Deno.makeTempDir({ prefix: 'brackets-dev-sse-watch-' });

  try {
    await writeText(join(tempRoot, 'config.json'), JSON.stringify({
      host: '127.0.0.1',
      port: 0,
      entry: {
        folder: '.',
        route: '/',
        autoStart: false
      },
      watch: {
        enabled: true,
        reload: true
      }
    }, null, 2));

    await writeText(join(tempRoot, 'index.html'), '<!doctype html><html><body>dev-watch</body></html>');

    await withServer(tempRoot, async ({ url }) => {
      const response = await fetch(`${url}/__brackets/dev-reload`);
      assertEqual(response.status, 200, 'dev SSE should be on when watch.reload is set');
      await response.body?.cancel?.();
    });
  } finally {
    await Deno.remove(tempRoot, { recursive: true });
  }
});

Deno.test('dev reload SSE is disabled without devMode or watch.reload', async () => {
  const tempRoot = await Deno.makeTempDir({ prefix: 'brackets-dev-sse-off-' });

  try {
    await writeText(join(tempRoot, 'config.json'), JSON.stringify({
      host: '127.0.0.1',
      port: 0,
      entry: {
        folder: '.',
        route: '/',
        autoStart: false
      },
      watch: {
        enabled: false,
        reload: false
      }
    }, null, 2));

    await writeText(join(tempRoot, 'index.html'), '<!doctype html><html><body>dev-off</body></html>');

    await withServer(tempRoot, async ({ url }) => {
      const response = await fetch(`${url}/__brackets/dev-reload`);
      assertEqual(response.status, 404, 'dev SSE should be disabled without devMode or watch.reload');
      await response.arrayBuffer();
    });
  } finally {
    await Deno.remove(tempRoot, { recursive: true });
  }
});

Deno.test('dev reload SSE emits spa and fullReload when package files change', async () => {
  const tempRoot = await Deno.makeTempDir({ prefix: 'brackets-dev-sse-on-' });

  try {
    await writeText(join(tempRoot, 'config.json'), JSON.stringify({
      host: '127.0.0.1',
      port: 0,
      entry: {
        folder: '.',
        route: '/',
        autoStart: false
      }
    }, null, 2));

    await writeText(join(tempRoot, 'index.html'), '<!doctype html><html><body>dev-on</body></html>');

    await withDevServer(tempRoot, async ({ url }) => {
      const hostResponse = await fetch(`${url}/__brackets/host`);
      const host = await hostResponse.json();
      assert(host.devReload === true, 'host contract should advertise devReload in dev mode');

      const denied = await fetch(`${url}/__brackets/dev-reload`, { method: 'POST' });
      assertEqual(denied.status, 405, 'dev SSE should reject non-GET');
      await denied.arrayBuffer();

      const response = await fetch(`${url}/__brackets/dev-reload`);
      assertEqual(response.status, 200, 'dev SSE should be available in devMode');
      assertEqual(response.headers.get('content-type'), 'text/event-stream; charset=utf-8', 'dev endpoint should be SSE');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      const raceWithTimeout = (promise, ms, label) => {
        let timer = null;
        return Promise.race([
          promise,
          new Promise((_, reject) => {
            timer = setTimeout(() => reject(new Error(`timed out waiting for ${label}`)), ms);
          })
        ]).finally(() => {
          if (timer !== null) {
            clearTimeout(timer);
          }
        });
      };

      try {
        await writeText(join(tempRoot, 'app', 'dev-probe.txt'), 'probe');
        const spaEvent = await raceWithTimeout(
          readNextDevSseEvent(reader, decoder),
          4000,
          'spa dev event'
        );
        assertEqual(spaEvent.event, 'spa', 'app tree changes should emit spa');

        await writeText(join(tempRoot, 'index.html'), '<!doctype html><html><body>dev-on-2</body></html>');
        const fullEvent = await raceWithTimeout(
          readNextDevSseEvent(reader, decoder),
          4000,
          'fullReload dev event'
        );
        assertEqual(fullEvent.event, 'fullReload', 'package index changes should emit fullReload');
      } finally {
        await reader.cancel();
      }
    });
  } finally {
    await Deno.remove(tempRoot, { recursive: true });
  }
});

Deno.test('package demo entry: render contract and shell inject route metadata', async () => {
  await withServer(repoRoot, async ({ url }) => {
    const renderPayload = await fetch(`${url}/__brackets/render?path=%2F`).then((response) => response.json());
    assertEqual(renderPayload.ok, true, 'render should succeed for demo /');
    assertEqual(renderPayload.layoutPath, null, 'demo home route should not use a layout file');
    const splashCount = (String(renderPayload.html ?? '').match(/brx-splash/g) ?? []).length;
    assertEqual(splashCount, 1, 'route HTML should include the hero fragment once');

    const homeHtml = await fetch(url).then((response) => response.text());
    assert(homeHtml.includes('data-brackets-route'), 'shell HTML should inject managed route head tags');
    assert(
      homeHtml.includes('Brackets framework demo'),
      'shell should include meta description from home.view'
    );
    assert(homeHtml.includes('<title>'), 'shell should include a document title');
    assert(homeHtml.includes('Brackets</title>') || homeHtml.includes('<title>Brackets</title>'), 'shell title should match route');

    const contract = await fetch(`${url}/.well-known/brackets-app.json`).then((response) => response.json());
    const homeRoute = contract.routes.find((r) => r.route === '/');
    assert(homeRoute, 'contract should list / route');
    assertEqual(homeRoute.layoutPath, null, 'contract should not report a layout path for flat demo home');
  });
});

Deno.test('package demo: data demo append persists and events readback; host stays up with robots', async () => {
  await withServer(repoRoot, async ({ url }) => {
    const sessionSecurity = await getSessionSecurity(url);
    assertEqual(sessionSecurity.status, 200, 'session should be available for demo RPC');
    const csrfHeaders = sessionSecurity.headers;
    const routePayload = {
      path: '/',
      query: {},
      hash: ''
    };

    const noteText = `demo-test-${Date.now()}`;
    const appendResponse = await fetch(`${url}/__brackets/rpc`, {
      method: 'POST',
      headers: {
        ...csrfHeaders,
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify({
        kind: 'data',
        module: 'demo',
        method: 'append',
        args: [{ text: noteText }],
        route: routePayload
      })
    });
    const appendJson = await appendResponse.json();
    assertEqual(appendResponse.status, 200, 'demo append RPC should return 200');
    assertEqual(appendJson.ok, true, 'demo append payload should be ok');
    assert(appendJson.result?.row?.id, 'append should return a row id');

    const eventsResponse = await fetch(`${url}/__brackets/rpc`, {
      method: 'POST',
      headers: {
        ...csrfHeaders,
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify({
        kind: 'data',
        module: 'demo',
        method: 'events',
        args: [],
        route: routePayload
      })
    });
    const eventsJson = await eventsResponse.json();
    assertEqual(eventsResponse.status, 200, 'demo events RPC should return 200');
    assertEqual(eventsJson.ok, true, 'demo events payload should be ok');
    const events = eventsJson.result?.events;
    assert(Array.isArray(events), 'events should return an array');
    assert(
      events.some((row) => String(row?.text ?? '') === noteText),
      'events list should include the appended note text'
    );

    for (let i = 0; i < 15; i += 1) {
      const r = await fetch(`${url}/__brackets/rpc`, {
        method: 'POST',
        headers: {
          ...csrfHeaders,
          'Content-Type': 'application/json',
          Accept: 'application/json'
        },
        body: JSON.stringify({
          kind: 'data',
          module: 'demo',
          method: 'append',
          args: [{ text: `stress-${i}-${Date.now()}` }],
          route: routePayload
        })
      });
      const rj = await r.json();
      assertEqual(r.status, 200, `stress append ${i} should return 200`);
      assertEqual(rj.ok, true, `stress append ${i} payload should be ok`);
      const robots = await fetch(`${url}/robots.txt`);
      assertEqual(robots.status, 200, `robots.txt should stay reachable during stress ${i}`);
      await robots.arrayBuffer();
    }
  });
});

Deno.test('GET /robots.txt is valid plain text without BOM', async () => {
  await withServer(repoRoot, async ({ url }) => {
    const res = await fetch(`${url}/robots.txt`);
    assertEqual(res.status, 200, 'robots.txt should be served');
    assertEqual(res.headers.get('content-type')?.includes('text/plain'), true, 'robots should be text/plain');
    const buf = new Uint8Array(await res.arrayBuffer());
    assert(buf.length >= 2, 'robots body should not be empty');
    const hasUtf8Bom = buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf;
    assert(!hasUtf8Bom, 'robots should not start with a UTF-8 BOM');
    const text = new TextDecoder('utf-8').decode(buf);
    assert(text.includes('User-agent:'), 'robots should include User-agent');
    assert(text.includes('Allow:'), 'robots should include Allow');
  });
});
