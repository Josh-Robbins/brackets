import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { execFile as execFileCallback } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { promisify } from 'node:util';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { parseArgs } from '../src/cli.js';
import { loadBracketsConfig } from '../src/config.js';
import { PAGE_MANIFEST_FIELDS, PAGE_MANIFEST_SCHEMA, page } from '../src/page.js';
import { BracketsApp, buildNavigationPlan, canRegisterServiceWorker, createLocationSnapshot, evaluateFrameworkExpression, normalizeRouterRedirect, parseRoute, sanitizeHtmlFragment } from '../src/runtime/runtime.js';
import { createServer } from '../src/server.js';
import { exportStaticSite, generateRoutes, validateApp } from '../src/tooling.js';
import { SYNTAX_CONTRACT, transformDatastarExpression, transformHtmlSyntax } from '../src/syntax.js';

const execFile = promisify(execFileCallback);

async function getSessionHeaders(baseUrl) {
  const response = await fetch(`${baseUrl}/__brackets/session`);
  const session = await response.json();
  const cookie = response.headers.get('set-cookie')?.split(';')[0] ?? '';
  return {
    session,
    headers: {
      'Content-Type': 'application/json',
      'X-Brackets-CSRF': session.csrfToken,
      ...(cookie ? { Cookie: cookie } : {})
    }
  };
}

async function createRemoteServer(port) {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');

    if (url.pathname === '/api/summary') {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ remoteCount: 11, remoteMessage: 'proxy-ok' }));
      return;
    }

    if (url.pathname === '/redirect-summary') {
      res.writeHead(302, { Location: '/api/summary' });
      res.end();
      return;
    }

    if (url.pathname === '/events/counts') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive'
      });
      res.write('event: datastar-patch-signals\n');
      res.write('data: {"liveCount":2}\n\n');
      res.end();
      return;
    }

    if (url.pathname === '/api/pets/42' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({
        id: '42',
        include: url.searchParams.getAll('include'),
        search: url.searchParams.get('search'),
        trace: req.headers['x-trace-id'] ?? null,
        cookie: req.headers.cookie ?? null
      }));
      return;
    }

    if (url.pathname === '/api/pets' && req.method === 'POST') {
      const chunks = [];
      req.on('data', (chunk) => chunks.push(chunk));
      req.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        const contentType = req.headers['content-type'] ?? '';
        const payload = contentType.includes('application/json')
          ? JSON.parse(raw || '{}')
          : Object.fromEntries(new URLSearchParams(raw));
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({
          contentType,
          payload
        }));
      });
      return;
    }

    if (url.pathname === '/echo' && req.method === 'POST') {
      const chunks = [];
      req.on('data', (chunk) => chunks.push(chunk));
      req.on('end', () => {
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ size: Buffer.concat(chunks).length }));
      });
      return;
    }

    res.writeHead(404);
    res.end('not-found');
  });

  await new Promise((resolve) => server.listen(port, '127.0.0.1', resolve));
  return server;
}

test('page validates required manifest fields and allowed keys', () => {
  assert.throws(() => page(null), /requires an object definition/);
  assert.throws(() => page({ html: '@pages/home.html' }), /requires a non-empty string id/);
  assert.throws(() => page({ id: 'home' }), /requires a non-empty html reference/);
  assert.throws(() => page({ id: 'home', html: '@pages/home.html', unknown: true }), /unknown field/);

  const manifest = page({
    id: 'home',
    html: '@pages/home.html',
    alias: '/start',
    aliases: ['/welcome'],
    params: { id: '^[0-9]+$' },
    redirectTo: '/dashboard',
    preload: 'idle',
    title: 'Home',
    meta: { description: 'Demo' },
    seo: { changefreq: 'daily' },
    auth: { required: true },
    assets: { themeColor: '#000000' },
    api: {},
    data: {}
  });

  assert.equal(manifest.id, 'home');
  assert.equal(manifest.html, '@pages/home.html');
  assert.deepEqual(manifest.aliases, ['/welcome']);
});

test('page manifest schema stays aligned with the public manifest fields', () => {
  assert.deepEqual(Object.keys(PAGE_MANIFEST_SCHEMA.properties), PAGE_MANIFEST_FIELDS);
  assert.deepEqual(PAGE_MANIFEST_SCHEMA.required, ['id', 'html']);
  assert.equal(PAGE_MANIFEST_SCHEMA.additionalProperties, false);
});

