import http from 'node:http';
import { readFile, readdir, writeFile, mkdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { BracketsError, createIssue, throwContractIssues } from './contracts.js';
import { transformHtmlSyntax } from './syntax.js';
import { buildFrameworkFaviconSvg, buildFrameworkLogoSvg, loadBracketsConfig } from './config.js';
import { closeStorageAdapters, createStorageHelpers } from './data-adapters.js';
import { PAGE_MANIFEST_SCHEMA, validatePageManifest } from './page.js';

const MODULE_EXTENSIONS = new Set(['.view', '.logic', '.api', '.data']);
const RPC_PREFIXES = {
  api: '/app/api/',
  data: '/app/data/'
};
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const DEFAULT_RPC_BODY_LIMIT_BYTES = 1024 * 1024;
const DEFAULT_PROXY_BODY_LIMIT_BYTES = 1024 * 1024;
const DATASTAR_BUNDLE_URL = 'https://cdn.jsdelivr.net/gh/starfederation/datastar@1.0.0-RC.8/bundles/datastar.js';
const FRAMEWORK_DEMO_DIR = path.resolve('src/framework/demo');
const HOP_BY_HOP_HEADERS = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'proxy-connection',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade'
]);

const MIME_TYPES = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.mjs', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.webmanifest', 'application/manifest+json; charset=utf-8'],
  ['.xml', 'application/xml; charset=utf-8'],
  ['.txt', 'text/plain; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.woff', 'font/woff'],
  ['.woff2', 'font/woff2'],
  ['.ttf', 'font/ttf']
]);
const TEXT_EXTENSIONS = new Set(['.html', '.js', '.mjs', '.json', '.webmanifest', '.css', '.svg', '.view', '.logic', '.api', '.data', '.yaml', '.yml', '.txt', '.xml']);

function datastarProxySource() {
  return `export * from ${json(DATASTAR_BUNDLE_URL)};\nimport * as Datastar from ${json(DATASTAR_BUNDLE_URL)};\nexport default Datastar;\n`;
}

function json(value) {
  return JSON.stringify(value, null, 2);
}

async function readCachedFile(cache, filePath, loader) {
  const fileStat = await stat(filePath);
  const cached = cache.get(filePath);
  if (cached?.mtimeMs === fileStat.mtimeMs) {
    return cached.value;
  }

  const value = await loader();
  cache.set(filePath, {
    mtimeMs: fileStat.mtimeMs,
    value
  });
  return value;
}

class HttpError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
  }
}

function cleanJoin(rootDir, requestPath) {
  const relative = requestPath.replace(/^\/+/, '').split('/').join(path.sep);
  const resolved = path.resolve(rootDir, relative);
  if (!resolved.startsWith(path.resolve(rootDir))) {
    throw new Error(`Blocked path traversal for ${requestPath}`);
  }
  return resolved;
}

function toAppUrl(filePath, appRoot) {
  const relative = path.relative(appRoot, filePath).split(path.sep).join('/');
  return `/app/${relative}`;
}

function resolveAppSpecifier(specifier, appRoot, baseDir = appRoot) {
  const aliasMap = {
    '@views/': 'views/',
    '@routes/': 'routes/',
    '@logic/': 'logic/',
    '@api/': 'api/',
    '@data/': 'data/',
    '@pages/': 'pages/',
    '@layouts/': 'layouts/',
    '@components/': 'components/',
    '@storage/': 'storage/'
  };

  for (const [alias, target] of Object.entries(aliasMap)) {
    if (specifier.startsWith(alias)) {
      return path.join(appRoot, target, specifier.slice(alias.length));
    }
  }

  if (specifier.startsWith('/app/')) {
    return cleanJoin(appRoot, specifier.slice('/app/'.length));
  }

  return path.resolve(baseDir, specifier);
}

function normalizeByteLimit(limit, fallback) {
  if (limit === undefined) {
    return fallback;
  }

  if (limit === null) {
    return null;
  }

  if (!Number.isFinite(limit) || limit < 1) {
    throw new HttpError(500, `Body limit must be a positive number or null: ${limit}`);
  }

  return Math.floor(limit);
}

function normalizeProxies(proxies, defaults = {}) {
  const normalized = {};
  for (const [prefix, rawProxy] of Object.entries(proxies)) {
    if (!prefix.startsWith('/')) {
      throw new HttpError(500, `Proxy prefix must start with "/": ${prefix}`);
    }

    const config = typeof rawProxy === 'string'
      ? { target: rawProxy }
      : rawProxy;

    if (!config?.target) {
      throw new HttpError(500, `Proxy target is required for ${prefix}`);
    }

    const target = new URL(config.target);
    if (!['http:', 'https:'].includes(target.protocol)) {
      throw new HttpError(500, `Proxy target must use http or https: ${config.target}`);
    }
    if (target.username || target.password) {
      throw new HttpError(500, `Proxy target must not include credentials: ${config.target}`);
    }

    normalized[prefix] = {
      target,
      followRedirects: config.followRedirects ?? defaults.allowProxyRedirects ?? false,
      bodyLimitBytes: normalizeByteLimit(config.bodyLimitBytes, defaults.proxyBodyLimitBytes ?? DEFAULT_PROXY_BODY_LIMIT_BYTES)
    };
  }
  return normalized;
}

function toModuleSource(source, extension, browser = false) {
  const trimmed = source.trim();
  const pageImport = browser
    ? `import { page } from '/framework/page.js';\n`
    : `import { page } from ${json(pathToFileURL(path.resolve('src/page.js')).href)};\n`;

  if (/export\s+default/.test(trimmed) || /export\s+\{/.test(trimmed)) {
    return trimmed;
  }

  if (extension === '.view') {
    if (/^page\s*\(/.test(trimmed)) {
      return `${pageImport}export default ${trimmed.replace(/;$/, '')};\n`;
    }

    return `${pageImport}export default page(${trimmed.replace(/;$/, '')});\n`;
  }

  return `export default (${trimmed.replace(/;$/, '')});\n`;
}

async function ensureServerModule(filePath, extension) {
  const source = await readFile(filePath, 'utf8');
  const wrapped = toModuleSource(source, extension, false);
  const hash = crypto.createHash('sha1').update(filePath).update(wrapped).digest('hex');
  const cacheDir = path.join(tmpdir(), 'brackets-framework');
  await mkdir(cacheDir, { recursive: true });
  const cachePath = path.join(cacheDir, `${hash}.mjs`);
  await writeFile(cachePath, wrapped, 'utf8');
  return cachePath;
}

async function loadDefaultExport(filePath) {
  const extension = path.extname(filePath);
  const modulePath = await ensureServerModule(filePath, extension);
  const imported = await import(pathToFileURL(modulePath).href + `?t=${Date.now()}`);
  return imported.default;
}

function normalizeRoutePath(route) {
  if (!route || route === '/') {
    return '/';
  }

  const normalized = route.startsWith('/') ? route : `/${route}`;
  return normalized.length > 1
    ? normalized.replace(/\/+$/, '')
    : normalized;
}

function routeToRegExp(route) {
  const keys = [];
  const normalizedRoute = normalizeRoutePath(route);
  const pattern = normalizedRoute
    .split('/')
    .map((segment, index) => {
      if (index === 0) {
        return '';
      }

      if (segment.startsWith(':')) {
        keys.push(segment.slice(1));
        return '/([^/]+)';
      }

      if (segment.startsWith('*')) {
        const key = segment.slice(1) || 'splat';
        keys.push(key);
        return '/(.*)';
      }

      return `/${segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`;
    })
    .join('');

  return {
    keys,
    regex: new RegExp(`^${pattern}$`)
  };
}

async function listFilesRecursive(rootDir, extension, options = {}) {
  if (!existsSync(rootDir)) {
    return [];
  }

  const entries = await readdir(rootDir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (options.excludeDirs?.has(entry.name)) {
      continue;
    }

    const fullPath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listFilesRecursive(fullPath, extension, options));
      continue;
    }

    if (entry.name.endsWith(extension)) {
      files.push(fullPath);
    }
  }

  return files;
}

