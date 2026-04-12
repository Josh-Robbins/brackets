#!/bin/sh
// 2>/dev/null; PLATFORM="$(uname -s)-$(uname -m)"; case "$PLATFORM" in Darwin-arm64) P=darwin-arm64;; Darwin-x86_64) P=darwin-x64;; Linux-aarch64) P=linux-arm64;; Linux-x86_64) P=linux-x64;; *) echo "Unsupported platform: $PLATFORM" >&2; exit 1;; esac; exec "$(dirname "$0")/framework/host/$P/deno" run --allow-read --allow-write --allow-net --allow-run --allow-env "$0" "$@"

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer, parseYaml } from './framework/server.js';

function existsSync(p) {
  try { Deno.statSync(p); return true; } catch { return false; }
}

const PACKAGE_ROOT = path.resolve(fileURLToPath(new URL('.', import.meta.url)));
const FRAMEWORK_HOST_ROOT = path.join(PACKAGE_ROOT, 'framework', 'host');
const VERSION = '0.95.0';

let runningServer = null;
let shuttingDown = false;

function platformKey() {
  const os = Deno.build.os;
  const arch = Deno.build.arch;

  if (os === 'windows') {
    return 'windows-x64';
  }
  if (os === 'linux' && arch === 'aarch64') {
    return 'linux-arm64';
  }
  if (os === 'linux') {
    return 'linux-x64';
  }
  if (os === 'darwin' && arch === 'aarch64') {
    return 'darwin-arm64';
  }
  if (os === 'darwin') {
    return 'darwin-x64';
  }

  throw new Error(`Unsupported Brackets host platform: ${os}/${arch}`);
}

function bundledEnginePath() {
  const folder = path.join(FRAMEWORK_HOST_ROOT, platformKey());
  return Deno.build.os === 'windows'
    ? path.join(folder, 'deno.exe')
    : path.join(folder, 'deno');
}

function parseRootConfig() {
  const candidates = [
    path.join(PACKAGE_ROOT, 'config.yaml'),
    path.join(PACKAGE_ROOT, 'config.yml'),
    path.join(PACKAGE_ROOT, 'config.json')
  ];

  for (const configPath of candidates) {
    if (!existsSync(configPath)) {
      continue;
    }

    try {
      if (configPath.endsWith('.json')) {
        return JSON.parse(Deno.readTextFileSync(configPath));
      }
      return parseYaml(Deno.readTextFileSync(configPath));
    } catch {
      return {};
    }
  }

  return {};
}

function entrySummary(config) {
  const folder = String(config?.entry?.folder ?? '.').trim() || '.';
  return {
    folder,
    route: String(config?.entry?.route ?? '/').trim() || '/',
    autoStart: config?.entry?.autoStart === true
  };
}

function normalizeRuntime(config) {
  return String(config?.runtime ?? 'embedded').trim() || 'embedded';
}

function externalOrigin(config) {
  return String(config?.external?.origin ?? '').trim();
}

function configuredOrigin(config) {
  const scheme = config?.tls?.enabled === true ? 'https' : 'http';
  const host = String(config?.host ?? '127.0.0.1').trim() || '127.0.0.1';
  const port = Number(config?.port ?? 4173);
  return `${scheme}://${host}:${port}`;
}

function isExternalRuntime(config) {
  return normalizeRuntime(config) === 'external';
}

async function probeHostOrigin(origin) {
  try {
    const response = await fetch(`${origin}/__brackets/host`, {
      headers: { Accept: 'application/json' },
      cache: 'no-store'
    });
    if (!response.ok) {
      return null;
    }
    const host = await response.json();
    return {
      origin,
      host
    };
  } catch {
    return null;
  }
}

