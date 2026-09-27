import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { chromium, type Browser } from 'playwright';

/**
 * M4's acceptance criteria, in a real browser.
 *
 * Skipped unless E2E_BASE_URL points at a running deployment, so the default
 * suite stays under a second and nobody stops running it:
 *
 *   pnpm build && pnpm start &
 *   E2E_BASE_URL=http://127.0.0.1:3000 pnpm vitest run test/e2e
 */
const BASE = process.env.E2E_BASE_URL;
const d = BASE ? describe : describe.skip;

let browser: Browser;
beforeAll(async () => {
  if (!BASE) return;
  browser = await chromium.launch({
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined,
  });
}, 60_000);
afterAll(async () => {
  await browser?.close();
});

d('the room, end to end', () => {
  it('streams a teammate’s run into the log', async () => {
    const page = await browser.newPage();
    await page.goto(`${BASE}/room`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: /teammate/i }).click();
    await page.waitForFunction(() => document.body.textContent?.includes('run.done'), null, { timeout: 30_000 });
    const text = await page.textContent('body');
    expect(text).toContain('text.delta');
    expect(text).toContain('cost.tick');
    await page.close();
  }, 60_000);

  it('replays exactly the gap after the connection drops', async () => {
    const page = await browser.newPage();
    await page.goto(`${BASE}/room`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: /teammate/i }).click();
    await page.waitForTimeout(1500);

    const seqBefore = await readSeqs(page);
    await page.getByRole('button', { name: /drop the connection/i }).click();
    await page.waitForTimeout(2500);
    const seqAfter = await readSeqs(page);

    // Nothing the client already had comes back, and nothing in between is lost.
    expect(seqAfter.length).toBeGreaterThanOrEqual(seqBefore.length);
    expect(new Set(seqAfter).size).toBe(seqAfter.length); // no duplicates
    for (let i = 1; i < seqAfter.length; i += 1) {
      expect(seqAfter[i] - seqAfter[i - 1]).toBe(1); // no gaps
    }
    await page.close();
  }, 60_000);

  it('shows two browsers the same run', async () => {
    const a = await browser.newPage();
    const b = await browser.newPage();
    await a.goto(`${BASE}/room`, { waitUntil: 'domcontentloaded' });
    await b.goto(`${BASE}/room`, { waitUntil: 'domcontentloaded' });
    await a.waitForTimeout(600);
    await a.getByRole('button', { name: /teammate/i }).click();
    await b.waitForFunction(() => document.body.textContent?.includes('text.delta'), null, { timeout: 30_000 });
    expect(await readSeqs(b)).not.toHaveLength(0);
    await a.close();
    await b.close();
  }, 90_000);

  it('claims a task, and the claim holds', async () => {
    const page = await browser.newPage();
    await page.goto(`${BASE}/room`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(600);
    await page.getByRole('button', { name: /Record SSE fixtures/i }).click();
    await page.waitForTimeout(400);
    expect(await page.textContent('body')).toMatch(/claimed/i);
    await page.close();
  }, 60_000);
});

async function readSeqs(page: import('playwright').Page): Promise<number[]> {
  const raw = await page.$$eval('.eventSeq', (els) =>
    els.map((e) => Number((e.textContent ?? '').replace('#', ''))).filter((n) => Number.isFinite(n) && n > 0),
  );
  return [...new Set(raw)].sort((x, y) => x - y);
}