function deriveRouteFromFile(filePath, rootDir, stripPrefix = '') {
  const relative = path.relative(rootDir, filePath).split(path.sep).join('/');
  const withoutExtension = relative.replace(/\.[^.]+$/, '');
  const withoutPrefix = stripPrefix && withoutExtension.startsWith(stripPrefix)
    ? withoutExtension.slice(stripPrefix.length)
    : withoutExtension;
  const normalized = withoutPrefix
    .replace(/(^|\/)index$/i, '')
    .replace(/\/+/g, '/')
    .replace(/^\/|\/$/g, '');

  return normalized ? `/${normalized}` : '/';
}

function scoreRoute(route) {
  const normalized = normalizeRoutePath(route);
  const segments = normalized.split('/').filter(Boolean);
  const staticSegments = segments.filter((segment) => !segment.startsWith(':') && !segment.startsWith('*')).length;
  const paramSegments = segments.filter((segment) => segment.startsWith(':')).length;
  const splatSegments = segments.filter((segment) => segment.startsWith('*')).length;
  return (staticSegments * 100) + (segments.length * 10) - (paramSegments * 8) - (splatSegments * 16);
}

function mergeRecord(base = {}, extra = {}) {
  return {
    ...(base ?? {}),
    ...(extra ?? {})
  };
}

function mergeRouteDefaults(defaults = {}, definition = {}) {
  return {
    ...defaults,
    ...definition,
    meta: mergeRecord(defaults.meta, definition.meta),
    seo: mergeRecord(defaults.seo, definition.seo),
    auth: mergeRecord(defaults.auth, definition.auth),
    assets: mergeRecord(defaults.assets, definition.assets),
    api: mergeRecord(defaults.api, definition.api),
    data: mergeRecord(defaults.data, definition.data),
    params: mergeRecord(defaults.params, definition.params)
  };
}

function normalizeAliasList(definition) {
  const values = [
    ...(definition.alias ? [definition.alias] : []),
    ...(Array.isArray(definition.aliases) ? definition.aliases : [])
  ];

  return [...new Set(values
    .filter((value) => typeof value === 'string' && value.trim())
    .map((value) => normalizeRoutePath(value)))];
}

function expandAliasRoutes(route) {
  const aliases = route.aliases ?? [];
  if (!aliases.length) {
    return [route];
  }

  const expanded = [route];
  for (const aliasRoute of aliases) {
    expanded.push({
      ...route,
      route: aliasRoute,
      alias: null,
      aliases: [],
      aliasOf: route.route,
      canonicalRoute: route.canonicalRoute ?? route.route,
      seo: {
        ...(route.seo ?? {}),
        canonical: route.seo?.canonical ?? route.canonicalRoute ?? route.route
      },
      routeKeys: routeToRegExp(aliasRoute).keys,
      routePattern: routeToRegExp(aliasRoute).regex.source,
      score: scoreRoute(aliasRoute),
      source: `${route.source}:alias`
    });
  }
  return expanded;
}

function resolveDependencyMap(specifiers, appRoot, baseDir) {
  const resolved = {};
  for (const [name, specifier] of Object.entries(specifiers ?? {})) {
    resolved[name] = toAppUrl(resolveAppSpecifier(specifier, appRoot, baseDir), appRoot);
  }
  return resolved;
}

function normalizeRouteDefaults(defaults = {}, sourcePath, appRoot) {
  if (!defaults || typeof defaults !== 'object' || Array.isArray(defaults)) {
    return {};
  }

  const sourceDir = path.dirname(sourcePath);
  const normalized = { ...defaults };

  for (const key of ['html', 'logic', 'layout']) {
    if (typeof normalized[key] === 'string' && normalized[key]) {
      normalized[key] = toAppUrl(resolveAppSpecifier(normalized[key], appRoot, sourceDir), appRoot);
    }
  }

  normalized.api = resolveDependencyMap(normalized.api, appRoot, sourceDir);
  normalized.data = resolveDependencyMap(normalized.data, appRoot, sourceDir);
  return normalized;
}

function normalizeRouteDefinition(definition, sourcePath, appRoot, options = {}) {
  if (!definition || typeof definition !== 'object' || Array.isArray(definition)) {
    throw new Error(`Brackets route definition in ${sourcePath} must be an object`);
  }

  const mergedDefinition = validatePageManifest(
    mergeRouteDefaults(options.defaults, definition),
    `Brackets route definition in ${sourcePath}`
  );

  const sourceDir = path.dirname(sourcePath);
  const resolveMaybe = (specifier) => {
    if (!specifier) {
      return null;
    }

    return toAppUrl(resolveAppSpecifier(specifier, appRoot, sourceDir), appRoot);
  };

  const route = normalizeRoutePath(mergedDefinition.route ?? options.defaultRoute ?? '/');
  const matcher = routeToRegExp(route || '/');
  const source = options.source ?? 'view';
  const sourcePriority = options.sourcePriority ?? 0;
  const aliases = normalizeAliasList(mergedDefinition);

  return {
    id: mergedDefinition.id,
    route,
    routeKeys: matcher.keys,
    routePattern: matcher.regex.source,
    title: mergedDefinition.title ?? '',
    meta: mergedDefinition.meta ?? {},
    seo: mergedDefinition.seo ?? {},
    auth: mergedDefinition.auth ?? null,
    assets: mergedDefinition.assets ?? {},
    htmlUrl: resolveMaybe(mergedDefinition.html),
    layoutUrl: resolveMaybe(mergedDefinition.layout),
    logicUrl: resolveMaybe(mergedDefinition.logic),
    api: resolveDependencyMap(mergedDefinition.api, appRoot, sourceDir),
    data: resolveDependencyMap(mergedDefinition.data, appRoot, sourceDir),
    params: mergedDefinition.params ?? {},
    redirectTo: mergedDefinition.redirectTo ?? null,
    preload: mergedDefinition.preload ?? null,
    aliases,
    aliasOf: null,
    canonicalRoute: route,
    source,
    sourceUrl: toAppUrl(sourcePath, appRoot),
    sourcePriority,
    score: scoreRoute(route)
  };
}

function normalizeManifest(manifest, viewPath, appRoot, defaults = {}) {
  const viewsDir = path.join(appRoot, 'views');
  const defaultRoot = viewPath.startsWith(viewsDir)
    ? viewsDir
    : appRoot;
  return normalizeRouteDefinition(manifest, viewPath, appRoot, {
    defaultRoute: deriveRouteFromFile(viewPath, defaultRoot),
    defaults,
    source: 'view',
    sourcePriority: 10
  });
}

function extractRouteDefinitions(exported) {
  if (!exported) {
    return [];
  }

  if (Array.isArray(exported)) {
    return exported;
  }

  if (Array.isArray(exported.routes)) {
    return exported.routes;
  }

  if (typeof exported === 'object' && (exported.id || exported.route || exported.html)) {
    return [exported];
  }

  return [];
}

