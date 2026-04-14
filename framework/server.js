import http from 'node:http';
import path from 'node:path';
import vm from 'node:vm';
import { existsSync, watch } from 'node:fs';
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { networkInterfaces } from 'node:os';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { transformHtmlSyntax } from './syntax.js';
import { BRACKETS_VERSION, buildVersionSnapshot } from './version.js';

const PACKAGE_ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const FRAMEWORK_ROOT = path.resolve(fileURLToPath(new URL('.', import.meta.url)));
const FRAMEWORK_DEMO_DIR = path.join(FRAMEWORK_ROOT, 'demo');
const FRAMEWORK_DATASTAR_PATH = path.join(FRAMEWORK_ROOT, 'datastar.js');
const FRAMEWORK_RUNTIME_PATH = path.join(FRAMEWORK_ROOT, 'runtime.js');
const FRAMEWORK_SYNTAX_PATH = path.join(FRAMEWORK_ROOT, 'syntax.js');
const FRAMEWORK_VERSION_PATH = path.join(FRAMEWORK_ROOT, 'version.js');
const STATIC_SAFE_EXTENSIONS = new Set([
  '.css',
  '.gif',
  '.html',
  '.ico',
  '.jpeg',
  '.jpg',
  '.js',
  '.json',
  '.map',
  '.md',
  '.png',
  '.svg',
  '.txt',
  '.webmanifest',
  '.yaml',
  '.yml'
]);
const MIME_TYPES = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.gif', 'image/gif'],
  ['.html', 'text/html; charset=utf-8'],
  ['.ico', 'image/x-icon'],
  ['.jpeg', 'image/jpeg'],
  ['.jpg', 'image/jpeg'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.map', 'application/json; charset=utf-8'],
  ['.md', 'text/markdown; charset=utf-8'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
  ['.txt', 'text/plain; charset=utf-8'],
  ['.webmanifest', 'application/manifest+json; charset=utf-8'],
  ['.yaml', 'text/yaml; charset=utf-8'],
  ['.yml', 'text/yaml; charset=utf-8']
]);
const STORAGE_LOCKS = new Map();
const ROUTE_MARKUP_CACHE = new Map();
const TEMPLATE_MARKUP_CACHE = new Map();
const MAX_RPC_BODY_BYTES = 1024 * 1024;
const DEFAULT_RESPONSE_HEADERS = Object.freeze({
  'Cache-Control': 'no-cache',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY'
});

const DEFAULT_BRACKETS_CONFIG = Object.freeze({
  framework: 'Brackets',
  version: BRACKETS_VERSION,
  app: 'app',
  runtime: 'embedded',
  mode: 'dynamic',
  engine: 'deno',
  host: '127.0.0.1',
  port: 4173,
  entry: {
    folder: '.',
    route: '/',
    autoStart: false
  },
  branding: {
    name: 'Brackets',
    title: 'Brackets',
    tagline: 'No build step. HTML first. Datastar underneath.',
    accent: '#714cb6',
    accentSoft: '#cdb8f3',
    canvas: '#fcfaf7',
    panel: '#ffffff',
    ink: '#241013',
    muted: '#5b5361'
  },
  splash: {
    enabled: true,
    chips: [
      'No build step',
      'Datastar engine',
      'Built-in Deno host'
    ],
    hints: [
      'Edit files in app/',
      'Keep templates in .html and behavior in .logic',
      'Use .data for local models and .api for backend transport'
    ]
  },
  security: {
    html: 'sanitize',
    storage: {
      keyEnv: 'BRACKETS_DATA_KEY',
      pbkdf2Iterations: 250000
    },
    headers: {
      contentSecurityPolicy: '',
      strictTransportSecurity: '',
      permissionsPolicy: ''
    }
  },
  health: {
    hostWarnMs: 420,
    hostFailMs: 850,
    appWarnMs: 520,
    appFailMs: 950
  },
  external: {
    origin: ''
  },
  watch: {
    enabled: false,
    reload: false
  }
});

function cloneDefaultConfig() {
  return JSON.parse(JSON.stringify(DEFAULT_BRACKETS_CONFIG));
}

function cleanYamlLine(rawLine) {
  let quote = null;
  let escape = false;
  let output = '';

  for (const char of String(rawLine ?? '')) {
    if (quote) {
      output += char;
      if (escape) {
        escape = false;
      } else if (char === '\\') {
        escape = true;
      } else if (char === quote) {
        quote = null;
      }
      continue;
    }

    if (char === '"' || char === '\'') {
      quote = char;
      output += char;
      continue;
    }

    if (char === '#') {
      break;
    }

    output += char;
  }

  return output.replace(/\s+$/g, '');
}

function parseYamlScalar(rawValue) {
  const value = String(rawValue ?? '').trim();
  if (!value) {
    return '';
  }
  if (value === 'true') {
    return true;
  }
  if (value === 'false') {
    return false;
  }
  if (value === 'null') {
    return null;
  }
  if (/^-?\d+(?:\.\d+)?$/.test(value)) {
    return Number(value);
  }
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith('\'') && value.endsWith('\''))) {
    return value.slice(1, -1);
  }
  return value;
}

export function parseYaml(source) {
  const lines = String(source ?? '')
    .replace(/\r/g, '')
    .split('\n')
    .map((rawLine, index) => {
      const cleaned = cleanYamlLine(rawLine);
      if (!cleaned.trim()) {
        return null;
      }
      return {
        index,
        indent: cleaned.match(/^ */)?.[0].length ?? 0,
        text: cleaned.trim()
      };
    })
    .filter(Boolean);

  let cursor = 0;

  function parseObject(indent, seed = {}) {
    const output = seed;

    while (cursor < lines.length) {
      const line = lines[cursor];
      if (line.indent < indent) {
        break;
      }
      if (line.indent !== indent || line.text.startsWith('- ')) {
        break;
      }

      const separator = line.text.indexOf(':');
      if (separator === -1) {
        throw new Error(`Invalid YAML at line ${line.index + 1}`);
      }

      const key = line.text.slice(0, separator).trim();
      const remainder = line.text.slice(separator + 1).trim();
      cursor += 1;

      if (remainder) {
        output[key] = parseYamlScalar(remainder);
        continue;
      }

      if (cursor < lines.length && lines[cursor].indent > indent) {
        output[key] = parseNode(indent + 2);
      } else {
        output[key] = {};
      }
    }

    return output;
  }

  function parseArray(indent) {
    const output = [];

    while (cursor < lines.length) {
      const line = lines[cursor];
      if (line.indent < indent) {
        break;
      }
      if (line.indent !== indent || !line.text.startsWith('- ')) {
        break;
      }

      const remainder = line.text.slice(2).trim();
      cursor += 1;

      if (!remainder) {
        output.push(cursor < lines.length && lines[cursor].indent > indent ? parseNode(indent + 2) : null);
        continue;
      }

      const separator = remainder.indexOf(':');
      if (separator > 0 && !remainder.startsWith('"') && !remainder.startsWith('\'')) {
        const key = remainder.slice(0, separator).trim();
        const value = remainder.slice(separator + 1).trim();
        const seed = {};
        if (value) {
          seed[key] = parseYamlScalar(value);
        } else if (cursor < lines.length && lines[cursor].indent > indent) {
          seed[key] = parseNode(indent + 4);
        } else {
          seed[key] = {};
        }
        output.push(parseObject(indent + 2, seed));
        continue;
      }

      output.push(parseYamlScalar(remainder));
    }

    return output;
  }

  function parseNode(indent) {
    if (cursor >= lines.length || lines[cursor].indent < indent) {
      return {};
    }
    return lines[cursor].text.startsWith('- ')
      ? parseArray(indent)
      : parseObject(indent);
  }

  return parseNode(0);
}

function arrayOfText(value, fallback) {
  if (!Array.isArray(value)) {
    return [...fallback];
  }
  const next = value
    .map((entry) => String(entry ?? '').trim())
    .filter(Boolean);
  return next.length ? next : [...fallback];
}