test('loadBracketsConfig supports sibling config in json or yaml form', async () => {
  const rootDir = await mkdtemp(path.join(tmpdir(), 'brackets-config-'));
  const appRoot = path.join(rootDir, 'app');
  const configDir = path.join(rootDir, 'config');

  await mkdir(appRoot, { recursive: true });
  await mkdir(configDir, { recursive: true });
  await writeFile(path.join(configDir, 'brackets.yaml'), [
    'server:',
    '  host: 127.0.0.1',
    '  port: 4455',
    'branding:',
    '  name: Brackets',
    '  title: Brackets is ready',
    '  tagline: YAML config works'
  ].join('\n'), 'utf8');

  try {
    const { config, filePath } = await loadBracketsConfig(appRoot);
    assert.match(filePath, /brackets\.ya?ml$/);
    assert.equal(config.server.port, 4455);
    assert.equal(config.branding.tagline, 'YAML config works');
    assert.equal(config.security.html, 'sanitize');
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test('parseRoute decodes named params', () => {
  assert.deepEqual(parseRoute('/contacts/:id', '/contacts/a%20b'), { id: 'a b' });
  assert.equal(parseRoute('/contacts/:id', '/projects/1'), null);
  assert.deepEqual(parseRoute('/docs/*slug', '/docs/guides/router/intro'), { slug: 'guides/router/intro' });
});

test('normalizeRouterRedirect accepts string and object redirect results', () => {
  assert.deepEqual(normalizeRouterRedirect('/login'), {
    path: '/login',
    replace: true
  });
  assert.deepEqual(normalizeRouterRedirect({ redirectTo: '/dashboard', replace: false }), {
    path: '/dashboard',
    replace: false
  });
  assert.equal(normalizeRouterRedirect({ title: 'No redirect' }), null);
});

test('createLocationSnapshot captures SPA path parts', () => {
  const snapshot = createLocationSnapshot('/contacts/42?tab=notes#history', 'http://127.0.0.1:4173');

  assert.equal(snapshot.pathname, '/contacts/42');
  assert.equal(snapshot.search, '?tab=notes');
  assert.equal(snapshot.hash, '#history');
  assert.equal(snapshot.path, '/contacts/42?tab=notes#history');
});

test('buildNavigationPlan preserves layout and page for the same route identity', () => {
  const plan = buildNavigationPlan(
    {
      route: {
        id: 'contacts',
        htmlUrl: '/app/pages/contacts.html',
        logicUrl: '/app/logic/contacts.logic'
      }
    },
    { url: '/app/layouts/app.html' },
    {
      id: 'contacts',
      layoutUrl: '/app/layouts/app.html',
      htmlUrl: '/app/pages/contacts.html',
      logicUrl: '/app/logic/contacts.logic'
    }
  );

  assert.deepEqual(plan, {
    preserveLayout: true,
    preservePage: true,
    layoutChanged: false,
    pageChanged: false,
    shouldMount: false,
    shouldSync: true
  });
});

test('buildNavigationPlan preserves layout but remounts a new page when route identity changes', () => {
  const plan = buildNavigationPlan(
    {
      route: {
        id: 'home',
        htmlUrl: '/app/pages/home.html',
        logicUrl: '/app/logic/home.logic'
      }
    },
    { url: '/app/layouts/app.html' },
    {
      id: 'contacts',
      layoutUrl: '/app/layouts/app.html',
      htmlUrl: '/app/pages/contacts.html',
      logicUrl: '/app/logic/contacts.logic'
    }
  );

  assert.deepEqual(plan, {
    preserveLayout: true,
    preservePage: false,
    layoutChanged: false,
    pageChanged: true,
    shouldMount: true,
    shouldSync: false
  });
});

test('buildNavigationPlan remounts layout and page when layout changes', () => {
  const plan = buildNavigationPlan(
    {
      route: {
        id: 'home',
        htmlUrl: '/app/pages/home.html',
        logicUrl: '/app/logic/home.logic'
      }
    },
    { url: '/app/layouts/app.html' },
    {
      id: 'settings',
      layoutUrl: '/app/layouts/settings.html',
      htmlUrl: '/app/pages/settings.html',
      logicUrl: '/app/logic/settings.logic'
    }
  );

  assert.deepEqual(plan, {
    preserveLayout: false,
    preservePage: false,
    layoutChanged: true,
    pageChanged: true,
    shouldMount: true,
    shouldSync: false
  });
});

test('matchRoute respects additive route param validation', () => {
  const app = new BracketsApp({
    routes: [
      {
        id: 'user',
        route: '/users/:id',
        routeKeys: ['id'],
        routePattern: '^/users/([^/]+)$',
        params: {
          id: '^[0-9]+$'
        },
        htmlUrl: '/app/user.html',
        logicUrl: null,
        layoutUrl: null
      }
    ]
  });

  assert.deepEqual(app.matchRoute('/users/42')?.params, { id: '42' });
  assert.equal(app.matchRoute('/users/abc'), null);
});

test('evaluateFrameworkExpression supports safe framework-only expressions', () => {
  const value = evaluateFrameworkExpression('event?.detail ?? count + 1', {
    count: 2,
    event: null
  });

  assert.equal(value, 3);
  assert.equal(
    evaluateFrameworkExpression('items[0].title', {
      items: [{ title: 'Hello' }]
    }),
    'Hello'
  );
  assert.deepEqual(
    evaluateFrameworkExpression('{ total: price * qty, open }', {
      price: 4,
      qty: 3,
      open: true
    }),
    { total: 12, open: true }
  );
});

test('sanitizeHtmlFragment strips obviously dangerous html sinks', () => {
  const html = sanitizeHtmlFragment('<div onclick="alert(1)"><script>alert(1)</script><a href="javascript:alert(1)">bad</a><p>safe</p></div>');
  assert.equal(html.includes('<script'), false);
  assert.equal(html.includes('onclick='), false);
  assert.equal(html.includes('javascript:'), false);
  assert.equal(html.includes('<p>safe</p>'), true);
});

test('BracketsApp html policy sanitizes by default and can allow trusted html explicitly', () => {
  const safeApp = new BracketsApp({ routes: [], security: { html: 'sanitize' } });
  const trustedApp = new BracketsApp({ routes: [], security: { html: 'trusted' } });
  const source = '<div onclick="alert(1)"><script>alert(1)</script><p>safe</p></div>';

  assert.equal(safeApp.renderHtmlContent(source).includes('<script>'), false);
  assert.equal(trustedApp.renderHtmlContent(source).includes('<script>'), true);
});

test('runtime no longer relies on broad Function-based evaluation', async () => {
  const source = await readFile(new URL('../src/runtime/runtime.js', import.meta.url), 'utf8');
  assert.equal(source.includes('Function('), false);
});

test('createFetchRequest expands GET payload and auto-cancels matching requests', () => {
  const app = new BracketsApp({ routes: [] });

  const first = app.createFetchRequest('GET', 'json', '/contacts', { page: 1, tags: ['a', 'b'] }, { key: 'contacts' });
  const second = app.createFetchRequest('GET', 'json', '/contacts', { page: 2 }, { key: 'contacts' });

  assert.equal(first.controller.signal.aborted, true);
  assert.equal(app.activeRequests.get('contacts'), second.controller);
  assert.equal(second.url.searchParams.get('page'), '2');
  assert.deepEqual(second.url.searchParams.getAll('tags'), []);
  assert.match(second.headers.get('accept'), /application\/json/);
  assert.equal(second.headers.get('x-requested-with'), 'Brackets');
});

test('performTransport uses the built request url and treats aborts as non-errors', async () => {
  const app = new BracketsApp({ routes: [] });
  app.current = {
    transportState: { loading: false, error: null },
    requestState: {},
    bindings: []
  };

  const calls = [];
  const originalFetch = global.fetch;
  let firstSignal = null;
  global.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), signal: options.signal });
    if (!firstSignal) {
      firstSignal = options.signal;
      return new Promise((resolve, reject) => {
        options.signal?.addEventListener('abort', () => {
          const error = new Error('Request aborted');
          error.name = 'AbortError';
          reject(error);
        });
      });
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json; charset=utf-8' }
    });
  };

  try {
    const firstPromise = app.get.json('/items', { page: 1 }, { key: 'items' });
    const secondResult = await app.get.json('/items', { page: 2 }, { key: 'items' });
    const firstResult = await firstPromise;

    assert.equal(firstSignal.aborted, true);
    assert.equal(firstResult, undefined);
    assert.deepEqual(secondResult, { ok: true });
    assert.equal(calls[0].url.includes('page=1'), true);
    assert.equal(calls[1].url.includes('page=2'), true);
    assert.equal(app.current.transportState.error, null);
  } finally {
    global.fetch = originalFetch;
  }
});

test('canRegisterServiceWorker only enables registration for trustworthy origins with host support', () => {
  assert.equal(canRegisterServiceWorker(
    { serviceWorker: { available: true, endpoint: '/service-worker.js' } },
    { protocol: 'http:', hostname: '127.0.0.1' },
    { serviceWorker: { register() {} } }
  ), true);

  assert.equal(canRegisterServiceWorker(
    { serviceWorker: { available: false, endpoint: '/service-worker.js' } },
    { protocol: 'http:', hostname: '127.0.0.1' },
    { serviceWorker: { register() {} } }
  ), false);

  assert.equal(canRegisterServiceWorker(
    { serviceWorker: { available: true, endpoint: '/service-worker.js' } },
    { protocol: 'http:', hostname: 'example.com' },
    { serviceWorker: { register() {} } }
  ), false);
});