function dedupeAndSortRoutes(routes) {
  const sorted = [...routes].sort((left, right) => {
    if (right.sourcePriority !== left.sourcePriority) {
      return right.sourcePriority - left.sourcePriority;
    }
    if (right.score !== left.score) {
      return right.score - left.score;
    }
    if (right.route.length !== left.route.length) {
      return right.route.length - left.route.length;
    }
    return left.route.localeCompare(right.route);
  });

  const deduped = [];
  const seen = new Set();
  for (const route of sorted) {
    const key = route.route;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(route);
  }

  return deduped;
}

async function buildRouterBundle(appRoot, cache) {
  const routerLogicPath = path.join(appRoot, 'router.logic');
  const groupedRoutesDir = path.join(appRoot, 'routes');
  const viewFiles = await listFilesRecursive(appRoot, '.view', {
    excludeDirs: new Set(['node_modules', '.git'])
  });
  const groupedRouteFiles = await listFilesRecursive(groupedRoutesDir, '.logic', {
    excludeDirs: new Set(['node_modules', '.git'])
  });
  const signatureFiles = [
    ...viewFiles,
    ...groupedRouteFiles,
    ...(existsSync(routerLogicPath) ? [routerLogicPath] : [])
  ];
  const signature = (await Promise.all(signatureFiles.map(async (filePath) => {
    const info = await stat(filePath);
    return `${filePath}:${info.mtimeMs}`;
  }))).join('|');

  if (cache.signature === signature && cache.bundle) {
    return cache.bundle;
  }

  const routes = [];
  let routerExport = {};
  if (existsSync(routerLogicPath)) {
    routerExport = await loadDefaultExport(routerLogicPath) ?? {};
  }
  const routerDefaults = existsSync(routerLogicPath)
    ? normalizeRouteDefaults(routerExport.defaults ?? {}, routerLogicPath, appRoot)
    : {};

  for (const filePath of viewFiles) {
    const manifest = await loadDefaultExport(filePath);
    routes.push(...expandAliasRoutes(normalizeManifest(manifest, filePath, appRoot, routerDefaults)));
  }

  for (const filePath of groupedRouteFiles) {
    const exported = await loadDefaultExport(filePath);
    const groupedDefaults = mergeRouteDefaults(routerDefaults, normalizeRouteDefaults(exported?.defaults ?? {}, filePath, appRoot));
    const definitions = extractRouteDefinitions(exported);
    for (const definition of definitions) {
      routes.push(...expandAliasRoutes(normalizeRouteDefinition(definition, filePath, appRoot, {
        defaultRoute: deriveRouteFromFile(filePath, groupedRoutesDir),
        defaults: groupedDefaults,
        source: 'routes.logic',
        sourcePriority: 20
      })));
    }
  }

  if (existsSync(routerLogicPath)) {
    const definitions = extractRouteDefinitions(routerExport);
    for (const definition of definitions) {
      routes.push(...expandAliasRoutes(normalizeRouteDefinition(definition, routerLogicPath, appRoot, {
        defaultRoute: '/',
        defaults: routerDefaults,
        source: 'router.logic',
        sourcePriority: 30
      })));
    }
  }

  const normalizedRoutes = dedupeAndSortRoutes(routes);
  const bundle = {
    routes: normalizedRoutes,
    router: {
      mode: existsSync(routerLogicPath) || groupedRouteFiles.length ? 'hybrid' : 'file',
      logicUrl: existsSync(routerLogicPath) ? toAppUrl(routerLogicPath, appRoot) : null,
      sources: {
        viewRoutes: viewFiles.length,
        groupedLogicFiles: groupedRouteFiles.length,
        logicRoutes: normalizedRoutes.filter((route) => route.source !== 'view').length
      },
      hooks: {
        beforeEach: typeof routerExport?.beforeEach === 'function',
        afterEach: typeof routerExport?.afterEach === 'function',
        notFound: typeof routerExport?.notFound === 'function'
      }
    }
  };

  cache.signature = signature;
  cache.bundle = bundle;
  return bundle;
}

function parseCookies(cookieHeader = '') {
  return Object.fromEntries(
    cookieHeader
      .split(';')
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const [name, ...rest] = part.split('=');
        return [name, decodeURIComponent(rest.join('='))];
      })
  );
}