function numberOrFallback(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeBracketsConfig(rawConfig = {}) {
  const defaults = cloneDefaultConfig();
  const raw = rawConfig && typeof rawConfig === 'object' ? rawConfig : {};
  const rawServer = raw.server && typeof raw.server === 'object' ? raw.server : {};
  const rawEntry = raw.entry && typeof raw.entry === 'object' ? raw.entry : {};
  const rawBranding = raw.branding && typeof raw.branding === 'object' ? raw.branding : {};
  const rawSplash = raw.splash && typeof raw.splash === 'object' ? raw.splash : {};
  const rawSecurity = raw.security && typeof raw.security === 'object' ? raw.security : {};
  const rawStorage = rawSecurity.storage && typeof rawSecurity.storage === 'object' ? rawSecurity.storage : {};
  const rawSecurityHeaders = rawSecurity.headers && typeof rawSecurity.headers === 'object' ? rawSecurity.headers : {};
  const rawHealth = raw.health && typeof raw.health === 'object' ? raw.health : {};
  const rawExternal = raw.external && typeof raw.external === 'object' ? raw.external : {};
  const rawWatch = raw.watch && typeof raw.watch === 'object' ? raw.watch : {};

  const runtime = String(raw.runtime ?? rawServer.runtime ?? defaults.runtime).trim() || defaults.runtime;
  const mode = String(raw.mode ?? rawServer.mode ?? defaults.mode).trim() || defaults.mode;
  const engine = String(raw.engine ?? rawServer.engine ?? defaults.engine).trim() || defaults.engine;
  const host = String(raw.host ?? rawServer.host ?? defaults.host).trim() || defaults.host;
  const port = numberOrFallback(raw.port ?? rawServer.port, defaults.port);
  const entryFolder = String(rawEntry.folder ?? defaults.entry.folder).trim() || defaults.entry.folder;
  const entryRoute = normalizePublicPath(rawEntry.route ?? defaults.entry.route);

  const config = {
    framework: String(raw.framework ?? defaults.framework),
    version: String(raw.version ?? BRACKETS_VERSION),
    app: String(raw.app ?? defaults.app).trim() || defaults.app,
    runtime,
    mode,
    engine,
    host,
    port,
    entry: {
      folder: entryFolder,
      route: entryRoute,
      autoStart: rawEntry.autoStart === true
    },
    branding: {
      ...defaults.branding,
      ...Object.fromEntries(Object.entries(rawBranding).map(([key, value]) => [key, String(value ?? '')]))
    },
    splash: {
      enabled: rawSplash.enabled !== false,
      chips: arrayOfText(rawSplash.chips, defaults.splash.chips),
      hints: arrayOfText(rawSplash.hints, defaults.splash.hints)
    },
    security: {
      html: rawSecurity.html === 'trusted' ? 'trusted' : defaults.security.html,
      storage: {
        keyEnv: String(rawStorage.keyEnv ?? defaults.security.storage.keyEnv).trim() || defaults.security.storage.keyEnv,
        pbkdf2Iterations: Math.max(1, numberOrFallback(rawStorage.pbkdf2Iterations, defaults.security.storage.pbkdf2Iterations))
      },
      headers: {
        contentSecurityPolicy: String(rawSecurityHeaders.contentSecurityPolicy ?? defaults.security.headers.contentSecurityPolicy ?? '').trim(),
        strictTransportSecurity: String(rawSecurityHeaders.strictTransportSecurity ?? defaults.security.headers.strictTransportSecurity ?? '').trim(),
        permissionsPolicy: String(rawSecurityHeaders.permissionsPolicy ?? defaults.security.headers.permissionsPolicy ?? '').trim()
      }
    },
    health: {
      hostWarnMs: Math.max(1, numberOrFallback(rawHealth.hostWarnMs, defaults.health.hostWarnMs)),
      hostFailMs: Math.max(1, numberOrFallback(rawHealth.hostFailMs, defaults.health.hostFailMs)),
      appWarnMs: Math.max(1, numberOrFallback(rawHealth.appWarnMs, defaults.health.appWarnMs)),
      appFailMs: Math.max(1, numberOrFallback(rawHealth.appFailMs, defaults.health.appFailMs))
    },
    external: {
      origin: String(rawExternal.origin ?? '').trim()
    },
    watch: {
      enabled: rawWatch.enabled === true,
      reload: rawWatch.reload === true
    }
  };

  config.server = {
    host: config.host,
    port: config.port,
    runtime: config.runtime,
    mode: config.mode,
    engine: config.engine,
    external: config.external
  };

  return config;
}

async function loadBracketsConfig(packageRoot) {
  const candidates = [
    path.join(packageRoot, 'config.yaml'),
    path.join(packageRoot, 'config.yml'),
    path.join(packageRoot, 'config.json'),
    path.join(packageRoot, 'config', 'brackets.yaml'),
    path.join(packageRoot, 'config', 'brackets.yml'),
    path.join(packageRoot, 'config', 'brackets.json')
  ];

  for (const filePath of candidates) {
    if (!existsSync(filePath)) {
      continue;
    }

    const source = await readText(filePath);
    const parsed = filePath.endsWith('.json')
      ? JSON.parse(source)
      : parseYaml(source);

    return {
      filePath,
      config: normalizeBracketsConfig(parsed)
    };
  }

  return {
    filePath: null,
    config: normalizeBracketsConfig()
  };
}

function json(value) {
  return JSON.stringify(value, null, 2);
}

function safeText(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function scriptJson(value) {
  return JSON.stringify(value ?? {})
    .replace(/</g, '\\u003c')
    .replace(/<\/script/gi, '<\\/script');
}

function toPosix(value) {
  return String(value ?? '').replace(/\\/g, '/');
}

function normalizePublicPath(value) {
  const pathname = `/${String(value ?? '').replace(/^\/+/, '')}`;
  return pathname === '/index.html' ? '/' : pathname;
}

function parseCookies(value) {
  return Object.fromEntries(
    String(value ?? '')
      .split(';')
      .map((chunk) => chunk.trim())
      .filter(Boolean)
      .map((chunk) => {
        const index = chunk.indexOf('=');
        return index === -1
          ? [chunk, '']
          : [chunk.slice(0, index), decodeURIComponent(chunk.slice(index + 1))];
      })
  );
}

function resolveCsrfCookie(cookies) {
  return cookies['__Host-brackets_csrf']
    ?? cookies['__Secure-brackets_csrf']
    ?? cookies.brackets_csrf
    ?? null;
}

function buildCsrfCookie(req, token) {
  const secure = req.socket?.encrypted === true;
  const cookieName = secure ? '__Host-brackets_csrf' : 'brackets_csrf';
  return [
    `${cookieName}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    ...(secure ? ['Secure'] : [])
  ].join('; ');
}

function networkOriginsForHost(protocol, host, port) {
  const bindHost = host === '0.0.0.0' ? '127.0.0.1' : host;
  const localOrigin = `${protocol}://${bindHost}:${port}`;

  if (host !== '0.0.0.0') {
    return {
      bindHost: host,
      localOrigin,
      networkOrigins: [],
      preferredOrigin: localOrigin,
      port
    };
  }

  const interfaces = networkInterfaces();
  const networkOrigins = [];
  for (const records of Object.values(interfaces)) {
    for (const record of records ?? []) {
      if (record.family !== 'IPv4' || record.internal) {
        continue;
      }
      networkOrigins.push(`${protocol}://${record.address}:${port}`);
    }
  }

  return {
    bindHost: host,
    localOrigin,
    networkOrigins,
    preferredOrigin: localOrigin,
    port
  };
}

function ensureWithinRoot(rootPath, targetPath, label) {
  const resolvedRoot = path.resolve(rootPath);
  const resolvedTarget = path.resolve(targetPath);
  if (resolvedTarget !== resolvedRoot && !resolvedTarget.startsWith(`${resolvedRoot}${path.sep}`)) {
    throw new Error(`Blocked path outside package root: ${label}`);
  }
  return resolvedTarget;
}

function entryPointPath(entryFolder) {
  return entryFolder === '.'
    ? '/index.html'
    : `/${toPosix(entryFolder).replace(/^\/+|\/+$/g, '')}/index.html`;
}

function resolveEntryFolder(packageRoot, config) {
  const entryFolder = typeof config?.entry?.folder === 'string' && config.entry.folder.trim()
    ? config.entry.folder.trim()
    : '.';
  const absolutePath = entryFolder === '.'
    ? packageRoot
    : path.resolve(packageRoot, entryFolder);
  const safeAbsolutePath = ensureWithinRoot(packageRoot, absolutePath, 'entry.folder');
  return {
    folder: entryFolder,
    absolutePath: safeAbsolutePath,
    indexPath: ensureWithinRoot(packageRoot, path.join(safeAbsolutePath, 'index.html'), 'entry.folder/index.html')
  };
}

function buildImportMap(entryFolder) {
  const basePrefix = entryFolder === '.' ? '' : `${toPosix(entryFolder).replace(/^\/+|\/+$/g, '')}/`;
  return {
    imports: {
      '@app/': `/${basePrefix}app/`,
      '@views/': `/${basePrefix}app/views/`,
      '@pages/': `/${basePrefix}app/pages/`,
      '@layouts/': `/${basePrefix}app/layouts/`,
      '@logic/': `/${basePrefix}app/logic/`,
      '@data/': `/${basePrefix}app/data/`,
      '@api/': `/${basePrefix}app/api/`,
      '@routes/': `/${basePrefix}app/routes/`,
      '@storage/': `/${basePrefix}app/storage/`,
      '@brackets/': '/framework/',
      '@framework/': '/framework/',
      '@config/': '/config/',
      brackets: '/framework/runtime.js'
    }
  };
}

function entryAssetPath(entryFolder, assetName) {
  const prefix = entryFolder === '.' ? '' : `/${toPosix(entryFolder).replace(/^\/+|\/+$/g, '')}`;
  return `${prefix}/app/${assetName}`;
}

function buildWebManifest(config, origin, entryFolder) {
  return {
    name: config.branding?.name ?? 'Brackets',
    short_name: config.branding?.name ?? 'Brackets',
    start_url: origin,
    scope: '/',
    display: 'standalone',
    background_color: config.branding?.canvas ?? '#fcfaf7',
    theme_color: config.branding?.accent ?? '#714cb6',
    icons: [
      {
        src: entryAssetPath(entryFolder, 'favicon.svg'),
        sizes: 'any',
        type: 'image/svg+xml'
      }
    ]
  };
}

function renderTemplate(source, replacements) {
  return source.replace(/\{\{([A-Z0-9_]+)\}\}/g, (_, key) => replacements[key] ?? '');
}

async function readText(filePath) {
  return readFile(filePath, 'utf8');
}

function escapeRegex(value) {
  return String(value ?? '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildRoutePattern(routePath) {
  const keys = [];
  const normalized = normalizePublicPath(routePath);
  const pattern = normalized
    .split('/')
    .map((segment) => {
      if (!segment) {
        return '';
      }
      if (segment.startsWith(':')) {
        keys.push(segment.slice(1));
        return '([^/]+)';
      }
      if (segment === '*') {
        keys.push('wildcard');
        return '(.*)';
      }
      return escapeRegex(segment);
    })
    .join('/');

  return {
    keys,
    regex: new RegExp(`^${pattern || '/'}$`)
  };
}

function routeParams(match, keys) {
  const params = {};
  for (const [index, key] of keys.entries()) {
    params[key] = match[index + 1];
  }
  return params;
}

function evaluatePageManifest(source, filePath) {
  let manifest = null;
  const sandbox = vm.createContext({
    page(value) {
      manifest = value;
      return value;
    }
  });
  const script = new vm.Script(source, { filename: filePath });
  script.runInContext(sandbox, { timeout: 200 });
  if (!manifest || typeof manifest !== 'object') {
    throw new Error(`Expected page(...) manifest in ${filePath}`);
  }
  return manifest;
}

function normalizeModuleExpression(source) {
  const trimmed = String(source ?? '').trim();
  if (trimmed.startsWith('export default')) {
    return trimmed.replace(/^export\s+default\s+/, '');
  }
  return trimmed;
}

function evaluateModuleValue(source, filePath) {
  const expression = normalizeModuleExpression(source);
  const script = new vm.Script(expression, { filename: filePath });
  return script.runInNewContext(Object.create(null), { timeout: 200 });
}

function wrapModuleForBrowser(source) {
  return `const moduleValue = ${normalizeModuleExpression(source)};\nexport default moduleValue;\n`;
}

async function listFilesRecursive(rootDir, extension) {
  const results = [];

  if (!existsSync(rootDir)) {
    return results;
  }

  const entries = await readdir(rootDir, { withFileTypes: true });
  for (const entry of entries) {
    const nextPath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      results.push(...await listFilesRecursive(nextPath, extension));
      continue;
    }
    if (entry.isFile() && nextPath.endsWith(extension)) {
      results.push(nextPath);
    }
  }

  return results.sort((left, right) => left.localeCompare(right));
}

function defaultRouteFromView(appRoot, viewFile) {
  const relative = toPosix(path.relative(appRoot, viewFile)).replace(/\.view$/i, '');
  const segments = relative.split('/').filter(Boolean);
  if (!segments.length) {
    return '/';
  }

  if (segments.at(-1) === 'index') {
    segments.pop();
  }

  return segments.length ? `/${segments.join('/')}` : '/';
}

function defaultIdFromView(appRoot, viewFile) {
  const relative = toPosix(path.relative(appRoot, viewFile)).replace(/\.view$/i, '');
  const segments = relative.split('/').filter(Boolean);
  if (!segments.length) {
    return 'index';
  }
  if (segments.at(-1) === 'index' && segments.length > 1) {
    segments.pop();
  }
  return segments.join('-');
}

function resolveAppReference(appRoot, sourceFile, reference, fallbackCandidates = []) {
  const candidates = [];
  if (reference) {
    if (reference.startsWith('@app/')) {
      candidates.push(path.join(appRoot, reference.slice('@app/'.length)));
    } else if (reference.startsWith('./') || reference.startsWith('../')) {
      candidates.push(path.resolve(path.dirname(sourceFile), reference));
    } else if (reference.startsWith('/')) {
      candidates.push(path.join(appRoot, reference.replace(/^\/+/, '')));
    } else {
      candidates.push(path.join(appRoot, reference));
    }
  }

  candidates.push(...fallbackCandidates);

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return path.resolve(candidate);
    }
  }

  return null;
}

function routeIdFromPath(routePath, fallback = 'route') {
  const normalized = normalizePublicPath(routePath);
  const segments = normalized.replace(/^\/+|\/+$/g, '').split('/').filter(Boolean);
  if (!segments.length) {
    return fallback;
  }

  return segments
    .map((segment) => segment.replace(/^:/, '').replace(/\*/g, 'wildcard'))
    .join('-');
}

function mergeRouteDefaults(defaults = {}, route = {}) {
  return {
    ...defaults,
    ...route,
    meta: {
      ...(defaults.meta ?? {}),
      ...(route.meta ?? {})
    },
    params: {
      ...(defaults.params ?? {}),
      ...(route.params ?? {})
    },
    seo: {
      ...(defaults.seo ?? {}),
      ...(route.seo ?? {})
    },
    auth: {
      ...(defaults.auth ?? {}),
      ...(route.auth ?? {})
    },
    assets: {
      ...(defaults.assets ?? {}),
      ...(route.assets ?? {})
    },
    aliases: [
      ...(Array.isArray(defaults.aliases) ? defaults.aliases : []),
      ...(defaults.alias ? [defaults.alias] : []),
      ...(Array.isArray(route.aliases) ? route.aliases : []),
      ...(route.alias ? [route.alias] : [])
    ]
  };
}

function createDeclaredRoute(appRoot, entryRoot, sourceFile, definition, defaults = {}, sourceKind = 'logic') {
  const merged = mergeRouteDefaults(defaults, definition ?? {});
  const routePath = normalizePublicPath(merged.route ?? '/');
  const id = merged.id ?? routeIdFromPath(routePath, path.basename(sourceFile, path.extname(sourceFile)));
  const aliases = [...new Set((merged.aliases ?? []).map(normalizePublicPath))];
  const htmlFile = merged.redirectTo
    ? null
    : resolveAppReference(appRoot, sourceFile, merged.html ?? null, []);
  const logicFile = resolveAppReference(appRoot, sourceFile, merged.logic ?? null, []);
  const layoutFile = resolveAppReference(appRoot, sourceFile, merged.layout ?? null, []);

  return {
    id,
    route: routePath,
    aliases,
    title: merged.title ?? id,
    meta: merged.meta ?? {},
    params: merged.params ?? {},
    seo: merged.seo ?? {},
    auth: merged.auth ?? {},
    assets: merged.assets ?? {},
    data: normalizeRouteDependencies(merged.data, 'data'),
    api: normalizeRouteDependencies(merged.api, 'api'),
    preload: merged.preload ?? null,
    redirectTo: merged.redirectTo ? normalizePublicPath(merged.redirectTo) : null,
    viewFile: null,
    viewRelative: null,
    htmlFile,
    htmlRelative: htmlFile ? toPosix(path.relative(entryRoot.absolutePath, htmlFile)) : null,
    logicFile,
    logicRelative: logicFile ? toPosix(path.relative(entryRoot.absolutePath, logicFile)) : null,
    layoutFile,
    layoutRelative: layoutFile ? toPosix(path.relative(entryRoot.absolutePath, layoutFile)) : null,
    sourceKind,
    sourceFile,
    sourceRelative: toPosix(path.relative(entryRoot.absolutePath, sourceFile))
  };
}

function normalizeRouteDependencyToken(value, kind = '') {
  const raw = String(value ?? '').trim();
  if (!raw) {
    return null;
  }

  const normalizedKind = String(kind ?? '').trim().toLowerCase();
  const explicitPrefix = normalizedKind ? `${normalizedKind}:` : '';
  if (explicitPrefix && raw.toLowerCase().startsWith(explicitPrefix)) {
    const sliced = raw.slice(explicitPrefix.length).trim();
    return sliced || null;
  }

  const cleaned = raw
    .replace(/^@app\/(?:data|api)\//i, '')
    .replace(/^\/?app\/(?:data|api)\//i, '')
    .replace(/^\.\/+/, '')
    .replace(/\.(?:data|api)$/i, '')
    .trim();

  if (!cleaned) {
    return null;
  }

  const tail = cleaned.split('/').pop()?.trim() ?? '';
  return tail || cleaned;
}

function normalizeRouteDependencies(value, kind = '') {
  const tokens = new Set();

  function visit(entry, fallbackKey = '') {
    if (entry === undefined || entry === null || entry === false) {
      return;
    }

    if (typeof entry === 'string' || typeof entry === 'number') {
      const token = normalizeRouteDependencyToken(entry, kind);
      if (token) {
        tokens.add(token);
      }
      return;
    }

    if (Array.isArray(entry)) {
      for (const item of entry) {
        visit(item, fallbackKey);
      }
      return;
    }

    if (typeof entry === 'object') {
      for (const [key, next] of Object.entries(entry)) {
        if (typeof next === 'string' || typeof next === 'number') {
          visit(next, key);
          continue;
        }
        if ((next === undefined || next === null || next === true) && key) {
          const token = normalizeRouteDependencyToken(key, kind);
          if (token) {
            tokens.add(token);
          }
          continue;
        }
        visit(next, key);
      }
      return;
    }

    if (fallbackKey) {
      const token = normalizeRouteDependencyToken(fallbackKey, kind);
      if (token) {
        tokens.add(token);
      }
    }
  }

  visit(value);
  return [...tokens];
}

async function discoverRouterLogic(appRoot, entryRoot) {
  const routerLogicFile = path.join(appRoot, 'router.logic');
  if (!existsSync(routerLogicFile)) {
    return {
      filePath: null,
      relativePath: null,
      routes: [],
      hooks: {
        beforeEach: false,
        afterEach: false,
        notFound: false
      }
    };
  }

  const moduleValue = evaluateModuleValue(await readText(routerLogicFile), routerLogicFile) ?? {};
  const routes = Array.isArray(moduleValue.routes)
    ? moduleValue.routes.map((route) => createDeclaredRoute(appRoot, entryRoot, routerLogicFile, route, moduleValue.defaults ?? {}, 'router.logic'))
    : [];

  return {
    filePath: routerLogicFile,
    relativePath: toPosix(path.relative(entryRoot.absolutePath, routerLogicFile)),
    routes,
    hooks: {
      beforeEach: typeof moduleValue.beforeEach === 'function',
      afterEach: typeof moduleValue.afterEach === 'function',
      notFound: typeof moduleValue.notFound === 'function'
    }
  };
}

async function discoverGroupedRouteLogic(appRoot, entryRoot) {
  const routeFiles = await listFilesRecursive(path.join(appRoot, 'routes'), '.logic');
  const groupedRoutes = [];
  const modules = [];

  for (const filePath of routeFiles) {
    const moduleValue = evaluateModuleValue(await readText(filePath), filePath) ?? {};
    const defaults = moduleValue.defaults ?? {};
    const routes = Array.isArray(moduleValue.routes)
      ? moduleValue.routes.map((route) => createDeclaredRoute(appRoot, entryRoot, filePath, route, defaults, 'routes.logic'))
      : [];

    modules.push({
      id: path.basename(filePath, '.logic'),
      filePath,
      relativePath: toPosix(path.relative(entryRoot.absolutePath, filePath)),
      routeCount: routes.length
    });
    groupedRoutes.push(...routes);
  }

  return {
    modules,
    routes: groupedRoutes
  };
}

function routeRecord(route, currentPath) {
  return {
    id: route.id,
    route: route.route,
    aliases: [...route.aliases],
    title: route.title ?? route.id,
    meta: route.meta ?? {},
    params: route.params ?? {},
    seo: route.seo ?? {},
    auth: route.auth ?? {},
    assets: route.assets ?? {},
    data: Array.isArray(route.data) ? [...route.data] : [],
    api: Array.isArray(route.api) ? [...route.api] : [],
    redirectTo: route.redirectTo ?? null,
    preload: route.preload ?? null,
    sourceKind: route.sourceKind ?? 'view',
    layoutPath: route.layoutRelative ? `/${route.layoutRelative}` : null,
    current: currentPath === route.route || route.aliases.includes(currentPath),
    logicUrl: route.logicRelative
      ? `/__brackets/module?kind=logic&file=${encodeURIComponent(route.logicRelative)}`
      : null,
    htmlPath: route.htmlRelative ? `/${route.htmlRelative}` : null
  };
}

function appModuleRecord(kind, module) {
  return {
    id: module.id,
    kind,
    file: module.relativePath,
    url: `/__brackets/module?kind=${encodeURIComponent(kind)}&file=${encodeURIComponent(module.relativePath)}`
  };
}

function createRouteMatchers(routes) {
  const matchers = [];
  for (const route of routes) {
    const allPaths = [route.route, ...route.aliases];
    for (const routePath of allPaths) {
      const pattern = buildRoutePattern(routePath);
      matchers.push({
        route,
        path: routePath,
        keys: pattern.keys,
        regex: pattern.regex
      });
    }
  }
  return matchers;
}

function matchDiscoveredRoute(snapshot, pathname) {
  for (const candidate of snapshot.matchers) {
    const match = pathname.match(candidate.regex);
    if (match) {
      return {
        route: candidate.route,
        path: candidate.path,
        params: routeParams(match, candidate.keys)
      };
    }
  }
  return null;
}

async function discoverBracketsApp(packageRoot, entryRoot, config) {
  const appRoot = path.join(entryRoot.absolutePath, 'app');
  const hasAppRoot = existsSync(appRoot);
  const routerLogic = hasAppRoot
    ? await discoverRouterLogic(appRoot, entryRoot)
    : {
        filePath: null,
        relativePath: null,
        routes: [],
        hooks: {
          beforeEach: false,
          afterEach: false,
          notFound: false
        }
      };
  const groupedRouteLogic = hasAppRoot
    ? await discoverGroupedRouteLogic(appRoot, entryRoot)
    : {
        modules: [],
        routes: []
      };
  const viewFiles = hasAppRoot ? await listFilesRecursive(appRoot, '.view') : [];
  const viewRoutes = [];

  for (const viewFile of viewFiles) {
    const source = await readText(viewFile);
    const manifest = evaluatePageManifest(source, viewFile);
    const routePath = normalizePublicPath(manifest.route ?? defaultRouteFromView(appRoot, viewFile));
    const id = manifest.id ?? defaultIdFromView(appRoot, viewFile);
    const basename = path.basename(viewFile, '.view');
    const relativeViewPath = toPosix(path.relative(entryRoot.absolutePath, viewFile));
    const inferredPagePath = viewFile
      .replace(`${path.sep}views${path.sep}`, `${path.sep}pages${path.sep}`)
      .replace(/\.view$/i, '.html');
    const underViewsTree = viewFile.includes(`${path.sep}views${path.sep}`);
    const inferredLayoutPath = underViewsTree
      ? viewFile
          .replace(`${path.sep}views${path.sep}`, `${path.sep}layouts${path.sep}`)
          .replace(/\.view$/i, '.html')
      : null;
    const htmlFile = resolveAppReference(appRoot, viewFile, manifest.html ?? null, [
      viewFile.replace(/\.view$/i, '.html'),
      inferredPagePath,
      path.join(appRoot, `${basename}.html`)
    ]);
    const logicFile = resolveAppReference(appRoot, viewFile, manifest.logic ?? null, [
      viewFile.replace(/\.view$/i, '.logic'),
      viewFile.replace(`${path.sep}views${path.sep}`, `${path.sep}logic${path.sep}`).replace(/\.view$/i, '.logic'),
      path.join(appRoot, `${basename}.logic`)
    ]);
    const layoutFile = resolveAppReference(
      appRoot,
      viewFile,
      manifest.layout ?? null,
      inferredLayoutPath ? [inferredLayoutPath] : []
    );
    const aliases = [
      ...(Array.isArray(manifest.aliases) ? manifest.aliases : []),
      ...(manifest.alias ? [manifest.alias] : [])
    ].map(normalizePublicPath);

    viewRoutes.push({
      id,
      route: routePath,
      aliases: [...new Set(aliases)],
      title: manifest.title ?? id,
      meta: manifest.meta ?? {},
      params: manifest.params ?? {},
      seo: manifest.seo ?? {},
      auth: manifest.auth ?? {},
      assets: manifest.assets ?? {},
      data: normalizeRouteDependencies(manifest.data, 'data'),
      api: normalizeRouteDependencies(manifest.api, 'api'),
      preload: manifest.preload ?? null,
      redirectTo: manifest.redirectTo ? normalizePublicPath(manifest.redirectTo) : null,
      viewFile,
      viewRelative: relativeViewPath,
      htmlFile,
      htmlRelative: htmlFile ? toPosix(path.relative(entryRoot.absolutePath, htmlFile)) : null,
      logicFile,
      logicRelative: logicFile ? toPosix(path.relative(entryRoot.absolutePath, logicFile)) : null,
      layoutFile,
      layoutRelative: layoutFile ? toPosix(path.relative(entryRoot.absolutePath, layoutFile)) : null,
      sourceKind: 'view',
      sourceFile: viewFile,
      sourceRelative: relativeViewPath
    });
  }

  const routes = [
    ...routerLogic.routes,
    ...groupedRouteLogic.routes,
    ...viewRoutes
  ];

  const dataFiles = hasAppRoot ? await listFilesRecursive(path.join(appRoot, 'data'), '.data') : [];
  const apiFiles = hasAppRoot ? await listFilesRecursive(path.join(appRoot, 'api'), '.api') : [];
  const dataModules = dataFiles.map((filePath) => ({
    id: path.basename(filePath, '.data'),
    filePath,
    relativePath: toPosix(path.relative(entryRoot.absolutePath, filePath))
  }));
  const apiModules = apiFiles.map((filePath) => ({
    id: path.basename(filePath, '.api'),
    filePath,
    relativePath: toPosix(path.relative(entryRoot.absolutePath, filePath))
  }));

  return {
    appRoot,
    entryRoot: entryRoot.absolutePath,
    entryFolder: entryRoot.folder,
    hasAppRoot,
    hasViews: viewFiles.length > 0,
    hasRouterLogic: Boolean(routerLogic.filePath),
    hasGroupedRoutes: groupedRouteLogic.modules.length > 0,
    routerLogic,
    groupedRouteLogic,
    routes,
    matchers: createRouteMatchers(routes),
    dataModules,
    apiModules,
    dataModuleIndex: createModuleIndex(dataModules),
    apiModuleIndex: createModuleIndex(apiModules),
    config
  };
}

function createModuleIndex(modules) {
  const index = new Map();
  for (const module of modules) {
    index.set(module.id, module);
    index.set(module.relativePath, module);
  }
  return index;
}

function resolveModuleFromSnapshot(snapshot, kind, identifier) {
  const index = kind === 'data'
    ? snapshot.dataModuleIndex
    : snapshot.apiModuleIndex;
  return index.get(identifier) ?? null;
}

function composeLayout(layoutSource, pageSource) {
  const patterns = [
    /<([A-Za-z][A-Za-z0-9:-]*)([^>]*?)\s:mount([^>]*)>([\s\S]*?)<\/\1>/i,
    /<([A-Za-z][A-Za-z0-9:-]*)([^>]*?)\sdata-b-mount(?:="")?([^>]*)>([\s\S]*?)<\/\1>/i
  ];

  for (const pattern of patterns) {
    if (pattern.test(layoutSource)) {
      return layoutSource.replace(pattern, (_, tagName, before, after) => {
        const attrs = `${before ?? ''} data-b-mount${after ?? ''}`.replace(/\s{2,}/g, ' ');
        return `<${tagName}${attrs}>${pageSource}</${tagName}>`;
      });
    }
  }

  if (layoutSource.includes('</body>')) {
    return layoutSource.replace('</body>', `${pageSource}</body>`);
  }

  return `${layoutSource}\n${pageSource}`;
}

function templateFallbackCandidates(appRoot, reference = '') {
  const trimmed = String(reference ?? '').trim().replace(/^['"]|['"]$/g, '');
  if (!trimmed || path.extname(trimmed)) {
    return [];
  }

  const names = [trimmed, `${trimmed}.html`];
  const candidates = [];
  for (const name of names) {
    candidates.push(path.join(appRoot, name));
    candidates.push(path.join(appRoot, 'components', name));
    candidates.push(path.join(appRoot, 'layouts', name));
    candidates.push(path.join(appRoot, 'pages', name));
  }
  return candidates;
}

async function resolveTemplateMarkup(snapshot, entryRoot, reference, fromRelativePath = '') {
  if (!snapshot?.hasAppRoot) {
    return null;
  }

  const sourceFile = fromRelativePath
    ? ensureWithinRoot(entryRoot.absolutePath, path.join(entryRoot.absolutePath, fromRelativePath), `template:${fromRelativePath}`)
    : path.join(snapshot.appRoot, 'index.html');
  const templatePath = resolveAppReference(
    snapshot.appRoot,
    sourceFile,
    String(reference ?? '').trim(),
    templateFallbackCandidates(snapshot.appRoot, reference)
  );

  if (!templatePath || path.extname(templatePath).toLowerCase() !== '.html' || !existsSync(templatePath)) {
    return null;
  }

  const templateInfo = await stat(templatePath);
  const cacheKey = `${templatePath}:${Number(templateInfo.mtimeMs ?? 0)}:${Number(templateInfo.size ?? 0)}`;
  const cached = TEMPLATE_MARKUP_CACHE.get(cacheKey);
  if (cached) {
    return cached;
  }

  const resolved = {
    filePath: templatePath,
    relativePath: toPosix(path.relative(entryRoot.absolutePath, templatePath)),
    stamp: `${Number(templateInfo.mtimeMs ?? 0)}:${Number(templateInfo.size ?? 0)}`,
    html: transformHtmlSyntax(await readText(templatePath))
  };
  TEMPLATE_MARKUP_CACHE.set(cacheKey, resolved);
  return resolved;
}

function effectiveLayoutFileForRoute(route) {
  if (!route?.layoutFile || !existsSync(route.layoutFile)) {
    return null;
  }
  if (route.htmlFile && path.resolve(route.layoutFile) === path.resolve(route.htmlFile)) {
    return null;
  }
  return route.layoutFile;
}

async function renderRouteMarkup(route) {
  if (route.redirectTo) {
    return {
      html: '',
      mountHtml: '',
      layoutPath: route.layoutRelative ? `/${route.layoutRelative}` : null
    };
  }
  if (!route.htmlFile) {
    throw new Error(`Missing html file for route ${route.route}`);
  }

  const layoutFileResolved = effectiveLayoutFileForRoute(route);

  const pageInfo = await stat(route.htmlFile);
  const layoutInfo = layoutFileResolved ? await stat(layoutFileResolved) : null;
  const cacheKey = [
    route.route,
    route.htmlFile,
    Number(pageInfo.mtimeMs ?? 0),
    Number(pageInfo.size ?? 0),
    layoutFileResolved ?? '',
    Number(layoutInfo?.mtimeMs ?? 0),
    Number(layoutInfo?.size ?? 0)
  ].join(':');
  const cached = ROUTE_MARKUP_CACHE.get(cacheKey);
  if (cached) {
    return cached;
  }

  const pageHtml = await readText(route.htmlFile);
  const mountHtml = transformHtmlSyntax(pageHtml);
  const source = layoutFileResolved
    ? composeLayout(await readText(layoutFileResolved), pageHtml)
    : pageHtml;

  const rendered = {
    html: transformHtmlSyntax(source),
    mountHtml,
    layoutPath: layoutFileResolved && route.layoutRelative ? `/${route.layoutRelative}` : null
  };
  ROUTE_MARKUP_CACHE.set(cacheKey, rendered);
  return rendered;
}

function normalizeModuleResponse(result) {
  if (result === undefined) {
    return null;
  }
  return result;
}

function toYamlScalar(value) {
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }
  if (typeof value === 'number') {
    return String(value);
  }

  const text = String(value ?? '');
  if (!text || /[:#\-\[\]\{\}\n\r\t]|^\s|\s$/.test(text)) {
    return JSON.stringify(text);
  }
  return text;
}

function toYamlLines(value, indent = 0) {
  const pad = ' '.repeat(indent);
  if (Array.isArray(value)) {
    return value.flatMap((entry) => {
      if (entry && typeof entry === 'object') {
        const nested = toYamlLines(entry, indent + 2);
        if (!nested.length) {
          return [`${pad}- {}`];
        }
        const [first, ...rest] = nested;
        return [`${pad}- ${first.trimStart()}`, ...rest];
      }
      return [`${pad}- ${toYamlScalar(entry)}`];
    });
  }

  return Object.entries(value ?? {}).flatMap(([key, entry]) => {
    if (Array.isArray(entry)) {
      return [`${pad}${key}:`, ...toYamlLines(entry, indent + 2)];
    }
    if (entry && typeof entry === 'object') {
      return [`${pad}${key}:`, ...toYamlLines(entry, indent + 2)];
    }
    return [`${pad}${key}: ${toYamlScalar(entry)}`];
  });
}

function stringifyYaml(value) {
  return `${toYamlLines(value).join('\n')}\n`;
}

function buildBracketsConfigYaml(config) {
  return stringifyYaml({
    framework: config.framework,
    version: config.version,
    runtime: config.runtime,
    mode: config.mode,
    engine: config.engine,
    host: config.host,
    port: config.port,
    entry: config.entry,
    branding: config.branding,
    splash: config.splash,
    security: config.security,
    health: config.health,
    external: config.external
  });
}

function resolveStorageFile(snapshot, reference) {
  const appRoot = snapshot.appRoot;
  const storageRoot = path.join(appRoot, 'storage');
  const rawReference = String(reference ?? '').trim();
  const resolved = rawReference.startsWith('@storage/')
    ? path.join(storageRoot, rawReference.slice('@storage/'.length))
    : rawReference.startsWith('./') || rawReference.startsWith('../')
      ? path.resolve(appRoot, rawReference)
      : path.join(storageRoot, rawReference.replace(/^\/+/, ''));
  return ensureWithinRoot(snapshot.entryRoot, resolved, `storage:${reference}`);
}

function storageFrameworkError(code, message) {
  const error = new Error(String(message ?? 'Brackets storage request failed.'));
  error.statusCode = 500;
  error.code = String(code ?? 'BRACKETS_STORAGE_ERROR');
  error.clientMessage = String(message ?? 'Brackets storage request failed.');
  error.exposeDetails = false;
  return error;
}

function readEnvironmentValue(name) {
  const key = String(name ?? '').trim();
  if (!key) {
    return '';
  }

  if (typeof process !== 'undefined' && process?.env && typeof process.env[key] === 'string') {
    return process.env[key];
  }

  try {
    if (globalThis.Deno?.env?.get) {
      return globalThis.Deno.env.get(key) ?? '';
    }
  } catch {
    return '';
  }

  return '';
}

function storageCryptoConfig(snapshot) {
  const envName = String(snapshot?.config?.security?.storage?.keyEnv ?? 'BRACKETS_DATA_KEY').trim() || 'BRACKETS_DATA_KEY';
  const secret = readEnvironmentValue(envName);
  if (!secret) {
    throw storageFrameworkError('BRACKETS_STORAGE_KEY_MISSING', `Encrypted storage requires the ${envName} host environment value.`);
  }

  return {
    secret,
    iterations: Math.max(1, Number(snapshot?.config?.security?.storage?.pbkdf2Iterations ?? 250000) || 250000)
  };
}

function deriveStorageKey(secret, salt, iterations) {
  return crypto.pbkdf2Sync(secret, salt, iterations, 32, 'sha256');
}

function encodeStorageEnvelope(envelope, encode) {
  return encode({
    version: 1,
    cipher: 'aes-256-gcm',
    kdf: 'pbkdf2-sha256',
    iterations: envelope.iterations,
    salt: envelope.salt.toString('base64'),
    iv: envelope.iv.toString('base64'),
    tag: envelope.tag.toString('base64'),
    data: envelope.data.toString('base64')
  });
}

function decodeStorageEnvelope(rawValue, decode, filePath, minIterations) {
  const envelope = decode(rawValue);
  const version = Number(envelope?.version ?? 0);
  const cipher = String(envelope?.cipher ?? '');
  const kdf = String(envelope?.kdf ?? '');
  const iterations = Number(envelope?.iterations ?? 0);
  const salt = String(envelope?.salt ?? '');
  const iv = String(envelope?.iv ?? '');
  const tag = String(envelope?.tag ?? '');
  const data = String(envelope?.data ?? '');

  if (
    !envelope
    || typeof envelope !== 'object'
    || version !== 1
    || cipher !== 'aes-256-gcm'
    || kdf !== 'pbkdf2-sha256'
    || iterations < minIterations
    || !salt
    || !iv
    || !tag
    || !data
  ) {
    throw storageFrameworkError('BRACKETS_STORAGE_FORMAT_INVALID', `Encrypted storage payload is invalid for ${filePath}.`);
  }

  return {
    iterations,
    salt: Buffer.from(salt, 'base64'),
    iv: Buffer.from(iv, 'base64'),
    tag: Buffer.from(tag, 'base64'),
    data: Buffer.from(data, 'base64')
  };
}

function encryptStorageValue(snapshot, encodeEnvelope, encodeValue, value) {
  const cryptoConfig = storageCryptoConfig(snapshot);
  const plaintext = Buffer.from(String(encodeValue(value)), 'utf8');
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const key = deriveStorageKey(cryptoConfig.secret, salt, cryptoConfig.iterations);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return encodeStorageEnvelope({
    iterations: cryptoConfig.iterations,
    salt,
    iv,
    tag,
    data
  }, encodeEnvelope);
}

function decryptStorageValue(snapshot, decodeEnvelope, decodeValue, filePath, rawValue) {
  const cryptoConfig = storageCryptoConfig(snapshot);
  const envelope = decodeStorageEnvelope(rawValue, decodeEnvelope, filePath, cryptoConfig.iterations);

  try {
    const key = deriveStorageKey(cryptoConfig.secret, envelope.salt, envelope.iterations);
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, envelope.iv);
    decipher.setAuthTag(envelope.tag);
    const plaintext = Buffer.concat([decipher.update(envelope.data), decipher.final()]).toString('utf8');
    return decodeValue(plaintext);
  } catch {
    throw storageFrameworkError('BRACKETS_STORAGE_DECRYPT_FAILED', `Encrypted storage could not be read from ${filePath}.`);
  }
}

function createStorageHelpers(snapshot) {
  const jsonCodec = {
    encodeValue(value) {
      return `${JSON.stringify(value, null, 2)}\n`;
    },
    decodeValue(value) {
      return JSON.parse(value);
    },
    encodeEnvelope(value) {
      return `${JSON.stringify(value, null, 2)}\n`;
    },
    decodeEnvelope(value) {
      return JSON.parse(value);
    }
  };

  const yamlCodec = {
    encodeValue(value) {
      return stringifyYaml(value);
    },
    decodeValue(value) {
      return parseYaml(value);
    },
    encodeEnvelope(value) {
      return stringifyYaml(value);
    },
    decodeEnvelope(value) {
      return parseYaml(value);
    }
  };

  const jsonAdapter = (reference) => {
    const filePath = resolveStorageFile(snapshot, reference);
    return {
      async read(fallback = null) {
        return runSerialized(filePath, async () => {
          if (!existsSync(filePath)) {
            return fallback;
          }
          return JSON.parse(await readText(filePath));
        });
      },
      async write(nextValue) {
        return runSerialized(filePath, async () => {
          await mkdir(path.dirname(filePath), { recursive: true });
          await writeFile(filePath, `${JSON.stringify(nextValue, null, 2)}\n`, 'utf8');
          return nextValue;
        });
      }
    };
  };

  const yamlAdapter = (reference) => {
    const filePath = resolveStorageFile(snapshot, reference);
    return {
      async read(fallback = null) {
        return runSerialized(filePath, async () => {
          if (!existsSync(filePath)) {
            return fallback;
          }
          return parseYaml(await readText(filePath));
        });
      },
      async write(nextValue) {
        return runSerialized(filePath, async () => {
          await mkdir(path.dirname(filePath), { recursive: true });
          await writeFile(filePath, stringifyYaml(nextValue), 'utf8');
          return nextValue;
        });
      }
    };
  };

  const dbAdapter = (reference) => {
    const filePath = resolveStorageFile(snapshot, reference);
    const openDatabase = () => {
      const database = new DatabaseSync(filePath);
      database.exec(`
        CREATE TABLE IF NOT EXISTS brackets_store (
          entry_key TEXT PRIMARY KEY,
          entry_value TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )
      `);
      return database;
    };

    return {
      async read(fallbackOrOptions = null, options = {}) {
        const { fallback, key } = storageRecordArgs(fallbackOrOptions, options);
        return runSerialized(filePath, async () => {
          await mkdir(path.dirname(filePath), { recursive: true });
          const database = openDatabase();
          try {
            const row = database.prepare('SELECT entry_value FROM brackets_store WHERE entry_key = ?').get(key);
            if (!row) {
              return fallback;
            }
            return JSON.parse(String(row.entry_value));
          } finally {
            database.close();
          }
        });
      },
      async write(nextValue, options = {}) {
        const key = String(options?.key ?? 'default');
        return runSerialized(filePath, async () => {
          await mkdir(path.dirname(filePath), { recursive: true });
          const database = openDatabase();
          try {
            database.prepare(`
              INSERT INTO brackets_store (entry_key, entry_value, updated_at)
              VALUES (?, ?, ?)
              ON CONFLICT(entry_key)
              DO UPDATE SET entry_value = excluded.entry_value, updated_at = excluded.updated_at
            `).run(key, JSON.stringify(nextValue), new Date().toISOString());
            return nextValue;
          } finally {
            database.close();
          }
        });
      }
    };
  };

  const encryptedAdapter = (reference, codec) => {
    const filePath = resolveStorageFile(snapshot, reference);
    return {
      async read(fallback = null) {
        return runSerialized(filePath, async () => {
          if (!existsSync(filePath)) {
            return fallback;
          }
          const raw = await readText(filePath);
          return decryptStorageValue(snapshot, codec.decodeEnvelope, codec.decodeValue, filePath, raw);
        });
      },
      async write(nextValue) {
        return runSerialized(filePath, async () => {
          await mkdir(path.dirname(filePath), { recursive: true });
          const encrypted = encryptStorageValue(snapshot, codec.encodeEnvelope, codec.encodeValue, nextValue);
          await writeFile(filePath, encrypted, 'utf8');
          return nextValue;
        });
      }
    };
  };

  const storage = {
    json: jsonAdapter,
    yaml: yamlAdapter,
    db: dbAdapter,
    '[e]json': (reference) => encryptedAdapter(reference, jsonCodec),
    '[e]yaml': (reference) => encryptedAdapter(reference, yamlCodec)
  };

  return {
    storage,
    json: jsonAdapter,
    yaml: yamlAdapter,
    db: dbAdapter,
    ejson: (reference) => encryptedAdapter(reference, jsonCodec),
    eyaml: (reference) => encryptedAdapter(reference, yamlCodec),
    secureJson: (reference) => encryptedAdapter(reference, jsonCodec),
    secureYaml: (reference) => encryptedAdapter(reference, yamlCodec)
  };
}

async function parseHttpResponse(response) {
  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    return response.json();
  }
  return response.text();
}

function createHttpHelpers() {
  const request = async (method, url, payload, options = {}) => {
    const headers = new Headers(options.headers ?? {});
    const init = {
      method,
      headers
    };

    if (payload !== undefined && payload !== null && method !== 'GET' && method !== 'HEAD') {
      if (payload instanceof FormData) {
        init.body = payload;
      } else if (typeof payload === 'string') {
        init.body = payload;
      } else {
        headers.set('content-type', 'application/json');
        init.body = JSON.stringify(payload);
      }
    }

    const response = await fetch(url, init);
    if (!response.ok) {
      throw new Error(`Request failed for ${url}: ${response.status}`);
    }
    return parseHttpResponse(response);
  };

  const client = (baseUrl, defaults = {}) => {
    const absolute = (nextPath) => new URL(nextPath, baseUrl).href;
    return {
      request(method, nextPath, payload, options = {}) {
        return request(method, absolute(nextPath), payload, {
          ...defaults,
          ...options
        });
      },
      get(nextPath, options) {
        return request('GET', absolute(nextPath), null, { ...defaults, ...options });
      },
      post(nextPath, payload, options) {
        return request('POST', absolute(nextPath), payload, { ...defaults, ...options });
      },
      put(nextPath, payload, options) {
        return request('PUT', absolute(nextPath), payload, { ...defaults, ...options });
      },
      patch(nextPath, payload, options) {
        return request('PATCH', absolute(nextPath), payload, { ...defaults, ...options });
      },
      delete(nextPath, payload, options) {
        return request('DELETE', absolute(nextPath), payload, { ...defaults, ...options });
      },
      operation({ method = 'GET', path: nextPath = '/', query, body, headers } = {}) {
        const url = new URL(nextPath, baseUrl);
        for (const [key, value] of Object.entries(query ?? {})) {
          if (value !== undefined && value !== null) {
            url.searchParams.set(key, String(value));
          }
        }
        return request(method.toUpperCase(), url.href, body, {
          ...defaults,
          headers: {
            ...(defaults.headers ?? {}),
            ...(headers ?? {})
          }
        });
      }
    };
  };

  const read = async (url, options = {}) => ({
    transport: 'sse',
    url,
    options
  });

  return {
    request,
    read,
    get(url, options) {
      return request('GET', url, null, options);
    },
    create(url, payload, options) {
      return request('POST', url, payload, options);
    },
    update(url, payload, options) {
      return request('PUT', url, payload, options);
    },
    patch(url, payload, options) {
      return request('PATCH', url, payload, options);
    },
    delete(url, payload, options) {
      return request('DELETE', url, payload, options);
    },
    client,
    resource: client,
    openapi: client,
    operation(definition) {
      return client('/', {}).operation(definition);
    }
  };
}

async function invokeModuleMethod(snapshot, kind, moduleDescriptor, methodName, args, routeState) {
  const source = await readText(moduleDescriptor.filePath);
  const value = evaluateModuleValue(source, moduleDescriptor.filePath);
  if (!value || typeof value !== 'object') {
    throw new Error(`Expected ${kind} module object in ${moduleDescriptor.relativePath}`);
  }

  const method = value[methodName];
  if (typeof method !== 'function') {
    throw new Error(`Missing ${kind}.${moduleDescriptor.id}.${methodName}()`);
  }

  const helpers = {
    config: snapshot.config,
    route: routeState,
    ...createStorageHelpers(snapshot),
    http: createHttpHelpers()
  };

  const result = await method(helpers, ...(Array.isArray(args) ? args : []));
  return normalizeModuleResponse(result);
}

function classifyDevFileChange(packageRoot, absPath) {
  const root = path.resolve(packageRoot);
  const resolved = path.resolve(absPath);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    return null;
  }
  const rel = path.relative(root, resolved).split(path.sep).join('/');
  if (!rel || rel === '.') {
    return 'spa';
  }
  if (rel === 'index.html') {
    return 'fullReload';
  }
  if (rel === 'config.yaml' || rel === 'config.yml' || rel === 'config.json') {
    return 'fullReload';
  }
  if (rel === 'config/brackets.yaml' || rel === 'config/brackets.yml' || rel === 'config/brackets.json') {
    return 'fullReload';
  }
  if (
    rel === 'framework/runtime.js'
    || rel === 'framework/datastar.js'
    || rel === 'framework/syntax.js'
    || rel === 'framework/version.js'
  ) {
    return 'fullReload';
  }
  return 'spa';
}

function buildHostContract(packageRoot, origin, config, addresses, appSnapshot, devReload = false) {
  const versions = buildVersionSnapshot();
  const currentEntryFolder = config.entry?.folder ?? '.';
  return {
    framework: 'Brackets',
    version: BRACKETS_VERSION,
    runtime: config.runtime,
    mode: config.mode,
    engine: config.engine,
    devReload: Boolean(devReload),
    origin,
    addresses,
    profiles: ['starter', 'same-origin', 'portable-folder'],
    distribution: {
      packageRoot,
      entryFolder: currentEntryFolder,
      entryPoint: entryPointPath(currentEntryFolder),
      modes: ['portable-folder', 'embedded-host']
    },
    router: {
      mode: appSnapshot.routes.length ? 'hybrid' : 'starter',
      sources: {
        views: appSnapshot.hasViews,
        routerLogic: appSnapshot.hasRouterLogic,
        groupedRoutes: appSnapshot.hasGroupedRoutes
      },
      routeCount: appSnapshot.routes.length
    },
    serviceWorker: {
      available: false,
      endpoint: null,
      scope: '/'
    },
    datastar: versions.datastar,
    bundledEngine: versions.engine
  };
}

function xmlEscape(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function routeCanonicalUrl(origin, route) {
  const canonical = String(route?.seo?.canonical ?? '').trim();
  return new URL(canonical || route.route || '/', origin).href;
}

function routeAuthRequired(route) {
  const auth = route?.auth ?? {};
  return auth.required === true
    || auth.public === false
    || (Array.isArray(auth.roles) && auth.roles.length > 0);
}

function sessionRoleSet(session) {
  const roles = new Set();
  const candidates = [
    session?.roles,
    session?.role,
    session?.user?.roles,
    session?.user?.role
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      for (const value of candidate) {
        const role = String(value ?? '').trim();
        if (role) {
          roles.add(role);
        }
      }
      continue;
    }

    const role = String(candidate ?? '').trim();
    if (role) {
      roles.add(role);
    }
  }

  return roles;
}

function routeAllowedForSession(route, session) {
  if (!routeAuthRequired(route)) {
    return true;
  }

  if (session?.authenticated !== true) {
    return false;
  }

  const requiredRoles = Array.isArray(route?.auth?.roles)
    ? route.auth.roles.map((role) => String(role ?? '').trim()).filter(Boolean)
    : [];
  if (!requiredRoles.length) {
    return true;
  }

  const sessionRoles = sessionRoleSet(session);
  return requiredRoles.every((role) => sessionRoles.has(role));
}

function routeAuthStatus(route, session = null) {
  if (!routeAuthRequired(route)) {
    return 'allowed';
  }
  if (session?.authenticated !== true) {
    return 'unauthorized';
  }
  return routeAllowedForSession(route, session) ? 'allowed' : 'forbidden';
}

function routeIncludedInSitemap(route) {
  if (!route || route.redirectTo || routeAuthRequired(route)) {
    return false;
  }
  return route?.seo?.sitemap !== false;
}

function routeIncludedInFeed(route) {
  if (!routeIncludedInSitemap(route)) {
    return false;
  }
  const feed = route?.seo?.feed;
  if (feed === false) {
    return false;
  }
  if (feed === true) {
    return true;
  }
  return Boolean(feed && typeof feed === 'object');
}

function routeAuthRedirect(route, session = null) {
  const auth = route?.auth ?? {};
  const roleMismatch = routeAuthStatus(route, session) === 'forbidden';
  const redirectTo = String(
    roleMismatch
      ? (auth.forbidden ?? auth.unauthorized ?? auth.redirectTo ?? auth.login ?? auth.path ?? '')
      : (auth.redirectTo ?? auth.login ?? auth.path ?? '')
  ).trim();
  return redirectTo ? normalizePublicPath(redirectTo) : null;
}

function methodLooksMutating(methodName) {
  const name = String(methodName ?? '').trim().toLowerCase();
  if (!name) {
    return false;
  }
  return /^(create|update|patch|delete|remove|destroy|save|write|set|put|post|insert|upsert|touch|publish|sync|replace|clear|reset|append|prepend|push|pop|shift|unshift)/.test(name);
}

function dependentRoutePaths(snapshot, kind, moduleId) {
  const dependencyKind = String(kind ?? '').trim().toLowerCase();
  const dependencyId = normalizeRouteDependencyToken(moduleId, dependencyKind);
  if (!dependencyKind || !dependencyId) {
    return [];
  }

  const field = dependencyKind === 'api' ? 'api' : 'data';
  const paths = new Set();
  for (const route of snapshot?.routes ?? []) {
    const dependencies = Array.isArray(route?.[field]) ? route[field] : [];
    if (!dependencies.includes(dependencyId)) {
      continue;
    }
    paths.add(normalizePublicPath(route.route ?? '/'));
    for (const alias of route.aliases ?? []) {
      paths.add(normalizePublicPath(alias));
    }
  }

  return [...paths];
}

function routeUpdatedAt(route) {
  const candidates = [
    route?.seo?.feed?.updatedAt,
    route?.seo?.updatedAt,
    route?.meta?.updatedAt,
    route?.meta?.publishedAt
  ];

  for (const candidate of candidates) {
    const value = String(candidate ?? '').trim();
    if (!value) {
      continue;
    }
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
  }

  return null;
}

function buildSitemapXml(origin, snapshot) {
  const urls = snapshot.routes
    .filter(routeIncludedInSitemap)
    .map((route) => {
      const lines = [
        '  <url>',
        `    <loc>${xmlEscape(routeCanonicalUrl(origin, route))}</loc>`
      ];
      const lastmod = routeUpdatedAt(route);
      if (lastmod) {
        lines.push(`    <lastmod>${xmlEscape(lastmod)}</lastmod>`);
      }
      lines.push('  </url>');
      return lines.join('\n');
    });

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls,
    '</urlset>',
    ''
  ].join('\n');
}

function buildFeedXml(config, origin, snapshot) {
  const items = snapshot.routes
    .filter(routeIncludedInFeed)
    .map((route) => {
      const feed = route.seo?.feed && typeof route.seo.feed === 'object'
        ? route.seo.feed
        : {};
      const updatedAt = routeUpdatedAt(route) ?? new Date().toISOString();
      const link = routeCanonicalUrl(origin, route);
      return {
        title: String(feed.title ?? route.title ?? route.id ?? 'Untitled').trim() || 'Untitled',
        description: String(feed.summary ?? feed.description ?? route.meta?.description ?? route.seo?.description ?? '').trim(),
        link,
        guid: link,
        updatedAt
      };
    })
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));

  const channelTitle = String(config?.branding?.name ?? 'Brackets').trim() || 'Brackets';
  const channelDescription = String(config?.branding?.tagline ?? 'Brackets feed').trim() || 'Brackets feed';
  const lastBuild = items[0]?.updatedAt ?? new Date().toISOString();

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0">',
    '  <channel>',
    `    <title>${xmlEscape(channelTitle)}</title>`,
    `    <link>${xmlEscape(origin)}</link>`,
    `    <description>${xmlEscape(channelDescription)}</description>`,
    `    <lastBuildDate>${xmlEscape(new Date(lastBuild).toUTCString())}</lastBuildDate>`,
    ...items.flatMap((item) => [
      '    <item>',
      `      <title>${xmlEscape(item.title)}</title>`,
      `      <link>${xmlEscape(item.link)}</link>`,
      `      <guid>${xmlEscape(item.guid)}</guid>`,
      `      <pubDate>${xmlEscape(new Date(item.updatedAt).toUTCString())}</pubDate>`,
      `      <description>${xmlEscape(item.description)}</description>`,
      '    </item>'
    ]),
    '  </channel>',
    '</rss>',
    ''
  ].join('\n');
}