async function localHostPids(port) {
  const targetPort = Number(port);
  if (!Number.isFinite(targetPort) || targetPort <= 0) {
    return [];
  }

  if (Deno.build.os === 'windows') {
    const command = new Deno.Command('powershell', {
      args: [
        '-NoProfile',
        '-Command',
        `Get-NetTCPConnection -LocalPort ${targetPort} -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess`
      ],
      stdout: 'piped',
      stderr: 'null'
    });
    const result = await command.output().catch(() => null);
    if (!result || !result.success) {
      return [];
    }
    return new TextDecoder()
      .decode(result.stdout)
      .split(/\r?\n/)
      .map((line) => Number(String(line).trim()))
      .filter((value) => Number.isInteger(value) && value > 0);
  }

  const command = new Deno.Command('lsof', {
    args: ['-ti', `tcp:${targetPort}`],
    stdout: 'piped',
    stderr: 'null'
  });
  const result = await command.output().catch(() => null);
  if (!result || !result.success) {
    return [];
  }
  return new TextDecoder()
    .decode(result.stdout)
    .split(/\r?\n/)
    .map((line) => Number(String(line).trim()))
    .filter((value) => Number.isInteger(value) && value > 0);
}

async function stopEmbeddedHostByPort(config) {
  const port = Number(config?.port ?? 4173);
  const pids = [...new Set(await localHostPids(port))];
  if (!pids.length) {
    return false;
  }

  for (const processId of pids) {
    try {
      Deno.kill(processId, Deno.build.os === 'windows' ? 'SIGTERM' : 'SIGTERM');
    } catch {
      // Ignore processes that have already exited or cannot be signaled.
    }
  }

  const deadline = Date.now() + 3000;
  while (Date.now() < deadline) {
    const remaining = await localHostPids(port);
    if (!remaining.length) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 120));
  }

  const remaining = [...new Set(await localHostPids(port))];
  for (const processId of remaining) {
    try {
      Deno.kill(processId, 'SIGKILL');
    } catch {
      // Ignore processes that cannot be terminated anymore.
    }
  }

  const settleDeadline = Date.now() + 2000;
  while (Date.now() < settleDeadline) {
    const active = await localHostPids(port);
    if (!active.length) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 120));
  }

  return (await localHostPids(port)).length === 0;
}

function helpText(config = {}) {
  const runtime = normalizeRuntime(config);
  const lines = [
    '',
    `Brackets CLI v${VERSION}`,
    '',
    `Runtime mode: ${runtime}`,
    '',
    'Commands:'
  ];

  if (runtime === 'external') {
    lines.push('  help            Show this help');
    lines.push('  status server   Show external host status');
    lines.push('  health          Probe the configured external host');
    lines.push('  run app test    Check the configured external host');
    lines.push('  config show     Show the current root config');
    lines.push('  info            Show package/runtime details');
    lines.push('  exit            Exit the CLI');
    lines.push('');
    lines.push('External mode notes:');
    lines.push('  - The built-in Deno host is disabled in this mode.');
    lines.push('  - Set external.origin in config.yaml to the host you want Brackets to use.');
    lines.push('  - Start your external server yourself, then use health, status server, and run app test here.');
    lines.push('');
    return lines.join('\n');
  }

  lines.push('  help            Show this help');
  lines.push('  run app         Start the built-in host for this package');
  lines.push('  run app dev     Start the built-in host in dev mode');
  lines.push('  start server    Alias for run app');
  lines.push('  stop server     Stop the built-in host');
  lines.push('  status server   Show server status');
  lines.push('  health          Probe the running host');
  lines.push('  run app test    Run bundled Deno framework tests');
  lines.push('  test app        Alias for run app test');
  lines.push('  config show     Show the current root config');
  lines.push('  info            Show package/runtime details');
  lines.push('  exit            Stop the host and exit');
  lines.push('');
  return lines.join('\n');
}

function printConfig(config) {
  console.log(JSON.stringify({
    runtime: normalizeRuntime(config),
    mode: config.mode ?? 'dynamic',
    engine: config.engine ?? 'deno',
    host: config.host ?? '127.0.0.1',
    port: config.port ?? 4173,
    watch: {
      enabled: config.watch?.enabled === true,
      reload: config.watch?.reload === true
    },
    external: {
      origin: externalOrigin(config)
    },
    entry: entrySummary(config)
  }, null, 2));
}

