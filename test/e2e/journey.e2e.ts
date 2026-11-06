import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';
import { PATH, nextStop } from '@/lib/journey';

/**
 * The journey, through the real interface: the theme choice, getting started,
 * the way each page leads to the next, and a creator's page colour.
 *
 *   E2E_BASE_URL=http://127.0.0.1:3000 pnpm test:e2e
 */
const BASE = process.env.E2E_BASE_URL;
const d = BASE ? describe : describe.skip;
let browser: Browser;

beforeAll(async () => {
  if (!BASE) return;
  browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined });
}, 60_000);
afterAll(async () => {
  await browser?.close();
});

async function page(scheme: 'light' | 'dark' = 'light'): Promise<Page> {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: scheme });
  return ctx.newPage();
}
const theme = (p: Page) => p.evaluate(() => document.documentElement.getAttribute('data-theme'));
const toggle = (p: Page) => p.locator('button.themeToggle');

d('the journey', () => {
  it('follows the system on Auto, live, and remembers an explicit choice', async () => {
    const p = await page('dark');
    await p.goto(`${BASE}/`, { waitUntil: 'load' });
    await expect.poll(() => toggle(p).textContent()).toBe('Auto');
    expect(await theme(p)).toBe('dark');
    // The system flips while the page is open.
    await p.emulateMedia({ colorScheme: 'light' });
    await expect.poll(() => theme(p)).toBe('light');

    await toggle(p).click(); // Auto → Light
    expect(await toggle(p).textContent()).toBe('Light');
    await toggle(p).click(); // Light → Dark
    expect(await theme(p)).toBe('dark');
    await p.reload({ waitUntil: 'load' });
    expect(await theme(p)).toBe('dark');
    await expect.poll(() => toggle(p).textContent()).toBe('Dark');

    await toggle(p).click(); // Dark → Auto: back to the system, and nothing stored
    expect(await p.evaluate(() => localStorage.getItem('tidepool.theme'))).toBeNull();
    await expect.poll(() => theme(p)).toBe('light');
    await p.context().close();
  });

  it('ticks a getting-started step from what happened, and stays put away once dismissed', async () => {
    const p = await page();
    await p.goto(`${BASE}/`, { waitUntil: 'load' });
    const run = p.locator('.guideStep', { hasText: 'Run something' });
    await run.waitFor();
    expect(await run.getAttribute('data-done')).toBe('false');
    const before = await p.locator('.guideMeter').getAttribute('aria-label');

    await run.getByRole('button', { name: 'Run it' }).click();
    await expect.poll(() => run.getAttribute('data-done'), { timeout: 30_000 }).toBe('true');
    expect(await p.locator('.guideMeter').getAttribute('aria-label')).not.toBe(before);

    await p.getByRole('button', { name: 'Hide the getting-started steps' }).click();
    await expect.poll(() => p.locator('.guide').count()).toBe(0);
    await p.reload({ waitUntil: 'load' });
    await p.waitForTimeout(500);
    expect(await p.locator('.guide').count()).toBe(0);
    await p.context().close();
  });

  it('ends every page with a link to the next one on the path', async () => {
    const p = await page();
    for (const stop of PATH) {
      await p.goto(`${BASE}${stop.href}`, { waitUntil: 'load' });
      const next = p.locator('a.nextStep');
      await next.waitFor();
      expect(await next.getAttribute('href'), stop.href).toBe(nextStop(stop.href).href);
    }
    await p.context().close();
  });

  it('carries a creator’s page colour to their public page', async () => {
    const p = await page();
    await p.goto(`${BASE}/support`, { waitUntil: 'load' });
    await p.getByText('Coral', { exact: true }).click();
    await p.goto(`${BASE}/c/harbour`, { waitUntil: 'load' });
    const cta = p.locator('button.tipCta');
    await cta.waitFor();
    expect(await cta.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe('rgb(255, 107, 91)');
    await p.context().close();
  });
});