function buildResponseHeaders(req, config) {
  const headers = { ...DEFAULT_RESPONSE_HEADERS };
  const h = config?.security?.headers;
  if (h && typeof h === 'object') {
    if (typeof h.contentSecurityPolicy === 'string' && h.contentSecurityPolicy.trim()) {
      headers['Content-Security-Policy'] = h.contentSecurityPolicy.trim();
    }
    if (
      req?.socket?.encrypted === true
      && typeof h.strictTransportSecurity === 'string'
      && h.strictTransportSecurity.trim()
    ) {
      headers['Strict-Transport-Security'] = h.strictTransportSecurity.trim();
    }
    if (typeof h.permissionsPolicy === 'string' && h.permissionsPolicy.trim()) {
      headers['Permissions-Policy'] = h.permissionsPolicy.trim();
    }
  }
  return headers;
}

function writeHttpResponse(res, status, contentType, body, extraHeaders = {}, requestContext = null) {
  const base = requestContext?.req && requestContext?.config
    ? buildResponseHeaders(requestContext.req, requestContext.config)
    : { ...DEFAULT_RESPONSE_HEADERS };
  res.writeHead(status, {
    ...base,
    'Content-Type': contentType,
    ...extraHeaders
  });
  res.end(body);
}

function sendJson(res, status, payload, extraHeaders = {}, requestContext = null) {
  writeHttpResponse(res, status, 'application/json; charset=utf-8', json(payload), {
    'Cache-Control': 'no-store',
    ...extraHeaders
  }, requestContext);
}