async function startServer(mode = 'dynamic') {
  if (runningServer) {
    return runningServer;
  }

  const config = parseRootConfig();
  if (isExternalRuntime(config)) {
    const origin = externalOrigin(config);
    if (!origin) {
      console.log('Brackets external host mode is enabled, but external.origin is empty.');
      console.log('Set external.origin in config.yaml to the host you want the CLI to use.');
      return null;
    }

    runningServer = {
      mode,
      startedAt: Date.now(),
      external: true,
      origin
    };

    console.log(`Brackets external host mode is active at ${origin}`);
    return runningServer;
  }

  let instance = null;
  try {
    instance = await createServer({
      appRoot: PACKAGE_ROOT,
      host: config.host ?? '127.0.0.1',
      port: Number(config.port ?? 4173),
      devMode: mode === 'dev'
    });
  } catch (error) {
    if (String(error?.message ?? '').includes('AddrInUse')) {
      const attached = await probeHostOrigin(configuredOrigin(config));
      if (attached) {
        runningServer = {
          mode,
          startedAt: Date.now(),
          attached: true,
          origin: attached.origin,
          host: attached.host
        };
        console.log(`Brackets host already running at ${attached.origin}`);
        return runningServer;
      }
      console.log(`Brackets could not start because ${configuredOrigin(config)} is already in use.`);
      console.log('Stop the other process, change host/port in config.yaml, or start Brackets on a different port.');
      return null;
    }
    throw error;
  }

  runningServer = {
    mode,
    startedAt: Date.now(),
    instance
  };

  console.log(`Brackets server running at ${instance.url}`);
  return runningServer;
}

async function stopServer() {
  const config = parseRootConfig();

  if (!runningServer) {
    if (isExternalRuntime(config)) {
      console.log('Brackets server is not running.');
      return;
    }
    const attached = await probeHostOrigin(configuredOrigin(config));
    if (!attached) {
      console.log('Brackets server is not running.');
      return;
    }
    runningServer = {
      mode: config.mode ?? 'dynamic',
      startedAt: Date.now(),
      attached: true,
      origin: attached.origin,
      host: attached.host
    };
  }

  const current = runningServer;
  runningServer = null;
  if (current.external) {
    console.log('Brackets external host session cleared.');
    return;
  }
  if (current.attached) {
    const stopped = await stopEmbeddedHostByPort(config);
    console.log(stopped ? 'Brackets server stopped.' : 'Brackets could not stop the running host.');
    return;
  }

  await current.instance.close();
  console.log('Brackets server stopped.');
}

async function health() {
  const config = parseRootConfig();
  if (!runningServer) {
    const attached = normalizeRuntime(config) === 'embedded'
      ? await probeHostOrigin(configuredOrigin(config))
      : null;
    if (attached) {
      runningServer = {
        mode: config.mode ?? 'dynamic',
        startedAt: Date.now(),
        attached: true,
        origin: attached.origin,
        host: attached.host
      };
    } else {
      console.log('Brackets health: server not running');
      return false;
    }
  }

  const targetOrigin = runningServer.external
    ? runningServer.origin
    : runningServer.attached
      ? runningServer.origin
      : runningServer.instance.url;
  const start = performance.now();
  const response = await fetch(`${targetOrigin}/__brackets/host`, {
    headers: { Accept: 'application/json' },
    cache: 'no-store'
  });
  const latency = Math.max(1, Math.round(performance.now() - start));
  const host = await response.json();
  const state = latency < 420 ? 'green' : latency < 850 ? 'yellow' : 'red';

  console.log(`Brackets health: ${state}`);
  console.log(`- Host latency: ${latency}ms`);
  console.log(`- Runtime: ${host.runtime} / ${host.engine}`);
  console.log(`- Mode: ${host.mode}`);
  console.log(`- Local: ${host.addresses?.localOrigin ?? targetOrigin}`);
  for (const origin of host.addresses?.networkOrigins ?? []) {
    console.log(`- Network: ${origin}`);
  }
  return response.ok;
}