function escapeXml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function safeText(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildSitemapXml(routes, origin) {
  const urls = routes
    .filter((route) => route.seo?.index !== false)
    .map((route) => {
      const absolute = new URL(route.route || '/', origin).href;
      const priority = route.seo?.priority ? `<priority>${escapeXml(route.seo.priority)}</priority>` : '';
      const changefreq = route.seo?.changefreq ? `<changefreq>${escapeXml(route.seo.changefreq)}</changefreq>` : '';
      return `<url><loc>${escapeXml(absolute)}</loc>${changefreq}${priority}</url>`;
    })
    .join('');

  return `<?xml version="1.0" encoding="UTF-8"?>` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`;
}

function buildFeedXml(routes, origin) {
  const items = routes
    .filter((route) => route.seo?.feed !== false)
    .map((route) => {
      const absolute = new URL(route.route || '/', origin).href;
      const description = route.meta?.description ?? route.seo?.description ?? route.title ?? '';
      return `<item><title>${escapeXml(route.title || route.id)}</title><link>${escapeXml(absolute)}</link><description>${escapeXml(description)}</description></item>`;
    })
    .join('');

  return `<?xml version="1.0" encoding="UTF-8"?>` +
    `<rss version="2.0"><channel><title>Brackets Feed</title><link>${escapeXml(origin)}</link>${items}</channel></rss>`;
}

function buildRobotsTxt(origin) {
  return `User-agent: *\nAllow: /\nSitemap: ${new URL('/sitemap.xml', origin).href}\n`;
}

function buildWebManifest(routes, origin, appName = 'Brackets App') {
  const home = routes.find((route) => route.route === '/') ?? routes[0] ?? {};
  const assets = home.assets ?? {};
  const meta = home.meta ?? {};
  return {
    name: assets.name ?? home.title ?? appName,
    short_name: assets.shortName ?? home.title ?? appName,
    description: meta.description ?? home.title ?? appName,
    start_url: '/',
    display: assets.display ?? 'standalone',
    background_color: assets.backgroundColor ?? '#f4f0e8',
    theme_color: assets.themeColor ?? '#8f3b2e',
    icons: assets.icons ?? [],
    scope: '/',
    id: new URL('/', origin).href
  };
}

function buildHostContract(origin, appRoot, appConfig) {
  const serviceWorkerPath = path.join(appRoot, 'service-worker.js');
  return {
    framework: 'Brackets',
    version: '0.1.0',
    origin,
    branding: appConfig.branding,
    assets: {
      logo: '/framework/demo/logo.svg',
      favicon: '/framework/demo/favicon.svg',
      splash: '/framework/demo/splash.html'
    },
    profiles: [
      'builtin-loopback',
      'web-server',
      'tauri',
      'webview2'
    ],
    distribution: {
      modes: [
        'desktop-folder',
        'file-server',
        'paired-backend'
      ],
      installFree: true,
      noBuild: true
    },
    contracts: {
      data: ['json', 'yaml', 'db'],
      transport: ['http', 'sse', 'datastar-html', 'datastar-state'],
      auth: ['session', 'csrf'],
      export: ['static-shell', 'sitemap', 'feed', 'robots']
    },
    serviceWorker: {
      available: existsSync(serviceWorkerPath),
      endpoint: '/service-worker.js',
      scope: '/'
    },
    devtools: {
      runtime: '/__brackets/debug',
      schema: '/__brackets/schema/page-manifest.json'
    },
    fileFlows: {
      formUploads: true,
      forcedDownloadQuery: 'download'
    }
  };
}

function securityHeaders(contentType, localOnly) {
  return {
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'X-Frame-Options': 'DENY',
    'Content-Security-Policy': [
      "default-src 'self'",
      "script-src 'self' https://cdn.jsdelivr.net",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data:",
      "connect-src 'self'",
      "frame-ancestors 'none'",
      "base-uri 'self'"
    ].join('; '),
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Resource-Policy': 'same-site',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    Vary: 'Origin, Sec-Fetch-Site',
    'Cache-Control': localOnly ? 'no-store' : 'private, max-age=60',
    'Content-Type': contentType
  };
}

function send(res, statusCode, contentType, body, localOnly = true, extraHeaders = {}) {
  res.writeHead(statusCode, {
    ...securityHeaders(contentType, localOnly),
    ...extraHeaders
  });
  res.end(body);
}

function sanitizeDownloadFilename(value, fallback) {
  const trimmed = String(value ?? '').trim();
  if (!trimmed || trimmed === '1' || trimmed.toLowerCase() === 'true') {
    return fallback;
  }

  return trimmed
    .replace(/[\\\/]+/g, '-')
    .replace(/[\r\n"]/g, '')
    .replace(/[^\w.\- ]+/g, '-')
    .slice(0, 180)
    || fallback;
}

function readRawBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    let exceeded = false;
    req.on('data', (chunk) => {
      if (exceeded) {
        return;
      }

      chunks.push(chunk);
      total += chunk.length;
      if (limit !== null && total > limit) {
        exceeded = true;
        req.resume();
        reject(new HttpError(413, `Request body exceeded ${limit} bytes`));
      }
    });
    req.on('end', () => {
      if (exceeded) {
        return;
      }
      resolve(Buffer.concat(chunks));
    });
    req.on('error', reject);
  });
}

async function parseBody(req, limit = DEFAULT_RPC_BODY_LIMIT_BYTES) {
  const raw = (await readRawBody(req, limit)).toString('utf8');
  if (!raw) {
    return {};
  }

  try {
    return JSON.parse(raw);
  } catch {
    throw new HttpError(400, 'Invalid JSON request body');
  }
}

async function proxyRequest(req, res, proxyConfig, prefix) {
  const url = new URL(req.url, 'http://127.0.0.1');
  const targetPath = url.pathname.slice(prefix.length) || '/';
  const targetUrl = new URL(`${targetPath}${url.search}`, proxyConfig.target);
  const method = req.method ?? 'GET';
  const hasBody = !['GET', 'HEAD'].includes(method);
  const body = hasBody ? await readRawBody(req, proxyConfig.bodyLimitBytes) : undefined;

  const headers = new Headers();
  for (const [name, value] of Object.entries(req.headers)) {
    const lowerName = name.toLowerCase();
    if (
      !value
      || lowerName === 'host'
      || lowerName === 'content-length'
      || lowerName === 'origin'
      || lowerName === 'referer'
      || lowerName.startsWith('sec-')
      || lowerName.startsWith('x-forwarded-')
      || HOP_BY_HOP_HEADERS.has(lowerName)
    ) {
      continue;
    }
    headers.set(name, Array.isArray(value) ? value.join(', ') : value);
  }
  headers.set('X-Forwarded-Host', req.headers.host ?? '');
  headers.set('X-Forwarded-Proto', 'http');
  headers.set('X-Forwarded-Prefix', prefix);
  headers.set('X-Brackets-Proxy', 'true');
  if (req.socket?.remoteAddress) {
    headers.set('X-Forwarded-For', req.socket.remoteAddress);
  }

  const response = await fetch(targetUrl, {
    method,
    headers,
    body,
    redirect: proxyConfig.followRedirects ? 'follow' : 'manual'
  });
  const proxyHeaders = {};
  response.headers.forEach((value, name) => {
    const lowerName = name.toLowerCase();
    if (lowerName === 'content-length' || lowerName === 'server' || HOP_BY_HOP_HEADERS.has(lowerName)) {
      return;
    }
    proxyHeaders[name] = value;
  });

  res.writeHead(response.status, {
    ...proxyHeaders,
    ...securityHeaders(response.headers.get('content-type') ?? 'application/octet-stream', false)
  });

  if (!response.body) {
    res.end();
    return;
  }

  for await (const chunk of response.body) {
    res.write(chunk);
  }
  res.end();
}

function createServerAcceptHeader(resultMode = 'json') {
  if (resultMode === 'html') {
    return 'text/html, application/json;q=0.9, text/event-stream;q=0.8';
  }
  if (resultMode === 'sse') {
    return 'text/event-stream, application/json;q=0.8, text/html;q=0.7';
  }
  return 'application/json, text/html;q=0.8, text/event-stream;q=0.7';
}

function appendUrlPayload(targetUrl, payload) {
  if (!payload || typeof payload !== 'object') {
    return;
  }

  const entries = payload instanceof URLSearchParams
    ? payload.entries()
    : payload instanceof FormData
      ? payload.entries()
      : Object.entries(payload);

  for (const [key, value] of entries) {
    if (value === undefined || value === null) {
      continue;
    }

    if (Array.isArray(value)) {
      targetUrl.searchParams.delete(key);
      for (const item of value) {
        if (item !== undefined && item !== null) {
          targetUrl.searchParams.append(key, String(item));
        }
      }
      continue;
    }

    targetUrl.searchParams.set(key, String(value));
  }
}

function mergeHttpOptions(defaults = {}, options = {}) {
  return {
    ...defaults,
    ...options,
    headers: {
      ...(defaults.headers ?? {}),
      ...(options.headers ?? {})
    }
  };
}

function createRpcHttpError(response, payload) {
  const message = typeof payload === 'string' && payload.trim()
    ? payload.trim()
    : `Request failed with status ${response.status}`;
  const error = new Error(message);
  error.status = response.status;
  error.payload = payload;
  return error;
}

const OPENAPI_TEMPLATE_CACHE = new Map();
const OPENAPI_SAFE_HEADER_NAME = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;

function toOpenApiScalar(value) {
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (value === undefined || value === null) {
    return '';
  }
  if (typeof value === 'object') {
    return JSON.stringify(value);
  }
  return String(value);
}

function encodeOpenApiValue(value) {
  return encodeURIComponent(toOpenApiScalar(value));
}

function assertSafeHeader(name, value) {
  if (!OPENAPI_SAFE_HEADER_NAME.test(name)) {
    throw new HttpError(400, `Invalid header name ${name}`);
  }

  const normalized = Array.isArray(value) ? value.join(', ') : String(value ?? '');
  if (/[\r\n]/.test(normalized)) {
    throw new HttpError(400, `Invalid header value for ${name}`);
  }
  return normalized;
}

function getOpenApiTemplateTokens(template) {
  if (OPENAPI_TEMPLATE_CACHE.has(template)) {
    return OPENAPI_TEMPLATE_CACHE.get(template);
  }

  const tokens = [];
  const pattern = /\{([^}]+)\}/g;
  let lastIndex = 0;
  let match;
  while ((match = pattern.exec(template)) !== null) {
    if (match.index > lastIndex) {
      tokens.push({ type: 'text', value: template.slice(lastIndex, match.index) });
    }
    tokens.push({ type: 'param', name: match[1] });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < template.length) {
    tokens.push({ type: 'text', value: template.slice(lastIndex) });
  }

  OPENAPI_TEMPLATE_CACHE.set(template, tokens);
  return tokens;
}

function serializeSimpleParameter(value, explode = false) {
  if (Array.isArray(value)) {
    return value.map((item) => encodeOpenApiValue(item)).join(',');
  }

  if (value && typeof value === 'object') {
    const entries = Object.entries(value);
    if (explode) {
      return entries.map(([key, item]) => `${encodeOpenApiValue(key)}=${encodeOpenApiValue(item)}`).join(',');
    }
    return entries.flatMap(([key, item]) => [encodeOpenApiValue(key), encodeOpenApiValue(item)]).join(',');
  }

  return encodeOpenApiValue(value);
}

function serializeFormParameter(name, value, explode = true) {
  if (Array.isArray(value)) {
    if (explode) {
      return value.map((item) => [name, toOpenApiScalar(item)]);
    }
    return [[name, value.map((item) => toOpenApiScalar(item)).join(',')]];
  }

  if (value && typeof value === 'object') {
    const entries = Object.entries(value).map(([key, item]) => [key, toOpenApiScalar(item)]);
    if (explode) {
      return entries;
    }
    return [[name, entries.flat().join(',')]];
  }

  return [[name, toOpenApiScalar(value)]];
}

function applyOpenApiPath(targetPath, pathParams = {}, parameterOptions = {}) {
  return getOpenApiTemplateTokens(targetPath).map((token) => {
    if (token.type === 'text') {
      return token.value;
    }

    if (!Object.prototype.hasOwnProperty.call(pathParams, token.name)) {
      throw new HttpError(400, `Missing path parameter ${token.name}`);
    }

    const options = parameterOptions[token.name] ?? {};
    return serializeSimpleParameter(pathParams[token.name], options.explode ?? false);
  }).join('');
}

function applyOpenApiQuery(targetUrl, query = {}, parameterOptions = {}) {
  for (const [name, value] of Object.entries(query ?? {})) {
    if (value === undefined || value === null) {
      continue;
    }

    const options = parameterOptions[name] ?? {};
    const style = options.style ?? 'form';
    const explode = options.explode ?? true;

    if (style !== 'form') {
      throw new HttpError(400, `Unsupported query style ${style} for ${name}`);
    }

    for (const [key, item] of serializeFormParameter(name, value, explode)) {
      targetUrl.searchParams.append(key, item);
    }
  }
}

function applyOpenApiHeaders(headers, nextHeaders = {}, parameterOptions = {}) {
  for (const [name, value] of Object.entries(nextHeaders ?? {})) {
    if (value === undefined || value === null) {
      continue;
    }

    const options = parameterOptions[name] ?? {};
    const serialized = serializeSimpleParameter(value, options.explode ?? false);
    headers.set(name, assertSafeHeader(name, decodeURIComponent(serialized)));
  }
}

function serializeCookieHeader(cookies = {}, parameterOptions = {}) {
  const parts = [];
  for (const [name, value] of Object.entries(cookies ?? {})) {
    if (value === undefined || value === null) {
      continue;
    }

    const options = parameterOptions[name] ?? {};
    const explode = options.explode ?? true;
    for (const [key, item] of serializeFormParameter(name, value, explode)) {
      const safeName = assertSafeHeader(key, key);
      const safeValue = assertSafeHeader(key, item);
      parts.push(`${safeName}=${encodeURIComponent(safeValue)}`);
    }
  }
  return parts.join('; ');
}

function createOpenApiFormBody(payload = {}, asMultipart = false) {
  if (payload instanceof FormData || payload instanceof URLSearchParams) {
    return payload;
  }

  if (asMultipart) {
    const formData = new FormData();
    for (const [key, value] of Object.entries(payload ?? {})) {
      if (value === undefined || value === null) {
        continue;
      }
      if (Array.isArray(value)) {
        for (const item of value) {
          formData.append(key, typeof item === 'object' && !(item instanceof Blob) ? JSON.stringify(item) : item);
        }
        continue;
      }
      formData.append(key, typeof value === 'object' && !(value instanceof Blob) ? JSON.stringify(value) : value);
    }
    return formData;
  }

  return new URLSearchParams(Object.entries(payload ?? {}).flatMap(([key, value]) => {
    if (value === undefined || value === null) {
      return [];
    }
    if (Array.isArray(value)) {
      return value.map((item) => [key, toOpenApiScalar(item)]);
    }
    return [[key, toOpenApiScalar(value)]];
  }));
}

function createRpcHelpers(appRoot, serverOrigin, authState) {
  const storage = createStorageHelpers((specifier) => resolveAppSpecifier(specifier, appRoot));
  const request = async (method, url, payload, options = {}) => {
    const requestOptions = mergeHttpOptions({}, options);
    const targetUrl = new URL(url, serverOrigin);
    const effectivePayload = requestOptions.payload ?? payload;
    const headers = new Headers({
      Accept: createServerAcceptHeader(requestOptions.resultMode),
      'X-Requested-With': 'Brackets',
      'Datastar-Request': 'true',
      ...(requestOptions.headers ?? {})
    });

    let body;
    if (method === 'GET' || method === 'HEAD') {
      appendUrlPayload(targetUrl, effectivePayload);
    } else if (requestOptions.contentType === 'form' || requestOptions.contentType === 'application/x-www-form-urlencoded') {
      body = createOpenApiFormBody(effectivePayload, false);
      headers.set('Content-Type', 'application/x-www-form-urlencoded; charset=utf-8');
    } else if (requestOptions.contentType === 'multipart/form-data' || effectivePayload instanceof FormData) {
      body = createOpenApiFormBody(effectivePayload, true);
    } else if (requestOptions.contentType === 'text/plain') {
      headers.set('Content-Type', 'text/plain; charset=utf-8');
      body = typeof effectivePayload === 'string' ? effectivePayload : toOpenApiScalar(effectivePayload);
    } else if (requestOptions.contentType === 'application/octet-stream') {
      headers.set('Content-Type', 'application/octet-stream');
      body = effectivePayload;
    } else if (effectivePayload !== undefined) {
      headers.set('Content-Type', 'application/json');
      body = JSON.stringify(effectivePayload);
    }

    const response = await fetch(targetUrl, {
      method,
      headers,
      body
    });

    const contentType = response.headers.get('content-type') ?? '';
    const responsePayload = contentType.includes('application/json')
      ? await response.json().catch(() => ({}))
      : await response.text();

    if (!response.ok) {
      throw createRpcHttpError(response, responsePayload);
    }

    return responsePayload;
  };

  const createClient = (baseUrl = '', defaults = {}) => {
    const normalizedBaseUrl = /^https?:\/\//.test(baseUrl)
      ? baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`
      : `${String(baseUrl || '').replace(/\/+$/, '')}/`;
    const baseTarget = new URL(normalizedBaseUrl || '.', serverOrigin);
    const resolveUrl = (next = '') => {
      if (/^https?:\/\//.test(next)) {
        return next;
      }
      const normalizedNext = String(next || '').replace(/^\/+/, '');
      return new URL(normalizedNext || '.', baseTarget).href;
    };
    const operation = (definition = {}) => {
      const {
        method = 'GET',
        path: operationPath = '',
        url = operationPath,
        params,
        pathParams = params,
        query,
        headers,
        cookies,
        body,
        requestBody = body,
        contentType,
        accept,
        resultMode,
        parameterOptions = {},
        allowBody = false
      } = definition;

      const upperMethod = String(method).toUpperCase();
      if ((upperMethod === 'GET' || upperMethod === 'HEAD') && requestBody !== undefined && !allowBody) {
        throw new HttpError(400, `${upperMethod} requests should not send a request body`);
      }

      const resolvedPath = applyOpenApiPath(url, pathParams ?? {}, parameterOptions.path ?? {});
      const operationUrl = new URL(resolveUrl(resolvedPath));
      applyOpenApiQuery(operationUrl, query, parameterOptions.query ?? {});

      const mergedOptions = mergeHttpOptions(defaults, {
        contentType,
        resultMode
      });
      const headerBag = new Headers();
      for (const [name, value] of Object.entries(defaults.headers ?? {})) {
        if (value !== undefined && value !== null) {
          headerBag.set(name, assertSafeHeader(name, value));
        }
      }
      applyOpenApiHeaders(headerBag, headers, parameterOptions.header ?? {});

      if (accept) {
        headerBag.set('Accept', assertSafeHeader('Accept', accept));
      }

      const cookieHeader = serializeCookieHeader(cookies, parameterOptions.cookie ?? {});
      if (cookieHeader) {
        headerBag.set('Cookie', [headerBag.get('Cookie'), cookieHeader].filter(Boolean).join('; '));
      }

      mergedOptions.headers = Object.fromEntries(headerBag.entries());

      if (resultMode === 'sse') {
        return {
          type: 'sse',
          url: operationUrl.href,
          options: mergedOptions
        };
      }

      return request(upperMethod, operationUrl.href, requestBody, mergedOptions);
    };
    return {
      operation,
      request(method, url = '', payload, options = {}) {
        return request(method, resolveUrl(url), payload, mergeHttpOptions(defaults, options));
      },
      get(url = '', options) {
        return this.request('GET', url, undefined, options);
      },
      post(url = '', payload, options) {
        return this.request('POST', url, payload, options);
      },
      put(url = '', payload, options) {
        return this.request('PUT', url, payload, options);
      },
      patch(url = '', payload, options) {
        return this.request('PATCH', url, payload, options);
      },
      delete(url = '', payload, options) {
        return this.request('DELETE', url, payload, options);
      },
      create(url = '', payload, options) {
        return this.post(url, payload, options);
      },
      update(url = '', payload, options) {
        return this.put(url, payload, options);
      },
      read(url = '', options = {}) {
        return {
          type: 'sse',
          url: resolveUrl(url),
          options: mergeHttpOptions(defaults, options)
        };
      },
      sse(url = '', options = {}) {
        return this.read(url, options);
      },
      openapi(definition = {}) {
        return operation(definition);
      }
    };
  };

  return {
    http: {
      request,
      get(url, options) {
        return this.request('GET', url, undefined, options);
      },
      post(url, payload, options) {
        return this.request('POST', url, payload, options);
      },
      put(url, payload, options) {
        return this.request('PUT', url, payload, options);
      },
      patch(url, payload, options) {
        return this.request('PATCH', url, payload, options);
      },
      delete(url, payload, options) {
        return this.request('DELETE', url, payload, options);
      },
      read(url, options = {}) {
        return {
          type: 'sse',
          url: new URL(url, serverOrigin).href,
          options
        };
      },
      sse(url, options = {}) {
        return this.read(url, options);
      },
      client(baseUrl, defaults = {}) {
        return createClient(baseUrl, defaults);
      },
      resource(baseUrl, defaults = {}) {
        return createClient(baseUrl, defaults);
      },
      openapi(baseUrl, defaults = {}) {
        return createClient(baseUrl, defaults);
      },
      operation(definition = {}) {
        return createClient('', {}).operation(definition);
      }
    },
    storage,
    auth: {
      session() {
        return authState;
      },
      isAuthenticated() {
        return Boolean(authState?.authenticated);
      },
      csrf() {
        return authState?.csrfToken ?? null;
      }
    }
  };
}