function createFrameworkError(statusCode, code, message, options = {}) {
  const error = new Error(String(message ?? 'Brackets request failed.'));
  error.statusCode = Number(statusCode) || 500;
  error.code = String(code ?? 'BRACKETS_ERROR');
  error.clientMessage = String(options.clientMessage ?? message ?? 'Brackets request failed.');
  error.requestId = String(options.requestId ?? '');
  error.details = options.details ?? null;
  error.exposeDetails = options.exposeDetails === true;
  return error;
}

function sendFrameworkError(res, error, fallbackRequestId = '', requestContext = null) {
  const statusCode = Number(error?.statusCode) || 500;
  const requestId = String(error?.requestId ?? fallbackRequestId ?? '');
  const payload = {
    ok: false,
    error: String(
      statusCode >= 500
        ? (error?.clientMessage ?? 'Brackets could not complete this request.')
        : (error?.clientMessage ?? error?.message ?? 'Brackets request failed.')
    ),
    code: String(error?.code ?? (statusCode >= 500 ? 'BRACKETS_INTERNAL_ERROR' : 'BRACKETS_REQUEST_ERROR'))
  };
  if (requestId) {
    payload.requestId = requestId;
  }
  if (error?.exposeDetails === true && error?.details && typeof error.details === 'object') {
    payload.details = error.details;
  }
  sendJson(res, statusCode, payload, {}, requestContext);
}