async function runTests() {
  const config = parseRootConfig();

  if (isExternalRuntime(config)) {
    const origin = externalOrigin(config);
    if (!origin) {
      console.log('Brackets test: red');
      console.log('- external.origin is empty');
      return false;
    }

    try {
      const root = await fetch(origin);
      const host = await fetch(`${origin}/.well-known/brackets-host.json`).then((response) => response.json());
      const app = await fetch(`${origin}/.well-known/brackets-app.json`).then((response) => response.json());
      const checks = [
        root.status === 200,
        Boolean(host.distribution?.entryPoint),
        Array.isArray(app.routes)
      ];
      const passed = checks.filter(Boolean).length;
      const failed = checks.length - passed;
      console.log(`Brackets test: ${failed === 0 ? 'green' : 'red'}`);
      console.log(`- Checks passed: ${passed}`);
      console.log(`- Checks failed: ${failed}`);
      return failed === 0;
    } catch (error) {
      console.log('Brackets test: red');
      console.log(`- External host is not reachable at ${origin}`);
      console.log(`- ${String(error?.message ?? error)}`);
      return false;
    }
  }

  const command = new Deno.Command(bundledEnginePath(), {
    args: [
      'test',
      '--allow-read',
      '--allow-write',
      '--allow-net',
      '--allow-env',
      path.join(PACKAGE_ROOT, 'tests', 'test.js')
    ],
    cwd: PACKAGE_ROOT,
    stdout: 'piped',
    stderr: 'piped'
  });

  const result = await command.output();
  const stdout = new TextDecoder().decode(result.stdout).trim();
  const stderr = new TextDecoder().decode(result.stderr).trim();

  console.log(`Brackets test: ${result.success ? 'green' : 'red'}`);
  if (stdout) {
    const summaryLine = stdout.split(/\r?\n/).find((line) => line.includes('passed') || line.includes('failed'));
    if (summaryLine) {
      console.log(`- ${summaryLine.replace(/\x1b\[[0-9;]*m/g, '').trim()}`);
    }
  }
  if (!result.success && stderr) {
    console.log(`- ${stderr.split(/\r?\n/).slice(-1)[0].replace(/\x1b\[[0-9;]*m/g, '').trim()}`);
  }
  return result.success;
}

function showInfo() {
  const config = parseRootConfig();
  const entry = entrySummary(config);
  console.log(JSON.stringify({
    framework: 'Brackets',
    version: VERSION,
    packageRoot: PACKAGE_ROOT,
    runtime: normalizeRuntime(config),
    mode: config.mode ?? 'dynamic',
    engine: config.engine ?? 'deno',
    enginePath: bundledEnginePath(),
    externalOrigin: externalOrigin(config),
    entryFolder: entry.folder,
    entryRoute: entry.route,
    entryFile: entry.folder === '.' ? 'index.html' : `${entry.folder}/index.html`
  }, null, 2));
}

async function executeCommand(parts) {
  const [first = '', second = '', third = ''] = parts;
  const command = `${first} ${second} ${third}`.trim();
  const config = parseRootConfig();
  const runtime = normalizeRuntime(config);
  const externalMode = runtime === 'external';

  if (!command || first === 'help') {
    console.log(helpText(config));
    return true;
  }

  if (first === 'config' && second === 'show') {
    printConfig(config);
    return true;
  }

  if (first === 'info') {
    showInfo();
    return true;
  }

  if (first === 'run' && second === 'app' && third === 'test') {
    const success = await runTests();
    if (!success) {
      Deno.exitCode = 1;
    }
    return success;
  }

  if ((first === 'run' && second === 'app') || (first === 'start' && second === 'server')) {
    if (externalMode) {
      if (third === 'dev') {
        console.log('Brackets dev watch mode is only available with the built-in embedded host.');
        console.log('Switch runtime back to embedded if you want run app dev.');
      } else {
        console.log('Brackets is in external host mode.');
        console.log('Start the external server yourself, then use status server, health, or run app test.');
      }
      return true;
    }
    const mode = third === 'dev' ? 'dev' : 'dynamic';
    await startServer(mode);
    if (third === 'dev') {
      console.log('Brackets dev mode is active.');
    }
    return true;
  }

  if (first === 'stop' && second === 'server') {
    if (externalMode) {
      console.log('Brackets is using an external host, so there is no built-in server to stop.');
      return true;
    }
    await stopServer();
    return true;
  }

  if (first === 'status' && second === 'server') {
    if (!runningServer) {
      const attached = externalMode
        ? null
        : await probeHostOrigin(configuredOrigin(config));
      if (!attached) {
        console.log('Brackets server status: stopped');
        return true;
      }
      runningServer = {
        mode: config.mode ?? 'dynamic',
        startedAt: Date.now(),
        attached: true,
        origin: attached.origin,
        host: attached.host
      };
    }

    if (runningServer.external) {
      console.log('Brackets server status: external');
      console.log(`- Origin: ${runningServer.origin}`);
      console.log(`- Runtime: external`);
      console.log(`- Mode: ${runningServer.mode}`);
      return true;
    }

    const host = runningServer.attached
      ? runningServer.host
      : runningServer.instance.host;
    const origin = runningServer.attached
      ? runningServer.origin
      : runningServer.instance.url;
    console.log('Brackets server status: running');
    if (runningServer.attached) {
      console.log('- Source: attached to existing host');
    }
    console.log(`- Local: ${host.addresses?.localOrigin ?? origin}`);
    for (const origin of host.addresses?.networkOrigins ?? []) {
      console.log(`- Network: ${origin}`);
    }
    console.log(`- Runtime: ${host.runtime} / ${host.engine}`);
    console.log(`- Mode: ${runningServer.mode}`);
    console.log(`- Entry: ${host.distribution?.entryFolder ?? '.'}`);
    return true;
  }

  if (first === 'health' || (first === 'check' && second === 'health')) {
    await health();
    return true;
  }

  if (first === 'test' && second === 'app') {
    const success = await runTests();
    if (!success) {
      Deno.exitCode = 1;
    }
    return success;
  }

  if (first === 'exit' || first === 'quit') {
    await stopServer();
    return false;
  }

  console.log(`Unknown Brackets command: ${command}`);
  console.log('Type `help` to see the available commands.');
  return true;
}

