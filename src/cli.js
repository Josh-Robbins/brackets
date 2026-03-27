import path from 'node:path';
import { createServer } from './server.js';
import { exportStaticSite, validateApp } from './tooling.js';

function parseArgs(argv) {
  const args = [...argv];
  const command = args[0] && !args[0].startsWith('--') && ['serve', 'validate', 'export'].includes(args[0])
    ? args.shift()
    : 'serve';
  const appRoot = args.shift() ?? 'demo/app';
  const options = {
    command,
    appRoot,
    port: undefined,
    host: undefined,
    proxies: {},
    outDir: 'dist'
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
      const pair = args.shift();
      const [prefix, target] = pair.split('=');
      options.proxies[prefix] = target;
      continue;
    }
    if (token === '--out-dir') {
      options.outDir = args.shift();
    }
  }

  return options;
}

const options = parseArgs(process.argv.slice(2));
const resolvedAppRoot = path.resolve(options.appRoot);

if (options.command === 'validate') {
  const result = await validateApp(resolvedAppRoot);
  if (!result.ok) {
    console.error('Validation failed:');
    for (const issue of result.issues) {
      console.error(`- ${issue}`);
    }
    process.exitCode = 1;
  } else {
    console.log(`Brackets validation passed for ${resolvedAppRoot}`);
  }
} else if (options.command === 'export') {
  const output = await exportStaticSite(resolvedAppRoot, path.resolve(options.outDir));
  console.log(`Brackets exported ${output.routes.length} routes to ${output.outDir}`);
} else {
  const instance = await createServer({
    appRoot: resolvedAppRoot,
    port: options.port,
    host: options.host,
    proxies: options.proxies
  });

  console.log(`Brackets running at ${instance.url}`);
}