function requireCsrf(req, expectedToken, requestId) {
  const provided = String(req.headers['x-brackets-csrf'] ?? '').trim();
  const expected = String(expectedToken ?? '');
  if (!provided || !expected) {
    throw createFrameworkError(403, 'BRACKETS_CSRF_MISMATCH', 'Brackets rejected this request because the session token did not match.', {
      requestId
    });
  }
  const providedBuffer = Buffer.from(provided, 'utf8');
  const expectedBuffer = Buffer.from(expected, 'utf8');
  if (providedBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(providedBuffer, expectedBuffer)) {
    throw createFrameworkError(403, 'BRACKETS_CSRF_MISMATCH', 'Brackets rejected this request because the session token did not match.', {
      requestId
    });
  }
}

function validateModuleKind(kind, requestId) {
  if (!['data', 'api'].includes(kind)) {
    throw createFrameworkError(400, 'BRACKETS_INVALID_KIND', 'Expected kind to be data or api.', {
      requestId
    });
  }
}

function validateModuleId(moduleId, requestId) {
  const value = String(moduleId ?? '').trim();
  if (!value || value.length > 160 || !/^[a-zA-Z0-9._/-]+$/.test(value)) {
    throw createFrameworkError(400, 'BRACKETS_INVALID_MODULE', 'Expected a valid module identifier.', {
      requestId
    });
  }
  return value;
}