async function runInteractive() {
  console.log(helpText(parseRootConfig()));
  while (true) {
    const input = prompt('brackets> ');
    if (input === null) {
      break;
    }
    const keepGoing = await executeCommand(input.trim().split(/\s+/).filter(Boolean));
    if (!keepGoing) {
      break;
    }
  }
}

async function shutdown() {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  if (runningServer?.instance) {
    await stopServer();
  }
}

function registerSignalHandlers() {
  Deno.addSignalListener('SIGINT', () => {
    void shutdown().then(() => Deno.exit(0));
  });

  if (Deno.build.os !== 'windows') {
    Deno.addSignalListener('SIGTERM', () => {
      void shutdown().then(() => Deno.exit(0));
    });
  }
}

function commandNeedsSignalHandlers(args) {
  if (!args.length) {
    return true;
  }
  if (args[0] === 'run' && args[1] === 'app' && args[2] === 'test') {
    return false;
  }
  return (args[0] === 'run' && args[1] === 'app') || (args[0] === 'start' && args[1] === 'server');
}

const REEXEC_ENV = '__BRACKETS_BUNDLED';

if (!Deno.env.get(REEXEC_ENV)) {
  const engine = bundledEnginePath();
  if (existsSync(engine)) {
    const result = new Deno.Command(engine, {
      args: [
        'run',
        '--allow-read', '--allow-write', '--allow-net', '--allow-run', '--allow-env',
        fileURLToPath(import.meta.url),
        ...Deno.args
      ],
      cwd: PACKAGE_ROOT,
      stdin: 'inherit',
      stdout: 'inherit',
      stderr: 'inherit',
      env: { ...Deno.env.toObject(), [REEXEC_ENV]: '1' }
    });
    const status = await result.output();
    Deno.exit(status.code);
  }
}

const args = [...Deno.args];
if (commandNeedsSignalHandlers(args)) {
  registerSignalHandlers();
}
if (args.length) {
  const runtime = normalizeRuntime(parseRootConfig());
  const keepGoing = await executeCommand(args);
  const runAppStartsServer = (args[0] === 'run' && args[1] === 'app' && args[2] !== 'test')
    || (args[0] === 'start' && args[1] === 'server');
  if (runAppStartsServer) {
    if (!keepGoing) {
      await shutdown();
      Deno.exit(Deno.exitCode);
    } else if (runtime === 'external') {
      await shutdown();
      Deno.exit(Deno.exitCode);
    } else if (runningServer?.external || runningServer?.attached) {
      await shutdown();
      Deno.exit(Deno.exitCode);
    } else {
      await new Promise(() => {});
    }
  } else {
    await shutdown();
    Deno.exit(Deno.exitCode);
  }
} else {
  try {
    await runInteractive();
  } finally {
    await shutdown();
  }
}
