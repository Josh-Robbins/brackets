import path from 'node:path';
import process from 'node:process';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { createServer } from './server.js';
import { loadBracketsConfig } from './config.js';
import { exportStaticSite, generateRoutes, validateApp } from './tooling.js';

const COMMANDS = new Set(['serve', 'dev', 'validate', 'export', 'info', 'routes', 'doctor', 'help']);

export function parseArgs(argv) {
  const args = [...argv];
  const command = args[0] && !args[0].startsWith('--') && COMMANDS.has(args[0])
    ? args.shift()
    : 'serve';
  const appRoot = command === 'help'
    ? 'demo/app'
    : (args[0] && !args[0].startsWith('--') ? args.shift() : 'demo/app');
  const options = {
    command,
    appRoot,
    port: undefined,
    host: undefined,
    proxies: {},
    outDir: 'dist',
    open: false,
    json: false,
    strict: false,
    generate: false,
    dryRun: false,
    force: false
  };

  while (args.length) {
    const token = args.shift();
    if (token === '--port') {
      options.port = Number(args.shift());
      continue;
    }
    if (token === '--host') {
      options.host = args.shift();
      continue;
    }
    if (token === '--proxy') {
      const pair = args.shift() ?? '';
      const [prefix, target] = pair.split('=');
      if (prefix && target) {
        options.proxies[prefix] = target;
      }
      continue;
    }
    if (token === '--out-dir') {
      options.outDir = args.shift() ?? 'dist';
      continue;
    }
    if (token === '--open') {
      options.open = true;
      continue;
    }
    if (token === '--json') {
      options.json = true;
      continue;
    }
    if (token === '--strict') {
      options.strict = true;
      continue;
    }
    if (token === '--generate') {
      options.generate = true;
      continue;
    }
    if (token === '--dry-run') {
      options.dryRun = true;
      continue;
    }
    if (token === '--force') {
      options.force = true;
    }
  }

  return options;
}

function printHelp() {
  console.log(`Brackets CLI

Commands:
  serve [app-root]       Run the local Brackets host
  dev [app-root]         Alias of serve
  validate [app-root]    Validate an app
  doctor [app-root]      Run validation plus config and host checks
  info [app-root]        Show app and host summary
  routes [app-root]      List resolved routes
  export [app-root]      Export a portable Brackets folder
  help                   Show this help

Options:
  --host <host>          Override host address
  --port <port>          Override port
  --proxy <prefix=url>   Add a proxy prefix
  --out-dir <dir>        Export directory
  --open                 Open the app in the default browser when serving
  --json                 Print machine-readable JSON output
  --strict               Treat warnings as failures in doctor
  --generate             Infer missing route manifests from app HTML
  --dry-run              Preview route generation without writing files
  --force                Overwrite same-path generated view files

Examples:
  node src/cli.js serve demo/app --open
  node src/cli.js info demo/app --json
  node src/cli.js routes demo/app
  node src/cli.js routes demo/app --generate
  node src/cli.js doctor demo/app --strict
  node src/cli.js export demo/app --out-dir dist`);
}

function printJson(value) {
  console.log(JSON.stringify(value, null, 2));
}

function openInBrowser(url) {
  const command = process.platform === 'win32'
    ? ['cmd', ['/c', 'start', '', url]]
    : process.platform === 'darwin'
      ? ['open', [url]]
      : ['xdg-open', [url]];

  const [binary, args] = command;
  const child = spawn(binary, args, {
    detached: true,
    stdio: 'ignore'
  });
  child.unref();
}

async function withTemporaryServer(options, handler) {
  const instance = await createServer({
    appRoot: options.appRoot,
    port: 0,
    host: options.host,
    proxies: options.proxies
  });

  try {
    return await handler(instance);
  } finally {
    await instance.close();
  }
}

async function fetchJson(url) {
  let lastError = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return response.json();
      }

      if (response.status >= 500 && attempt < 2) {
        await new Promise((resolve) => setTimeout(resolve, 75 * (attempt + 1)));
        continue;
      }

      throw new Error(`Request failed for ${url}: ${response.status}`);
    } catch (error) {
      lastError = error;
      if (attempt < 2) {
        await new Promise((resolve) => setTimeout(resolve, 75 * (attempt + 1)));
        continue;
      }
      throw error;
    }
  }

  throw lastError ?? new Error(`Request failed for ${url}`);
}

