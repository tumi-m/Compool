import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';

/**
 * The run engine, driven through the real interface.
 *
 * The pure parts — admit, compaction, pricing — have unit tests. These cover the
 * part that only exists once React, timers and storage are all running at once,
 * which is exactly where the first engine's bugs lived.
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

type W = {
  runs: { id: string; state: string; sourceId: string | null; errorCode: string | null; notice?: string }[];
  usage: { runId: string; estimated: boolean; costUsd: number }[];
  ledger: { usageEventId: string; direction: string; amountUsd: number }[];
  sources: { id: string; cls: string; label: string }[];
};
const read = (p: Page) => p.evaluate(() => JSON.parse(localStorage.getItem('tidepool.workspace.v1')!)) as Promise<W>;
const imbalances = (w: W) => {
  const m = new Map<string, { n: number; net: number }>();
  for (const e of w.ledger) {
    const c = m.get(e.usageEventId) ?? { n: 0, net: 0 };
    c.n += 1;
    c.net += e.direction === 'debit' ? e.amountUsd : -e.amountUsd;
    m.set(e.usageEventId, c);
  }
  return [...m.values()].filter((v) => v.n !== 2 || Math.abs(v.net) > 1e-9).length;
};

async function fresh(): Promise<Page> {
  const p = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await p.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  await p.evaluate(() => localStorage.clear());
  await p.reload({ waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(900);
  return p;
}

d('the run engine', () => {
  it('passes every run through metering before done', async () => {
    const p = await fresh();
    await p.getByRole('button', { name: 'Run something' }).click();
    const seen = new Set<string>();
    for (let i = 0; i < 24; i += 1) {
      seen.add((await read(p)).runs[0].state);
      await p.waitForTimeout(100);
    }
    expect([...seen]).toEqual(['streaming', 'metering', 'done']);
    await p.close();
  }, 60_000);

  it('reserves headroom, so a burst cannot all pick a source that holds one', async () => {
    const p = await fresh();
    await p.evaluate(() => {
      const w = JSON.parse(localStorage.getItem('tidepool.workspace.v1')!);
      w.sources = w.sources.filter((s: { id: string }) => s.id === 'src_anthropic_a');
      w.headroom = {
        src_anthropic_a: {
          ...w.headroom.src_anthropic_a,
          tokens: 300_000,
          limitTokens: 2_000_000,
          observedAt: new Date().toISOString(),
          resetAt: new Date(Date.now() + 86_400_000).toISOString(),
        },
      };
      w.rungs = w.rungs.map((r: object) => ({ ...r, provider: 'anthropic' }));
      localStorage.setItem('tidepool.workspace.v1', JSON.stringify(w));
    });
    await p.reload({ waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(900);
    await p.evaluate(() => {
      for (let i = 0; i < 5; i += 1) (document.querySelector('.poolControls button:last-child') as HTMLButtonElement).click();
    });
    await p.waitForTimeout(300);
    const burst = (await read(p)).runs.slice(0, 5);
    expect(burst.filter((r) => r.sourceId === 'src_anthropic_a').length).toBeLessThanOrEqual(2);
    expect(burst.filter((r) => r.state === 'failed').length).toBeGreaterThanOrEqual(3);
    await p.close();
  }, 60_000);

  it('meters what a run drew when its source is revoked mid-stream', async () => {
    const p = await fresh();
    await p.getByRole('button', { name: 'Run a batch' }).click();
    await p.waitForTimeout(700);
    const w = await read(p);
    const run = w.runs[0];
    const label = w.sources.find((s) => s.id === run.sourceId)!.label;
    await p.locator('.basin', { hasText: label }).getByRole('button', { name: 'Revoke' }).click();
    await p.waitForTimeout(600);
    const after = await read(p);
    expect(after.runs.find((r) => r.id === run.id)!.state).toBe('failed');
    const est = after.usage.find((u) => u.runId === run.id);
    expect(est?.estimated).toBe(true);
    expect(est!.costUsd).toBeGreaterThan(0);
    expect(imbalances(after)).toBe(0);
    await p.close();
  }, 60_000);

  it('routes to owned compute when the budget is spent, and says so', async () => {
    const p = await fresh();
    await p.getByRole('button', { name: /full hackathon/i }).click();
    await p.waitForTimeout(500);
    await p.getByRole('button', { name: 'Run something' }).click();
    await p.waitForTimeout(600);
    const w = await read(p);
    expect(w.sources.find((s) => s.id === w.runs[0].sourceId)?.cls).toBe('B');
    expect(w.runs[0].notice).toMatch(/daily budget is spent/);
    await p.close();
  }, 60_000);

  it('leaves nothing behind when the workspace is reset mid-run', async () => {
    const p = await fresh();
    await p.getByRole('button', { name: 'Run a batch' }).click();
    await p.waitForTimeout(400);
    await p.getByRole('button', { name: /Reset preview/i }).click();
    await p.waitForTimeout(3000);
    const w = await read(p);
    expect(w.usage.filter((u) => !w.runs.some((r) => r.id === u.runId))).toHaveLength(0);
    expect(imbalances(w)).toBe(0);
    await p.close();
  }, 60_000);

  it('recovers a run orphaned by a reload, metering what it drew', async () => {
    const p = await fresh();
    await p.getByRole('button', { name: 'Run a batch' }).click();
    await p.waitForTimeout(500);
    await p.reload({ waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(7500);
    const w = await read(p);
    expect(w.runs[0].state).toBe('failed');
    expect(w.usage.find((u) => u.runId === w.runs[0].id)?.estimated).toBe(true);
    expect(imbalances(w)).toBe(0);
    await p.close();
  }, 60_000);

  it('does not let one tab undo what another tab did', async () => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const a = await ctx.newPage();
    const b = await ctx.newPage();
    await a.goto(`${BASE}/preload`, { waitUntil: 'domcontentloaded' });
    await a.evaluate(() => localStorage.clear());
    await a.reload({ waitUntil: 'domcontentloaded' });
    await a.waitForTimeout(900);
    await b.goto(`${BASE}/orchestrate`, { waitUntil: 'domcontentloaded' });
    await b.waitForTimeout(900);
    await a.getByRole('button', { name: /^Remove / }).first().click();
    await a.waitForTimeout(300);
    const kept = (await read(a) as unknown as { preload: unknown[] }).preload.length;
    await b.fill('#dump', 'an idea from the other tab');
    await b.getByRole('button', { name: /Capture/ }).click();
    await b.waitForTimeout(400);
    expect((await read(b) as unknown as { preload: unknown[] }).preload.length).toBe(kept);
    await ctx.close();
  }, 60_000);
});