function isSameOriginRequest(req, serverOrigin) {
  const fetchSite = req.headers['sec-fetch-site'];
  if (fetchSite === 'cross-site') {
    return false;
  }

  if ((fetchSite === 'same-site' || fetchSite === 'none') && !SAFE_METHODS.has(req.method ?? 'GET')) {
    return false;
  }

  const origin = req.headers.origin;
  if (origin && origin !== serverOrigin) {
    return false;
  }

  const referer = req.headers.referer;
  if (referer) {
    try {
      if (new URL(referer).origin !== serverOrigin) {
        return false;
      }
    } catch {
      return false;
    }
  }

  return true;
}

function validateRpcPayload(payload) {
  const { kind, moduleUrl, method, args = [] } = payload ?? {};
  const issues = [];

  if (!['api', 'data'].includes(kind)) {
    issues.push(createIssue('rpc.kind', '"api" or "data"', JSON.stringify(kind)));
  }

  if (typeof method !== 'string' || !/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(method)) {
    issues.push(createIssue('rpc.method', 'a valid exported method name', JSON.stringify(method)));
  }

  if (typeof moduleUrl !== 'string' || (kind && !moduleUrl.startsWith(RPC_PREFIXES[kind] ?? ''))) {
    issues.push(createIssue('rpc.moduleUrl', 'a valid Brackets RPC module path', JSON.stringify(moduleUrl)));
  } else {
    if (kind === 'api' && !moduleUrl.endsWith('.api')) {
      issues.push(createIssue('rpc.moduleUrl', 'a .api module path', JSON.stringify(moduleUrl)));
    }

    if (kind === 'data' && !moduleUrl.endsWith('.data')) {
      issues.push(createIssue('rpc.moduleUrl', 'a .data module path', JSON.stringify(moduleUrl)));
    }
  }

  if (!Array.isArray(args)) {
    issues.push(createIssue('rpc.args', 'an array', typeof args));
  }

  throwContractIssues('Brackets RPC payload is invalid', issues, {
    code: 'BRACKETS_RPC_INVALID',
    statusCode: 400,
    hint: 'RPC requests must target /app/api/*.api or /app/data/*.data and pass args as an array.'
  });
}