function routeTable(routes) {
  const rows = routes.map((route) => ({
    id: route.id,
    route: route.route,
    title: route.title || '-',
    layout: route.layoutUrl ? 'yes' : 'no',
    logic: route.logicUrl ? 'yes' : 'no'
  }));

  const widths = {
    id: Math.max('id'.length, ...rows.map((row) => row.id.length)),
    route: Math.max('route'.length, ...rows.map((row) => row.route.length)),
    title: Math.max('title'.length, ...rows.map((row) => row.title.length)),
    layout: Math.max('layout'.length, ...rows.map((row) => row.layout.length)),
    logic: Math.max('logic'.length, ...rows.map((row) => row.logic.length))
  };

  const header = [
    'id'.padEnd(widths.id),
    'route'.padEnd(widths.route),
    'title'.padEnd(widths.title),
    'layout'.padEnd(widths.layout),
    'logic'.padEnd(widths.logic)
  ].join('  ');

  const divider = [
    '-'.repeat(widths.id),
    '-'.repeat(widths.route),
    '-'.repeat(widths.title),
    '-'.repeat(widths.layout),
    '-'.repeat(widths.logic)
  ].join('  ');

  const lines = rows.map((row) => [
    row.id.padEnd(widths.id),
    row.route.padEnd(widths.route),
    row.title.padEnd(widths.title),
    row.layout.padEnd(widths.layout),
    row.logic.padEnd(widths.logic)
  ].join('  '));

  return [header, divider, ...lines].join('\n');
}

async function runInfo(options) {
  const resolvedAppRoot = path.resolve(options.appRoot);
  const { config, filePath } = await loadBracketsConfig(resolvedAppRoot);

  return withTemporaryServer({ ...options, appRoot: resolvedAppRoot }, async (instance) => {
    const [routesPayload, hostContract, appContract] = await Promise.all([
      fetchJson(`${instance.url}/config/brackets.json`),
      fetchJson(`${instance.url}/.well-known/brackets-host.json`),
      fetchJson(`${instance.url}/.well-known/brackets-app.json`)
    ]);

    const summary = {
      framework: routesPayload.framework,
      appRoot: resolvedAppRoot,
      configPath: filePath,
      branding: routesPayload.branding,
      splash: routesPayload.splash,
      origin: instance.url,
      routes: routesPayload.routes.length,
      assets: routesPayload.assets,
      server: routesPayload.server,
      host: {
        profiles: hostContract.profiles,
        serviceWorker: hostContract.serviceWorker,
        distribution: hostContract.distribution
      },
      app: appContract
    };

    if (options.json) {
      printJson(summary);
      return;
    }

    console.log(`Brackets info`);
    console.log(`app: ${resolvedAppRoot}`);
    console.log(`config: ${filePath ?? '(defaults only)'}`);
    console.log(`title: ${config.branding?.title ?? 'Brackets'}`);
    console.log(`origin: ${instance.url}`);
    console.log(`routes: ${routesPayload.routes.length}`);
    console.log(`service worker: ${hostContract.serviceWorker?.available ? 'yes' : 'no'}`);
    console.log(`distribution: ${hostContract.distribution?.modes?.join(', ') ?? 'unknown'}`);
    console.log(`assets: ${Object.values(routesPayload.assets ?? {}).join(', ')}`);
  });
}

async function runRoutes(options) {
  const resolvedAppRoot = path.resolve(options.appRoot);

  if (options.generate) {
    const report = await generateRoutes(resolvedAppRoot, {
      write: !options.dryRun,
      force: options.force
    });

    return withTemporaryServer({ ...options, appRoot: resolvedAppRoot }, async (instance) => {
      const routesPayload = await fetchJson(`${instance.url}/config/brackets.json`);
      const payload = {
        ...report,
        resolvedRoutes: routesPayload.routes
      };

      if (options.json) {
        printJson(payload);
        return;
      }

      console.log(`Brackets route generation`);
      console.log(`app: ${resolvedAppRoot}`);
      console.log(`mode: ${report.write ? 'write' : 'dry-run'}`);
      console.log(`created: ${report.created.length}`);
      console.log(`skipped: ${report.skipped.length}`);

      if (report.warnings.length) {
        console.log(`\nWarnings:`);
        for (const warning of report.warnings) {
          console.log(`- ${warning}`);
        }
      }

      if (report.created.length) {
        console.log(`\nCreated:`);
        for (const item of report.created) {
          console.log(`- ${item.route} -> ${item.viewPath}`);
        }
      }

      if (report.skipped.length) {
        console.log(`\nSkipped:`);
        for (const item of report.skipped) {
          const suffix = item.route ? ` (${item.route})` : '';
          console.log(`- ${item.reason}: ${item.htmlPath}${suffix}`);
        }
      }

      console.log(`\nResolved routes:`);
      console.log(routeTable(routesPayload.routes));
    });
  }

  return withTemporaryServer({ ...options, appRoot: resolvedAppRoot }, async (instance) => {
    const routesPayload = await fetchJson(`${instance.url}/config/brackets.json`);
    if (options.json) {
      printJson(routesPayload.routes);
      return;
    }
    console.log(routeTable(routesPayload.routes));
  });
}