function validateMethodName(methodName, requestId) {
  const value = String(methodName ?? '').trim();
  if (!value || value.length > 120 || !/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(value)) {
    throw createFrameworkError(400, 'BRACKETS_INVALID_METHOD', 'Expected a valid module method name.', {
      requestId
    });
  }
  return value;
}

function validateRoutePayload(route, requestId) {
  const nextRoute = route && typeof route === 'object' && !Array.isArray(route)
    ? route
    : {};
  return {
    path: normalizePublicPath(nextRoute.path ?? '/'),
    query: nextRoute.query && typeof nextRoute.query === 'object' && !Array.isArray(nextRoute.query)
      ? nextRoute.query
      : {},
    hash: String(nextRoute.hash ?? '').slice(0, 256)
  };
}

function shouldServeShell(pathname) {
  if (pathname === '/' || pathname === '/index.html') {
    return true;
  }

  if (
    pathname.startsWith('/framework/') ||
    pathname.startsWith('/config/') ||
    pathname.startsWith('/.well-known/') ||
    pathname.startsWith('/__brackets/')
  ) {
    return false;
  }

  if (pathname.includes('.') && !pathname.endsWith('.html')) {
    return false;
  }

  return true;
}

async function readStaticBody(filePath) {
  return readFile(filePath);
}

async function readJsonRequest(req, limitBytes = MAX_RPC_BODY_BYTES) {
  const chunks = [];
  let size = 0;

  for await (const chunk of req) {
    const buffer = Buffer.from(chunk);
    size += buffer.length;
    if (size > limitBytes) {
      const error = new Error(`Request body exceeded ${limitBytes} bytes.`);
      error.statusCode = 413;
      throw error;
    }
    chunks.push(buffer);
  }

  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (!raw) {
    return {};
  }

  let payload = null;
  try {
    payload = JSON.parse(raw);
  } catch {
    const error = new Error('Expected valid JSON body');
    error.statusCode = 400;
    throw error;
  }

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    const error = new Error('Expected a JSON object body');
    error.statusCode = 400;
    throw error;
  }

  return payload;
}

async function runSerialized(filePath, task) {
  const key = path.resolve(filePath);
  const previous = STORAGE_LOCKS.get(key) ?? Promise.resolve();
  let releaseNext;
  const next = new Promise((resolve) => {
    releaseNext = resolve;
  });

  STORAGE_LOCKS.set(key, previous.then(() => next));
  await previous;

  try {
    return await task();
  } finally {
    releaseNext?.();
    if (STORAGE_LOCKS.get(key)) {
      STORAGE_LOCKS.delete(key);
    }
  }
}

function storageRecordArgs(fallbackOrOptions = null, maybeOptions = {}) {
  if (
    fallbackOrOptions
    && typeof fallbackOrOptions === 'object'
    && !Array.isArray(fallbackOrOptions)
    && !(fallbackOrOptions instanceof Date)
    && ('fallback' in fallbackOrOptions || 'key' in fallbackOrOptions)
  ) {
    return {
      fallback: fallbackOrOptions.fallback ?? null,
      key: String(fallbackOrOptions.key ?? 'default')
    };
  }

  return {
    fallback: fallbackOrOptions,
    key: String(maybeOptions?.key ?? 'default')
  };
}

/** Inline shell for GET /{entry}/app/splash.html — rendered on demand, not stored on disk. */
const DEMO_SHELL_HTML_TEMPLATE = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="theme-color" content="{{THEME_COLOR}}" />
  <title>{{TITLE}}</title>
  <link rel="icon" href="{{FAVICON_PATH}}" type="image/svg+xml" />
  <meta name="csrf" content="{{CSRF_TOKEN}}" />
  <script type="application/json" id="session">{{SESSION_JSON}}</script>
  <script type="application/json" id="host">{{HOST_JSON}}</script>
  <script type="application/json" id="config">{{CONFIG_JSON}}</script>
  <style>
    :root {
      color-scheme: light;
      --canvas: {{CANVAS}};
      --ink: {{INK}};
      --accent: {{ACCENT}};
      --muted: {{MUTED}};
    }
    body {
      margin: 0;
      min-height: 100vh;
      font-family: system-ui, sans-serif;
      background: var(--canvas);
      color: var(--ink);
      display: grid;
      place-content: center;
      padding: 2rem;
    }
    .brx-shell {
      max-width: 40rem;
      text-align: center;
    }
    .brx-shell img { max-width: 12rem; height: auto; }
    .brx-chips { display: flex; flex-wrap: wrap; gap: 0.5rem; justify-content: center; margin-top: 1rem; }
  </style>
</head>
<body>
  <div class="brx-shell">
    <img src="{{LOGO_PATH}}" alt="{{NAME}}" />
    <h1>{{BRANDING_TITLE}}</h1>
    <p>{{TAGLINE}}</p>
    <p><a href="/">Open the full demo (index.html + app)</a></p>
    <div class="brx-chips">{{CHIPS_HTML}}</div>
    <p style="margin-top:2rem;color:var(--muted);font-size:0.9rem;">Origin: {{ORIGIN}}</p>
  </div>
