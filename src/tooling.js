import path from 'node:path';
import { existsSync } from 'node:fs';
import { cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from './server.js';
import { transformHtmlSyntax } from './syntax.js';

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