async function runDoctor(options) {
  const resolvedAppRoot = path.resolve(options.appRoot);
  const [validation, configResult] = await Promise.all([
    validateApp(resolvedAppRoot),
    loadBracketsConfig(resolvedAppRoot)
  ]);

  return withTemporaryServer({ ...options, appRoot: resolvedAppRoot }, async (instance) => {
    const [hostContract, appContract] = await Promise.all([
      fetchJson(`${instance.url}/.well-known/brackets-host.json`),
      fetchJson(`${instance.url}/.well-known/brackets-app.json`)
    ]);

    const report = {
      ok: validation.ok && (!options.strict || validation.warnings.length === 0),
      appRoot: resolvedAppRoot,
      configPath: configResult.filePath,
      routes: appContract.routes.length,
      issues: validation.issues,
      warnings: validation.warnings,
      audits: validation.audits,
      host: {
        origin: instance.url,
        serviceWorker: hostContract.serviceWorker,
        distribution: hostContract.distribution,
        profiles: hostContract.profiles
      }
    };

    if (options.json) {
      printJson(report);
    } else {
      console.log(`Brackets doctor`);
      console.log(`app: ${resolvedAppRoot}`);
      console.log(`config: ${configResult.filePath ?? '(defaults only)'}`);
      console.log(`routes: ${appContract.routes.length}`);
      console.log(`issues: ${validation.issues.length}`);
      console.log(`warnings: ${validation.warnings.length}`);
      console.log(`service worker: ${hostContract.serviceWorker?.available ? 'yes' : 'no'}`);

      if (validation.issues.length) {
        console.log(`\nIssues:`);
        for (const issue of validation.issues) {
          console.log(`- ${issue}`);
        }
      }

      if (validation.warnings.length) {
        console.log(`\nWarnings:`);
        for (const warning of validation.warnings) {
          console.log(`- ${warning}`);
        }
      }
    }

    if (!report.ok) {
      process.exitCode = 1;
    }
  });
}

export async function runCli(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  const resolvedAppRoot = path.resolve(options.appRoot);

  if (options.command === 'help') {
    printHelp();
    return;
  }

  if (options.command === 'info') {
    await runInfo({ ...options, appRoot: resolvedAppRoot });
    return;
  }

  if (options.command === 'routes') {
    await runRoutes({ ...options, appRoot: resolvedAppRoot });
    return;
  }

  if (options.command === 'doctor') {
    await runDoctor({ ...options, appRoot: resolvedAppRoot });
    return;
  }

  if (options.command === 'validate') {
    const result = await validateApp(resolvedAppRoot);
    if (options.json) {
      printJson(result);
      if (!result.ok) {
        process.exitCode = 1;
      }
      return;
    }

    if (!result.ok) {
      console.error('Validation failed:');
      for (const issue of result.issues) {
        console.error(`- ${issue}`);
      }
      process.exitCode = 1;
    } else {
      console.log(`Brackets validation passed for ${resolvedAppRoot}`);
      if (result.warnings.length) {
        console.log(`Warnings:`);
        for (const warning of result.warnings) {
          console.log(`- ${warning}`);
        }
      }
    }
    return;
  }

  if (options.command === 'export') {
    const output = await exportStaticSite(resolvedAppRoot, path.resolve(options.outDir));
    if (options.json) {
      printJson(output);
      return;
    }
    console.log(`Brackets exported ${output.routes.length} routes to ${output.outDir}`);
    return;
  }

  const instance = await createServer({
    appRoot: resolvedAppRoot,
    port: options.port,
    host: options.host,
    proxies: options.proxies
  });

  console.log(`Brackets running at ${instance.url}`);

  if (options.open) {
    openInBrowser(instance.url);
  }
}

const entryHref = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href
  : null;

if (entryHref && import.meta.url === entryHref) {
  await runCli();
}
