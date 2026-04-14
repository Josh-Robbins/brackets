// Optional browser smoke: requires Deno + Chromium (puppeteer download). Interacts with: ../framework/server.js, ../framework/demo/
// Run: deno test tests/e2e-demo.test.js --allow-all
// Skip locally: $env:SKIP_BROWSER="1" (PowerShell) or SKIP_BROWSER=1

import { resolve } from 'jsr:@std/path@1';
import { assert } from 'jsr:@std/assert@1';
import { createServer } from '../framework/server.js';

const repoRoot = resolve(import.meta.dirname, '..');

Deno.test({
  name: 'demo: live-data tab save updates list (puppeteer)',
  ignore: Deno.env.get('SKIP_BROWSER') === '1',
  sanitizeOps: false,
  sanitizeResources: false
}, async () => {
  const puppeteerMod = await import('npm:puppeteer@23.11.1');
  const puppeteer = puppeteerMod.default ?? puppeteerMod;
  const instance = await createServer({
    appRoot: repoRoot,
    host: '127.0.0.1',
    port: 0
  });

  try {
    const base = instance.url;
    const launchOpts = {
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    };
    const chromePath = Deno.env.get('PUPPETEER_EXECUTABLE_PATH')?.trim();
    if (chromePath) {
      launchOpts.executablePath = chromePath;
    }
    const browser = await puppeteer.launch(launchOpts);
    try {
      const page = await browser.newPage();
      const errors = [];
      page.on('pageerror', (err) => errors.push(String(err)));
      page.on('requestfailed', (req) => errors.push(`requestfailed:${req.url()}`));

      await page.goto(`${base}/`, { waitUntil: 'networkidle2', timeout: 60000 });
      await page.waitForSelector('#app-root', { timeout: 30000 });
      await page.waitForSelector('.brx-splash', { timeout: 30000 });

      await page.click('#brx-tab-live');
      await page.waitForSelector('#brx-live-note', { visible: true, timeout: 15000 });

      const note = `e2e-${Date.now()}`;
      await page.type('#brx-live-note', note, { delay: 5 });
      await page.click('.brx-live-form button[type="button"]');
      await page.waitForFunction(
        (text) => Boolean(text && document.body?.innerText?.includes(text)),
        { timeout: 20000 },
        note
      );

      assert(errors.length === 0, `browser console/network errors: ${errors.join('; ')}`);
    } finally {
      await browser.close();
    }
  } finally {
    await instance.close();
  }
});
