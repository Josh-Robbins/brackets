import path from 'node:path';
import { existsSync } from 'node:fs';
import { cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import crypto from 'node:crypto';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { findBracketsConfigFile, loadBracketsConfig } from './config.js';
import {
  BracketsContractError,
  validateLogicModuleContract,
  validateRouterModuleContract,
  validateRpcModuleContract
} from './contracts.js';
import { validatePageManifest } from './page.js';
import { createServer } from './server.js';
import { transformHtmlSyntax } from './syntax.js';

const ROUTE_GENERATION_EXCLUDE_DIRS = new Set([
  '.git',
  'node_modules',
  'framework',
  'config',
  'tests',
  'layouts',
  'components',
  'fragments',
  'partials',
  'includes',
  'api',
  'data',
  'storage',
  'logic',
  'routes'
]);
const ROUTE_STRIP_PREFIXES = ['pages/', 'views/', 'screens/'];
const SPECIFIER_ALIASES = {
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

function toModuleSource(source, extension) {
  const trimmed = source.trim();
  const pageImport = `import { page } from ${JSON.stringify(pathToFileURL(path.resolve('src/page.js')).href)};\n`;

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

async function loadDefaultExport(filePath) {
  const source = await readFile(filePath, 'utf8');
  const wrapped = toModuleSource(source, path.extname(filePath));
  const hash = crypto.createHash('sha1').update(filePath).update(wrapped).digest('hex');
  const cacheDir = path.join(tmpdir(), 'brackets-tooling');
  await mkdir(cacheDir, { recursive: true });
  const modulePath = path.join(cacheDir, `${hash}.mjs`);
  await writeFile(modulePath, wrapped, 'utf8');
  const imported = await import(pathToFileURL(modulePath).href + `?t=${Date.now()}`);
  return imported.default;
}

function issuePathTokens(issuePath = '') {
  return [...String(issuePath).matchAll(/\.([A-Za-z_$][A-Za-z0-9_$-]*)(?:\[\d+\])?/g)].map((match) => match[1]);
}

function lineFromIndex(source, index) {
  return source.slice(0, index).split('\n').length;
}

function locateLineForIssuePath(source, issuePath, fallback = 1) {
  const tokens = issuePathTokens(issuePath);
  if (!tokens.length) {
    return fallback;
  }

  const searchToken = tokens.at(-1);
  const escapedToken = searchToken.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patterns = [
    new RegExp(`["']?${escapedToken}["']?\\s*:`, 'g'),
    new RegExp(`(?:^|[\\s,{])(?:async\\s+)?${escapedToken}\\s*\\(`, 'gm')
  ];
  const matches = patterns.flatMap((pattern) => [...source.matchAll(pattern)]);
  if (!matches.length) {
    return fallback;
  }

  if (matches.length === 1 || tokens.length === 1) {
    return lineFromIndex(source, matches[0].index ?? 0);
  }

  for (let index = tokens.length - 2; index >= 0; index -= 1) {
    const parentToken = tokens[index];
    const parentPattern = new RegExp(`["']?${parentToken.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["']?\\s*:`, 'g');
    const parentMatch = parentPattern.exec(source);
    if (!parentMatch) {
      continue;
    }

    const nestedMatch = matches.find((match) => (match.index ?? 0) >= (parentMatch.index ?? 0));
    if (nestedMatch) {
      return lineFromIndex(source, nestedMatch.index ?? 0);
    }
  }

  return lineFromIndex(source, matches[0].index ?? 0);
}

function createDiagnostic({ file, line = 1, column = 1, code = 'BRACKETS_CHECK', message, level = 'error', issue = null, hint = null }) {
  return {
    level,
    file,
    line,
    column,
    code,
    message,
    issue,
    hint
  };
}

function lineFromPattern(source, pattern, fallback = 1) {
  const match = pattern.exec(source);
  if (!match || match.index === undefined) {
    return fallback;
  }
  return lineFromIndex(source, match.index);
}

function resolveCheckSpecifier(specifier, appRoot, baseDir = appRoot) {
  if (typeof specifier !== 'string' || !specifier.trim()) {
    return null;
  }

  const normalizedRoot = path.resolve(appRoot);
  const describe = (resolvedPath) => {
    const normalizedPath = path.resolve(resolvedPath);
    return {
      path: normalizedPath,
      outsideRoot: normalizedPath !== normalizedRoot && !normalizedPath.startsWith(`${normalizedRoot}${path.sep}`)
    };
  };

  for (const [alias, target] of Object.entries(SPECIFIER_ALIASES)) {
    if (specifier.startsWith(alias)) {
      return describe(path.join(appRoot, target, specifier.slice(alias.length)));
    }
  }

  if (specifier.startsWith('/app/')) {
    return describe(path.join(appRoot, specifier.slice('/app/'.length).split('/').join(path.sep)));
  }

  return describe(path.resolve(baseDir, specifier));
}

function collectArchitectureDiagnostics(filePath, source, kind) {
  const diagnostics = [];
  const rules = {
    logic: [
      {
        pattern: /\bstorage\.(json|yaml|db|ejson|eyaml|secureJson|secureYaml)\s*\(/,
        message: '.logic should call local persistence through `.data`, not through direct storage helpers.',
        hint: 'Move persistence rules into a `.data` module and call it from `.logic` through ctx.data.'
      },
      {
        pattern: /\bfetch\s*\(|\bhttp\.(client|resource|openapi|request|get|post|put|patch|delete|read)\s*\(/,
        message: '.logic should use `.api` for remote/backend transport instead of reaching for transport directly.',
        hint: 'Move remote calls into a `.api` module and call it from `.logic` through ctx.api.'
      }
    ],
    api: [
      {
        pattern: /\bstorage\.(json|yaml|db|ejson|eyaml|secureJson|secureYaml)\s*\(/,
        message: '.api should stay remote/backend-facing and should not own local persistence.',
        hint: 'Move local file or database access into a `.data` module.'
      }
    ],
    data: [
      {
        pattern: /\bfetch\s*\(|\bhttp\.(client|resource|openapi|request|get|post|put|patch|delete|read)\s*\(/,
        message: '.data should stay local-first and should not own remote/backend transport.',
        hint: 'Move remote sync or backend access into a `.api` module.'
      }
    ]
  };

  for (const rule of rules[kind] ?? []) {
    if (!rule.pattern.test(source)) {
      continue;
    }

    diagnostics.push(createDiagnostic({
      file: filePath,
      line: lineFromPattern(source, rule.pattern),
      code: 'BRACKETS_ARCHITECTURE_INVALID',
      message: rule.message,
      hint: rule.hint
    }));
  }

  return diagnostics;
}

function normalizeRoutePathForCheck(route) {
  if (!route || route === '/') {
    return '/';
  }

  const normalized = route.startsWith('/') ? route : `/${route}`;
  return normalized.length > 1
    ? normalized.replace(/\/+$/, '')
    : normalized;
}

function normalizeAliasValues(definition = {}) {
  return [...new Set([
    ...(typeof definition.alias === 'string' ? [definition.alias] : []),
    ...(Array.isArray(definition.aliases) ? definition.aliases : [])
  ].filter((value) => typeof value === 'string' && value.trim()).map((value) => normalizeRoutePathForCheck(value)))];
}

function buildRouteEntry(filePath, definition, appRoot, kind) {
  const viewsDir = path.join(appRoot, 'views');
  const routesDir = path.join(appRoot, 'routes');
  const relativePath = path.relative(appRoot, filePath);
  const defaultRouteRoot = kind === 'view'
    ? (filePath.startsWith(viewsDir) ? viewsDir : appRoot)
    : (relativePath === 'router.logic' ? null : routesDir);
  const route = normalizeRoutePathForCheck(
    definition.route ?? (defaultRouteRoot ? deriveRouteFromFile(filePath, defaultRouteRoot) : '/')
  );

  return {
    filePath,
    id: definition.id,
    route,
    aliases: normalizeAliasValues(definition),
    redirectTo: typeof definition.redirectTo === 'string' && definition.redirectTo.trim()
      ? normalizeRoutePathForCheck(definition.redirectTo)
      : null
  };
}

function collectRouteIdentityDiagnostics(entries, sources) {
  const diagnostics = [];
  const ids = new Map();
  const routes = new Map();

  for (const entry of entries) {
    if (typeof entry.id === 'string' && entry.id.trim()) {
      const bucket = ids.get(entry.id) ?? [];
      bucket.push(entry);
      ids.set(entry.id, bucket);
    }

    const routeKeys = [entry.route, ...entry.aliases];
    for (const routeKey of routeKeys) {
      const bucket = routes.get(routeKey) ?? [];
      bucket.push(entry);
      routes.set(routeKey, bucket);
    }
  }

  for (const [id, bucket] of ids) {
    if (bucket.length < 2) {
      continue;
    }

    for (const entry of bucket) {
      const source = sources.get(entry.filePath) ?? '';
      diagnostics.push(createDiagnostic({
        file: entry.filePath,
        line: locateLineForIssuePath(source, `${entry.filePath}.id`),
        code: 'BRACKETS_ROUTE_ID_CONFLICT',
        message: `Route id "${id}" is declared more than once.`,
        hint: 'Give each page or route definition a stable unique id.'
      }));
    }
  }

  for (const [routeKey, bucket] of routes) {
    if (bucket.length < 2) {
      continue;
    }

    const uniqueFiles = new Set(bucket.map((entry) => `${entry.filePath}:${entry.route}:${entry.aliases.join('|')}`));
    if (uniqueFiles.size < 2) {
      continue;
    }

    for (const entry of bucket) {
      const source = sources.get(entry.filePath) ?? '';
      diagnostics.push(createDiagnostic({
        file: entry.filePath,
        line: locateLineForIssuePath(source, `${entry.filePath}.route`),
        code: 'BRACKETS_ROUTE_CONFLICT',
        message: `Route path "${routeKey}" is declared more than once.`,
        hint: 'Use unique routes and aliases so one path maps to one page definition.'
      }));
    }
  }

  for (const entry of entries) {
    if (!entry.redirectTo) {
      continue;
    }

    if (![entry.route, ...entry.aliases].includes(entry.redirectTo)) {
      continue;
    }

    const source = sources.get(entry.filePath) ?? '';
    diagnostics.push(createDiagnostic({
      file: entry.filePath,
      line: locateLineForIssuePath(source, `${entry.filePath}.redirectTo`),
      code: 'BRACKETS_ROUTE_REDIRECT_LOOP',
      message: `Route "${entry.route}" redirects back to "${entry.redirectTo}".`,
      hint: 'Redirect routes should point to a different destination path to avoid navigation loops.'
    }));
  }

  const redirectGraph = new Map();
  const redirectOwners = new Map();
  for (const entry of entries) {
    if (!entry.redirectTo) {
      continue;
    }

    for (const sourcePath of [entry.route, ...entry.aliases]) {
      redirectGraph.set(sourcePath, entry.redirectTo);
      redirectOwners.set(sourcePath, entry);
    }
  }

  const cycleNodes = new Set();
  for (const start of redirectGraph.keys()) {
    if (cycleNodes.has(start)) {
      continue;
    }

    const pathIndex = new Map();
    const chain = [];
    let current = start;

    while (current && redirectGraph.has(current)) {
      if (pathIndex.has(current)) {
        for (const node of chain.slice(pathIndex.get(current))) {
          cycleNodes.add(node);
        }
        break;
      }

      if (cycleNodes.has(current)) {
        break;
      }

      pathIndex.set(current, chain.length);
      chain.push(current);
      current = redirectGraph.get(current);
    }
  }

  const reportedLoops = new Set();
  for (const node of cycleNodes) {
    const entry = redirectOwners.get(node);
    if (!entry) {
      continue;
    }

    const reportKey = `${entry.filePath}:${entry.route}:${entry.redirectTo}`;
    if (reportedLoops.has(reportKey)) {
      continue;
    }
    reportedLoops.add(reportKey);

    const source = sources.get(entry.filePath) ?? '';
    diagnostics.push(createDiagnostic({
      file: entry.filePath,
      line: locateLineForIssuePath(source, `${entry.filePath}.redirectTo`),
      code: 'BRACKETS_ROUTE_REDIRECT_LOOP',
      message: `Route "${entry.route}" participates in a redirect loop through "${entry.redirectTo}".`,
      hint: 'Redirect routes should end at a non-redirect destination path instead of cycling between routes.'
    }));
  }

  return diagnostics;
}

function collectManifestReferenceDiagnostics(filePath, definition, appRoot, source) {
  const diagnostics = [];
  const baseDir = path.dirname(filePath);

  const requiredRefs = [
    ['html', definition.html],
    ['logic', definition.logic],
    ['layout', definition.layout]
  ];

  for (const [field, specifier] of requiredRefs) {
    if (!specifier) {
      continue;
    }

    const resolved = resolveCheckSpecifier(specifier, appRoot, baseDir);
    if (!resolved) {
      continue;
    }

    if (resolved.outsideRoot) {
      diagnostics.push(createDiagnostic({
        file: filePath,
        line: locateLineForIssuePath(source, `${filePath}.${field}`),
        code: 'BRACKETS_REFERENCE_OUTSIDE_APP',
        message: `${field} reference "${specifier}" points outside the app root.`,
        hint: `Keep ${field} references inside the app folder.`
      }));
      continue;
    }

    if (!existsSync(resolved.path)) {
      diagnostics.push(createDiagnostic({
        file: filePath,
        line: locateLineForIssuePath(source, `${filePath}.${field}`),
        code: 'BRACKETS_REFERENCE_MISSING',
        message: `Missing ${field} reference "${specifier}".`,
        hint: `Create the referenced ${field} file or update the ${field} specifier.`
      }));
    }
  }

  for (const [group, entries] of Object.entries({
    api: definition.api ?? {},
    data: definition.data ?? {}
  })) {
    for (const [name, specifier] of Object.entries(entries)) {
      const resolved = resolveCheckSpecifier(specifier, appRoot, baseDir);
      if (!resolved) {
        continue;
      }

      if (resolved.outsideRoot) {
        diagnostics.push(createDiagnostic({
          file: filePath,
          line: locateLineForIssuePath(source, `${filePath}.${group}.${name}`),
          code: 'BRACKETS_REFERENCE_OUTSIDE_APP',
          message: `${group} dependency "${name}" points outside the app root: "${specifier}".`,
          hint: `Keep ${group}.${name} inside the app folder.`
        }));
        continue;
      }

      if (!existsSync(resolved.path)) {
        diagnostics.push(createDiagnostic({
          file: filePath,
          line: locateLineForIssuePath(source, `${filePath}.${group}.${name}`),
          code: 'BRACKETS_REFERENCE_MISSING',
          message: `Missing ${group} dependency "${name}" at "${specifier}".`,
          hint: `Create the referenced ${group} file or update the ${group}.${name} specifier.`
        }));
      }
    }
  }

  return diagnostics;
}

function diagnosticsFromContractError(error, filePath, source) {
  if (!(error instanceof BracketsContractError) || !Array.isArray(error.issues) || !error.issues.length) {
    return [createDiagnostic({
      file: filePath,
      code: error.code ?? 'BRACKETS_CHECK',
      message: error.message,
      hint: error.hint ?? null
    })];
  }

  return error.issues.map((issue) => {
    const line = locateLineForIssuePath(source, issue.path);
    return createDiagnostic({
      file: filePath,
      line,
      code: error.code,
      message: issue.message,
      issue,
      hint: error.hint ?? null
    });
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

async function withServer(appRoot, handler) {
  const instance = await createServer({
    appRoot,
    host: '127.0.0.1',
    port: 0
  });

  try {
    return await handler(instance);
  } finally {
    await instance.close();
  }
}

async function listFilesRecursive(rootDir, extension, options = {}) {
  if (!existsSync(rootDir)) {
    return [];
  }

  const entries = await readdir(rootDir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.isDirectory() && options.excludeDirs?.has(entry.name)) {
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

  return files.sort((left, right) => left.localeCompare(right));
}

function toPosixPath(value) {
  return value.split(path.sep).join('/');
}

function relativeSpecifier(fromDir, targetPath) {
  const relative = toPosixPath(path.relative(fromDir, targetPath));
  return relative.startsWith('.')
    ? relative
    : `./${relative}`;
}

function stripRoutePrefixes(relativePath) {
  let normalized = toPosixPath(relativePath);
  for (const prefix of ROUTE_STRIP_PREFIXES) {
    if (normalized.startsWith(prefix)) {
      normalized = normalized.slice(prefix.length);
      break;
    }
  }
  return normalized;
}

function routeSegmentFromFileSegment(segment) {
  if (/^\(.+\)$/.test(segment)) {
    return null;
  }

  const catchAll = segment.match(/^\[\.\.\.(.+)\]$/);
  if (catchAll) {
    return `*${catchAll[1]}`;
  }

  const dynamic = segment.match(/^\[(.+)\]$/);
  if (dynamic) {
    return `:${dynamic[1]}`;
  }

  return segment;
}

function inferRouteFromHtml(relativePath) {
  const withoutExtension = stripRoutePrefixes(relativePath).replace(/\.[^.]+$/, '');
  const segments = toPosixPath(withoutExtension)
    .split('/')
    .filter(Boolean);

  if (segments.some((segment) => segment.startsWith('_'))) {
    return null;
  }

  const routeSegments = [];
  for (const [index, segment] of segments.entries()) {
    const isTrailingIndex = index === segments.length - 1 && segment.toLowerCase() === 'index';
    if (isTrailingIndex) {
      continue;
    }

    const normalized = routeSegmentFromFileSegment(segment);
    if (!normalized) {
      continue;
    }
    routeSegments.push(normalized);
  }

  return routeSegments.length
    ? `/${routeSegments.join('/')}`
    : '/';
}

function inferRouteId(relativePath) {
  const withoutExtension = stripRoutePrefixes(relativePath).replace(/\.[^.]+$/, '');
  const segments = toPosixPath(withoutExtension)
    .split('/')
    .filter(Boolean)
    .map((segment) => {
      if (/^\(.+\)$/.test(segment)) {
        return null;
      }

      if (segment.toLowerCase() === 'index') {
        return null;
      }

      return segment
        .replace(/^\[\.\.\.(.+)\]$/, '$1-splat')
        .replace(/^\[(.+)\]$/, '$1')
        .replace(/[^a-zA-Z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .toLowerCase();
    })
    .filter(Boolean);

  return segments.length
    ? segments.join('-')
    : 'home';
}

function inferTitleFromHtml(relativePath) {
  const withoutExtension = path.basename(relativePath).replace(/\.[^.]+$/, '');
  if (withoutExtension.toLowerCase() === 'index') {
    return 'Home';
  }

  const plain = withoutExtension
    .replace(/^\[\.\.\.(.+)\]$/, '$1')
    .replace(/^\[(.+)\]$/, '$1')
    .replace(/[-_]+/g, ' ')
    .trim();

  return plain
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function findCompanionLogic(htmlPath, appRoot) {
  const siblingLogic = htmlPath.replace(/\.html$/i, '.logic');
  if (existsSync(siblingLogic)) {
    return siblingLogic;
  }

  const relativeHtml = stripRoutePrefixes(toPosixPath(path.relative(appRoot, htmlPath))).replace(/\.html$/i, '.logic');
  const conventionalLogic = path.join(appRoot, 'logic', relativeHtml.split('/').join(path.sep));
  if (existsSync(conventionalLogic)) {
    return conventionalLogic;
  }

  return null;
}

async function routeGenerationCoverage(appRoot) {
  try {
    return await withServer(appRoot, async (instance) => {
      const payload = await fetch(`${instance.url}/config/brackets.json`).then((response) => response.json());
      return {
        routes: payload.routes,
        warnings: []
      };
    });
  } catch (error) {
    return {
      routes: [],
      warnings: [
        `Route generation could not inspect existing routes through the host, so only file-level checks were used: ${error.message}`
      ]
    };
  }
}

function buildGeneratedViewSource({ id, route, htmlSpecifier, logicSpecifier, title }) {
  const lines = [
    'page({',
    `  id: ${JSON.stringify(id)},`,
    `  route: ${JSON.stringify(route)},`,
    `  html: ${JSON.stringify(htmlSpecifier)},`
  ];

  if (title) {
    lines.push(`  title: ${JSON.stringify(title)},`);
  }

  if (logicSpecifier) {
    lines.push(`  logic: ${JSON.stringify(logicSpecifier)},`);
  }

  const trailing = lines[lines.length - 1];
  lines[lines.length - 1] = trailing.replace(/,$/, '');
  lines.push('})', '');
  return lines.join('\n');
}

export async function generateRoutes(appRoot, options = {}) {
  const write = options.write !== false;
  const force = options.force === true;
  const htmlFiles = await listFilesRecursive(appRoot, '.html', {
    excludeDirs: ROUTE_GENERATION_EXCLUDE_DIRS
  });
  const coverage = await routeGenerationCoverage(appRoot);
  const existingHtmlUrls = new Set(coverage.routes.map((route) => route.htmlUrl));
  const existingRoutes = new Map(coverage.routes.map((route) => [route.route, route]));
  const seenGeneratedRoutes = new Map();
  const created = [];
  const skipped = [];

  for (const htmlPath of htmlFiles) {
    const htmlSource = await readFile(htmlPath, 'utf8');
    const relativeHtml = toPosixPath(path.relative(appRoot, htmlPath));
    const htmlUrl = `/app/${relativeHtml}`;
    const viewPath = htmlPath.replace(/\.html$/i, '.view');

    if (/:area\s*=|data-brx-area=|:fill\s*=|data-brx-fill=/i.test(htmlSource)) {
      skipped.push({
        htmlPath,
        viewPath,
        reason: 'layout-or-fill-template'
      });
      continue;
    }

    if (existingHtmlUrls.has(htmlUrl)) {
      skipped.push({
        htmlPath,
        viewPath,
        reason: 'already-routed'
      });
      continue;
    }

    if (existsSync(viewPath) && !force) {
      skipped.push({
        htmlPath,
        viewPath,
        reason: 'view-exists'
      });
      continue;
    }

    const route = inferRouteFromHtml(relativeHtml);
    if (!route) {
      skipped.push({
        htmlPath,
        viewPath,
        reason: 'route-opt-out'
      });
      continue;
    }

    if (existingRoutes.has(route) && existingRoutes.get(route)?.htmlUrl !== htmlUrl) {
      skipped.push({
        htmlPath,
        viewPath,
        route,
        reason: 'route-conflict'
      });
      continue;
    }

    if (seenGeneratedRoutes.has(route)) {
      skipped.push({
        htmlPath,
        viewPath,
        route,
        reason: `route-conflict:${seenGeneratedRoutes.get(route)}`
      });
      continue;
    }

    seenGeneratedRoutes.set(route, relativeHtml);

    const logicPath = findCompanionLogic(htmlPath, appRoot);
    const generated = {
      id: inferRouteId(relativeHtml),
      title: inferTitleFromHtml(relativeHtml),
      route,
      htmlPath,
      viewPath,
      htmlSpecifier: relativeSpecifier(path.dirname(viewPath), htmlPath),
      logicSpecifier: logicPath ? relativeSpecifier(path.dirname(viewPath), logicPath) : null
    };

    if (write) {
      await writeFile(viewPath, buildGeneratedViewSource(generated), 'utf8');
    }

    created.push(generated);
  }

  return {
    ok: true,
    appRoot,
    write,
    force,
    created,
    skipped,
    warnings: coverage.warnings
  };
}

function auditMarkup(html, label, warnings) {
  if (/<(?:div|span|p|li|section|article)[^>]*data-on:click=/i.test(html) && !/\brole=|\btabindex=/i.test(html)) {
    warnings.push(`${label}: clickable non-interactive element should usually use a button/link or include role and keyboard support`);
  }

  if (/<img\b(?![^>]*\balt=)[^>]*>/i.test(html)) {
    warnings.push(`${label}: image is missing alt text`);
  }

  if (/\bdata-html=/i.test(html)) {
    warnings.push(`${label}: :html/data-html should only render trusted or explicitly sanitized content`);
  }
}

export async function validateApp(appRoot) {
  return withServer(appRoot, async (instance) => {
    const issues = [];
    const warnings = [];
    const routesPayload = await fetch(`${instance.url}/config/brackets.json`).then((response) => response.json());
    const canonicalRoutes = routesPayload.routes.filter((route) => !route.aliasOf);
    const seenIds = new Map();
    const seenPaths = new Map();

    for (const route of canonicalRoutes) {
      if (route.id) {
        const bucket = seenIds.get(route.id) ?? [];
        bucket.push(route.route);
        seenIds.set(route.id, bucket);
      }
      const bucket = seenPaths.get(route.route) ?? [];
      bucket.push(route.id ?? route.sourceUrl ?? route.route);
      seenPaths.set(route.route, bucket);
    }

    for (const route of routesPayload.routes) {
      const htmlResponse = await fetch(`${instance.url}${route.htmlUrl}`);
      if (!htmlResponse.ok) {
        issues.push(`Missing page HTML for route ${route.route}: ${route.htmlUrl}`);
      } else {
        auditMarkup(await htmlResponse.text(), `Route ${route.route} page ${route.htmlUrl}`, warnings);
      }

      if (route.layoutUrl) {
        const layoutResponse = await fetch(`${instance.url}${route.layoutUrl}`);
        if (!layoutResponse.ok) {
          issues.push(`Missing layout HTML for route ${route.route}: ${route.layoutUrl}`);
        } else {
          auditMarkup(await layoutResponse.text(), `Route ${route.route} layout ${route.layoutUrl}`, warnings);
        }
      }

      if (route.logicUrl) {
        const logicResponse = await fetch(`${instance.url}${route.logicUrl}`);
        if (!logicResponse.ok) {
          issues.push(`Missing logic module for route ${route.route}: ${route.logicUrl}`);
        }
      }

      if (!route.meta?.lang) {
        warnings.push(`Route ${route.route}: add meta.lang for a clearer i18n/document-language contract`);
      }
    }

    for (const [id, routes] of seenIds) {
      if (routes.length > 1) {
        issues.push(`Duplicate route id "${id}" was found across multiple canonical routes.`);
      }
    }

    for (const [routePath, owners] of seenPaths) {
      if (owners.length > 1) {
        issues.push(`Duplicate canonical route path "${routePath}" was found across multiple pages.`);
      }
    }

    return {
      ok: issues.length === 0,
      issues,
      warnings,
      audits: {
        accessibility: warnings.filter((warning) => /clickable non-interactive|image is missing alt|trusted or explicitly sanitized/.test(warning)),
        internationalization: warnings.filter((warning) => /meta\.lang/.test(warning))
      },
      routes: routesPayload.routes
    };
  });
}

export async function checkTypes(appRoot) {
  const resolvedAppRoot = path.resolve(appRoot);
  const diagnostics = [];
  let filesChecked = 0;
  const routeEntries = [];
  const routeSources = new Map();

  const configFile = findBracketsConfigFile(resolvedAppRoot);
  if (configFile) {
    filesChecked += 1;
    const source = await readFile(configFile, 'utf8');
    try {
      await loadBracketsConfig(resolvedAppRoot);
    } catch (error) {
      diagnostics.push(...diagnosticsFromContractError(error, configFile, source));
    }
  }

  const frameworkFiles = await listFilesRecursive(resolvedAppRoot, '.view', {
    excludeDirs: new Set(['node_modules', '.git', 'framework', 'config', 'tests'])
  });
  const logicFiles = await listFilesRecursive(resolvedAppRoot, '.logic', {
    excludeDirs: new Set(['node_modules', '.git', 'framework', 'config', 'tests'])
  });
  const apiFiles = await listFilesRecursive(resolvedAppRoot, '.api', {
    excludeDirs: new Set(['node_modules', '.git', 'framework', 'config', 'tests'])
  });
  const dataFiles = await listFilesRecursive(resolvedAppRoot, '.data', {
    excludeDirs: new Set(['node_modules', '.git', 'framework', 'config', 'tests'])
  });
  const routeLogicFiles = [];
  const appLogicFiles = [];

  for (const filePath of logicFiles) {
    const relativePath = path.relative(resolvedAppRoot, filePath);
    const routePrefix = `routes${path.sep}`;
    if (relativePath === 'router.logic' || relativePath.startsWith(routePrefix)) {
      routeLogicFiles.push(filePath);
    } else {
      appLogicFiles.push(filePath);
    }
  }

  for (const filePath of frameworkFiles) {
    filesChecked += 1;
    const source = await readFile(filePath, 'utf8');
    routeSources.set(filePath, source);
    try {
      const exported = await loadDefaultExport(filePath);
      validatePageManifest(exported, `page manifest ${filePath}`);
      routeEntries.push(buildRouteEntry(filePath, exported, resolvedAppRoot, 'view'));
      diagnostics.push(...collectManifestReferenceDiagnostics(filePath, exported, resolvedAppRoot, source));
    } catch (error) {
      diagnostics.push(...diagnosticsFromContractError(error, filePath, source));
    }
  }

  for (const filePath of routeLogicFiles) {
    filesChecked += 1;
    const source = await readFile(filePath, 'utf8');
    routeSources.set(filePath, source);
    try {
      const exported = await loadDefaultExport(filePath);
      validateRouterModuleContract(exported, `router logic ${filePath}`);
      const definitions = extractRouteDefinitions(exported);
      for (const definition of definitions) {
        validatePageManifest(definition, `route definition ${filePath}`);
        routeEntries.push(buildRouteEntry(filePath, definition, resolvedAppRoot, 'route-logic'));
        diagnostics.push(...collectManifestReferenceDiagnostics(filePath, definition, resolvedAppRoot, source));
      }
    } catch (error) {
      diagnostics.push(...diagnosticsFromContractError(error, filePath, source));
    }
  }

  for (const filePath of appLogicFiles) {
    filesChecked += 1;
    const source = await readFile(filePath, 'utf8');
    try {
      const exported = await loadDefaultExport(filePath);
      validateLogicModuleContract(exported, `logic module ${filePath}`);
    } catch (error) {
      diagnostics.push(...diagnosticsFromContractError(error, filePath, source));
    }
    diagnostics.push(...collectArchitectureDiagnostics(filePath, source, 'logic'));
  }

  for (const filePath of apiFiles) {
    filesChecked += 1;
    const source = await readFile(filePath, 'utf8');
    try {
      const exported = await loadDefaultExport(filePath);
      validateRpcModuleContract(exported, {
        context: `api module ${filePath}`,
        code: 'BRACKETS_API_INVALID',
        kind: 'api'
      });
    } catch (error) {
      diagnostics.push(...diagnosticsFromContractError(error, filePath, source));
    }
    diagnostics.push(...collectArchitectureDiagnostics(filePath, source, 'api'));
  }

  for (const filePath of dataFiles) {
    filesChecked += 1;
    const source = await readFile(filePath, 'utf8');
    try {
      const exported = await loadDefaultExport(filePath);
      validateRpcModuleContract(exported, {
        context: `data module ${filePath}`,
        code: 'BRACKETS_DATA_INVALID',
        kind: 'data'
      });
    } catch (error) {
      diagnostics.push(...diagnosticsFromContractError(error, filePath, source));
    }
    diagnostics.push(...collectArchitectureDiagnostics(filePath, source, 'data'));
  }

  diagnostics.push(...collectRouteIdentityDiagnostics(routeEntries, routeSources));

  diagnostics.sort((left, right) => {
    if (left.file !== right.file) {
      return left.file.localeCompare(right.file);
    }
    if (left.line !== right.line) {
      return left.line - right.line;
    }
    return left.message.localeCompare(right.message);
  });

  return {
    ok: diagnostics.length === 0,
    appRoot: resolvedAppRoot,
    filesChecked,
    diagnostics
  };
}

function outputPathForRoute(outDir, route) {
  if (route === '/') {
    return path.join(outDir, 'index.html');
  }

  const pathname = route.replace(/^\/+/, '').replace(/\/+$/, '');
  return path.join(outDir, pathname, 'index.html');
}

function buildPortableReleaseManifest(appRoot, routes, host, importMap, settings = {}) {
  return {
    framework: 'Brackets',
    version: host?.version ?? '0.1.0',
    app: path.basename(appRoot),
    server: settings.server ?? null,
    branding: settings.branding ?? null,
    splash: settings.splash ?? null,
    security: settings.security ?? null,
    assets: settings.assets ?? null,
    distribution: {
      mode: 'portable-folder',
      installFree: true,
      noBuild: true,
      supports: [
        'desktop-folder',
        'file-server',
        'paired-backend'
      ]
    },
    importMap: importMap ?? {},
    routes,
    host: host ?? null
  };
}

function toBrowserModuleSource(source, extension) {
  const trimmed = source.trim();
  const pageImport = `import { page } from '/framework/page.js';\n`;

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

function toExportRelativePath(relativePath) {
  const extension = path.extname(relativePath);
  if (['.view', '.logic', '.api', '.data'].includes(extension)) {
    return `${relativePath}.js`;
  }
  return relativePath;
}

function rewriteRouteForExport(route) {
  const rewrite = (value) => {
    if (!value?.startsWith('/app/')) {
      return value;
    }
    const relative = value.slice('/app/'.length);
    return `/app/${toExportRelativePath(relative).split(path.sep).join('/')}`;
  };

  return {
    ...route,
    htmlUrl: rewrite(route.htmlUrl),
    layoutUrl: rewrite(route.layoutUrl),
    logicUrl: rewrite(route.logicUrl),
    api: Object.fromEntries(Object.entries(route.api ?? {}).map(([key, value]) => [key, rewrite(value)])),
    data: Object.fromEntries(Object.entries(route.data ?? {}).map(([key, value]) => [key, rewrite(value)]))
  };
}

async function exportAppFiles(sourceDir, outputRoot, rootDir = sourceDir) {
  await mkdir(outputRoot, { recursive: true });

  for (const entry of await readdir(sourceDir, { withFileTypes: true })) {
    const sourcePath = path.join(sourceDir, entry.name);
    const relativePath = path.relative(rootDir, sourcePath);
    if (entry.isDirectory()) {
      await exportAppFiles(sourcePath, outputRoot, rootDir);
      continue;
    }

    const extension = path.extname(entry.name);
    const outputRelativePath = toExportRelativePath(relativePath);
    const outputPath = path.join(outputRoot, outputRelativePath);

    if (extension === '.html') {
      const source = await readFile(sourcePath, 'utf8');
      await mkdir(path.dirname(outputPath), { recursive: true });
      await writeFile(outputPath, transformHtmlSyntax(source), 'utf8');
      continue;
    }

    if (['.view', '.logic', '.api', '.data'].includes(extension)) {
      const source = await readFile(sourcePath, 'utf8');
      await mkdir(path.dirname(outputPath), { recursive: true });
      await writeFile(outputPath, toBrowserModuleSource(source, extension), 'utf8');
      continue;
    }

    await mkdir(path.dirname(outputPath), { recursive: true });
    await cp(sourcePath, outputPath);
  }
}

export async function exportStaticSite(appRoot, outDir) {
  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });

  return withServer(appRoot, async (instance) => {
    const routesPayload = await fetch(`${instance.url}/config/brackets.json`).then((response) => response.json());
    const hostContract = await fetch(`${instance.url}/__brackets/host`).then((response) => response.json());
    const exportedRoutes = routesPayload.routes.map(rewriteRouteForExport);
    const appOutDir = path.join(outDir, 'app');
    const frameworkOutDir = path.join(outDir, 'framework');
    const configOutDir = path.join(outDir, 'config');
    const testsOutDir = path.join(outDir, 'tests');
    await mkdir(appOutDir, { recursive: true });
    await mkdir(frameworkOutDir, { recursive: true });
    await mkdir(configOutDir, { recursive: true });
    await mkdir(testsOutDir, { recursive: true });
    await exportAppFiles(appRoot, appOutDir);

    for (const route of routesPayload.routes) {
      const response = await fetch(`${instance.url}${route.route}`);
      const html = await response.text();
      const outputPath = outputPathForRoute(outDir, route.route);
      await mkdir(path.dirname(outputPath), { recursive: true });
      await writeFile(outputPath, html, 'utf8');
    }

    for (const [remotePath, fileName] of [
      ['/robots.txt', 'robots.txt'],
      ['/manifest.webmanifest', 'manifest.webmanifest'],
      ['/service-worker.js', 'service-worker.js'],
      ['/sitemap.xml', 'sitemap.xml'],
      ['/feed.xml', 'feed.xml'],
      ['/framework/datastar.js', path.join('framework', 'datastar.js')],
      ['/framework/page.js', path.join('framework', 'page.js')],
      ['/framework/demo/logo.svg', path.join('framework', 'demo', 'logo.svg')],
      ['/framework/demo/favicon.svg', path.join('framework', 'demo', 'favicon.svg')],
      ['/framework/demo/splash.html', path.join('framework', 'demo', 'splash.html')],
      ['/framework/runtime.js', path.join('framework', 'runtime.js')],
      ['/framework/syntax.js', path.join('framework', 'syntax.js')],
      ['/framework/docs.md', path.join('framework', 'docs.md')],
      ['/framework/agents.md', path.join('framework', 'agents.md')]
    ]) {
      const response = await fetch(`${instance.url}${remotePath}`);
      if (!response.ok) {
        continue;
      }
      const body = await response.text();
      const outputPath = path.join(outDir, fileName);
      await mkdir(path.dirname(outputPath), { recursive: true });
      await writeFile(outputPath, body, 'utf8');
    }

    await writeFile(
      path.join(configOutDir, 'brackets.json'),
      JSON.stringify(
        buildPortableReleaseManifest(
          appRoot,
          exportedRoutes,
          hostContract,
          routesPayload.importMap,
          {
            server: routesPayload.server,
            branding: routesPayload.branding,
            splash: routesPayload.splash,
            security: routesPayload.security,
            assets: routesPayload.assets
          }
        ),
        null,
        2
      ),
      'utf8'
    );

    await writeFile(
      path.join(testsOutDir, 'test.js'),
      `import test from 'node:test';\nimport assert from 'node:assert/strict';\n\ntest('Brackets starter is present', () => {\n  assert.ok(true);\n});\n`,
      'utf8'
    );

    if (existsSync(path.resolve('README.md'))) {
      await cp(path.resolve('README.md'), path.join(outDir, 'README.md'));
    }

    if (existsSync(path.resolve('LICENSE'))) {
      await cp(path.resolve('LICENSE'), path.join(outDir, 'LICENSE'));
    }

    return {
      routes: routesPayload.routes,
      outDir
    };
  });
}