async function invokeRpc(appRoot, payload, serverOrigin, authState) {
  validateRpcPayload(payload);
  const { kind, moduleUrl, method, args = [] } = payload;

  const filePath = cleanJoin(appRoot, moduleUrl.replace(/^\/app\//, ''));
  const exported = await loadDefaultExport(filePath);
  const callable = exported?.[method];
  if (typeof callable !== 'function') {
    throw new HttpError(404, `Missing ${kind} method ${method} in ${moduleUrl}`);
  }

  const helpers = createRpcHelpers(appRoot, serverOrigin, authState);
  return callable(helpers, ...args);
}

function buildImportMap() {
  return {
    imports: {
      '@views/': '/app/views/',
      '@routes/': '/app/routes/',
      '@logic/': '/app/logic/',
      '@api/': '/app/api/',
      '@data/': '/app/data/',
      '@pages/': '/app/pages/',
      '@layouts/': '/app/layouts/',
      '@components/': '/app/components/',
      '@storage/': '/app/storage/',
      '@brackets/': '/framework/'
    }
  };
}

function configLabel(filePath) {
  if (!filePath) {
    return 'config/brackets.yaml';
  }

  const normalized = filePath.split(path.sep).join('/');
  const marker = normalized.lastIndexOf('/config/');
  if (marker >= 0) {
    return normalized.slice(marker + 1);
  }

  return path.basename(filePath);
}

function renderTemplate(source, values) {
  return source.replace(/\{\{([A-Z0-9_]+)\}\}/g, (_, key) => values[key] ?? '');
}

async function shellHtml(cache, { csrfToken = '', session = null, host = null, appConfig = null, appConfigPath = null } = {}) {
  const template = await readCachedFile(cache, path.join(FRAMEWORK_DEMO_DIR, 'splash.html'), () => readFile(path.join(FRAMEWORK_DEMO_DIR, 'splash.html'), 'utf8'));
  const branding = appConfig?.branding ?? {};
  const splash = appConfig?.splash ?? {};
  const chips = (splash.chips ?? []).slice(0, 3);
  const hints = (splash.hints ?? []).slice(0, 3);
  const hostOrigin = host?.origin ?? '';
  return renderTemplate(template, {
    TITLE: safeText(branding.title ?? 'Brackets'),
    THEME_COLOR: safeText(branding.accent ?? '#c4512c'),
    FAVICON_PATH: '/framework/demo/favicon.svg',
    CSRF_TOKEN: safeText(csrfToken),
    SESSION_JSON: safeText(JSON.stringify(session ?? { authenticated: false, user: null })),
    HOST_JSON: safeText(JSON.stringify(host ?? {})),
    CONFIG_JSON: safeText(JSON.stringify(appConfig ?? {})),
    IMPORT_MAP_JSON: safeText(json(buildImportMap())),
    CANVAS: safeText(branding.canvas ?? '#f7efe3'),
    PANEL: safeText(branding.panel ?? '#fffaf4'),
    INK: safeText(branding.ink ?? '#1f1a17'),
    ACCENT: safeText(branding.accent ?? '#c4512c'),
    MUTED: safeText(branding.muted ?? '#6c6257'),
    NAME: safeText(branding.name ?? 'Brackets'),
    LOGO_PATH: '/framework/demo/logo.svg',
    BRANDING_TITLE: safeText(branding.title ?? 'Brackets is ready'),
    TAGLINE: safeText(branding.tagline ?? 'Everything is working and ready to start building.'),
    CHIPS_HTML: chips.map((chip) => `<span class="brx-chip">${safeText(chip)}</span>`).join(''),
    CONFIG_LABEL: safeText(configLabel(appConfigPath)),
    ORIGIN: safeText(hostOrigin),
    HINTS_HTML: hints.map((hint) => `<li>${safeText(hint)}</li>`).join('')
  });
}

export async function createServer({
  appRoot,
  port,
  host,
  proxies = {},
  rpcBodyLimitBytes = DEFAULT_RPC_BODY_LIMIT_BYTES,
  proxyBodyLimitBytes = DEFAULT_PROXY_BODY_LIMIT_BYTES,
  allowProxyRedirects = false,
  auth = {}
}) {
  const resolvedAppRoot = path.resolve(appRoot);
  const { config: appConfig, filePath: appConfigPath } = await loadBracketsConfig(resolvedAppRoot);
  const resolvedHost = host ?? appConfig.server.host;
  const resolvedPort = port ?? appConfig.server.port;
  let serverOrigin = `http://${resolvedHost}:${resolvedPort}`;
  const sourceCache = new Map();
  const routeCache = {
    signature: null,
    bundle: null
  };
  const normalizedProxies = normalizeProxies(proxies, {
    proxyBodyLimitBytes: normalizeByteLimit(proxyBodyLimitBytes, DEFAULT_PROXY_BODY_LIMIT_BYTES),
    allowProxyRedirects
  });
  const normalizedRpcBodyLimitBytes = normalizeByteLimit(rpcBodyLimitBytes, DEFAULT_RPC_BODY_LIMIT_BYTES);
  const hostContract = buildHostContract(serverOrigin, resolvedAppRoot, appConfig);
  const defaultSession = auth.session ?? { authenticated: false, user: null };
  const csrfCookieName = auth.csrfCookieName ?? '__Host-brackets-csrf';
  const csrfHeaderName = auth.csrfHeaderName ?? 'x-brackets-csrf';

  const server = http.createServer(async (req, res) => {
    try {
      if (!req.url) {
        send(res, 400, 'text/plain; charset=utf-8', 'Missing URL');
        return;
      }

      for (const [prefix, proxyConfig] of Object.entries(normalizedProxies).sort((left, right) => right[0].length - left[0].length)) {
        if (req.url.startsWith(prefix)) {
          await proxyRequest(req, res, proxyConfig, prefix);
          return;
        }
      }

      const url = new URL(req.url, 'http://127.0.0.1');
      const cookies = parseCookies(req.headers.cookie ?? '');
      const csrfToken = cookies[csrfCookieName] ?? crypto.randomBytes(16).toString('hex');
      const sessionState = {
        ...defaultSession,
        csrfToken
      };

      if (url.pathname === '/framework/page.js' || url.pathname === '/__brackets/page.js') {
        const source = await readFile(path.resolve('src/page.js'), 'utf8');
        send(res, 200, 'text/javascript; charset=utf-8', source);
        return;
      }

      if (url.pathname === '/framework/runtime.js' || url.pathname === '/__brackets/runtime.js') {
        const source = await readFile(path.resolve('src/runtime/runtime.js'), 'utf8');
        send(res, 200, 'text/javascript; charset=utf-8', source);
        return;
      }

      if (url.pathname === '/framework/syntax.js') {
        const source = await readFile(path.resolve('src/syntax.js'), 'utf8');
        send(res, 200, 'text/javascript; charset=utf-8', source);
        return;
      }

      if (url.pathname === '/framework/datastar.js') {
        send(res, 200, 'text/javascript; charset=utf-8', datastarProxySource());
        return;
      }

      if (url.pathname === '/framework/demo/logo.svg' || url.pathname === '/framework/logo.svg') {
        send(res, 200, 'image/svg+xml', buildFrameworkLogoSvg(appConfig));
        return;
      }

      if (url.pathname === '/framework/demo/favicon.svg' || url.pathname === '/framework/favicon.svg') {
        send(res, 200, 'image/svg+xml', buildFrameworkFaviconSvg(appConfig));
        return;
      }

      if (url.pathname === '/framework/demo/splash.html') {
        send(res, 200, 'text/html; charset=utf-8', await shellHtml(sourceCache, {
          csrfToken,
          session: sessionState,
          host: hostContract,
          appConfig,
          appConfigPath
        }), true);
        return;
      }

      if (url.pathname === '/framework/docs.md') {
        const source = await readFile(path.resolve('docs.md'), 'utf8');
        send(res, 200, 'text/markdown; charset=utf-8', source);
        return;
      }

      if (url.pathname === '/framework/agents.md') {
        const source = await readFile(path.resolve('docs/agents.md'), 'utf8');
        send(res, 200, 'text/markdown; charset=utf-8', source);
        return;
      }

      if (url.pathname === '/config/brackets.json' || url.pathname === '/__brackets/routes') {
        const { routes, router } = await buildRouterBundle(resolvedAppRoot, routeCache);
        send(res, 200, 'application/json; charset=utf-8', json({
          framework: 'Brackets',
          server: {
            host: resolvedHost,
            port: resolvedPort
          },
          branding: appConfig.branding,
          splash: appConfig.splash,
          security: appConfig.security,
          assets: {
            logo: '/framework/demo/logo.svg',
            favicon: '/framework/demo/favicon.svg',
            splash: '/framework/demo/splash.html'
          },
          router,
          routes,
          importMap: buildImportMap(),
          host: hostContract
        }));
        return;
      }

      if (url.pathname === '/__brackets/session') {
        send(res, 200, 'application/json; charset=utf-8', json(sessionState), true, {
          'Set-Cookie': `${csrfCookieName}=${encodeURIComponent(csrfToken)}; Path=/; SameSite=Lax; HttpOnly`
        });
        return;
      }

      if (url.pathname === '/__brackets/host') {
        send(res, 200, 'application/json; charset=utf-8', json(hostContract));
        return;
      }

      if (url.pathname === '/__brackets/debug') {
        const { routes, router } = await buildRouterBundle(resolvedAppRoot, routeCache);
        send(res, 200, 'application/json; charset=utf-8', json({
          framework: hostContract.framework,
          version: hostContract.version,
          host: hostContract,
          router,
          session: {
            authenticated: Boolean(sessionState.authenticated),
            user: sessionState.user ?? null
          },
          routes
        }));
        return;
      }

      if (url.pathname === '/__brackets/schema/page-manifest.json') {
        send(res, 200, 'application/schema+json; charset=utf-8', json(PAGE_MANIFEST_SCHEMA));
        return;
      }

      if (url.pathname === '/__brackets/rpc' && req.method === 'POST') {
        if (!isSameOriginRequest(req, serverOrigin)) {
          throw new HttpError(403, 'Blocked cross-origin RPC request');
        }
        if ((req.headers[csrfHeaderName] ?? '') !== csrfToken) {
          throw new HttpError(403, 'Blocked RPC request with invalid CSRF token');
        }
        const payload = await parseBody(req, normalizedRpcBodyLimitBytes);
        const result = await invokeRpc(resolvedAppRoot, payload, serverOrigin, sessionState);
        send(res, 200, 'application/json; charset=utf-8', json({ result }));
        return;
      }

      if (url.pathname === '/sitemap.xml') {
        const { routes } = await buildRouterBundle(resolvedAppRoot, routeCache);
        send(res, 200, 'application/xml; charset=utf-8', buildSitemapXml(routes, serverOrigin));
        return;
      }

      if (url.pathname === '/manifest.webmanifest') {
        const { routes } = await buildRouterBundle(resolvedAppRoot, routeCache);
        send(res, 200, 'application/manifest+json; charset=utf-8', json(buildWebManifest(routes, serverOrigin, path.basename(resolvedAppRoot))));
        return;
      }

      if (url.pathname === '/feed.xml') {
        const { routes } = await buildRouterBundle(resolvedAppRoot, routeCache);
        send(res, 200, 'application/xml; charset=utf-8', buildFeedXml(routes, serverOrigin));
        return;
      }

      if (url.pathname === '/robots.txt') {
        send(res, 200, 'text/plain; charset=utf-8', buildRobotsTxt(serverOrigin));
        return;
      }

      if (url.pathname === '/.well-known/brackets-host.json') {
        send(res, 200, 'application/json; charset=utf-8', json(hostContract));
        return;
      }

      if (url.pathname === '/.well-known/brackets-app.json') {
        const { routes, router } = await buildRouterBundle(resolvedAppRoot, routeCache);
        send(res, 200, 'application/json; charset=utf-8', json({
          framework: hostContract.framework,
          version: hostContract.version,
          appRoot: path.basename(resolvedAppRoot),
          distribution: hostContract.distribution,
          router,
          routes: routes.map((route) => ({
            id: route.id,
            route: route.route,
            title: route.title
          }))
        }));
        return;
      }

      if (url.pathname === '/service-worker.js') {
        const serviceWorkerPath = path.join(resolvedAppRoot, 'service-worker.js');
        if (existsSync(serviceWorkerPath)) {
          const source = await readCachedFile(sourceCache, serviceWorkerPath, () => readFile(serviceWorkerPath, 'utf8'));
          send(res, 200, 'text/javascript; charset=utf-8', source, true, {
            'Service-Worker-Allowed': '/',
            'Cache-Control': 'no-cache'
          });
          return;
        }
      }

      if (url.pathname.startsWith('/app/')) {
        const filePath = cleanJoin(resolvedAppRoot, url.pathname.replace(/^\/app\//, ''));
        const extension = path.extname(filePath);
        const extraHeaders = {};
        if (url.searchParams.has('download')) {
          const filename = sanitizeDownloadFilename(url.searchParams.get('download'), path.basename(filePath));
          extraHeaders['Content-Disposition'] = `attachment; filename="${filename}"`;
        }

        if (!existsSync(filePath)) {
          send(res, 404, 'text/plain; charset=utf-8', `Missing ${url.pathname}`);
          return;
        }

        if (MODULE_EXTENSIONS.has(extension)) {
          const browserSource = await readCachedFile(sourceCache, filePath, async () => {
            const source = await readFile(filePath, 'utf8');
            return toModuleSource(source, extension, true);
          });
          send(res, 200, 'text/javascript; charset=utf-8', browserSource, true, extraHeaders);
          return;
        }

        if (extension === '.html') {
          const transformed = await readCachedFile(sourceCache, filePath, async () => {
            const source = await readFile(filePath, 'utf8');
            return transformHtmlSyntax(source);
          });
          if (url.searchParams.get('inspect') === '1') {
            send(res, 200, 'text/plain; charset=utf-8', transformed, true, extraHeaders);
            return;
          }
          send(res, 200, 'text/html; charset=utf-8', transformed, true, extraHeaders);
          return;
        }

        const body = TEXT_EXTENSIONS.has(extension)
          ? await readCachedFile(sourceCache, filePath, () => readFile(filePath, 'utf8'))
          : await readFile(filePath);
        send(res, 200, MIME_TYPES.get(extension) ?? 'application/octet-stream', body, true, extraHeaders);
        return;
      }

      if (req.method === 'GET') {
        send(res, 200, 'text/html; charset=utf-8', await shellHtml(sourceCache, {
          csrfToken,
          session: sessionState,
          host: hostContract,
          appConfig,
          appConfigPath
        }), true, {
          'Set-Cookie': `${csrfCookieName}=${encodeURIComponent(csrfToken)}; Path=/; SameSite=Lax; HttpOnly`
        });
        return;
      }

      send(res, 404, 'text/plain; charset=utf-8', 'Not found');
    } catch (error) {
      const statusCode = error?.statusCode ?? 500;
      const payload = {
        error: error.message
      };
      if (error instanceof BracketsError) {
        payload.code = error.code;
        payload.issues = error.issues;
        payload.hint = error.hint;
      }
      send(res, statusCode, 'application/json; charset=utf-8', json(payload));
    }
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(resolvedPort, resolvedHost, resolve);
  });

  const address = server.address();
  const actualPort = typeof address === 'object' && address ? address.port : resolvedPort;
  serverOrigin = `http://${resolvedHost}:${actualPort}`;
  hostContract.origin = serverOrigin;

  return {
    server,
    url: serverOrigin,
    async close() {
      closeStorageAdapters();
      await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  };
}
