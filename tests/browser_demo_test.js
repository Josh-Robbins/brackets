// Uses Deno + Playwright (npm). Interacts with: ../framework/server.js, framework/demo (entry from root config).
import { chromium } from 'npm:playwright@1.49.1';
import { resolve } from 'jsr:@std/path@1';
import { createServer } from '../framework/server.js';

const repoRoot = resolve(import.meta.dirname, '..');

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

Deno.test({
  name: 'browser smoke: demo Live tab Save runs RPC without console errors',
  sanitizeOps: false,
  sanitizeResources: false
}, async () => {
  const instance = await createServer({
    appRoot: repoRoot,
    host: '127.0.0.1',
    port: 0
  });

  const base = instance.url;
  const consoleErrors = [];

  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });
    page.on('pageerror', (err) => {
      consoleErrors.push(String(err?.message ?? err));
    });

    await page.goto(`${base}/`, { waitUntil: 'load', timeout: 90000 });
    await page.getByRole('tab', { name: 'Live data' }).click();
    await page.waitForSelector('#brx-live-note', { state: 'visible', timeout: 30000 });
    await page.locator('#brx-live-note').fill('browser smoke note');

    const rpcPromise = page.waitForResponse(
      (response) => response.url().includes('/__brackets/rpc') && response.request().method() === 'POST',
      { timeout: 30000 }
    );
    await page.locator('.brx-live-form').getByRole('button', { name: 'Save' }).click();
    const rpcResponse = await rpcPromise;
    assert(rpcResponse.ok(), `RPC POST expected 2xx, got ${rpcResponse.status()}`);

    assert(
      consoleErrors.length === 0,
      `Expected no console/page errors, got: ${consoleErrors.join(' | ')}`
    );
  } finally {
    await browser.close();
    await instance.close();
  }
});
