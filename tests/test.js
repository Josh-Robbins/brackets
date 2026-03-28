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
import {
  BRACKETS_CONFIG_SCHEMA,
  validateBracketsConfig,
  validateLogicModuleContract,
  validateRouterModuleContract,
  validateRpcModuleContract
} from '../src/contracts.js';
import { closeStorageAdapters, createStorageHelpers, parseYaml } from '../src/data-adapters.js';
import { PAGE_MANIFEST_FIELDS, PAGE_MANIFEST_SCHEMA, page } from '../src/page.js';
import { BracketsApp, buildNavigationPlan, buildRouteHref, canRegisterServiceWorker, createLocationSnapshot, evaluateFrameworkExpression, extendNavigationRedirectChain, formDataToObject, normalizeRouterRedirect, parseRoute, resolveNotFoundResult, sanitizeHtmlFragment } from '../src/runtime/runtime.js';
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

    if (url.pathname === '/inspect-proxy') {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({
        forwardedHost: req.headers['x-forwarded-host'] ?? null,
        forwardedProto: req.headers['x-forwarded-proto'] ?? null,
        forwardedPrefix: req.headers['x-forwarded-prefix'] ?? null,
        forwardedFor: req.headers['x-forwarded-for'] ?? null,
        proxyHeader: req.headers['x-brackets-proxy'] ?? null,
        origin: req.headers.origin ?? null,
        referer: req.headers.referer ?? null,
        secFetchSite: req.headers['sec-fetch-site'] ?? null
      }));
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

test('page reports structured contract issues for nested type errors', () => {
  assert.throws(
    () => page({
      id: 'home',
      html: '@pages/home.html',
      params: { id: 42 },
      api: { remote: true }
    }),
    (error) => {
      assert.equal(error.code, 'BRACKETS_PAGE_INVALID');
      assert.equal(Array.isArray(error.issues), true);
      assert.match(error.hint, /page manifest/i);
      assert.equal(error.issues.some((issue) => issue.path.endsWith('.params.id')), true);
      assert.equal(error.issues.some((issue) => issue.path.endsWith('.api.remote')), true);
      return true;
    }
  );
});

test('page manifest schema stays aligned with the public manifest fields', () => {
  assert.deepEqual(Object.keys(PAGE_MANIFEST_SCHEMA.properties), PAGE_MANIFEST_FIELDS);
  assert.deepEqual(PAGE_MANIFEST_SCHEMA.required, ['id', 'html']);
  assert.equal(PAGE_MANIFEST_SCHEMA.additionalProperties, false);
});