</body>
</html>
`;

async function shellHtml({ csrfToken = '', session = null, host = null, appConfig = null, entryFolder = '.' } = {}) {
  const faviconPath = entryAssetPath(entryFolder, 'favicon.svg');
  const logoPath = entryAssetPath(entryFolder, 'logo.svg');
  return renderTemplate(DEMO_SHELL_HTML_TEMPLATE, {
    TITLE: safeText(appConfig?.branding?.title ?? 'Brackets'),
    THEME_COLOR: safeText(appConfig?.branding?.accent ?? '#714cb6'),
    FAVICON_PATH: faviconPath,
    CSRF_TOKEN: safeText(csrfToken),
    SESSION_JSON: scriptJson(session ?? { authenticated: false, user: null }),
    HOST_JSON: scriptJson(host ?? {}),
    CONFIG_JSON: scriptJson(appConfig ?? {}),
    IMPORT_MAP_JSON: scriptJson(buildImportMap(appConfig?.entry?.folder ?? '.')),
    CANVAS: safeText(appConfig?.branding?.canvas ?? '#fcfaf7'),
    PANEL: safeText(appConfig?.branding?.panel ?? '#ffffff'),
    INK: safeText(appConfig?.branding?.ink ?? '#241013'),
    ACCENT: safeText(appConfig?.branding?.accent ?? '#714cb6'),
    MUTED: safeText(appConfig?.branding?.muted ?? '#5b5361'),
    NAME: safeText(appConfig?.branding?.name ?? 'Brackets'),
    LOGO_PATH: logoPath,
    BRANDING_TITLE: safeText(appConfig?.branding?.title ?? 'Give HTML superpowers.'),
    TAGLINE: safeText(appConfig?.branding?.tagline ?? 'No build step. HTML first. Datastar underneath.'),
    CHIPS_HTML: (appConfig?.splash?.chips ?? [])
      .map((chip) => `<span class="brx-chip">${safeText(chip)}</span>`)
      .join(''),
    ORIGIN: safeText(host?.origin ?? '')
  });
}

function hydratePackagedIndexHtml(source, { csrfToken = '', session = null, host = null, appConfig = null } = {}) {
  let html = source;
  html = html.replace(
    /<meta name="csrf" content="[^"]*"\s*\/?>/i,
    `<meta name="csrf" content="${safeText(csrfToken)}" />`
  );
  html = html.replace(
    /<script type="application\/json" id="session">[\s\S]*?<\/script>/i,
    `<script type="application/json" id="session">${scriptJson(session ?? { authenticated: false, user: null })}</script>`
  );
  html = html.replace(
    /<script type="application\/json" id="host">[\s\S]*?<\/script>/i,
    `<script type="application/json" id="host">${scriptJson(host ?? {})}</script>`
  );
  html = html.replace(
    /<script type="application\/json" id="config">[\s\S]*?<\/script>/i,
    `<script type="application/json" id="config">${scriptJson(appConfig ?? {})}</script>`
  );
  html = html.replace(
    /<script type="importmap">[\s\S]*?<\/script>/i,
    `<script type="importmap">${scriptJson(buildImportMap(appConfig?.entry?.folder ?? '.'))}</script>`
  );
  return html;
}

export async function createServer({ appRoot = PACKAGE_ROOT, port, host, devMode: devModeOption = false } = {}) {
  const resolvedAppRoot = path.resolve(appRoot);
  const packageRoot = path.basename(resolvedAppRoot).toLowerCase() === 'app'
    ? path.dirname(resolvedAppRoot)
    : resolvedAppRoot;
  const readmePath = path.join(packageRoot, 'README.md');
  const robotsPath = path.join(packageRoot, 'robots.txt');
  const { config } = await loadBracketsConfig(packageRoot);
  const liveReload = Boolean(devModeOption)
    || (config.watch?.enabled === true && config.watch?.reload === true);
  const entryRoot = resolveEntryFolder(packageRoot, config);

  if (!existsSync(entryRoot.indexPath)) {
    throw new Error(`Missing Brackets entry file at ${entryRoot.indexPath}`);
  }

  const resolvedHost = host ?? config.host;
  const resolvedPort = port ?? config.port;
  const protocol = 'http';

  let addresses = networkOriginsForHost(protocol, resolvedHost, resolvedPort);
  let origin = addresses.preferredOrigin;
  let snapshot = await discoverBracketsApp(packageRoot, entryRoot, config);
  let hostContract = buildHostContract(packageRoot, origin, config, addresses, snapshot, liveReload);
  const sessionBase = { authenticated: false, user: null };
  let snapshotCache = snapshot;
  let snapshotCacheAt = Date.now();
  let snapshotRefreshPromise = null;
  const sockets = new Set();
  const liveSubscribers = new Map();
  const devSseClients = new Set();
  const devWatchers = [];
  let devDebounceTimer = null;
  let pendingDevFullReload = false;

  function broadcastDevSseEvent(eventName, data = {}) {
    const line = `event: ${eventName}\ndata: ${JSON.stringify(data ?? {})}\n\n`;
    for (const client of devSseClients) {
      try {
        client.write(line);
      } catch {
        devSseClients.delete(client);
      }
    }
  }

  function scheduleDevRediscover(changedPath) {
    if (changedPath) {
      const kind = classifyDevFileChange(packageRoot, changedPath);
      if (kind === null) {
        return;
      }
      if (kind === 'fullReload') {
        pendingDevFullReload = true;
      }
    }
    if (devDebounceTimer) {
      clearTimeout(devDebounceTimer);
    }
    devDebounceTimer = setTimeout(async () => {
      devDebounceTimer = null;
      const useFullReload = pendingDevFullReload;
      pendingDevFullReload = false;
      ROUTE_MARKUP_CACHE.clear();
      TEMPLATE_MARKUP_CACHE.clear();
      try {
        const next = await discoverBracketsApp(packageRoot, entryRoot, config);
        snapshot = next;
        snapshotCache = next;
        snapshotCacheAt = Date.now();
        hostContract = buildHostContract(packageRoot, origin, config, addresses, snapshot, liveReload);
      } catch (error) {
        console.error('[Brackets dev watch]', error);
      }
      broadcastDevSseEvent(useFullReload ? 'fullReload' : 'spa', {});
    }, 200);
  }

  async function getSnapshot() {
    if (Date.now() - snapshotCacheAt < 200) {
      return snapshotCache;
    }

    if (!snapshotRefreshPromise) {
      snapshotRefreshPromise = discoverBracketsApp(packageRoot, entryRoot, config)
        .then((nextSnapshot) => {
          snapshotCache = nextSnapshot;
          snapshotCacheAt = Date.now();
          return nextSnapshot;
        })
        .finally(() => {
          snapshotRefreshPromise = null;
        });
    }

    snapshotCache = await snapshotRefreshPromise;
    snapshotCacheAt = Date.now();
    return snapshotCache;
  }

  function subscribeLiveStream(id, subscriber) {
    liveSubscribers.set(id, subscriber);
  }

  function unsubscribeLiveStream(id) {
    liveSubscribers.delete(id);
  }

  async function broadcastLiveUpdates(kind, moduleId) {
    const tasks = [];
    for (const subscriber of liveSubscribers.values()) {
      if (subscriber.kind !== kind || subscriber.moduleId !== moduleId) {
        continue;
      }
      tasks.push(subscriber.push().catch(() => null));
    }
    if (tasks.length) {
      await Promise.all(tasks);
    }
  }

  const server = http.createServer(async (req, res) => {
    const requestId = crypto.randomBytes(8).toString('hex');
    const requestContext = { req, config };
    const respond = {
      send: (status, contentType, body, extraHeaders = {}) => writeHttpResponse(res, status, contentType, body, extraHeaders, requestContext),
      sendJson: (status, payload, extraHeaders = {}) => sendJson(res, status, payload, extraHeaders, requestContext)
    };
    try {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1');

      if (url.pathname === '/__brackets/dev-reload') {
        if (!liveReload) {
          respond.send(404, 'text/plain; charset=utf-8', 'Not found');
          return;
        }
        if (req.method !== 'GET') {
          respond.send(405, 'text/plain; charset=utf-8', 'Method not allowed');
          return;
        }
        res.writeHead(200, {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache, no-transform',
          Connection: 'keep-alive'
        });
        res.write(': dev\n\n');
        devSseClients.add(res);
        req.on('close', () => {
          devSseClients.delete(res);
        });
        return;
      }

      const cookies = parseCookies(req.headers.cookie ?? '');
      const csrfToken = resolveCsrfCookie(cookies) ?? crypto.randomBytes(16).toString('hex');
      const session = { ...sessionBase, csrfToken };
      const cookieHeader = buildCsrfCookie(req, csrfToken);
      const appSnapshot = await getSnapshot();
      hostContract = buildHostContract(packageRoot, origin, config, addresses, appSnapshot, liveReload);

      if (url.pathname === '/framework/runtime.js') {
        respond.send(200, 'text/javascript; charset=utf-8', await readText(FRAMEWORK_RUNTIME_PATH));
        return;
      }

      if (url.pathname === '/framework/datastar.js') {
        respond.send(200, 'text/javascript; charset=utf-8', await readText(FRAMEWORK_DATASTAR_PATH));
        return;
      }

      if (url.pathname === '/framework/syntax.js') {
        respond.send(200, 'text/javascript; charset=utf-8', await readText(FRAMEWORK_SYNTAX_PATH));
        return;
      }

      if (url.pathname === '/framework/version.js') {
        respond.send(200, 'text/javascript; charset=utf-8', await readText(FRAMEWORK_VERSION_PATH));
        return;
      }

      if (url.pathname.startsWith('/framework/embedded/') || url.pathname.startsWith('/framework/host/')) {
        respond.send(404, 'text/plain; charset=utf-8', 'Not found');
        return;
      }

      const entryLogoPath = entryAssetPath(entryRoot.folder, 'logo.svg');
      const entryFaviconPath = entryAssetPath(entryRoot.folder, 'favicon.svg');

      if (url.pathname === entryLogoPath || url.pathname === '/framework/logo.svg') {
        respond.send(200, 'image/svg+xml', await readText(path.join(entryRoot.absolutePath, 'app', 'logo.svg')));
        return;
      }

      if (url.pathname === entryFaviconPath || url.pathname === '/framework/favicon.svg') {
        respond.send(200, 'image/svg+xml', await readText(path.join(entryRoot.absolutePath, 'app', 'favicon.svg')));
        return;
      }

      const entrySplashPath = entryAssetPath(entryRoot.folder, 'splash.html');
      if (url.pathname === entrySplashPath) {
        respond.send(200, 'text/html; charset=utf-8', await shellHtml({
          csrfToken,
          session,
          host: hostContract,
          appConfig: config,
          entryFolder: entryRoot.folder
        }), {
          'Set-Cookie': cookieHeader
        });
        return;
      }

      if (url.pathname === '/config.json') {
        respond.sendJson(200, config);
        return;
      }

      if (url.pathname === '/config.yaml' || url.pathname === '/config.yml') {
        respond.send(200, 'text/yaml; charset=utf-8', buildBracketsConfigYaml(config));
        return;
      }

      if (url.pathname === '/config/brackets.json') {
        respond.sendJson(200, {
          framework: 'Brackets',
          version: BRACKETS_VERSION,
          branding: config.branding,
          splash: config.splash,
          security: config.security,
          runtime: config.runtime,
          mode: config.mode,
          engine: config.engine,
          host: config.host,
          port: addresses.port,
          entry: config.entry,
          router: {
            mode: appSnapshot.routes.length ? 'hybrid' : 'starter',
            logicUrl: appSnapshot.hasRouterLogic ? '/app/router.logic' : null,
            sources: {
              views: appSnapshot.hasViews,
              routerLogic: appSnapshot.hasRouterLogic,
              groupedRoutes: appSnapshot.hasGroupedRoutes
            }
          },
          routes: appSnapshot.routes.map((route) => routeRecord(route, url.pathname)),
          modules: {
            data: appSnapshot.dataModules.map((module) => appModuleRecord('data', module)),
            api: appSnapshot.apiModules.map((module) => appModuleRecord('api', module))
          },
          assets: {
            logo: entryAssetPath(entryRoot.folder, 'logo.svg'),
            favicon: entryAssetPath(entryRoot.folder, 'favicon.svg'),
            splash: entryAssetPath(entryRoot.folder, 'splash.html')
          },
          importMap: buildImportMap(config.entry?.folder ?? '.'),
          host: hostContract
        });
        return;
      }

      if (url.pathname === '/config/brackets.yaml') {
        respond.send(200, 'text/yaml; charset=utf-8', buildBracketsConfigYaml(config));
        return;
      }

      if (url.pathname === '/config/config.js' && existsSync(path.join(packageRoot, 'config', 'config.js'))) {
        respond.send(200, 'text/javascript; charset=utf-8', await readText(path.join(packageRoot, 'config', 'config.js')));
        return;
      }

      if (url.pathname === '/manifest.webmanifest') {
        respond.sendJson(200, buildWebManifest(config, origin, entryRoot.folder));
        return;
      }

      if (url.pathname === '/robots.txt' && existsSync(robotsPath)) {
        respond.send(200, 'text/plain; charset=utf-8', await readText(robotsPath));
        return;
      }

      if (url.pathname === '/sitemap.xml') {
        respond.send(200, 'application/xml; charset=utf-8', buildSitemapXml(origin, appSnapshot));
        return;
      }

      if (url.pathname === '/feed.xml') {
        respond.send(200, 'application/rss+xml; charset=utf-8', buildFeedXml(config, origin, appSnapshot));
        return;
      }

      if (url.pathname === '/README.md' && existsSync(readmePath)) {
        respond.send(200, 'text/markdown; charset=utf-8', await readText(readmePath));
        return;
      }

      if (url.pathname.startsWith('/docs/')) {
        let decodedPathname;
        try {
          decodedPathname = decodeURIComponent(url.pathname);
        } catch {
          respond.send(400, 'text/plain; charset=utf-8', 'Bad request');
          return;
        }
        const relative = decodedPathname.replace(/^\/docs\/?/, '').replace(/\\/g, '/');
        if (!relative || relative.includes('..')) {
          respond.sendJson(404, {
            ok: false,
            error: `Not found: ${url.pathname}`,
            code: 'BRACKETS_NOT_FOUND',
            requestId
          });
          return;
        }
        const docsRoot = path.join(packageRoot, 'docs');
        let staticTarget;
        try {
          staticTarget = ensureWithinRoot(
            docsRoot,
            path.join(docsRoot, ...relative.split('/').filter(Boolean)),
            `docs:${url.pathname}`
          );
        } catch {
          respond.sendJson(404, {
            ok: false,
            error: `Not found: ${url.pathname}`,
            code: 'BRACKETS_NOT_FOUND',
            requestId
          });
          return;
        }
        const extension = path.extname(staticTarget).toLowerCase();
        if (STATIC_SAFE_EXTENSIONS.has(extension) && existsSync(staticTarget)) {
          const fileInfo = await stat(staticTarget);
          if (fileInfo.isFile()) {
            respond.send(200, MIME_TYPES.get(extension) ?? 'application/octet-stream', await readStaticBody(staticTarget));
            return;
          }
        }
        respond.sendJson(404, {
          ok: false,
          error: `Not found: ${url.pathname}`,
          code: 'BRACKETS_NOT_FOUND',
          requestId
        });
        return;
      }

      if (url.pathname === '/__brackets/session') {
        respond.sendJson(200, session, {
          'Set-Cookie': cookieHeader
        });
        return;
      }

      if (url.pathname === '/__brackets/host') {
        respond.sendJson(200, hostContract);
        return;
      }

      if (url.pathname === '/__brackets/render') {
        const targetPath = normalizePublicPath(url.searchParams.get('path') ?? '/');
        const match = matchDiscoveredRoute(appSnapshot, targetPath);
        if (!match) {
          sendFrameworkError(res, createFrameworkError(404, 'BRACKETS_ROUTE_NOT_FOUND', `Unknown Brackets route: ${targetPath}`, {
            requestId
          }), requestId, requestContext);
          return;
        }

        const authStatus = routeAuthStatus(match.route, session);
        if (authStatus !== 'allowed') {
          respond.sendJson(200, {
            ok: true,
            path: targetPath,
            params: match.params,
            route: routeRecord(match.route, targetPath),
            redirectTo: routeAuthRedirect(match.route, session) ?? '/login',
            authStatus,
            html: ''
          });
          return;
        }

        if (match.route.redirectTo) {
          respond.sendJson(200, {
            ok: true,
            path: targetPath,
            params: match.params,
            route: routeRecord(match.route, targetPath),
            redirectTo: match.route.redirectTo,
            html: ''
          });
          return;
        }

        const rendered = await renderRouteMarkup(match.route);
        respond.sendJson(200, {
          ok: true,
          path: targetPath,
          params: match.params,
          route: routeRecord(match.route, targetPath),
          html: rendered.html,
          mountHtml: rendered.mountHtml,
          layoutPath: rendered.layoutPath
        });
        return;
      }

      if (url.pathname === '/__brackets/module') {
        const kind = url.searchParams.get('kind');
        const file = url.searchParams.get('file');
        if (!['logic', 'data', 'api'].includes(kind) || !file) {
          sendFrameworkError(res, createFrameworkError(400, 'BRACKETS_INVALID_MODULE_REQUEST', 'Expected kind=logic|data|api and file=...', {
            requestId
          }), requestId, requestContext);
          return;
        }

        const candidate = ensureWithinRoot(entryRoot.absolutePath, path.join(entryRoot.absolutePath, file), `module:${file}`);
        const extension = path.extname(candidate);
        const validExtension = (kind === 'logic' && extension === '.logic')
          || (kind === 'data' && extension === '.data')
          || (kind === 'api' && extension === '.api');

        if (!validExtension || !existsSync(candidate)) {
          sendFrameworkError(res, createFrameworkError(404, 'BRACKETS_MODULE_NOT_FOUND', `Unknown Brackets module: ${file}`, {
            requestId
          }), requestId, requestContext);
          return;
        }

        respond.send(200, 'text/javascript; charset=utf-8', wrapModuleForBrowser(await readText(candidate)));
        return;
      }

      if (url.pathname === '/__brackets/template') {
        const reference = String(url.searchParams.get('ref') ?? '').trim();
        const fromRelativePath = String(url.searchParams.get('from') ?? '').trim();
        if (!reference) {
          sendFrameworkError(res, createFrameworkError(400, 'BRACKETS_TEMPLATE_REF_REQUIRED', 'Expected ref=...', {
            requestId
          }), requestId, requestContext);
          return;
        }

        const template = await resolveTemplateMarkup(appSnapshot, entryRoot, reference, fromRelativePath);
        if (!template) {
          sendFrameworkError(res, createFrameworkError(404, 'BRACKETS_TEMPLATE_NOT_FOUND', `Unknown Brackets template: ${reference}`, {
            requestId
          }), requestId, requestContext);
          return;
        }

        respond.sendJson(200, {
          ok: true,
          path: `/${template.relativePath}`,
          stamp: template.stamp,
          html: template.html
        });
        return;
      }

      if (url.pathname === '/__brackets/rpc') {
        if (req.method !== 'POST') {
          sendFrameworkError(res, createFrameworkError(405, 'BRACKETS_METHOD_NOT_ALLOWED', 'POST required', {
            requestId
          }), requestId, requestContext);
          return;
        }

        requireCsrf(req, csrfToken, requestId);
        const payload = await readJsonRequest(req);
        const kind = payload.kind;
        validateModuleKind(kind, requestId);
        const moduleId = validateModuleId(payload.module, requestId);
        const methodName = validateMethodName(payload.method, requestId);
        const args = Array.isArray(payload.args) ? payload.args : [];
        const routeInfo = validateRoutePayload(payload.route, requestId);
        const routePath = routeInfo.path;
        const match = matchDiscoveredRoute(appSnapshot, routePath);
        const moduleDescriptor = resolveModuleFromSnapshot(appSnapshot, kind, moduleId);

        if (!moduleDescriptor) {
          sendFrameworkError(res, createFrameworkError(404, 'BRACKETS_MODULE_NOT_FOUND', 'Expected a valid data or api module.', {
            requestId
          }), requestId, requestContext);
          return;
        }

        const result = await invokeModuleMethod(
          appSnapshot,
          kind,
          moduleDescriptor,
          methodName,
          args,
          {
            path: routePath,
            id: match?.route.id ?? null,
            params: match?.params ?? {},
            query: routeInfo.query,
            hash: routeInfo.hash
          }
        );

        const isMutating = methodLooksMutating(methodName);
        const invalidatedRoutes = isMutating
          ? dependentRoutePaths(appSnapshot, kind, moduleDescriptor.id ?? moduleId)
          : [];

        if (isMutating) {
          await broadcastLiveUpdates(kind, moduleId);
        }

        respond.sendJson(200, {
          ok: true,
          result,
          invalidate: {
            kind,
            module: moduleDescriptor.id ?? moduleId,
            write: isMutating,
            routes: invalidatedRoutes,
            cacheKeys: isMutating
              ? [
                  `${kind}:${moduleDescriptor.id ?? moduleId}`,
                  ...invalidatedRoutes
                ]
              : []
          }
        });
        return;
      }

      if (url.pathname === '/__brackets/live' || url.pathname === '/__brackets/live.state' || url.pathname === '/__brackets/live.json') {
        if (req.method !== 'GET') {
          sendFrameworkError(res, createFrameworkError(405, 'BRACKETS_METHOD_NOT_ALLOWED', 'GET required', {
            requestId
          }), requestId, requestContext);
          return;
        }

        const kind = url.searchParams.get('kind');
        validateModuleKind(kind, requestId);
        const moduleId = validateModuleId(url.searchParams.get('module'), requestId);
        const methodName = validateMethodName(url.searchParams.get('method'), requestId);
        const routePath = normalizePublicPath(url.searchParams.get('route') ?? '/');
        const intervalMs = Math.max(250, Math.min(10000, Number(url.searchParams.get('intervalMs') ?? 1000) || 1000));
        const match = matchDiscoveredRoute(appSnapshot, routePath);
        const moduleDescriptor = resolveModuleFromSnapshot(appSnapshot, kind, moduleId);
        const subscriberId = `${requestId}:${kind}:${moduleId}:${methodName}:${routePath}`;

        if (!moduleDescriptor) {
          sendFrameworkError(res, createFrameworkError(404, 'BRACKETS_MODULE_NOT_FOUND', 'Expected a valid data or api module.', {
            requestId
          }), requestId, requestContext);
          return;
        }

        res.writeHead(200, {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache, no-transform',
          Connection: 'keep-alive'
        });

        let closed = false;
        let running = false;
        let lastSerialized = null;

        const emit = (eventName, payload) => {
          const serialized = typeof payload === 'string'
            ? payload
            : JSON.stringify(payload);
          res.write(`event: ${eventName}\n`);
          for (const line of String(serialized).split('\n')) {
            res.write(`data: ${line}\n`);
          }
          res.write('\n');
        };

        const sendSnapshot = async () => {
          if (closed || running) {
            return;
          }

          running = true;
          try {
            const nextSnapshot = await getSnapshot();
            const nextModuleDescriptor = resolveModuleFromSnapshot(nextSnapshot, kind, moduleId);
            if (!nextModuleDescriptor) {
              return;
            }
            const result = await invokeModuleMethod(
              nextSnapshot,
              kind,
              nextModuleDescriptor,
              methodName,
              [],
              {
                path: routePath,
                id: match?.route.id ?? null,
                params: match?.params ?? {},
                query: {},
                hash: ''
              }
            );

            const serialized = JSON.stringify(result);
            if (serialized !== lastSerialized) {
              lastSerialized = serialized;
              emit('message', result);
            }
          } catch (error) {
            emit('error', {
              error: String(error?.clientMessage ?? error?.message ?? error),
              code: String(error?.code ?? 'BRACKETS_LIVE_ERROR'),
              requestId
            });
          } finally {
            running = false;
          }
        };

        subscribeLiveStream(subscriberId, {
          kind,
          moduleId,
          push: sendSnapshot
        });

        emit('open', {
          ok: true,
          kind,
          module: moduleId,
          method: methodName,
          intervalMs
        });
        await sendSnapshot();

        const timer = setInterval(() => {
          void sendSnapshot();
        }, intervalMs);

        const closeStream = () => {
          closed = true;
          clearInterval(timer);
          unsubscribeLiveStream(subscriberId);
          res.end();
        };

        req.on('close', closeStream);
        res.on('close', closeStream);

        return;
      }

      if (url.pathname === '/.well-known/brackets-host.json') {
        respond.sendJson(200, hostContract);
        return;
      }

      if (url.pathname === '/.well-known/brackets-app.json') {
        respond.sendJson(200, {
          framework: 'Brackets',
          version: BRACKETS_VERSION,
          appRoot: appSnapshot.appRoot,
          entryFolder: appSnapshot.entryFolder,
          entryPoint: entryPointPath(appSnapshot.entryFolder),
          routes: appSnapshot.routes.map((route) => routeRecord(route, '/')),
          modules: {
            data: appSnapshot.dataModules.map((module) => appModuleRecord('data', module)),
            api: appSnapshot.apiModules.map((module) => appModuleRecord('api', module))
          },
          router: {
            mode: appSnapshot.routes.length ? 'hybrid' : 'starter',
            logicUrl: appSnapshot.routerLogic.relativePath
              ? `/__brackets/module?kind=logic&file=${encodeURIComponent(appSnapshot.routerLogic.relativePath)}`
              : null,
            groupedLogicUrls: appSnapshot.groupedRouteLogic.modules.map((module) => `/__brackets/module?kind=logic&file=${encodeURIComponent(module.relativePath)}`),
            hooks: appSnapshot.routerLogic.hooks,
            sources: {
              views: appSnapshot.hasViews,
              routerLogic: appSnapshot.hasRouterLogic,
              groupedRoutes: appSnapshot.hasGroupedRoutes
            }
          },
          branding: config.branding
        });
        return;
      }

      if (url.pathname === '/service-worker.js') {
        respond.send(404, 'text/plain; charset=utf-8', 'Not found');
        return;
      }

      let decodedPathname;
      try {
        decodedPathname = decodeURIComponent(url.pathname);
      } catch {
        respond.send(400, 'text/plain; charset=utf-8', 'Bad request');
        return;
      }
      const staticTarget = ensureWithinRoot(
        entryRoot.absolutePath,
        path.join(entryRoot.absolutePath, decodedPathname.replace(/^\/+/, '')),
        `static:${url.pathname}`
      );
      const extension = path.extname(staticTarget).toLowerCase();
      if (STATIC_SAFE_EXTENSIONS.has(extension) && existsSync(staticTarget)) {
        const fileInfo = await stat(staticTarget);
        if (fileInfo.isFile()) {
          respond.send(200, MIME_TYPES.get(extension) ?? 'application/octet-stream', await readStaticBody(staticTarget));
          return;
        }
      }

      if (shouldServeShell(url.pathname) && existsSync(entryRoot.indexPath)) {
        const source = await readText(entryRoot.indexPath);
        respond.send(200, 'text/html; charset=utf-8', transformHtmlSyntax(hydratePackagedIndexHtml(source, {
          csrfToken,
          session,
          host: hostContract,
          appConfig: config
        })), {
          'Set-Cookie': cookieHeader
        });
        return;
      }

      respond.sendJson(404, {
        ok: false,
        error: `Not found: ${url.pathname}`,
        code: 'BRACKETS_NOT_FOUND',
        requestId
      });
    } catch (error) {
      if (Number(error?.statusCode) >= 500 || !Number(error?.statusCode)) {
        console.error(`[Brackets ${requestId}]`, error);
      }
      sendFrameworkError(res, error, requestId, requestContext);
    }
  });

  server.on('connection', (socket) => {
    sockets.add(socket);
    socket.on('close', () => {
      sockets.delete(socket);
    });
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(resolvedPort, resolvedHost, resolve);
  });

  const address = server.address();
  const actualPort = typeof address === 'object' && address ? address.port : resolvedPort;
  addresses = networkOriginsForHost(protocol, resolvedHost, actualPort);
  origin = addresses.preferredOrigin;
  snapshot = await discoverBracketsApp(packageRoot, entryRoot, config);
  hostContract = buildHostContract(packageRoot, origin, config, addresses, snapshot, liveReload);

  if (liveReload) {
    const onFsEvent = (_event, fname) => {
      const target = fname
        ? path.resolve(packageRoot, fname)
        : packageRoot;
      scheduleDevRediscover(target);
    };
    try {
      devWatchers.push(watch(packageRoot, { recursive: true }, onFsEvent));
    } catch {
      const fallbackDirs = [
        packageRoot,
        path.join(packageRoot, config.app),
        entryRoot.absolutePath
      ];
      for (const dir of fallbackDirs) {
        if (!existsSync(dir)) {
          continue;
        }
        try {
          devWatchers.push(watch(dir, onFsEvent));
        } catch {
          // Ignore directories the host cannot watch on this platform.
        }
      }
    }
  }

  return {
    server,
    url: origin,
    host: hostContract,
    async close() {
      if (devDebounceTimer) {
        clearTimeout(devDebounceTimer);
        devDebounceTimer = null;
      }
      for (const w of devWatchers) {
        try {
          w.close();
        } catch {
          // Ignore close errors from platform watchers.
        }
      }
      devWatchers.length = 0;
      for (const client of devSseClients) {
        try {
          client.end();
        } catch {
          // Ignore half-open SSE clients.
        }
      }
      devSseClients.clear();
      await new Promise((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
        for (const socket of sockets) {
          socket.destroy();
        }
      });
    }
  };
}