test('parseArgs supports the expanded CLI command surface', () => {
  const options = parseArgs([
    'doctor',
    'demo/app',
    '--host', '127.0.0.1',
    '--port', '9001',
    '--proxy', '/remote=http://127.0.0.1:4174',
    '--json',
    '--strict'
  ]);

  assert.equal(options.command, 'doctor');
  assert.equal(options.appRoot, 'demo/app');
  assert.equal(options.host, '127.0.0.1');
  assert.equal(options.port, 9001);
  assert.equal(options.proxies['/remote'], 'http://127.0.0.1:4174');
  assert.equal(options.json, true);
  assert.equal(options.strict, true);

  const serveAlias = parseArgs(['dev', 'demo/app', '--open']);
  assert.equal(serveAlias.command, 'dev');
  assert.equal(serveAlias.open, true);

  const routeGenerator = parseArgs(['routes', 'demo/app', '--generate', '--dry-run', '--force']);
  assert.equal(routeGenerator.command, 'routes');
  assert.equal(routeGenerator.generate, true);
  assert.equal(routeGenerator.dryRun, true);
  assert.equal(routeGenerator.force, true);

  const help = parseArgs(['help']);
  assert.equal(help.command, 'help');
});

test('cli info, routes, and doctor expose useful output for humans and AI', async () => {
  const cwd = fileURLToPath(new URL('..', import.meta.url));
  const node = process.execPath;

  const info = await execFile(node, ['src/cli.js', 'info', 'demo/app', '--json'], { cwd });
  const infoPayload = JSON.parse(info.stdout);
  assert.equal(infoPayload.framework, 'Brackets');
  assert.equal(infoPayload.routes, 2);
  assert.equal(infoPayload.assets.splash, '/framework/demo/splash.html');

  const routes = await execFile(node, ['src/cli.js', 'routes', 'demo/app'], { cwd });
  assert.match(routes.stdout, /contacts/);
  assert.match(routes.stdout, /\//);

  const doctor = await execFile(node, ['src/cli.js', 'doctor', 'demo/app', '--json'], { cwd });
  const doctorPayload = JSON.parse(doctor.stdout);
  assert.equal(doctorPayload.appRoot.endsWith(path.join('Brackets', 'demo', 'app')), true);
  assert.equal(Array.isArray(doctorPayload.warnings), true);
  assert.equal(doctorPayload.host.distribution.installFree, true);
});

test('generateRoutes infers missing view manifests from html structure without forcing folders', async () => {
  const appRoot = await mkdtemp(path.join(tmpdir(), 'brackets-generate-'));

  await mkdir(path.join(appRoot, 'blog'), { recursive: true });
  await mkdir(path.join(appRoot, 'components'), { recursive: true });
  await mkdir(path.join(appRoot, 'layouts'), { recursive: true });
  await mkdir(path.join(appRoot, 'logic'), { recursive: true });
  await writeFile(path.join(appRoot, 'index.html'), '<main><h1>Home</h1></main>', 'utf8');
  await writeFile(path.join(appRoot, 'about.html'), '<main><h1>About</h1></main>', 'utf8');
  await writeFile(path.join(appRoot, 'about.logic'), '({ mount() {} })', 'utf8');
  await writeFile(path.join(appRoot, 'blog', '[id].html'), '<main><h1>Post</h1></main>', 'utf8');
  await writeFile(path.join(appRoot, 'components', 'card.html'), '<div>Card</div>', 'utf8');
  await writeFile(path.join(appRoot, 'layouts', 'app.html'), '<header :area=\"header\"></header><main :mount></main>', 'utf8');
  await writeFile(path.join(appRoot, 'existing.html'), '<main><h1>Existing</h1></main>', 'utf8');
  await writeFile(path.join(appRoot, 'existing.view'), `page({ id: 'existing', route: '/existing', html: './existing.html' })`, 'utf8');

  try {
    const report = await generateRoutes(appRoot);

    assert.equal(report.created.length, 3);
    assert.equal(report.skipped.some((item) => ['view-exists', 'already-routed'].includes(item.reason)), true);

    const indexView = await readFile(path.join(appRoot, 'index.view'), 'utf8');
    assert.match(indexView, /id: "home"/);
    assert.match(indexView, /route: "\/"/);
    assert.match(indexView, /html: "\.\/index\.html"/);

    const aboutView = await readFile(path.join(appRoot, 'about.view'), 'utf8');
    assert.match(aboutView, /route: "\/about"/);
    assert.match(aboutView, /logic: "\.\/about\.logic"/);

    const blogView = await readFile(path.join(appRoot, 'blog', '[id].view'), 'utf8');
    assert.match(blogView, /route: "\/blog\/:id"/);

    assert.equal(existsSync(path.join(appRoot, 'components', 'card.view')), false);
    assert.equal(existsSync(path.join(appRoot, 'layouts', 'app.view')), false);
  } finally {
    await rm(appRoot, { recursive: true, force: true });
  }
});

test('cli routes --generate can preview and create inferred route manifests', async () => {
  const appRoot = await mkdtemp(path.join(tmpdir(), 'brackets-cli-generate-'));
  const cwd = fileURLToPath(new URL('..', import.meta.url));
  const node = process.execPath;

  await writeFile(path.join(appRoot, 'contact.html'), '<main><h1>Contact</h1></main>', 'utf8');

  try {
    const preview = await execFile(node, ['src/cli.js', 'routes', appRoot, '--generate', '--dry-run', '--json'], { cwd });
    const previewPayload = JSON.parse(preview.stdout);
    assert.equal(previewPayload.write, false);
    assert.equal(previewPayload.created[0].route, '/contact');
    assert.equal(existsSync(path.join(appRoot, 'contact.view')), false);

    const generated = await execFile(node, ['src/cli.js', 'routes', appRoot, '--generate', '--json'], { cwd });
    const generatedPayload = JSON.parse(generated.stdout);
    assert.equal(generatedPayload.write, true);
    assert.equal(generatedPayload.resolvedRoutes[0].route, '/contact');
    assert.equal(existsSync(path.join(appRoot, 'contact.view')), true);
  } finally {
    await rm(appRoot, { recursive: true, force: true });
  }
});

test('server exposes shell, routes, syntax transforms, rpc, proxy, and security headers', async () => {
  const remote = await createRemoteServer(4374);
  const app = await createServer({
    appRoot: './demo/app',
    port: 4393,
    host: '127.0.0.1',
    proxies: {
      '/remote': 'http://127.0.0.1:4374'
    }
  });

  try {
    const sessionHeaders = await getSessionHeaders('http://127.0.0.1:4393');
    const shell = await fetch('http://127.0.0.1:4393/');
    const shellHtml = await shell.text();
    assert.equal(shell.status, 200);
    assert.match(shellHtml, /framework\/runtime\.js/);
    assert.match(shellHtml, /Brackets is ready/);
    assert.match(shellHtml, /framework\/demo\/favicon\.svg/);
    assert.equal(shell.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(shell.headers.get('x-frame-options'), 'DENY');
    assert.equal(shell.headers.get('content-security-policy')?.includes("'unsafe-eval'"), false);

    const routes = await fetch('http://127.0.0.1:4393/config/brackets.json').then((response) => response.json());
    assert.equal(routes.routes.length, 2);
    assert.deepEqual(routes.routes.map((route) => route.route), ['/contacts', '/']);
    assert.equal(routes.router.mode, 'file');
    assert.equal(routes.branding.title, 'Brackets is ready');
    assert.equal(routes.security.html, 'sanitize');
    assert.equal(routes.assets.logo, '/framework/demo/logo.svg');
    assert.equal(routes.assets.splash, '/framework/demo/splash.html');

    const logo = await fetch('http://127.0.0.1:4393/framework/demo/logo.svg').then((response) => response.text());
    assert.match(logo, /<svg/);
    const favicon = await fetch('http://127.0.0.1:4393/framework/demo/favicon.svg').then((response) => response.text());
    assert.match(favicon, /<svg/);
    const splash = await fetch('http://127.0.0.1:4393/framework/demo/splash.html').then((response) => response.text());
    assert.match(splash, /Starter modules/);
    assert.match(splash, /framework\/demo\/logo\.svg/);

    const homeHtml = await fetch('http://127.0.0.1:4393/app/pages/home.html').then((response) => response.text());
    assert.match(homeHtml, /data-signals=/);
    assert.match(homeHtml, /data-on:click=/);
    assert.match(homeHtml, /data-text=/);

    const proxySummary = await fetch('http://127.0.0.1:4393/remote/api/summary').then((response) => response.json());
    assert.equal(proxySummary.remoteCount, 11);

    const apiSummary = await fetch('http://127.0.0.1:4393/__brackets/rpc', {
      method: 'POST',
      headers: sessionHeaders.headers,
      body: JSON.stringify({
        kind: 'api',
        moduleUrl: '/app/api/remote.api',
        method: 'summary',
        args: []
      })
    }).then((response) => response.json());
    assert.equal(apiSummary.result.remoteMessage, 'proxy-ok');

    const contacts = await fetch('http://127.0.0.1:4393/__brackets/rpc', {
      method: 'POST',
      headers: sessionHeaders.headers,
      body: JSON.stringify({
        kind: 'data',
        moduleUrl: '/app/data/contacts.data',
        method: 'list',
        args: []
      })
    }).then((response) => response.json());
    assert.equal(contacts.result.length, 2);

    const blockedRpc = await fetch('http://127.0.0.1:4393/__brackets/rpc', {
      method: 'POST',
      headers: sessionHeaders.headers,
      body: JSON.stringify({
        kind: 'api',
        moduleUrl: '/app/data/contacts.data',
        method: 'list',
        args: []
      })
    });
    assert.equal(blockedRpc.status, 400);

    const sitemap = await fetch('http://127.0.0.1:4393/sitemap.xml').then((response) => response.text());
    assert.match(sitemap, /<urlset/);
    assert.match(sitemap, /http:\/\/127\.0\.0\.1:4393\/contacts/);

    const feed = await fetch('http://127.0.0.1:4393/feed.xml').then((response) => response.text());
    assert.match(feed, /<rss version="2.0">/);

    const manifest = await fetch('http://127.0.0.1:4393/manifest.webmanifest').then((response) => response.json());
    assert.equal(manifest.start_url, '/');
    assert.equal(manifest.display, 'standalone');

    const serviceWorker = await fetch('http://127.0.0.1:4393/service-worker.js').then((response) => response.text());
    assert.match(serviceWorker, /CACHE_NAME/);

    const hostContract = await fetch('http://127.0.0.1:4393/.well-known/brackets-host.json').then((response) => response.json());
    assert.equal(hostContract.framework, 'Brackets');
    assert.match(hostContract.profiles.join(','), /webview2/);
    assert.equal(hostContract.serviceWorker.available, true);
    assert.equal(hostContract.distribution.installFree, true);

    const appContract = await fetch('http://127.0.0.1:4393/.well-known/brackets-app.json').then((response) => response.json());
    assert.equal(appContract.distribution.noBuild, true);
    assert.equal(appContract.routes.length, 2);

    const debugPayload = await fetch('http://127.0.0.1:4393/__brackets/debug').then((response) => response.json());
    assert.equal(debugPayload.routes.length, 2);
    assert.equal(debugPayload.host.devtools.schema, '/__brackets/schema/page-manifest.json');

    const schema = await fetch('http://127.0.0.1:4393/__brackets/schema/page-manifest.json').then((response) => response.json());
    assert.deepEqual(schema.required, ['id', 'html']);

    const forcedDownload = await fetch('http://127.0.0.1:4393/app/pages/home.html?download=home-copy.html');
    assert.equal(forcedDownload.headers.get('content-disposition'), 'attachment; filename="home-copy.html"');
  } finally {
    await app.close();
    await new Promise((resolve) => remote.close(resolve));
  }
});

test('server supports hybrid file-based and logic-based routing together', async () => {
  const appRoot = await mkdtemp(path.join(tmpdir(), 'brackets-router-'));

  await mkdir(path.join(appRoot, 'pages'), { recursive: true });
  await mkdir(path.join(appRoot, 'routes'), { recursive: true });
  await writeFile(path.join(appRoot, 'index.view'), `page({
  id: 'home',
  html: './pages/home.html',
  title: 'Home'
})`, 'utf8');
  await writeFile(path.join(appRoot, 'pages', 'home.html'), '<main :mount>Home</main>', 'utf8');
  await writeFile(path.join(appRoot, 'pages', 'dashboard.html'), '<main :mount>Dashboard</main>', 'utf8');
  await writeFile(path.join(appRoot, 'pages', 'admin.html'), '<main :mount>Admin</main>', 'utf8');
  await writeFile(path.join(appRoot, 'router.logic'), `({
  beforeEach({ to }) {
    return to.location.pathname === '/old-dashboard'
      ? '/dashboard'
      : null;
  },
  routes: [
    {
      id: 'dashboard',
      route: '/dashboard',
      html: './pages/dashboard.html',
      title: 'Dashboard'
    }
  ]
})`, 'utf8');
  await writeFile(path.join(appRoot, 'routes', 'admin.logic'), `({
  id: 'admin',
  route: '/admin',
  html: '../pages/admin.html',
  title: 'Admin'
})`, 'utf8');

  const app = await createServer({
    appRoot,
    port: 4398,
    host: '127.0.0.1'
  });

  try {
    const payload = await fetch('http://127.0.0.1:4398/config/brackets.json').then((response) => response.json());
    assert.equal(payload.router.mode, 'hybrid');
    assert.equal(payload.router.logicUrl, '/app/router.logic');
    assert.equal(payload.router.sources.viewRoutes, 1);
    assert.equal(payload.router.sources.groupedLogicFiles, 1);
    assert.equal(payload.router.hooks.beforeEach, true);
    assert.deepEqual(payload.routes.map((route) => route.route), ['/dashboard', '/admin', '/']);
    assert.deepEqual(payload.routes.map((route) => route.source), ['router.logic', 'routes.logic', 'view']);

    const appContract = await fetch('http://127.0.0.1:4398/.well-known/brackets-app.json').then((response) => response.json());
    assert.equal(appContract.router.mode, 'hybrid');
    assert.equal(appContract.routes.length, 3);
  } finally {
    await app.close();
    await rm(appRoot, { recursive: true, force: true });
  }
});

test('server routing supports aliases, defaults, redirects, preload hints, and param validation metadata', async () => {
  const appRoot = await mkdtemp(path.join(tmpdir(), 'brackets-router-plus-'));

  await mkdir(path.join(appRoot, 'pages'), { recursive: true });
  await mkdir(path.join(appRoot, 'routes'), { recursive: true });
  await writeFile(path.join(appRoot, 'home.view'), `page({
  id: 'home',
  html: './pages/home.html',
  route: '/',
  alias: '/start'
})`, 'utf8');
  await writeFile(path.join(appRoot, 'pages', 'home.html'), '<main :mount>Home</main>', 'utf8');
  await writeFile(path.join(appRoot, 'pages', 'layout.html'), '<div><main :mount></main></div>', 'utf8');
  await writeFile(path.join(appRoot, 'pages', 'user.html'), '<main :mount>User</main>', 'utf8');
  await writeFile(path.join(appRoot, 'pages', 'legacy.html'), '<main :mount>Legacy</main>', 'utf8');
  await writeFile(path.join(appRoot, 'pages', 'admin.html'), '<main :mount>Admin</main>', 'utf8');
  await writeFile(path.join(appRoot, 'router.logic'), `({
  defaults: {
    layout: './pages/layout.html',
    meta: { lang: 'en' },
    preload: 'idle'
  },
  routes: [
    {
      id: 'user',
      route: '/users/:id',
      html: './pages/user.html',
      aliases: ['/members/:id'],
      params: { id: '^[0-9]+$' },
      preload: 'render'
    },
    {
      id: 'legacy-user',
      route: '/legacy-user',
      html: './pages/legacy.html',
      redirectTo: '/users/1'
    }
  ]
})`, 'utf8');
  await writeFile(path.join(appRoot, 'routes', 'admin.logic'), `({
  defaults: {
    auth: { required: true }
  },
  routes: [
    {
      id: 'admin',
      route: '/admin',
      html: '../pages/admin.html'
    }
  ]
})`, 'utf8');

  const app = await createServer({
    appRoot,
    port: 4399,
    host: '127.0.0.1'
  });

  try {
    const payload = await fetch('http://127.0.0.1:4399/config/brackets.json').then((response) => response.json());
    const byRoute = new Map(payload.routes.map((route) => [route.route, route]));

    assert.equal(byRoute.get('/').preload, 'idle');
    assert.equal(byRoute.get('/start').aliasOf, '/');
    assert.equal(byRoute.get('/users/:id').preload, 'render');
    assert.equal(byRoute.get('/users/:id').layoutUrl, '/app/pages/layout.html');
    assert.equal(byRoute.get('/users/:id').meta.lang, 'en');
    assert.equal(byRoute.get('/users/:id').params.id, '^[0-9]+$');
    assert.equal(byRoute.get('/members/:id').aliasOf, '/users/:id');
    assert.equal(byRoute.get('/legacy-user').redirectTo, '/users/1');
    assert.equal(byRoute.get('/admin').auth.required, true);
  } finally {
    await app.close();
    await rm(appRoot, { recursive: true, force: true });
  }
});

test('server keeps redirect and body-limit policies configurable with safe defaults', async () => {
  const remote = await createRemoteServer(4375);
  const app = await createServer({
    appRoot: './demo/app',
    port: 4394,
    host: '127.0.0.1',
    rpcBodyLimitBytes: 64,
    proxies: {
      '/manual': 'http://127.0.0.1:4375',
      '/follow': {
        target: 'http://127.0.0.1:4375',
        followRedirects: true,
        bodyLimitBytes: 48
      }
    }
  });

  try {
    const sessionHeaders = await getSessionHeaders('http://127.0.0.1:4394');
    const manualRedirect = await fetch('http://127.0.0.1:4394/manual/redirect-summary', {
      redirect: 'manual'
    });
    assert.equal(manualRedirect.status, 302);

    const followedRedirect = await fetch('http://127.0.0.1:4394/follow/redirect-summary').then((response) => response.json());
    assert.equal(followedRedirect.remoteMessage, 'proxy-ok');

    const oversizedRpc = await fetch('http://127.0.0.1:4394/__brackets/rpc', {
      method: 'POST',
      headers: sessionHeaders.headers,
      body: JSON.stringify({
        kind: 'data',
        moduleUrl: '/app/data/contacts.data',
        method: 'list',
        args: ['x'.repeat(200)]
      })
    });
    assert.equal(oversizedRpc.status, 413);

    const oversizedProxy = await fetch('http://127.0.0.1:4394/follow/echo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ payload: 'x'.repeat(200) })
    });
    assert.equal(oversizedProxy.status, 413);
  } finally {
    await app.close();
    await new Promise((resolve) => remote.close(resolve));
  }
});

test('server http.openapi helper serializes path, query, headers, cookies, and request bodies with less api boilerplate', async () => {
  const remote = await createRemoteServer(4376);
  const appRoot = await mkdtemp(path.join(tmpdir(), 'brackets-openapi-'));

  await mkdir(path.join(appRoot, 'views'), { recursive: true });
  await mkdir(path.join(appRoot, 'pages'), { recursive: true });
  await mkdir(path.join(appRoot, 'api'), { recursive: true });
  await writeFile(path.join(appRoot, 'views', 'index.view'), `page({ id: 'home', html: '@pages/home.html', route: '/' })`, 'utf8');
  await writeFile(path.join(appRoot, 'pages', 'home.html'), '<main :mount>Home</main>', 'utf8');
  await writeFile(path.join(appRoot, 'api', 'pets.api'), `({
  show({ http }) {
    return http.openapi('/remote/api').operation({
      method: 'GET',
      path: '/pets/{id}',
      pathParams: { id: 42 },
      query: {
        include: ['owner', 'visits'],
        search: 'rufus'
      },
      headers: {
        'X-Trace-Id': 'trace-42'
      },
      cookies: {
        session: 'abc123'
      }
    })
  },
  create({ http }) {
    return http.openapi('/remote/api').operation({
      method: 'POST',
      path: '/pets',
      body: {
        name: 'Rufus',
        age: 4
      },
      contentType: 'application/json'
    })
  },
  invalidRead({ http }) {
    return http.openapi('/remote/api').operation({
      method: 'GET',
      path: '/pets/{id}',
      pathParams: { id: 42 },
      body: { bad: true }
    })
  }
})`, 'utf8');

  const app = await createServer({
    appRoot,
    port: 4396,
    host: '127.0.0.1',
    proxies: {
      '/remote': 'http://127.0.0.1:4376'
    }
  });

  try {
    const sessionHeaders = await getSessionHeaders('http://127.0.0.1:4396');
    const show = await fetch('http://127.0.0.1:4396/__brackets/rpc', {
      method: 'POST',
      headers: sessionHeaders.headers,
      body: JSON.stringify({
        kind: 'api',
        moduleUrl: '/app/api/pets.api',
        method: 'show',
        args: []
      })
    }).then((response) => response.json());
    assert.deepEqual(show.result.include, ['owner', 'visits']);
    assert.equal(show.result.search, 'rufus');
    assert.equal(show.result.trace, 'trace-42');
    assert.match(show.result.cookie, /session=abc123/);

    const create = await fetch('http://127.0.0.1:4396/__brackets/rpc', {
      method: 'POST',
      headers: sessionHeaders.headers,
      body: JSON.stringify({
        kind: 'api',
        moduleUrl: '/app/api/pets.api',
        method: 'create',
        args: []
      })
    }).then((response) => response.json());
    assert.match(create.result.contentType, /application\/json/);
    assert.deepEqual(create.result.payload, { name: 'Rufus', age: 4 });

    const invalidRead = await fetch('http://127.0.0.1:4396/__brackets/rpc', {
      method: 'POST',
      headers: sessionHeaders.headers,
      body: JSON.stringify({
        kind: 'api',
        moduleUrl: '/app/api/pets.api',
        method: 'invalidRead',
        args: []
      })
    }).then((response) => response.json());
    assert.match(invalidRead.error, /GET requests should not send a request body/);
  } finally {
    await app.close();
    await new Promise((resolve) => remote.close(resolve));
    await rm(appRoot, { recursive: true, force: true });
  }
});

test('server serves binary assets without corrupting them', async () => {
  const appRoot = await mkdtemp(path.join(tmpdir(), 'brackets-binary-'));
  const binary = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  await mkdir(path.join(appRoot, 'views'), { recursive: true });
  await writeFile(path.join(appRoot, 'views', 'index.view'), `page({ id: 'home', html: '@pages/home.html', route: '/' })`, 'utf8');
  await mkdir(path.join(appRoot, 'pages'), { recursive: true });
  await writeFile(path.join(appRoot, 'pages', 'home.html'), '<main :mount>Home</main>', 'utf8');
  await writeFile(path.join(appRoot, 'image.png'), binary);

  const app = await createServer({
    appRoot,
    port: 4395,
    host: '127.0.0.1'
  });

  try {
    const response = await fetch('http://127.0.0.1:4395/app/image.png');
    const served = Buffer.from(await response.arrayBuffer());
    assert.equal(response.headers.get('content-type'), 'image/png');
    assert.deepEqual(served, binary);
  } finally {
    await app.close();
    await rm(appRoot, { recursive: true, force: true });
  }
});

test('server data adapters support json, yaml, and db storage and tooling can validate/export an app', async () => {
  const appRoot = await mkdtemp(path.join(tmpdir(), 'brackets-data-'));
  const outDir = path.join(appRoot, 'static-out');

  await mkdir(path.join(appRoot, 'views'), { recursive: true });
  await mkdir(path.join(appRoot, 'pages'), { recursive: true });
  await mkdir(path.join(appRoot, 'data'), { recursive: true });
  await mkdir(path.join(appRoot, 'storage'), { recursive: true });
  await mkdir(path.join(appRoot, 'files'), { recursive: true });
  await writeFile(path.join(appRoot, 'views', 'index.view'), `page({
  id: 'home',
  html: '@pages/home.html',
  route: '/',
  title: 'Data Demo',
  meta: { description: 'Data adapters active' },
  seo: { changefreq: 'daily', priority: 0.8 },
  data: { demo: '@data/demo.data' }
})`, 'utf8');
  await writeFile(path.join(appRoot, 'pages', 'home.html'), '<main :mount><h1>Demo</h1></main>', 'utf8');
  await writeFile(path.join(appRoot, 'service-worker.js'), 'self.addEventListener("fetch", () => {});', 'utf8');
  await writeFile(path.join(appRoot, 'files', 'report.txt'), 'export-me', 'utf8');
  await writeFile(path.join(appRoot, 'storage', 'items.json'), JSON.stringify([{ id: 1, name: 'Ada' }], null, 2), 'utf8');
  await writeFile(path.join(appRoot, 'storage', 'settings.yaml'), 'title: Demo\ncount: 2\nitems:\n  - alpha\n  - beta\n', 'utf8');
  await writeFile(path.join(appRoot, 'data', 'demo.data'), `({
  async readJson({ storage }) {
    return storage.json('@storage/items.json').read([])
  },
  async readYaml({ storage }) {
    return storage.yaml('@storage/settings.yaml').read({})
  },
  async useDb({ storage }) {
    const db = storage.db('@storage/app.db')
    await db.exec('create table if not exists notes (id integer primary key, title text)')
    await db.run('insert into notes (title) values (?)', 'First')
    return db.all('select title from notes order by id asc')
  }
})`, 'utf8');

  const app = await createServer({
    appRoot,
    port: 4397,
    host: '127.0.0.1'
  });

  try {
    const sessionHeaders = await getSessionHeaders('http://127.0.0.1:4397');
    const readJson = await fetch('http://127.0.0.1:4397/__brackets/rpc', {
      method: 'POST',
      headers: sessionHeaders.headers,
      body: JSON.stringify({
        kind: 'data',
        moduleUrl: '/app/data/demo.data',
        method: 'readJson',
        args: []
      })
    }).then((response) => response.json());
    assert.equal(readJson.result[0].name, 'Ada');

    const readYaml = await fetch('http://127.0.0.1:4397/__brackets/rpc', {
      method: 'POST',
      headers: sessionHeaders.headers,
      body: JSON.stringify({
        kind: 'data',
        moduleUrl: '/app/data/demo.data',
        method: 'readYaml',
        args: []
      })
    }).then((response) => response.json());
    assert.equal(readYaml.result.title, 'Demo');
    assert.deepEqual(readYaml.result.items, ['alpha', 'beta']);

    const useDb = await fetch('http://127.0.0.1:4397/__brackets/rpc', {
      method: 'POST',
      headers: sessionHeaders.headers,
      body: JSON.stringify({
        kind: 'data',
        moduleUrl: '/app/data/demo.data',
        method: 'useDb',
        args: []
      })
    }).then((response) => response.json());
    assert.equal(useDb.result[0].title, 'First');
  } finally {
    await app.close();
  }

  try {
    const validation = await validateApp(appRoot);
    assert.equal(validation.ok, true);
    assert.match(validation.warnings.join('\n'), /meta\.lang/);

    const exported = await exportStaticSite(appRoot, outDir);
    assert.equal(exported.routes.length, 1);
    const sitemap = await readFile(path.join(outDir, 'sitemap.xml'), 'utf8');
    assert.match(sitemap, /<urlset/);
    const manifest = await readFile(path.join(outDir, 'manifest.webmanifest'), 'utf8');
    assert.match(manifest, /start_url/);
    const serviceWorker = await readFile(path.join(outDir, 'service-worker.js'), 'utf8');
    assert.match(serviceWorker, /fetch/);
    const copiedAsset = await readFile(path.join(outDir, 'app', 'files', 'report.txt'), 'utf8');
    assert.equal(copiedAsset, 'export-me');
    const frameworkRuntime = await readFile(path.join(outDir, 'framework', 'runtime.js'), 'utf8');
    assert.match(frameworkRuntime, /BracketsApp/);
    const frameworkDatastar = await readFile(path.join(outDir, 'framework', 'datastar.js'), 'utf8');
    assert.match(frameworkDatastar, /cdn\.jsdelivr\.net/);
    const frameworkPage = await readFile(path.join(outDir, 'framework', 'page.js'), 'utf8');
    assert.match(frameworkPage, /PAGE_MANIFEST_SCHEMA/);
    const frameworkLogo = await readFile(path.join(outDir, 'framework', 'demo', 'logo.svg'), 'utf8');
    assert.match(frameworkLogo, /<svg/);
    const frameworkFavicon = await readFile(path.join(outDir, 'framework', 'demo', 'favicon.svg'), 'utf8');
    assert.match(frameworkFavicon, /<svg/);
    const frameworkSplash = await readFile(path.join(outDir, 'framework', 'demo', 'splash.html'), 'utf8');
    assert.match(frameworkSplash, /Starter modules/);
    const frameworkDocs = await readFile(path.join(outDir, 'framework', 'docs.md'), 'utf8');
    assert.match(frameworkDocs, /Brackets Docs/);
    const frameworkAgents = await readFile(path.join(outDir, 'framework', 'agents.md'), 'utf8');
    assert.match(frameworkAgents, /Brackets Agents/);
    const config = JSON.parse(await readFile(path.join(outDir, 'config', 'brackets.json'), 'utf8'));
    assert.equal(config.distribution.mode, 'portable-folder');
    assert.equal(config.distribution.noBuild, true);
    assert.equal(config.framework, 'Brackets');
    assert.match(config.branding.title, /ready/i);
    assert.equal(config.security.html, 'sanitize');
    const exportedTest = await readFile(path.join(outDir, 'tests', 'test.js'), 'utf8');
    assert.match(exportedTest, /Brackets starter is present/);
  } finally {
    await rm(appRoot, { recursive: true, force: true });
  }
});

test('transformHtmlSyntax converts shorthand syntax into framework attributes', () => {
  const source = `
    <section [panel] #hero :state="{ count: 1 }">
      <button [button] @click="refresh" :show="count > 0">Refresh</button>
      <main :mount></main>
    </section>
  `;

  const transformed = transformHtmlSyntax(source);

  assert.match(transformed, /class="panel"/);
  assert.match(transformed, /id="hero"/);
  assert.match(transformed, /data-signals="\{ count: 1 \}"/);
  assert.match(transformed, /data-on:click="window\.BracketsRuntime\.callAction\(&quot;refresh&quot;, \[\], evt, el\)"/);
  assert.equal(/data-brx-on:click/.test(transformed), false);
  assert.match(transformed, /data-show="\$count > 0"/);
  assert.match(transformed, /data-brx-mount=""/);
});

test('transformHtmlSyntax supports named action calls with arguments and form request sugar', () => {
  const source = `
    <form @submit="create('/contacts')">
      <button @click="select(contact.id)">Open</button>
    </form>
  `;

  const transformed = transformHtmlSyntax(source);

  assert.match(transformed, /data-on:submit="@post\('\/contacts', \{ contentType: 'form' \}\)"/);
  assert.match(transformed, /data-on:click="window\.BracketsRuntime\.callAction\(&quot;select&quot;, \[\$contact\.id\], evt, el\)"/);
});

test('transformHtmlSyntax supports the broader documented directive surface', () => {
  const source = `
    <article [card]
      :run="read('/events/users')"
      :watch="mutate('count', count)"
      :class.open="open"
      :set.aria-hidden="!open"
      :loading="contacts"
      :error="contacts">
    </article>
  `;

  const transformed = transformHtmlSyntax(source);

  assert.match(transformed, /data-init="@get\('\/events\/users'\)"/);
  assert.match(transformed, /data-effect="\$count = \$count"/);
  assert.match(transformed, /data-class:open="\$open"/);
  assert.match(transformed, /data-attr:aria-hidden="!\$open"/);
  assert.match(transformed, /data-brx-loading="contacts"/);
  assert.match(transformed, /data-brx-error="contacts"/);
});

test('syntax contract includes the full documented directive inventory', () => {
  assert.deepEqual(
    SYNTAX_CONTRACT.static.map((rule) => rule.name),
    [
      'state',
      'calc',
      'run',
      'watch',
      'text',
      'html',
      'show',
      'bind',
      'if',
      'each',
      'use',
      'props',
      'area',
      'fill',
      'loading',
      'error',
      'mount'
    ]
  );

  assert.deepEqual(
    SYNTAX_CONTRACT.dynamic.map((rule) => rule.prefix),
    ['class.', 'set.']
  );
});

test('transformDatastarExpression preserves framework syntax while targeting Datastar semantics', () => {
  assert.equal(transformDatastarExpression('count + total'), '$count + $total');
  assert.equal(transformDatastarExpression('mutate("count", count + 1)'), '$count = $count + 1');
  assert.equal(transformDatastarExpression('mutate("form.name", name)'), '$form.name = $name');
  assert.equal(transformDatastarExpression('mutate({ count: count + 1 })'), 'window.BracketsRuntime.mutate({ count: $count + 1 })');
  assert.equal(transformDatastarExpression('read("/events")'), '@get("/events")');
  assert.equal(transformDatastarExpression('request("/contacts")'), '@get("/contacts")');
  assert.equal(transformDatastarExpression('get("/contacts")'), '@get("/contacts")');
  assert.equal(transformDatastarExpression('create("/contacts")'), '@post("/contacts")');
  assert.equal(transformDatastarExpression('patch.state("/contacts/1")'), 'window.BracketsRuntime.patch.state("/contacts/1")');
  assert.equal(transformDatastarExpression('event?.detail ?? count'), 'evt?.detail ?? $count');
  assert.equal(transformDatastarExpression('form.name', { bindName: true }), 'form.name');
});

test('transformHtmlSyntax prefers native Datastar assignment for simple mutate calls', () => {
  const source = `
    <main :state="{ count: 0, form: { name: '' } }">
      <button @click="mutate('count', count + 1)">Add</button>
      <input @input="mutate('form.name', event.target.value)" />
      <section :watch="mutate('count', count + 1)"></section>
    </main>
  `;

  const transformed = transformHtmlSyntax(source);

  assert.match(transformed, /data-on:click="\$count = \$count \+ 1"/);
  assert.match(transformed, /data-on:input="\$form\.name = evt\.target\.value"/);
  assert.match(transformed, /data-effect="\$count = \$count \+ 1"/);
  assert.equal(/window\\.BracketsRuntime\\.mutate\('count'/.test(transformed), false);
});

test('reference still documents the broader framework vocabulary', async () => {
  const reference = await readFile(new URL('../docs/reference.md', import.meta.url), 'utf8');

  for (const term of [
    '`page()`',
    '`print()`',
    '`ctx`',
    '`mount(ctx)`',
    '`sync(ctx)`',
    '`run(payload, ctx)`',
    '`ctx.cleanup(fn)`',
    '`mutate()`',
    '`read()`',
    '`request()`',
    '`get()`',
    '`create()`',
    '`update()`',
    '`patch()`',
    '`delete()`',
    '`.html`',
    '`.sse`',
    '`.state`',
    '`.json`',
    '`self`',
    '`parent`',
    '`children`',
    '`root`',
    '`props`',
    '`event`'
  ]) {
    assert.match(reference, new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});

test('reference keeps transport intent separate from result handling', async () => {
  const reference = await readFile(new URL('../docs/reference.md', import.meta.url), 'utf8');

  for (const line of [
    '- `read()` uses an SSE/live channel by default',
    '- `request()` uses HTTP by default',
    '- `get()` uses HTTP by default',
    '- `create()` uses HTTP by default',
    '- `update()` uses HTTP by default',
    '- `patch()` uses HTTP by default',
    '- `delete()` uses HTTP by default',
    '- `mutate()` is local state mutation, not transport',
    '- `.html`, `.sse`, `.state`, and `.json` describe how the result should be handled'
  ]) {
    assert.match(reference, new RegExp(line.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});

test('docs explain why Brackets does not need a plugin api', async () => {
  const [docs, guide, agents, reference] = await Promise.all([
    readFile(new URL('../docs.md', import.meta.url), 'utf8'),
    readFile(new URL('../docs/guide.md', import.meta.url), 'utf8'),
    readFile(new URL('../docs/agents.md', import.meta.url), 'utf8'),
    readFile(new URL('../docs/reference.md', import.meta.url), 'utf8')
  ]);

  assert.match(docs, /Brackets does not need a framework-owned plugin API/i);
  assert.match(docs, /drop the code into `app\/`/i);
  assert.match(guide, /Brackets does not require a plugin API/i);
  assert.match(guide, /standard browser ESM imports/i);
  assert.match(agents, /Do not assume Brackets needs a plugin API/i);
  assert.match(reference, /Brackets also does not need a framework-owned plugin API/i);
});

test('reference documents html trust policy and Datastar-first helper compilation', async () => {
  const reference = await readFile(new URL('../docs/reference.md', import.meta.url), 'utf8');

  for (const line of [
    '| `security.html: sanitize` | sanitize `:html` output before insertion |',
    '| `security.html: trusted` | allow raw `:html` output for intentionally trusted content |',
    '- simple `mutate("path", value)` expressions should compile toward native Datastar signal assignment when possible',
    '- simple `read("/events")` expressions in transformed markup should compile toward Datastar-native request behavior when possible'
  ]) {
    assert.match(reference, new RegExp(line.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});

test('reference keeps the canonical framework summary intact', async () => {
  const reference = await readFile(new URL('../docs/reference.md', import.meta.url), 'utf8');

  for (const row of [
    '| `.view` | what page exists |',
    '| `.logic` | how the app behaves |',
    '| `.api` | how the app talks to a backend |',
    '| `.data` | how the app talks to local storage/data files |',
    '| `.html` | actual markup/templates/pages/layouts/components |',
    '| `.json` | simple structured storage |',
    '| `.yaml` | human-editable config/content storage |',
    '| `.db` | file-backed database storage |',
    '| `router.logic` | router engine and global router hooks |',
    '| `view.route` | optional route declaration in a `.view` file |',
    '| `/routes/*.logic` | grouped route registration for larger apps |',
    '| `id` | yes | stable page identity |',
    '| `html` | yes | page HTML reference |',
    '| `logic` | no | primary behavior module or inline logic |',
    '| `route` | no | route pattern or path |',
    '| `alias` | no | single alternate route path |',
    '| `aliases` | no | multiple alternate route paths |',
    '| `params` | no | route param validation rules |',
    '| `redirectTo` | no | redirect target for matched route |',
    '| `preload` | no | route preload hint such as `render` or `idle` |',
    '| `title` | no | document/page title |',
    '| `layout` | no | layout HTML reference |',
    '| `api` | no | named remote dependencies |',
    '| `data` | no | named local-data dependencies |',
    '| `route` | route params, query, path, and hash |',
    '| `state` | local state reads and writes |',
    '| `action` | current event, element, and input payload |',
    '| `api` | backend transport modules |',
    '| `data` | local persistence modules |',
    '| `nav` | navigation helpers |',
    '| `cleanup()` | lifecycle teardown registration |',
    '| `mount()` | automatic setup when an instance becomes live |',
    '| `sync()` | automatic update when the same instance is preserved |',
    '| `run()` | explicit advanced task entry point |',
    '| named action | ordinary UI action |',
    '| returned cleanup / `ctx.cleanup()` | teardown for work started by `mount()` |',
    '| Class shorthand | `[name]` | `<div [card]>` |',
    '| ID shorthand | `#name` | `<main #content>` |',
    '| Event | `@event="..."` | `<button @click="save">` |',
    '| Local state | `:state="..."` | `<section :state="{ open: false }">` |',
    '| Calculated values | `:calc="..."` | `<div :calc="{ total: price * qty }">` |',
    '| Text binding | `:text="..."` | `<span :text="count">` |',
    '| HTML binding | `:html="..."` | `<div :html="content">` |',
    '| Show/hide | `:show="..."` | `<div :show="open">` |',
    '| Two-way bind | `:bind="..."` | `<input :bind="form.name">` |',
    '| Conditional | `:if="..."` | `<section :if="loggedIn">` |',
    '| Loop | `:each="..."` | `<template :each="item in items">` |',
    '| Load component/template | `:use="..."` | `<div :use="\'card\'">` |',
    '| Props | `:props="..."` | `<div :use="\'card\'" :props="{ title: \'Hi\' }">` |',
    '| Layout area | `:area="..."` | `<header :area="\'header\'">` |',
    '| Fill area | `:fill="..."` | `<template :fill="\'header\'">` |',
    '| Mount target | `:mount` | `<main :mount>` |',
    '| Reactive class | `:class.name="..."` | `<div :class.open="open">` |',
    '| Reactive attribute | `:set.name="..."` | `<a :set.href="url">` |',
    '| `read()` | live SSE read |',
    '| `request()` | advanced one-off read-only request |',
    '| `get()` | one-off read |',
    '| `create()` | create record |',
    '| `update()` | full update |',
    '| `patch()` | partial update |',
    '| `delete()` | delete record |',
    '| `mutate()` | local state mutation |',
    '| mock/demo data | `.json` |',
    '| editable config/content | `.yaml` |',
    '| durable local database | `.db` |',
    '| framework local-data adapter | `.data` |'
  ]) {
    assert.match(reference, new RegExp(row.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});

test('reference keeps the final framework recommendations intact', async () => {
  const reference = await readFile(new URL('../docs/reference.md', import.meta.url), 'utf8');

  for (const line of [
    '1. Keep `.view`, `.logic`, `.api`, `.data`, and `.html` as the public framework file model.',
    '2. Keep `.view` as the page-layer contract, not raw markup.',
    '3. Keep markup in `.html`.',
    '4. Keep routing in `.logic`, not `.api`.',
    '5. Keep `.api` strictly about remote/backend transport.',
    '6. Keep `.data` strictly about local persistence/storage access.',
    '7. Ship the tiny local server early because it unlocks the rest of the design cleanly.',
    '8. Use import maps for framework modules.',
    '9. Keep JS flat and normal.',
    '10. Keep Datastar as the engine, not the public authoring surface.',
    '11. Use `page()` for declarative page manifests.',
    '12. Use `print()` for render/output helpers.',
    '13. Support plain-object authoring and optional helper-based authoring.',
    '14. Remove `export default` as required ceremony from framework-identity files.',
    '15. Allow inline logic for simple pages and external `.logic` files for larger pages.',
    '16. Use `mount()` and `sync()` as lifecycle hooks.',
    '17. Keep `run()` as an imperative advanced task hook, not a second setup hook.',
    '18. Prefer direct named actions for ordinary UI behavior.',
    '19. Preserve layouts across same-layout route changes.',
    '20. Keep `ctx` as the canonical runtime object name.',
    '21. Solve `ctx.` fatigue with grouped destructuring, not hidden magic locals.',
    '22. Keep the v1 `ctx` shape small, grouped, and teachable.',
    '23. Keep v1 small, coherent, and teachable.'
  ]) {
    assert.match(reference, new RegExp(line.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});