test('config schema and validation keep no-build config type-safe', () => {
  assert.equal(BRACKETS_CONFIG_SCHEMA.properties.server.properties.port.minimum, 1);
  assert.equal(BRACKETS_CONFIG_SCHEMA.properties.security.properties.storage.properties.pbkdf2Iterations.minimum, 1);

  assert.throws(
    () => validateBracketsConfig({
      server: { port: '4173' },
      splash: { enabled: 'yes' },
      security: {
        html: 'unsafe',
        storage: {
          keyEnv: 42,
          pbkdf2Iterations: 0
        }
      }
    }, 'Brackets test config'),
    (error) => {
      assert.equal(error.code, 'BRACKETS_CONFIG_INVALID');
      assert.equal(Array.isArray(error.issues), true);
      assert.equal(error.issues.some((issue) => issue.path.endsWith('.server.port')), true);
      assert.equal(error.issues.some((issue) => issue.path.endsWith('.splash.enabled')), true);
      assert.equal(error.issues.some((issue) => issue.path.endsWith('.security.html')), true);
      assert.equal(error.issues.some((issue) => issue.path.endsWith('.security.storage.keyEnv')), true);
      assert.equal(error.issues.some((issue) => issue.path.endsWith('.security.storage.pbkdf2Iterations')), true);
      return true;
    }
  );
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
    assert.equal(config.security.storage.keyEnv, 'BRACKETS_DATA_KEY');
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test('loadBracketsConfig fails with structured issues for invalid config types', async () => {
  const rootDir = await mkdtemp(path.join(tmpdir(), 'brackets-config-invalid-'));
  const appRoot = path.join(rootDir, 'app');
  const configDir = path.join(rootDir, 'config');

  await mkdir(appRoot, { recursive: true });
  await mkdir(configDir, { recursive: true });
  await writeFile(path.join(configDir, 'brackets.json'), JSON.stringify({
    server: { port: 'bad' },
    splash: { chips: [1, 2] }
  }, null, 2), 'utf8');

  try {
    await assert.rejects(
      loadBracketsConfig(appRoot),
      (error) => {
        assert.equal(error.code, 'BRACKETS_CONFIG_INVALID');
        assert.equal(error.issues.some((issue) => issue.path.includes('.server.port')), true);
        assert.equal(error.issues.some((issue) => issue.path.includes('.splash.chips[0]')), true);
        return true;
      }
    );
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test('logic, router, api, and data contracts stay type-safe without a build step', () => {
  assert.throws(
    () => validateLogicModuleContract({ mount: true }, 'logic module demo.logic'),
    (error) => {
      assert.equal(error.code, 'BRACKETS_LOGIC_INVALID');
      assert.equal(error.issues.some((issue) => issue.path.endsWith('.mount')), true);
      return true;
    }
  );

  assert.throws(
    () => validateRouterModuleContract({ beforeEach: true, routes: {} }, 'router logic router.logic'),
    (error) => {
      assert.equal(error.code, 'BRACKETS_ROUTER_INVALID');
      assert.equal(error.issues.some((issue) => issue.path.endsWith('.beforeEach')), true);
      assert.equal(error.issues.some((issue) => issue.path.endsWith('.routes')), true);
      return true;
    }
  );

  assert.throws(
    () => validateRpcModuleContract({ list: 'bad' }, {
      context: 'api module contacts.api',
      code: 'BRACKETS_API_INVALID',
      kind: 'api'
    }),
    (error) => {
      assert.equal(error.code, 'BRACKETS_API_INVALID');
      assert.equal(error.issues.some((issue) => issue.path.endsWith('.list')), true);
      return true;
    }
  );

  assert.throws(
    () => validateRpcModuleContract({ load: 123 }, {
      context: 'data module contacts.data',
      code: 'BRACKETS_DATA_INVALID',
      kind: 'data'
    }),
    (error) => {
      assert.equal(error.code, 'BRACKETS_DATA_INVALID');
      assert.equal(error.issues.some((issue) => issue.path.endsWith('.load')), true);
      return true;
    }
  );
});

test('parseRoute decodes named params', () => {
  assert.deepEqual(parseRoute('/contacts/:id', '/contacts/a%20b'), { id: 'a b' });
  assert.equal(parseRoute('/contacts/:id', '/projects/1'), null);
  assert.deepEqual(parseRoute('/docs/*slug', '/docs/guides/router/intro'), { slug: 'guides/router/intro' });
});

test('buildRouteHref lets navigation target routes by id with params, query, and hash', () => {
  const routes = [
    { id: 'home', route: '/' },
    { id: 'contact', route: '/contacts/:id' }
  ];

  assert.equal(buildRouteHref(routes, '/pricing'), '/pricing');
  assert.equal(buildRouteHref(routes, {
    id: 'contact',
    params: { id: 'ada lovelace' },
    query: { tab: 'notes', tag: ['vip', 'founder'] },
    hash: 'activity'
  }), '/contacts/ada%20lovelace?tab=notes&tag=vip&tag=founder#activity');
});

test('buildRouteHref reports missing route ids and params clearly', () => {
  const routes = [
    { id: 'contact', route: '/contacts/:id' }
  ];

  assert.throws(
    () => buildRouteHref(routes, { id: 'missing' }),
    (error) => {
      assert.equal(error.code, 'BRACKETS_ROUTE_UNKNOWN');
      return true;
    }
  );

  assert.throws(
    () => buildRouteHref(routes, { id: 'contact' }),
    (error) => {
      assert.equal(error.code, 'BRACKETS_ROUTE_PARAM_MISSING');
      assert.equal(error.param, 'id');
      return true;
    }
  );
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

test('resolveNotFoundResult delays history updates until not-found redirects are resolved', () => {
  assert.deepEqual(resolveNotFoundResult('/login'), {
    kind: 'redirect',
    redirect: {
      path: '/login',
      replace: true
    },
    updateHistory: false
  });

  assert.deepEqual(resolveNotFoundResult({
    html: '<main>Missing</main>',
    title: 'Missing'
  }), {
    kind: 'html',
    result: {
      html: '<main>Missing</main>',
      title: 'Missing'
    },
    updateHistory: true
  });

  assert.deepEqual(resolveNotFoundResult(null), {
    kind: 'default',
    result: null,
    updateHistory: true
  });

  assert.deepEqual(resolveNotFoundResult({ redirectTo: '/missing' }, '/missing'), {
    kind: 'default',
    result: { redirectTo: '/missing' },
    updateHistory: true
  });
});

test('formDataToObject preserves repeated field values for clean form orchestration', () => {
  const formData = new FormData();
  formData.append('name', 'Ada');
  formData.append('tag', 'admin');
  formData.append('tag', 'owner');
  formData.append('tag', 'builder');

  assert.deepEqual(formDataToObject(formData), {
    name: 'Ada',
    tag: ['admin', 'owner', 'builder']
  });
});

test('extendNavigationRedirectChain detects redirect loops and runaway redirect depth', () => {
  assert.deepEqual(
    extendNavigationRedirectChain(['/login'], '/dashboard'),
    ['/login', '/dashboard']
  );

  assert.throws(
    () => extendNavigationRedirectChain(['/login', '/dashboard'], '/login'),
    (error) => {
      assert.equal(error.code, 'BRACKETS_NAVIGATION_REDIRECT_LOOP');
      assert.equal(error.path, '/login');
      assert.deepEqual(error.chain, ['/login', '/dashboard', '/login']);
      return true;
    }
  );

  assert.throws(
    () => extendNavigationRedirectChain(
      ['/one', '/two', '/three'],
      '/four',
      'http://127.0.0.1',
      3
    ),
    (error) => {
      assert.equal(error.code, 'BRACKETS_NAVIGATION_REDIRECT_LIMIT');
      assert.equal(error.path, '/four');
      assert.deepEqual(error.chain, ['/one', '/two', '/three', '/four']);
      return true;
    }
  );
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

test('route context and nav helpers can build route-aware hrefs without raw string paths', () => {
  const app = new BracketsApp({
    routes: [
      { id: 'home', route: '/' },
      { id: 'contact', route: '/contacts/:id' }
    ]
  });

  app.lastRouteSnapshot = {
    route: { id: 'contact', route: '/contacts/:id' },
    params: { id: '42' },
    location: createLocationSnapshot('/contacts/42?tab=notes', 'http://127.0.0.1')
  };

  const routeContext = app.buildRouteContext(
    { id: 'contact', route: '/contacts/:id' },
    { id: '42' },
    createLocationSnapshot('/contacts/42?tab=notes', 'http://127.0.0.1')
  );

  assert.equal(routeContext.href(), '/contacts/42');
  assert.equal(routeContext.href({ query: { tab: 'files' }, hash: 'activity' }), '/contacts/42?tab=files#activity');
  assert.equal(routeContext.isActive(), true);
  assert.equal(app.nav.href({ id: 'contact', params: { id: '99' } }), '/contacts/99');
});

test('router hook context exposes route-aware helpers and alias metadata', () => {
  const app = new BracketsApp({
    routes: [
      { id: 'home', route: '/', aliases: ['/start'] },
      { id: 'contact', route: '/contacts/:id' }
    ]
  });

  app.lastRouteSnapshot = {
    route: app.routes[0],
    params: {},
    location: createLocationSnapshot('/start', 'http://127.0.0.1')
  };

  const matched = {
    route: app.routes[1],
    params: { id: '42' }
  };
  const hook = app.buildRouterHookContext(
    createLocationSnapshot('/contacts/42?tab=notes', 'http://127.0.0.1'),
    matched
  );

  assert.equal(hook.from.href(), '/');
  assert.equal(hook.to.href(), '/contacts/42');
  assert.equal(hook.to.query('tab'), 'notes');
  assert.deepEqual(hook.routes.find((route) => route.id === 'home')?.aliases, ['/start']);
  assert.equal(hook.routes.find((route) => route.id === 'contact')?.href({ params: { id: '77' } }), '/contacts/77');
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

test('storage db transactions await async callbacks and roll back failed work', async () => {
  const rootDir = await mkdtemp(path.join(tmpdir(), 'brackets-tx-'));
  const storage = createStorageHelpers((specifier) => path.join(rootDir, specifier));
  const db = storage.db('storage/app.db');

  try {
    await db.exec('create table if not exists notes (id integer primary key, title text)');

    const committed = await db.transaction(async (tx) => {
      tx.run('insert into notes (title) values (?)', 'First');
      await new Promise((resolve) => setTimeout(resolve, 10));
      tx.run('insert into notes (title) values (?)', 'Second');
      return tx.all('select title from notes order by id asc');
    });
    assert.deepEqual(committed.map((row) => row.title), ['First', 'Second']);

    await assert.rejects(async () => db.transaction(async (tx) => {
        tx.run('insert into notes (title) values (?)', 'Rolled back');
        await new Promise((resolve) => setTimeout(resolve, 10));
        throw new Error('stop');
      }),
      /stop/
    );

    const rows = await db.all('select title from notes order by id asc');
    assert.deepEqual(rows.map((row) => row.title), ['First', 'Second']);
  } finally {
    closeStorageAdapters();
    await rm(rootDir, { recursive: true, force: true });
  }
});

test('storage db transactions stay serialized under overlap', async () => {
  const rootDir = await mkdtemp(path.join(tmpdir(), 'brackets-tx-overlap-'));
  const storage = createStorageHelpers((specifier) => path.join(rootDir, specifier));
  const db = storage.db('storage/app.db');

  try {
    await db.exec('create table if not exists notes (id integer primary key, title text)');

    await Promise.all([
      db.transaction(async (tx) => {
        tx.run('insert into notes (title) values (?)', 'First');
        await new Promise((resolve) => setTimeout(resolve, 20));
        tx.run('insert into notes (title) values (?)', 'Second');
      }),
      db.transaction(async (tx) => {
        tx.run('insert into notes (title) values (?)', 'Third');
      })
    ]);

    const rows = await db.all('select title from notes order by id asc');
    assert.equal(rows.length, 3);
    assert.deepEqual(
      [...rows.map((row) => row.title)].sort(),
      ['First', 'Second', 'Third']
    );
  } finally {
    closeStorageAdapters();
    await rm(rootDir, { recursive: true, force: true });
  }
});

test('storage [e]json and [e]yaml encrypt local persistence with a host-managed key', async () => {
  const rootDir = await mkdtemp(path.join(tmpdir(), 'brackets-secure-storage-'));
  const originalKey = process.env.BRACKETS_DATA_KEY;
  process.env.BRACKETS_DATA_KEY = 'correct horse battery staple';
  const storage = createStorageHelpers((specifier) => path.join(rootDir, specifier), {
    security: {
      storage: {
        keyEnv: 'BRACKETS_DATA_KEY',
        pbkdf2Iterations: 1000
      }
    }
  });

  try {
    const profile = storage['[e]json']('storage/profile.secure.json');
    const settings = storage['[e]yaml']('storage/settings.secure.yaml');
    const profileAlias = storage.ejson('storage/profile.secure.json');
    const settingsAlias = storage.eyaml('storage/settings.secure.yaml');
    const profileCompat = storage.secureJson('storage/profile.secure.json');
    const settingsCompat = storage.secureYaml('storage/settings.secure.yaml');

    await profile.write({ name: 'Ada', roles: ['admin'] });
    await settings.write({ theme: 'dark', count: 2 });

    const profileSource = await readFile(path.join(rootDir, 'storage', 'profile.secure.json'), 'utf8');
    const settingsSource = await readFile(path.join(rootDir, 'storage', 'settings.secure.yaml'), 'utf8');

    assert.equal(profileSource.includes('Ada'), false);
    assert.equal(settingsSource.includes('dark'), false);
    assert.deepEqual(await profile.read({}), { name: 'Ada', roles: ['admin'] });
    assert.deepEqual(await settings.read({}), { theme: 'dark', count: 2 });
    assert.deepEqual(await profileAlias.read({}), { name: 'Ada', roles: ['admin'] });
    assert.deepEqual(await settingsAlias.read({}), { theme: 'dark', count: 2 });
    assert.deepEqual(await profileCompat.read({}), { name: 'Ada', roles: ['admin'] });
    assert.deepEqual(await settingsCompat.read({}), { theme: 'dark', count: 2 });

    delete process.env.BRACKETS_DATA_KEY;
    await assert.rejects(() => profile.read({}), /Missing encrypted storage key/);
  } finally {
    if (originalKey === undefined) {
      delete process.env.BRACKETS_DATA_KEY;
    } else {
      process.env.BRACKETS_DATA_KEY = originalKey;
    }
    closeStorageAdapters();
    await rm(rootDir, { recursive: true, force: true });
  }
});

test('storage json and yaml writes stay serialized and readable under overlap', async () => {
  const rootDir = await mkdtemp(path.join(tmpdir(), 'brackets-storage-overlap-'));
  const storage = createStorageHelpers((specifier) => path.join(rootDir, specifier));
  const jsonStore = storage.json('storage/contacts.json');
  const yamlStore = storage.yaml('storage/settings.yaml');

  try {
    await Promise.all([
      jsonStore.write([{ id: 1, name: 'Ada' }]),
      jsonStore.write([{ id: 2, name: 'Grace' }]),
      yamlStore.write({ theme: 'light', count: 1 }),
      yamlStore.write({ theme: 'dark', count: 2 })
    ]);

    const jsonRaw = await readFile(path.join(rootDir, 'storage', 'contacts.json'), 'utf8');
    const yamlRaw = await readFile(path.join(rootDir, 'storage', 'settings.yaml'), 'utf8');

    assert.doesNotThrow(() => JSON.parse(jsonRaw));
    assert.doesNotThrow(() => parseYaml(yamlRaw));
    assert.deepEqual(await jsonStore.read([]), [{ id: 2, name: 'Grace' }]);
    assert.deepEqual(await yamlStore.read({}), { theme: 'dark', count: 2 });
  } finally {
    closeStorageAdapters();
    await rm(rootDir, { recursive: true, force: true });
  }
});

test('encrypted storage can recover from a wrong passphrase on a later read', async () => {
  const rootDir = await mkdtemp(path.join(tmpdir(), 'brackets-secure-retry-'));
  const storage = createStorageHelpers((specifier) => path.join(rootDir, specifier), {
    security: {
      storage: {
        keyEnv: 'BRACKETS_DATA_KEY'
      }
    }
  });
  const originalKey = process.env.BRACKETS_DATA_KEY;
  process.env.BRACKETS_DATA_KEY = 'correct-key';
  const profile = storage['[e]json']('storage/profile.secure.json');

  try {
    await profile.write({ name: 'Ada' });

    process.env.BRACKETS_DATA_KEY = 'wrong-key';
    await assert.rejects(() => profile.read({}), /authenticate data|unsupported state|decrypt/i);

    process.env.BRACKETS_DATA_KEY = 'correct-key';
    assert.deepEqual(await profile.read({}), { name: 'Ada' });
  } finally {
    if (originalKey === undefined) {
      delete process.env.BRACKETS_DATA_KEY;
    } else {
      process.env.BRACKETS_DATA_KEY = originalKey;
    }
    closeStorageAdapters();
    await rm(rootDir, { recursive: true, force: true });
  }
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

test('createEventStreamUrl preserves existing query params and appends SSE payload values', () => {
  const app = new BracketsApp({ routes: [] });
  const url = app.createEventStreamUrl('/events/counts?existing=1', {
    tag: ['alpha', 'beta'],
    page: 2,
    empty: null
  });

  assert.equal(url.searchParams.get('existing'), '1');
  assert.deepEqual(url.searchParams.getAll('tag'), ['alpha', 'beta']);
  assert.equal(url.searchParams.get('page'), '2');
  assert.equal(url.searchParams.has('empty'), false);
});

test('createEventStreamUrl preserves repeated keys from URLSearchParams payloads', () => {
  const app = new BracketsApp({ routes: [] });
  const payload = new URLSearchParams();
  payload.append('tag', 'alpha');
  payload.append('tag', 'beta');
  payload.append('page', '2');

  const url = app.createEventStreamUrl('/events/counts', payload);

  assert.deepEqual(url.searchParams.getAll('tag'), ['alpha', 'beta']);
  assert.equal(url.searchParams.get('page'), '2');
});

test('createFetchRequest preserves repeated GET query values from FormData payloads', () => {
  const app = new BracketsApp({ routes: [] });
  const originalFormData = global.FormData;

  class FakeFormData {
    constructor() {
      this.items = [];
    }

    append(key, value) {
      this.items.push([key, value]);
    }

    *entries() {
      yield* this.items;
    }
  }

  global.FormData = FakeFormData;

  try {
    const payload = new FakeFormData();
    payload.append('tag', 'alpha');
    payload.append('tag', 'beta');
    payload.append('page', '2');

    const request = app.createFetchRequest('GET', 'json', '/search', payload, {});

    assert.deepEqual(request.url.searchParams.getAll('tag'), ['alpha', 'beta']);
    assert.equal(request.url.searchParams.get('page'), '2');
  } finally {
    global.FormData = originalFormData;
  }
});

test('resolveFormPayload preserves repeated values when payload arrays extend a form', () => {
  const app = new BracketsApp({ routes: [] });
  const originalDocument = global.document;
  const originalFormData = global.FormData;
  const originalElement = global.Element;

  class FakeFormData {
    constructor(form) {
      this.values = new Map();
      for (const [key, value] of form?._entries ?? []) {
        this.append(key, value);
      }
    }

    append(key, value) {
      const bucket = this.values.get(key) ?? [];
      bucket.push(value);
      this.values.set(key, bucket);
    }

    set(key, value) {
      this.values.set(key, [value]);
    }

    delete(key) {
      this.values.delete(key);
    }

    get(key) {
      return (this.values.get(key) ?? [])[0] ?? null;
    }

    getAll(key) {
      return [...(this.values.get(key) ?? [])];
    }
  }

  global.document = {
    querySelector(selector) {
      if (selector === '#demo-form') {
        return {
          _entries: [
            ['name', 'Ada'],
            ['role', 'reader']
          ]
        };
      }
      return null;
    }
  };
  global.Element = class FakeElement {};
  global.FormData = FakeFormData;

  try {
    const payload = app.resolveFormPayload({
      selector: '#demo-form',
      payload: {
        role: ['admin', 'editor'],
        name: 'Grace'
      }
    });

    assert.equal(payload.get('name'), 'Grace');
    assert.deepEqual(payload.getAll('role'), ['admin', 'editor']);
  } finally {
    global.document = originalDocument;
    global.FormData = originalFormData;
    global.Element = originalElement;
  }
});

test('resolveFormPayload returns provided FormData directly when no DOM form lookup is needed', () => {
  const app = new BracketsApp({ routes: [] });
  const originalFormData = global.FormData;
  const originalDocument = global.document;

  class FakeFormData {}

  global.FormData = FakeFormData;
  global.document = undefined;

  try {
    const payload = new FakeFormData();
    assert.equal(app.resolveFormPayload({ payload }), payload);
  } finally {
    global.FormData = originalFormData;
    global.document = originalDocument;
  }
});

test('createFetchRequest preserves plain-text and octet-stream payloads without JSON wrapping', () => {
  const app = new BracketsApp({ routes: [] });
  const bytes = new Uint8Array([1, 2, 3, 4]);

  const textRequest = app.createFetchRequest('POST', 'json', '/notes', 'hello', {
    contentType: 'text/plain'
  });
  const binaryRequest = app.createFetchRequest('POST', 'json', '/upload', bytes, {
    contentType: 'application/octet-stream'
  });

  assert.equal(textRequest.headers.get('content-type'), 'text/plain; charset=utf-8');
  assert.equal(textRequest.body, 'hello');
  assert.equal(binaryRequest.headers.get('content-type'), 'application/octet-stream');
  assert.equal(binaryRequest.body, bytes);
});

test('createFetchRequest preserves provided FormData payloads for form requests without DOM lookup', () => {
  const app = new BracketsApp({ routes: [] });
  const originalFormData = global.FormData;
  const originalDocument = global.document;

  class FakeFormData {}

  global.FormData = FakeFormData;
  global.document = undefined;

  try {
    const payload = new FakeFormData();
    const request = app.createFetchRequest('POST', 'html', '/submit', payload, {
      contentType: 'form'
    });

    assert.equal(request.body, payload);
    assert.equal(request.headers.has('content-type'), false);
  } finally {
    global.FormData = originalFormData;
    global.document = originalDocument;
  }
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

test('performTransport keeps request loading active while a superseded keyed request aborts', async () => {
  const app = new BracketsApp({ routes: [] });
  app.current = {
    transportState: { loading: false, error: null },
    requestState: {},
    bindings: []
  };

  const originalFetch = global.fetch;
  let calls = 0;
  let resolveSecondResponse;

  global.fetch = async (_url, options = {}) => {
    calls += 1;

    if (calls === 1) {
      return new Promise((resolve, reject) => {
        options.signal?.addEventListener('abort', () => {
          const error = new Error('Request aborted');
          error.name = 'AbortError';
          reject(error);
        });
      });
    }

    return new Promise((resolve) => {
      resolveSecondResponse = () => resolve(new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json; charset=utf-8' }
      }));
    });
  };

  try {
    const firstPromise = app.get.json('/items', { page: 1 }, { key: 'items' });
    const secondPromise = app.get.json('/items', { page: 2 }, { key: 'items' });
    const firstResult = await firstPromise;

    assert.equal(firstResult, undefined);
    assert.equal(app.current.requestState.items.loading, true);
    assert.equal(app.current.requestState.items.pending, 1);
    assert.equal(app.current.requestState.items.error, null);

    resolveSecondResponse();
    const secondResult = await secondPromise;

    assert.deepEqual(secondResult, { ok: true });
    assert.equal(app.current.requestState.items.loading, false);
    assert.equal(app.current.requestState.items.pending, 0);
    assert.equal(app.current.requestState.items.error, null);
  } finally {
    global.fetch = originalFetch;
  }
});

test('performTransport keeps transport state aligned with the latest overlapping request', async () => {
  const app = new BracketsApp({ routes: [] });
  app.current = {
    transportState: { loading: false, error: null },
    requestState: {},
    bindings: []
  };

  const originalFetch = global.fetch;
  let calls = 0;
  let rejectFirstResponse;
  let resolveSecondResponse;

  global.fetch = async (_url, _options = {}) => {
    calls += 1;

    if (calls === 1) {
      return new Promise((_resolve, reject) => {
        rejectFirstResponse = () => reject(new Error('older request failed'));
      });
    }

    return new Promise((resolve) => {
      resolveSecondResponse = () => resolve(new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json; charset=utf-8' }
      }));
    });
  };

  try {
    const firstPromise = app.get.json('/items', { page: 1 }, { key: 'first' }).catch((error) => error);
    const secondPromise = app.get.json('/items', { page: 2 }, { key: 'second' });

    rejectFirstResponse();
    const firstResult = await firstPromise;

    assert.match(firstResult.message, /older request failed/i);
    assert.equal(app.current.transportState.loading, true);
    assert.equal(app.current.transportState.error, null);

    resolveSecondResponse();
    const secondResult = await secondPromise;

    assert.deepEqual(secondResult, { ok: true });
    assert.equal(app.current.transportState.loading, false);
    assert.equal(app.current.transportState.error, null);
  } finally {
    global.fetch = originalFetch;
  }
});

test('performTransport reports a clear framework error when SSE is unavailable', async () => {
  const app = new BracketsApp({ routes: [] });
  app.current = {
    transportState: { loading: false, error: null, pending: 0, latestRequestId: 0 },
    requestState: {},
    bindings: []
  };

  const originalEventSource = global.EventSource;
  global.EventSource = undefined;

  try {
    await assert.rejects(
      () => app.read('/events/counts', null, { key: 'live' }),
      (error) => {
        assert.equal(error.code, 'BRACKETS_SSE_UNAVAILABLE');
        assert.match(error.message, /EventSource is not available/i);
        return true;
      }
    );

    assert.equal(app.current.transportState.loading, false);
    assert.equal(app.current.requestState.live.loading, false);
    assert.equal(app.current.requestState.live.pending, 0);
    assert.equal(app.current.requestState.live.error.code, 'BRACKETS_SSE_UNAVAILABLE');
  } finally {
    global.EventSource = originalEventSource;
  }
});

test('performTransport keeps SSE loading active until the stream opens', async () => {
  const app = new BracketsApp({ routes: [] });
  app.current = {
    transportState: { loading: false, error: null, pending: 0, latestRequestId: 0 },
    requestState: {},
    bindings: []
  };

  const originalEventSource = global.EventSource;
  let source = null;

  class FakeEventSource {
    constructor(url) {
      this.url = String(url);
      this.listeners = new Map();
      source = this;
    }

    addEventListener(type, listener) {
      const bucket = this.listeners.get(type) ?? [];
      bucket.push(listener);
      this.listeners.set(type, bucket);
    }

    emit(type, event = {}) {
      for (const listener of this.listeners.get(type) ?? []) {
        listener(event);
      }
    }
  }

  global.EventSource = FakeEventSource;

  try {
    const promise = app.read('/events/counts', null, { key: 'live' });
    const stream = await promise;

    assert.equal(stream, source);
    assert.equal(app.current.transportState.loading, true);
    assert.equal(app.current.requestState.live.loading, true);
    assert.match(source.url, /\/events\/counts/);

    source.emit('open');

    assert.equal(app.current.transportState.loading, false);
    assert.equal(app.current.requestState.live.loading, false);
    assert.equal(app.current.requestState.live.pending, 0);
    assert.equal(app.current.requestState.live.error, null);
  } finally {
    global.EventSource = originalEventSource;
  }
});

test('performTransport reports clear framework errors when SSE fails before opening', async () => {
  const app = new BracketsApp({ routes: [] });
  app.current = {
    transportState: { loading: false, error: null, pending: 0, latestRequestId: 0 },
    requestState: {},
    bindings: []
  };

  const originalEventSource = global.EventSource;
  let source = null;

  class FakeEventSource {
    constructor(url) {
      this.url = String(url);
      this.listeners = new Map();
      source = this;
    }

    addEventListener(type, listener) {
      const bucket = this.listeners.get(type) ?? [];
      bucket.push(listener);
      this.listeners.set(type, bucket);
    }

    emit(type, event = {}) {
      for (const listener of this.listeners.get(type) ?? []) {
        listener(event);
      }
    }
  }

  global.EventSource = FakeEventSource;

  try {
    const stream = await app.read('/events/counts', null, { key: 'live' });
    assert.equal(stream, source);
    source.emit('error', { type: 'error' });

    assert.equal(app.current.transportState.loading, false);
    assert.equal(app.current.transportState.error.code, 'BRACKETS_SSE_ERROR');
    assert.match(app.current.transportState.error.message, /SSE stream failed/i);
    assert.equal(app.current.requestState.live.loading, false);
    assert.equal(app.current.requestState.live.pending, 0);
    assert.equal(app.current.requestState.live.error.code, 'BRACKETS_SSE_ERROR');
    assert.match(app.current.requestState.live.error.hint, /SSE endpoint/i);
  } finally {
    global.EventSource = originalEventSource;
  }
});

test('cacheFetch deduplicates concurrent initial loads for the same key', async () => {
  const app = new BracketsApp({ routes: [] });
  let calls = 0;

  const loader = async () => {
    calls += 1;
    await new Promise((resolve) => setTimeout(resolve, 10));
    return { ok: true };
  };

  const [first, second] = await Promise.all([
    app.cacheFetch('contacts', loader),
    app.cacheFetch('contacts', loader)
  ]);

  assert.equal(calls, 1);
  assert.deepEqual(first, { ok: true });
  assert.deepEqual(second, { ok: true });
});

test('cacheFetch keeps stale data usable after a failed refresh and allows retry', async () => {
  const app = new BracketsApp({ routes: [] });
  app.resourceCache.set('contacts', {
    value: { ok: 'stale' },
    updatedAt: Date.now() - 50,
    promise: null
  });

  const stale = await app.cacheFetch('contacts', async () => {
    await new Promise((resolve) => setTimeout(resolve, 10));
    throw new Error('refresh failed');
  }, {
    ttlMs: 0,
    staleMs: 1000
  });

  assert.deepEqual(stale, { ok: 'stale' });

  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(app.resourceCache.get('contacts').promise, null);
  assert.deepEqual(app.resourceCache.get('contacts').value, { ok: 'stale' });

  const fresh = await app.cacheFetch('contacts', async () => ({ ok: 'fresh' }), {
    force: true
  });

  assert.deepEqual(fresh, { ok: 'fresh' });
  assert.deepEqual(app.resourceCache.get('contacts').value, { ok: 'fresh' });
});

test('invalidateCache clears one key or the whole cache without touching unrelated entries first', () => {
  const app = new BracketsApp({ routes: [] });
  app.resourceCache.set('contacts', { value: ['Ada'], updatedAt: 1, promise: null });
  app.resourceCache.set('projects', { value: ['Brackets'], updatedAt: 1, promise: null });

  app.invalidateCache('contacts');
  assert.equal(app.resourceCache.has('contacts'), false);
  assert.equal(app.resourceCache.has('projects'), true);

  app.invalidateCache();
  assert.equal(app.resourceCache.size, 0);
});

test('invalidateCache prevents an older in-flight cache load from repopulating a cleared key', async () => {
  const app = new BracketsApp({ routes: [] });
  let resolveLoader;

  const promise = app.cacheFetch('contacts', () => new Promise((resolve) => {
    resolveLoader = resolve;
  }));

  await Promise.resolve();
  app.invalidateCache('contacts');
  resolveLoader({ ok: 'late' });

  const result = await promise;
  assert.deepEqual(result, { ok: 'late' });
  assert.equal(app.resourceCache.has('contacts'), false);
});

test('invalidateCache with no key prevents older in-flight cache loads from repopulating cleared cache', async () => {
  const app = new BracketsApp({ routes: [] });
  let resolveLoader;

  const promise = app.cacheFetch('contacts', () => new Promise((resolve) => {
    resolveLoader = resolve;
  }));

  await Promise.resolve();
  app.invalidateCache();
  resolveLoader({ ok: 'late' });

  const result = await promise;
  assert.deepEqual(result, { ok: 'late' });
  assert.equal(app.resourceCache.size, 0);
});

test('warmRoute clears failed warm attempts so a later retry can succeed', async () => {
  const app = new BracketsApp({ routes: [] });
  const route = {
    id: 'home',
    route: '/',
    htmlUrl: '/pages/home.html',
    layoutUrl: '/layouts/app.html',
    logicUrl: '/logic/home.js'
  };

  let htmlCalls = 0;
  let logicCalls = 0;
  app.fetchTextCached = async (url) => {
    htmlCalls += 1;
    if (url === '/pages/home.html' && htmlCalls === 1) {
      throw new Error('warm failed');
    }
    return `<div data-url="${url}"></div>`;
  };
  app.importModuleCached = async (url) => {
    logicCalls += 1;
    return { url };
  };

  await assert.rejects(() => app.warmRoute(route), /warm failed/);
  assert.equal(app.routeAssetCache.has('home'), false);

  const warmed = await app.warmRoute(route);
  assert.equal(Array.isArray(warmed), true);
  assert.equal(htmlCalls >= 3, true);
  assert.equal(logicCalls, 2);
  assert.equal(app.routeAssetCache.has('home'), true);
});

test('warmRoute deduplicates concurrent route warm requests', async () => {
  const app = new BracketsApp({ routes: [] });
  const route = {
    id: 'home',
    route: '/',
    htmlUrl: '/pages/home.html',
    layoutUrl: '/layouts/app.html',
    logicUrl: '/logic/home.js'
  };

  let htmlCalls = 0;
  let logicCalls = 0;
  app.fetchTextCached = async (url) => {
    htmlCalls += 1;
    await new Promise((resolve) => setTimeout(resolve, 10));
    return `<div data-url="${url}"></div>`;
  };
  app.importModuleCached = async (url) => {
    logicCalls += 1;
    await new Promise((resolve) => setTimeout(resolve, 10));
    return { url };
  };

  const [first, second] = await Promise.all([
    app.warmRoute(route),
    app.warmRoute(route)
  ]);

  assert.equal(first, second);
  assert.equal(htmlCalls, 2);
  assert.equal(logicCalls, 1);
});

test('scheduleConfiguredPrefetch warms render routes immediately and idle routes later', async () => {
  const app = new BracketsApp({
    routes: [
      { id: 'home', route: '/', preload: 'idle' },
      { id: 'about', route: '/about', preload: 'render' },
      { id: 'pricing', route: '/pricing', preload: 'idle' }
    ]
  });
  app.initialPath = '/';

  const originalWindow = global.window;
  let idleCallback = null;
  const warmed = [];
  global.window = {
    location: {
      origin: 'http://example.com',
      href: 'http://example.com/'
    },
    requestIdleCallback(callback) {
      idleCallback = callback;
    },
    setTimeout
  };
  app.warmRoute = async (route) => {
    warmed.push(route.route);
  };

  try {
    app.scheduleConfiguredPrefetch();

    assert.deepEqual(warmed, ['/about']);
    assert.equal(typeof idleCallback, 'function');

    idleCallback();
    assert.deepEqual(warmed, ['/about', '/pricing']);
  } finally {
    global.window = originalWindow;
  }
});

test('scheduleConfiguredPrefetch uses the active route, not only the initial path', async () => {
  const app = new BracketsApp({
    routes: [
      { id: 'home', route: '/', preload: 'render' },
      { id: 'pricing', route: '/pricing', preload: 'render' },
      { id: 'about', route: '/about', preload: 'idle' }
    ]
  });
  app.initialPath = '/';
  app.lastRouteSnapshot = {
    route: { id: 'pricing', route: '/pricing' },
    params: {},
    location: { pathname: '/pricing', path: '/pricing', search: '', hash: '' }
  };

  const originalWindow = global.window;
  const warmed = [];
  global.window = {
    location: {
      pathname: '/pricing',
      origin: 'http://example.com',
      href: 'http://example.com/pricing'
    },
    requestIdleCallback() {},
    setTimeout
  };
  app.warmRoute = async (route) => {
    warmed.push(route.route);
  };

  try {
    app.scheduleConfiguredPrefetch();
    assert.deepEqual(warmed, ['/']);
  } finally {
    global.window = originalWindow;
  }
});

test('scheduleConfiguredPrefetch skips the active page even when the current route is an alias', async () => {
  const app = new BracketsApp({
    routes: [
      { id: 'home', route: '/', preload: 'render' },
      { id: 'home', route: '/start', aliasOf: '/', preload: 'render' },
      { id: 'pricing', route: '/pricing', preload: 'render' }
    ]
  });
  app.initialPath = '/';
  app.lastRouteSnapshot = {
    route: { id: 'home', route: '/start', aliasOf: '/' },
    params: {},
    location: { pathname: '/start', path: '/start', search: '', hash: '' }
  };

  const originalWindow = global.window;
  const warmed = [];
  global.window = {
    location: {
      pathname: '/start',
      origin: 'http://example.com',
      href: 'http://example.com/start'
    },
    requestIdleCallback() {},
    setTimeout
  };
  app.warmRoute = async (route) => {
    warmed.push(route.route);
  };

  try {
    app.scheduleConfiguredPrefetch();
    assert.deepEqual(warmed, ['/pricing']);
  } finally {
    global.window = originalWindow;
  }
});

test('prefetchPath skips warming the active page even when the hovered path is an alias', async () => {
  const app = new BracketsApp({
    routes: [
      { id: 'home', route: '/', preload: 'render' },
      { id: 'home', route: '/start', aliasOf: '/' },
      { id: 'pricing', route: '/pricing', preload: 'render' }
    ]
  });
  app.lastRouteSnapshot = {
    route: { id: 'home', route: '/start', aliasOf: '/' },
    params: {},
    location: { pathname: '/start', path: '/start', search: '', hash: '' }
  };

  const originalWindow = global.window;
  const warmed = [];
  global.window = {
    location: {
      pathname: '/start',
      origin: 'http://example.com',
      href: 'http://example.com/start'
    }
  };
  app.matchRoute = (pathname) => {
    if (pathname === '/start') {
      return { route: { id: 'home', route: '/start', aliasOf: '/' }, params: {} };
    }
    if (pathname === '/pricing') {
      return { route: { id: 'pricing', route: '/pricing' }, params: {} };
    }
    return null;
  };
  app.warmRoute = async (route) => {
    warmed.push(route.route);
  };

  try {
    app.prefetchPath('/start');
    app.prefetchPath('/pricing');
    assert.deepEqual(warmed, ['/pricing']);
  } finally {
    global.window = originalWindow;
  }
});

test('getSession deduplicates overlapping session reads', async () => {
  const app = new BracketsApp({ routes: [], session: null });
  const originalFetch = global.fetch;
  let calls = 0;

  global.fetch = async () => {
    calls += 1;
    await new Promise((resolve) => setTimeout(resolve, 10));
    return new Response(JSON.stringify({
      authenticated: true,
      user: { id: 1, name: 'Ada' }
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json; charset=utf-8' }
    });
  };

  try {
    const [first, second] = await Promise.all([
      app.getSession(true),
      app.getSession(true)
    ]);

    assert.equal(calls, 1);
    assert.equal(first.authenticated, true);
    assert.equal(second.user.name, 'Ada');
  } finally {
    global.fetch = originalFetch;
  }
});

test('resolveRouteSession refreshes protected-route auth when the cached session is unauthenticated', async () => {
  const app = new BracketsApp({
    routes: [],
    session: { authenticated: false, user: null }
  });
  const originalFetch = global.fetch;
  let calls = 0;

  global.fetch = async () => {
    calls += 1;
    return new Response(JSON.stringify({
      authenticated: true,
      user: { id: 1, name: 'Ada' }
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json; charset=utf-8' }
    });
  };

  try {
    const session = await app.resolveRouteSession({
      auth: { required: true }
    });
    assert.equal(calls, 1);
    assert.equal(session.user.name, 'Ada');
    assert.equal(app.sessionState.user.name, 'Ada');
  } finally {
    global.fetch = originalFetch;
  }
});

test('resolveRouteSession reuses the current authenticated session for protected routes', async () => {
  const app = new BracketsApp({
    routes: [],
    session: { authenticated: true, user: { id: 1, name: 'Grace' } }
  });
  const originalFetch = global.fetch;
  let calls = 0;

  global.fetch = async () => {
    calls += 1;
    throw new Error('fetch should not run');
  };

  try {
    const session = await app.resolveRouteSession({
      auth: { required: true }
    });
    assert.equal(calls, 0);
    assert.equal(session.user.name, 'Grace');
  } finally {
    global.fetch = originalFetch;
  }
});

test('resolveRouteSession returns null only after a protected-route refresh confirms the user is unauthenticated', async () => {
  const app = new BracketsApp({
    routes: [],
    session: { authenticated: false, user: null }
  });
  const originalFetch = global.fetch;
  let calls = 0;

  global.fetch = async () => {
    calls += 1;
    return new Response(JSON.stringify({
      authenticated: false,
      user: null
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json; charset=utf-8' }
    });
  };

  try {
    const session = await app.resolveRouteSession({
      auth: { required: true, redirectTo: '/login' }
    });
    assert.equal(calls, 1);
    assert.equal(session, null);
    assert.equal(app.sessionState.authenticated, false);
  } finally {
    global.fetch = originalFetch;
  }
});

test('getSession keeps previous session on failed refresh and allows a later retry', async () => {
  const app = new BracketsApp({
    routes: [],
    session: { authenticated: true, user: { id: 1, name: 'Ada' } }
  });
  const originalFetch = global.fetch;
  let calls = 0;

  global.fetch = async () => {
    calls += 1;
    if (calls === 1) {
      return new Response(JSON.stringify({ error: 'temporary failure' }), {
        status: 503,
        headers: { 'Content-Type': 'application/json; charset=utf-8' }
      });
    }

    return new Response(JSON.stringify({
      authenticated: true,
      user: { id: 1, name: 'Grace' }
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json; charset=utf-8' }
    });
  };

  try {
    await assert.rejects(() => app.getSession(true), /temporary failure/i);
    assert.equal(app.sessionState.user.name, 'Ada');
    assert.equal(app.sessionPromise, null);

    const session = await app.getSession(true);
    assert.equal(session.user.name, 'Grace');
    assert.equal(app.sessionState.user.name, 'Grace');
  } finally {
    global.fetch = originalFetch;
  }
});

test('getSession deduplicates overlapping failed refreshes and allows retry', async () => {
  const app = new BracketsApp({
    routes: [],
    session: { authenticated: true, user: { id: 1, name: 'Ada' } }
  });
  const originalFetch = global.fetch;
  let calls = 0;

  global.fetch = async () => {
    calls += 1;
    if (calls === 1) {
      await new Promise((resolve) => setTimeout(resolve, 10));
      return new Response(JSON.stringify({ error: 'temporary failure' }), {
        status: 503,
        headers: { 'Content-Type': 'application/json; charset=utf-8' }
      });
    }

    return new Response(JSON.stringify({
      authenticated: true,
      user: { id: 1, name: 'Grace' }
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json; charset=utf-8' }
    });
  };

  try {
    const [firstError, secondError] = await Promise.all([
      app.getSession(true).catch((error) => error),
      app.getSession(true).catch((error) => error)
    ]);

    assert.equal(calls, 1);
    assert.match(firstError.message, /temporary failure/i);
    assert.equal(secondError, firstError);
    assert.equal(app.sessionState.user.name, 'Ada');
    assert.equal(app.sessionPromise, null);

    const session = await app.getSession(true);
    assert.equal(calls, 2);
    assert.equal(session.user.name, 'Grace');
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

  const check = parseArgs(['check', 'demo/app', '--json']);
  assert.equal(check.command, 'check');
  assert.equal(check.json, true);
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

test('cli check reports no-build type diagnostics with file and line information', async () => {
  const appRoot = await mkdtemp(path.join(tmpdir(), 'brackets-check-'));
  const cwd = fileURLToPath(new URL('..', import.meta.url));
  const node = process.execPath;

  await mkdir(path.join(appRoot, 'config'), { recursive: true });
  await mkdir(path.join(appRoot, 'routes'), { recursive: true });
  await writeFile(path.join(appRoot, 'home.view'), `page({
  id: 'home',
  html: './home.html',
  params: { id: 42 }
})`, 'utf8');
  await writeFile(path.join(appRoot, 'home.html'), '<main><h1>Home</h1></main>', 'utf8');
  await writeFile(path.join(appRoot, 'home.logic'), `({
  async mount() {
    return null
  },
  sync: true
})`, 'utf8');
  await writeFile(path.join(appRoot, 'remote.api'), `({
  summary: 'bad'
})`, 'utf8');
  await writeFile(path.join(appRoot, 'prefs.data'), `({
  load: 123
})`, 'utf8');
  await writeFile(path.join(appRoot, 'router.logic'), `({
  beforeEach: true
})`, 'utf8');
  await writeFile(path.join(appRoot, 'routes', 'admin.logic'), `({
  routes: {}
})`, 'utf8');
  await writeFile(path.join(appRoot, 'config', 'brackets.json'), JSON.stringify({
    server: { port: 'bad' }
  }, null, 2), 'utf8');

  try {
    let stdout = '';
    let failed = false;
    try {
      const result = await execFile(node, ['src/cli.js', 'check', appRoot, '--json'], { cwd });
      stdout = result.stdout;
    } catch (error) {
      failed = true;
      stdout = error.stdout;
    }

    assert.equal(failed, true);
    const payload = JSON.parse(stdout);
      assert.equal(payload.ok, false);
      assert.equal(payload.diagnostics.length >= 6, true);
      assert.equal(payload.diagnostics.some((item) => item.file.endsWith(path.join('config', 'brackets.json'))), true);
      assert.equal(payload.diagnostics.some((item) => item.file.endsWith('home.view')), true);
      assert.equal(payload.diagnostics.some((item) => item.file.endsWith('home.logic') && item.code === 'BRACKETS_LOGIC_INVALID'), true);
      assert.equal(payload.diagnostics.some((item) => item.file.endsWith('remote.api') && item.code === 'BRACKETS_API_INVALID'), true);
      assert.equal(payload.diagnostics.some((item) => item.file.endsWith('prefs.data') && item.code === 'BRACKETS_DATA_INVALID'), true);
      assert.equal(payload.diagnostics.some((item) => item.file.endsWith('router.logic') && item.code === 'BRACKETS_ROUTER_INVALID'), true);
      assert.equal(payload.diagnostics.some((item) => item.file.endsWith(path.join('routes', 'admin.logic')) && item.code === 'BRACKETS_ROUTER_INVALID'), true);
      assert.equal(payload.diagnostics.every((item) => Number.isInteger(item.line) && item.line >= 1), true);
      const viewDiagnostic = payload.diagnostics.find((item) => item.file.endsWith('home.view'));
      const logicDiagnostic = payload.diagnostics.find((item) => item.file.endsWith('home.logic'));
      const apiDiagnostic = payload.diagnostics.find((item) => item.file.endsWith('remote.api'));
      const dataDiagnostic = payload.diagnostics.find((item) => item.file.endsWith('prefs.data'));
      const routerDiagnostic = payload.diagnostics.find((item) => item.file.endsWith('router.logic'));
      assert.equal(viewDiagnostic.line, 4);
      assert.equal(logicDiagnostic.line, 5);
      assert.equal(apiDiagnostic.line, 2);
      assert.equal(dataDiagnostic.line, 2);
      assert.equal(routerDiagnostic.line, 2);
    } finally {
      await rm(appRoot, { recursive: true, force: true });
    }
  });

test('cli check reports architecture drift when layers blur', async () => {
  const appRoot = await mkdtemp(path.join(tmpdir(), 'brackets-architecture-check-'));
  const cwd = fileURLToPath(new URL('..', import.meta.url));
  const node = process.execPath;

  await writeFile(path.join(appRoot, 'home.view'), `page({
  id: 'home',
  html: './home.html'
})`, 'utf8');
  await writeFile(path.join(appRoot, 'home.html'), '<main><h1>Home</h1></main>', 'utf8');
  await writeFile(path.join(appRoot, 'home.logic'), `({
  async mount({ storage, http }) {
    await storage.json('./bad.json').read([])
    await fetch('/remote/api/contacts')
    return http.client('/remote/api').get('/contacts')
  }
})`, 'utf8');
  await writeFile(path.join(appRoot, 'remote.api'), `({
  sync({ storage }) {
    return storage.json('./bad.json').read([])
  }
})`, 'utf8');
  await writeFile(path.join(appRoot, 'prefs.data'), `({
  load({ http }) {
    return http.client('/remote/api').get('/prefs')
  }
})`, 'utf8');

  try {
    let stdout = '';
    let failed = false;
    try {
      const result = await execFile(node, ['src/cli.js', 'check', appRoot, '--json'], { cwd });
      stdout = result.stdout;
    } catch (error) {
      failed = true;
      stdout = error.stdout;
    }

    assert.equal(failed, true);
    const payload = JSON.parse(stdout);
    const architectureDiagnostics = payload.diagnostics.filter((item) => item.code === 'BRACKETS_ARCHITECTURE_INVALID');
    assert.equal(architectureDiagnostics.length >= 3, true);
    assert.equal(architectureDiagnostics.some((item) => item.file.endsWith('home.logic') && /local persistence/.test(item.message)), true);
    assert.equal(architectureDiagnostics.some((item) => item.file.endsWith('home.logic') && /remote\/backend transport/.test(item.message)), true);
    assert.equal(architectureDiagnostics.some((item) => item.file.endsWith('remote.api') && /remote\/backend-facing/.test(item.message)), true);
    assert.equal(architectureDiagnostics.some((item) => item.file.endsWith('prefs.data') && /local-first/.test(item.message)), true);
  } finally {
    await rm(appRoot, { recursive: true, force: true });
  }
});

test('cli check reports duplicate route ids and route-path collisions', async () => {
  const appRoot = await mkdtemp(path.join(tmpdir(), 'brackets-route-conflicts-'));
  const cwd = fileURLToPath(new URL('..', import.meta.url));
  const node = process.execPath;

  await mkdir(path.join(appRoot, 'routes'), { recursive: true });
  await writeFile(path.join(appRoot, 'home.view'), `page({
  id: 'shared',
  route: '/',
  html: './home.html'
})`, 'utf8');
  await writeFile(path.join(appRoot, 'home.html'), '<main><h1>Home</h1></main>', 'utf8');
  await writeFile(path.join(appRoot, 'about.view'), `page({
  id: 'shared',
  route: '/about',
  alias: '/team',
  html: './about.html'
})`, 'utf8');
  await writeFile(path.join(appRoot, 'about.html'), '<main><h1>About</h1></main>', 'utf8');
  await writeFile(path.join(appRoot, 'routes', 'team.logic'), `({
  routes: [
    {
      id: 'team-page',
      route: '/team',
      html: '../team.html'
    }
  ]
})`, 'utf8');
  await writeFile(path.join(appRoot, 'team.html'), '<main><h1>Team</h1></main>', 'utf8');

  try {
    let stdout = '';
    let failed = false;
    try {
      const result = await execFile(node, ['src/cli.js', 'check', appRoot, '--json'], { cwd });
      stdout = result.stdout;
    } catch (error) {
      failed = true;
      stdout = error.stdout;
    }

    assert.equal(failed, true);
    const payload = JSON.parse(stdout);
    assert.equal(payload.ok, false);
    assert.equal(payload.diagnostics.some((entry) => entry.code === 'BRACKETS_ROUTE_ID_CONFLICT'), true);
    assert.equal(payload.diagnostics.some((entry) => entry.code === 'BRACKETS_ROUTE_CONFLICT'), true);
    assert.equal(payload.diagnostics.some((entry) => /shared/.test(entry.message)), true);
    assert.equal(payload.diagnostics.some((entry) => /\/team/.test(entry.message)), true);
  } finally {
    await rm(appRoot, { recursive: true, force: true });
  }
});

test('cli check reports self-redirecting route definitions before runtime', async () => {
  const appRoot = await mkdtemp(path.join(tmpdir(), 'brackets-route-redirect-loop-'));
  const cwd = fileURLToPath(new URL('..', import.meta.url));
  const node = process.execPath;

  await writeFile(path.join(appRoot, 'home.view'), `page({
  id: 'home',
  route: '/',
  redirectTo: '/',
  html: './home.html'
})`, 'utf8');
  await writeFile(path.join(appRoot, 'home.html'), '<main><h1>Home</h1></main>', 'utf8');
  await writeFile(path.join(appRoot, 'alias.view'), `page({
  id: 'alias',
  route: '/welcome',
  alias: '/start',
  redirectTo: '/start',
  html: './alias.html'
})`, 'utf8');
  await writeFile(path.join(appRoot, 'alias.html'), '<main><h1>Alias</h1></main>', 'utf8');

  try {
    let stdout = '';
    let failed = false;
    try {
      const result = await execFile(node, ['src/cli.js', 'check', appRoot, '--json'], { cwd });
      stdout = result.stdout;
    } catch (error) {
      failed = true;
      stdout = error.stdout;
    }

    assert.equal(failed, true);
    const payload = JSON.parse(stdout);
    const loops = payload.diagnostics.filter((entry) => entry.code === 'BRACKETS_ROUTE_REDIRECT_LOOP');
    assert.equal(loops.length >= 2, true);
    assert.equal(loops.every((entry) => Number.isInteger(entry.line) && entry.line >= 1), true);
    assert.equal(loops.some((entry) => entry.file.endsWith('home.view') && /redirects back/.test(entry.message)), true);
    assert.equal(
      loops.some((entry) => entry.file.endsWith('alias.view') && /\/start/.test(entry.message)),
      true
    );
  } finally {
    await rm(appRoot, { recursive: true, force: true });
  }
});

test('cli check reports multi-route redirect cycles before runtime', async () => {
  const appRoot = await mkdtemp(path.join(tmpdir(), 'brackets-route-redirect-cycle-'));
  const cwd = fileURLToPath(new URL('..', import.meta.url));
  const node = process.execPath;

  await writeFile(path.join(appRoot, 'a.view'), `page({
  id: 'a',
  route: '/a',
  redirectTo: '/b',
  html: './a.html'
})`, 'utf8');
  await writeFile(path.join(appRoot, 'a.html'), '<main><h1>A</h1></main>', 'utf8');
  await writeFile(path.join(appRoot, 'b.view'), `page({
  id: 'b',
  route: '/b',
  redirectTo: '/a',
  html: './b.html'
})`, 'utf8');
  await writeFile(path.join(appRoot, 'b.html'), '<main><h1>B</h1></main>', 'utf8');

  try {
    let stdout = '';
    let failed = false;
    try {
      const result = await execFile(node, ['src/cli.js', 'check', appRoot, '--json'], { cwd });
      stdout = result.stdout;
    } catch (error) {
      failed = true;
      stdout = error.stdout;
    }

    assert.equal(failed, true);
    const payload = JSON.parse(stdout);
    const loops = payload.diagnostics.filter((entry) => entry.code === 'BRACKETS_ROUTE_REDIRECT_LOOP');
    assert.equal(loops.length, 2);
    assert.equal(loops.some((entry) => entry.file.endsWith('a.view') && /participates in a redirect loop/.test(entry.message)), true);
    assert.equal(loops.some((entry) => entry.file.endsWith('b.view') && /participates in a redirect loop/.test(entry.message)), true);
  } finally {
    await rm(appRoot, { recursive: true, force: true });
  }
});

test('cli check reports missing route references early', async () => {
  const appRoot = await mkdtemp(path.join(tmpdir(), 'brackets-missing-refs-'));
  const cwd = fileURLToPath(new URL('..', import.meta.url));
  const node = process.execPath;

  await writeFile(path.join(appRoot, 'broken.view'), `page({
  id: 'broken',
  route: '/broken',
  html: './missing.html',
  logic: './missing.logic',
  api: { crm: './missing.api' },
  data: { prefs: './missing.data' }
})`, 'utf8');

  try {
    let stdout = '';
    let failed = false;
    try {
      const result = await execFile(node, ['src/cli.js', 'check', appRoot, '--json'], { cwd });
      stdout = result.stdout;
    } catch (error) {
      failed = true;
      stdout = error.stdout;
    }

    assert.equal(failed, true);
    const payload = JSON.parse(stdout);
    assert.equal(payload.ok, false);
    const missing = payload.diagnostics.filter((entry) => entry.code === 'BRACKETS_REFERENCE_MISSING');
    assert.equal(missing.length >= 4, true);
    assert.equal(missing.some((entry) => /Missing html reference/.test(entry.message)), true);
    assert.equal(missing.some((entry) => /Missing logic reference/.test(entry.message)), true);
    assert.equal(missing.some((entry) => /Missing api dependency "crm"/.test(entry.message)), true);
    assert.equal(missing.some((entry) => /Missing data dependency "prefs"/.test(entry.message)), true);
  } finally {
    await rm(appRoot, { recursive: true, force: true });
  }
});

test('cli check reports references that escape outside the app root', async () => {
  const appRoot = await mkdtemp(path.join(tmpdir(), 'brackets-outside-refs-'));
  const cwd = fileURLToPath(new URL('..', import.meta.url));
  const node = process.execPath;

  await writeFile(path.join(appRoot, 'escape.view'), `page({
  id: 'escape',
  route: '/escape',
  html: '../outside.html',
  logic: '../outside.logic',
  api: { crm: '../outside.api' },
  data: { prefs: '../outside.data' }
})`, 'utf8');

  try {
    let stdout = '';
    let failed = false;
    try {
      const result = await execFile(node, ['src/cli.js', 'check', appRoot, '--json'], { cwd });
      stdout = result.stdout;
    } catch (error) {
      failed = true;
      stdout = error.stdout;
    }

    assert.equal(failed, true);
    const payload = JSON.parse(stdout);
    assert.equal(payload.ok, false);
    const outside = payload.diagnostics.filter((entry) => entry.code === 'BRACKETS_REFERENCE_OUTSIDE_APP');
    assert.equal(outside.length >= 4, true);
    assert.equal(outside.some((entry) => /html reference/.test(entry.message)), true);
    assert.equal(outside.some((entry) => /logic reference/.test(entry.message)), true);
    assert.equal(outside.some((entry) => /api dependency "crm"/.test(entry.message)), true);
    assert.equal(outside.some((entry) => /data dependency "prefs"/.test(entry.message)), true);
  } finally {
    await rm(appRoot, { recursive: true, force: true });
  }
});

test('server blocks storage references that escape outside the app root', async () => {
  const appRoot = await mkdtemp(path.join(tmpdir(), 'brackets-storage-escape-'));

  await mkdir(path.join(appRoot, 'data'), { recursive: true });
  await writeFile(path.join(appRoot, 'data', 'escape.data'), `({
  load({ storage }) {
    return storage.json('../outside.json').read([])
  }
})`, 'utf8');

  const app = await createServer({
    appRoot,
    host: '127.0.0.1',
    port: 4403
  });

  try {
    const { headers } = await getSessionHeaders('http://127.0.0.1:4403');
    const response = await fetch('http://127.0.0.1:4403/__brackets/rpc', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        kind: 'data',
        moduleUrl: '/app/data/escape.data',
        method: 'load',
        args: []
      })
    });
    const payload = await response.json();
    assert.equal(response.ok, false);
    assert.match(payload.error, /outside app root/i);
  } finally {
    await app.close();
    await rm(appRoot, { recursive: true, force: true });
  }
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

    const proxyHeaders = await fetch('http://127.0.0.1:4393/remote/inspect-proxy', {
      headers: {
        Origin: 'http://malicious.example',
        Referer: 'http://malicious.example/payload',
        'Sec-Fetch-Site': 'cross-site'
      }
    }).then((response) => response.json());
    assert.equal(proxyHeaders.forwardedHost, '127.0.0.1:4393');
    assert.equal(proxyHeaders.forwardedProto, 'http');
    assert.equal(proxyHeaders.forwardedPrefix, '/remote');
    assert.equal(proxyHeaders.proxyHeader, 'true');
    assert.equal(proxyHeaders.origin, null);
    assert.equal(proxyHeaders.referer, null);
    assert.equal(proxyHeaders.secFetchSite, null);
    assert.equal(typeof proxyHeaders.forwardedFor, 'string');

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

test('server uses local-safe csrf cookies on http and secure host cookies on https', async () => {
  const app = await createServer({
    appRoot: './demo/app',
    port: 4404,
    host: '127.0.0.1'
  });

  try {
    const localResponse = await fetch('http://127.0.0.1:4404/__brackets/session');
    const localCookie = localResponse.headers.get('set-cookie') ?? '';
    assert.match(localCookie, /^brackets-csrf=/);
    assert.match(localCookie, /HttpOnly/);
    assert.match(localCookie, /SameSite=Lax/);
    assert.doesNotMatch(localCookie, /__Host-brackets-csrf/);
    assert.doesNotMatch(localCookie, /(?:^|;\s*)Secure(?:;|$)/);

    const secureResponse = await fetch('http://127.0.0.1:4404/__brackets/session', {
      headers: {
        'X-Forwarded-Proto': 'https'
      }
    });
    const secureCookie = secureResponse.headers.get('set-cookie') ?? '';
    assert.match(secureCookie, /^__Host-brackets-csrf=/);
    assert.match(secureCookie, /HttpOnly/);
    assert.match(secureCookie, /SameSite=Lax/);
    assert.match(secureCookie, /(?:^|;\s*)Secure(?:;|$)/);
  } finally {
    await app.close();
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

test('server rejects proxy targets with embedded credentials and invalid rpc args', async () => {
  await assert.rejects(
    createServer({
      appRoot: './demo/app',
      port: 0,
      host: '127.0.0.1',
      proxies: {
        '/remote': 'http://user:pass@127.0.0.1:4375'
      }
    }),
    /must not include credentials/
  );

  const app = await createServer({
    appRoot: './demo/app',
    port: 4400,
    host: '127.0.0.1'
  });

  try {
    const sessionHeaders = await getSessionHeaders('http://127.0.0.1:4400');
    const invalidArgs = await fetch('http://127.0.0.1:4400/__brackets/rpc', {
      method: 'POST',
      headers: sessionHeaders.headers,
      body: JSON.stringify({
        kind: 'data',
        moduleUrl: '/app/data/contacts.data',
        method: 'list',
        args: { bad: true }
      })
    });
    assert.equal(invalidArgs.status, 400);
    const payload = await invalidArgs.json();
    assert.equal(payload.code, 'BRACKETS_RPC_INVALID');
    assert.equal(Array.isArray(payload.issues), true);
    assert.match(payload.hint, /args as an array/i);
    assert.equal(payload.issues.some((issue) => issue.path === 'rpc.args'), true);
  } finally {
    await app.close();
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

test('server rpc keeps module method context for data-model helper methods', async () => {
  const appRoot = await mkdtemp(path.join(tmpdir(), 'brackets-rpc-this-'));
  await mkdir(path.join(appRoot, 'data'), { recursive: true });

  await writeFile(path.join(appRoot, 'home.view'), `page({
  id: 'home',
  html: './home.html',
  route: '/',
  data: { contacts: './data/contacts.data' }
})`, 'utf8');
  await writeFile(path.join(appRoot, 'home.html'), '<main><h1>Home</h1></main>', 'utf8');
  await writeFile(path.join(appRoot, 'data', 'contacts.data'), `({
  normalize(input) {
    return String(input ?? '').trim().toUpperCase()
  },
  async save({ storage }, values) {
    const next = (values ?? []).map((value) => this.normalize(value))
    await storage.json('./contacts.json').write(next)
    return next
  }
})`, 'utf8');

  const app = await createServer({
    appRoot,
    port: 4402,
    host: '127.0.0.1'
  });

  try {
    const sessionHeaders = await getSessionHeaders('http://127.0.0.1:4402');
    const result = await fetch('http://127.0.0.1:4402/__brackets/rpc', {
      method: 'POST',
      headers: sessionHeaders.headers,
      body: JSON.stringify({
        kind: 'data',
        moduleUrl: '/app/data/contacts.data',
        method: 'save',
        args: [['ada', 'grace']]
      })
    }).then((response) => response.json());

    assert.deepEqual(result.result, ['ADA', 'GRACE']);
  } finally {
    await app.close();
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

test('transformHtmlSyntax keeps Datastar-native directives off the Brackets runtime path', () => {
  const source = `
    <section
      :state="{ count: 1 }"
      :calc="{ doubled: count * 2 }"
      :run="read('/events')"
      :watch="mutate('count', count + 1)"
      :text="count"
      :show="count > 0"
      :bind="form.name"
      :class.open="open"
      :set.aria-hidden="!open"
      @click="get('/contacts')"
      :if="ready"
      :html="content"
      :loading="contacts"
      :error="contacts"
      :mount>
    </section>
  `;

  const transformed = transformHtmlSyntax(source);

  for (const unexpected of [
    'data-brx-state',
    'data-brx-calc',
    'data-brx-run',
    'data-brx-watch',
    'data-brx-text',
    'data-brx-show',
    'data-brx-bind',
    'data-brx-class:',
    'data-brx-attr:',
    'data-brx-on:click'
  ]) {
    assert.equal(transformed.includes(unexpected), false, `${unexpected} should stay Datastar-native`);
  }

  for (const expected of [
    'data-signals=',
    'data-computed=',
    'data-init=',
    'data-effect=',
    'data-text=',
    'data-show=',
    'data-bind=',
    'data-class:open=',
    'data-attr:aria-hidden=',
    'data-on:click='
  ]) {
    assert.equal(transformed.includes(expected), true, `${expected} should be present`);
  }

  for (const frameworkOwned of [
    'data-brx-if=',
    'data-brx-html=',
    'data-brx-loading=',
    'data-brx-error=',
    'data-brx-mount='
  ]) {
    assert.equal(transformed.includes(frameworkOwned), true, `${frameworkOwned} should remain framework-owned`);
  }
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

test('docs describe no-build runtime type safety and structured framework errors', async () => {
  const [docs, reference] = await Promise.all([
    readFile(new URL('../docs.md', import.meta.url), 'utf8'),
    readFile(new URL('../docs/reference.md', import.meta.url), 'utf8')
  ]);

  assert.match(docs, /Type safety without a build step/i);
  assert.match(docs, /\.logic`, `\.api`, and `\.data` module exports/);
  assert.match(docs, /duplicate page ids and route path collisions/);
  assert.match(docs, /missing `\.html`, `\.logic`, `\.api`, and `\.data` references/);
  assert.match(docs, /escape outside the app root/);
  assert.match(docs, /structured errors/i);
  assert.match(reference, /No-build type safety/i);
  assert.match(reference, /`\.logic` module exports/);
  assert.match(reference, /`issues`/);
  assert.match(reference, /`hint`/);
});

test('docs lock the local-first dynamic authority model', async () => {
  const [docs, guide, platform, agents, checklist] = await Promise.all([
    readFile(new URL('../docs.md', import.meta.url), 'utf8'),
    readFile(new URL('../docs/guide.md', import.meta.url), 'utf8'),
    readFile(new URL('../docs/platform.md', import.meta.url), 'utf8'),
    readFile(new URL('../docs/agents.md', import.meta.url), 'utf8'),
    readFile(new URL('../docs/checklist.md', import.meta.url), 'utf8')
  ]);

  assert.match(docs, /dynamic UI and app behavior/i);
  assert.match(docs, /optional shared trusted server authority through `\.api`/i);
  assert.match(docs, /session cookies should stay local-safe on plain HTTP/i);
  assert.match(guide, /`\.data` = data model, queries, validation, transforms, and persistence rules/);
  assert.match(guide, /Datastar makes this a frontend reality/i);
  assert.match(guide, /session cookies should stay local-safe on HTTP/i);
  assert.match(platform, /Authority Profiles/);
  assert.match(platform, /local persistence and local database: yes/i);
  assert.match(agents, /do not assume every deployment has shared server-side write authority/i);
  assert.match(checklist, /local-first and authority-flexible by design/i);
});

test('front-door docs teach the modern Brackets architecture explicitly', async () => {
  const [readme, docsIndex, docs, guide] = await Promise.all([
    readFile(new URL('../README.md', import.meta.url), 'utf8'),
    readFile(new URL('../docs/index.md', import.meta.url), 'utf8'),
    readFile(new URL('../docs.md', import.meta.url), 'utf8'),
    readFile(new URL('../docs/guide.md', import.meta.url), 'utf8')
  ]);

  assert.match(readme, /Modern Model/);
  assert.match(readme, /`\.view` \/ `\.html` = UI/);
  assert.match(readme, /model code, queries, validation, transforms, and persistence rules/);
  assert.match(docsIndex, /Learn The Model/);
  assert.match(docsIndex, /Dynamic app, static shape/);
  assert.match(docs, /Teaching shortcut/i);
  assert.match(guide, /The fastest way to teach it/i);
  assert.match(guide, /Datastar powers the live frontend/i);
});

test('docs teach modern request and cache resilience', async () => {
  const [docs, guide] = await Promise.all([
    readFile(new URL('../docs.md', import.meta.url), 'utf8'),
    readFile(new URL('../docs/guide.md', import.meta.url), 'utf8')
  ]);

  assert.match(docs, /cancel superseded work without dropping the next request's loading state early/i);
  assert.match(docs, /preserve stale data during failed background refreshes/i);
  assert.match(docs, /keep page-level loading and error state aligned with the latest active request/i);
  assert.match(docs, /failed route warming and failed session refreshes should be retryable/i);
  assert.match(docs, /configured route prefetch should follow navigation/i);
  assert.match(docs, /local `\.json`, `\.yaml`, and encrypted storage writes should stay serialized and readable under overlap/i);
  assert.match(docs, /`\.db` transactions should stay serialized under overlap/i);
  assert.match(docs, /invalidating cache should prevent older in-flight reads from silently repopulating cleared keys/i);
  assert.match(guide, /overlapping `cache\.fetch\(\)` calls for the same key should deduplicate work/i);
  assert.match(guide, /failed background refresh should not poison the cache/i);
  assert.match(guide, /overlapping transport requests should keep loading\/error state aligned with the latest active request/i);
  assert.match(guide, /failed route prefetch or session refresh attempts should clear their in-flight state so the next retry can succeed/i);
  assert.match(guide, /configured route prefetch should continue after navigation so warmed routes stay relevant/i);
  assert.match(guide, /route ids stay stable/i);
  assert.match(guide, /query and hash stay structured/i);
  assert.match(guide, /local `\.json`, `\.yaml`, and encrypted storage writes should serialize cleanly/i);
  assert.match(guide, /local `\.db` transactions should serialize cleanly too/i);
  assert.match(guide, /invalidating cache should stop older in-flight reads from silently writing stale values back/i);
});

test('docs teach route-target navigation helpers for cleaner router code', async () => {
  const [docs, guide, reference] = await Promise.all([
    readFile(new URL('../docs.md', import.meta.url), 'utf8'),
    readFile(new URL('../docs/guide.md', import.meta.url), 'utf8'),
    readFile(new URL('../docs/reference.md', import.meta.url), 'utf8')
  ]);

  assert.match(docs, /route-target navigation helpers/i);
  assert.match(docs, /ctx\.nav\.href\(target\)/i);
  assert.match(docs, /ctx\.route\.href\(next\?\)/i);
  assert.match(guide, /Prefer route targets over raw path strings/i);
  assert.match(guide, /ctx\.nav\.to\(target\)/i);
  assert.match(reference, /route-target helpers so navigation can use route ids plus params\/query\/hash/i);
  assert.match(reference, /ctx\.nav\.to\(target\).*ctx\.nav\.replace\(target\).*ctx\.nav\.redirect\(target\)/i);
});

test('docs keep the Datastar-first boundary explicit', async () => {
  const [docs, reference] = await Promise.all([
    readFile(new URL('../docs.md', import.meta.url), 'utf8'),
    readFile(new URL('../docs/reference.md', import.meta.url), 'utf8')
  ]);

  assert.match(docs, /:state`, `:calc`, `:run`, `:watch`, `:text`, `:show`, `:bind`, `:class\.\*`, and `:set\.\*` should compile to native Datastar attributes/i);
  assert.match(docs, /only framework-specific surfaces such as `:use`, `:props`, `:area`, `:fill`, `:mount`, `:if`, `:each`, `:html`, `:loading`, and `:error` should stay on the Brackets-owned side/i);
  assert.match(reference, /the current native Datastar coverage should include `:state`, `:calc`, `:run`, `:watch`, `:text`, `:show`, `:bind`, `:class\.\*`, `:set\.\*`, and plain transport\/event expressions/i);
});

test('docs explain encrypted local persistence as an optional host capability', async () => {
  const [docs, guide, platform, agents] = await Promise.all([
    readFile(new URL('../docs.md', import.meta.url), 'utf8'),
    readFile(new URL('../docs/guide.md', import.meta.url), 'utf8'),
    readFile(new URL('../docs/platform.md', import.meta.url), 'utf8'),
    readFile(new URL('../docs/agents.md', import.meta.url), 'utf8')
  ]);

  assert.match(docs, /encrypted local persistence/i);
  assert.match(docs, /BRACKETS_DATA_KEY/);
  assert.match(docs, /storage\['\[e\]json'\]/);
  assert.match(guide, /storage\['\[e\]json'\]/);
  assert.match(guide, /storage\['\[e\]yaml'\]/);
  assert.match(platform, /encrypted local persistence is an optional host capability/i);
  assert.match(agents, /encrypted persistence as a host capability/i);
});

test('docs teach .data as the preferred model layer', async () => {
  const [docs, guide, reference] = await Promise.all([
    readFile(new URL('../docs.md', import.meta.url), 'utf8'),
    readFile(new URL('../docs/guide.md', import.meta.url), 'utf8'),
    readFile(new URL('../docs/reference.md', import.meta.url), 'utf8')
  ]);

  assert.match(docs, /\.data` defines the model layer, local data rules, queries, validation, transforms, and persistence behavior/);
  assert.match(guide, /\.data` should own most, and ideally all, model code/i);
  assert.match(guide, /validation, transforms, and query logic/);
  assert.match(reference, /local model layer, persistence rules, queries, and storage adapters/);
  assert.match(reference, /\.data` should own most model logic when it can/);
});

test('docs keep .data and .api aligned with Datastar transfer semantics', async () => {
  const [readme, docs, guide, reference, agents] = await Promise.all([
    readFile(new URL('../README.md', import.meta.url), 'utf8'),
    readFile(new URL('../docs.md', import.meta.url), 'utf8'),
    readFile(new URL('../docs/guide.md', import.meta.url), 'utf8'),
    readFile(new URL('../docs/reference.md', import.meta.url), 'utf8'),
    readFile(new URL('../docs/agents.md', import.meta.url), 'utf8')
  ]);

  assert.match(readme, /\.data` and `\.api` should preserve Datastar-compatible SSE and HTTP transfer/i);
  assert.match(docs, /\.data` is still the local-first model layer, but when it transfers or streams data into the UI it should do that through Datastar-compatible HTTP and SSE behavior/i);
  assert.match(guide, /\.data` is local-first, but when it moves data into the UI it should preserve Datastar-compatible HTTP and SSE transfer behavior/i);
  assert.match(reference, /both should preserve Datastar-compatible SSE and HTTP transfer when they move data/i);
  assert.match(agents, /do not invent a second transport model underneath those layers/i);
});

test('docs teach small clean type-safe patterns for each file type', async () => {
  const [docs, guide, agents] = await Promise.all([
    readFile(new URL('../docs.md', import.meta.url), 'utf8'),
    readFile(new URL('../docs/guide.md', import.meta.url), 'utf8'),
    readFile(new URL('../docs/agents.md', import.meta.url), 'utf8')
  ]);

  assert.match(docs, /Write small, clean, type-safe files/i);
  assert.match(docs, /`\.view` stays declarative/);
  assert.match(docs, /`\.logic` stays orchestration-first/);
  assert.match(docs, /`\.data` stays model-first/);
  assert.match(docs, /`\.api` stays transport-first/);
  assert.match(guide, /Small, clean, type-safe file patterns/i);
  assert.match(guide, /If you can explain a file in one sentence, it is probably small enough/i);
  assert.match(agents, /keep `\.logic` orchestration-first/);
  assert.match(agents, /keep `\.data` model-first/);
});

test('reference keeps the canonical framework summary intact', async () => {
  const reference = await readFile(new URL('../docs/reference.md', import.meta.url), 'utf8');

  for (const row of [
    '| `.view` | what page exists |',
    '| `.logic` | how the app behaves |',
    '| `.api` | how the app talks to a backend |',
    '| `.data` | how the app defines and talks to local models, storage, and persistence rules |',
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
    '| `data` | local model and persistence modules |',
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
    '| framework local-data adapter and model layer | `.data` |'
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
    '6. Keep `.data` strictly about the local model layer, persistence rules, and storage access.',
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
