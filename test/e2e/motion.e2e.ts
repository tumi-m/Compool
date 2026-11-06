import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';

/**
 * The rules every animation here signs up to, checked in a real browser:
 * reduced motion stops all of it, scripted motion included; nothing loops while
 * nothing is happening; and the motion that is driven by something — scroll,
 * a reorder, time running out — is actually driven by it.
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

const ROUTES = ['/', '/room', '/orchestrate', '/preload', '/connect', '/models', '/nodes', '/open-source', '/ledger', '/support', '/c/harbour', '/docs'];

async function page(reduced: boolean, width = 1280, height = 900): Promise<Page> {
  const ctx = await browser.newContext({ viewport: { width, height }, reducedMotion: reduced ? 'reduce' : 'no-preference' });
  // Count scripted animations on table rows as they are started, so a short
  // glide cannot finish before the test gets to look for it.
  await ctx.addInitScript(() => {
    const w = window as unknown as { __rowGlides: number };
    w.__rowGlides = 0;
    const animate = Element.prototype.animate;
    Element.prototype.animate = function (this: Element, ...args: Parameters<Element['animate']>) {
      if (this.tagName === 'TR') w.__rowGlides += 1;
      return animate.apply(this, args);
    };
  });
  return ctx.newPage();
}

const rowGlides = (p: Page) => p.evaluate(() => (window as unknown as { __rowGlides: number }).__rowGlides);

/** Animations still running, described well enough to say which one broke the rule. */
const running = (p: Page) =>
  p.evaluate(() =>
    document
      .getAnimations()
      .filter((a) => a.playState === 'running')
      .map((a) => {
        const t = a.effect!.getTiming();
        const target = (a.effect as KeyframeEffect).target as Element | null;
        return {
          name: (a as CSSAnimation).animationName ?? (a as CSSTransition).transitionProperty ?? 'script',
          on: target ? `${target.tagName.toLowerCase()}.${[...target.classList].join('.')}` : '?',
          infinite: t.iterations === Infinity,
          duration: Number(t.duration) || 0,
        };
      }),
  );

/** The seed's least important idea, which nothing depends on, made the most important. */
async function boost(p: Page) {
  await p.locator('#impact-idea_4').selectOption('5');
  await p.locator('#urgency-idea_4').selectOption('5');
}

/** Puts a debt between two members, so the settle-up flow has something to draw. */
async function owe(p: Page) {
  await p.evaluate(() => {
    const w = JSON.parse(localStorage.getItem('tidepool.workspace.v1')!);
    const at = new Date().toISOString();
    w.ledger.push(
      { id: 'le_m_d', poolId: w.pool.id, usageEventId: 'ue_m', userId: 'user_kwame', direction: 'debit', amountUsd: 4.2, createdAt: at },
      { id: 'le_m_c', poolId: w.pool.id, usageEventId: 'ue_m', userId: 'user_ada', direction: 'credit', amountUsd: 4.2, createdAt: at },
    );
    localStorage.setItem('tidepool.workspace.v1', JSON.stringify(w));
  });
}

d('motion', () => {
  it('stops everywhere under reduced motion — CSS and script alike', async () => {
    const p = await page(true);
    await p.goto(`${BASE}/ledger`, { waitUntil: 'load' });
    await owe(p);
    for (const path of ROUTES) {
      await p.goto(`${BASE}${path}`, { waitUntil: 'load' });
      await p.waitForTimeout(400);
      expect(await running(p), path).toEqual([]);
    }
    // The one scripted animation: re-ranking the plan must not glide either.
    await p.goto(`${BASE}/orchestrate`, { waitUntil: 'load' });
    await boost(p);
    await expect.poll(() => p.locator('tbody tr').first().getAttribute('data-flip')).toBe('idea_4');
    expect(await rowGlides(p), 'plan rows glided').toBe(0);
    await p.context().close();
  });

  it('loops nothing while nothing is happening', async () => {
    const p = await page(false);
    for (const path of ROUTES) {
      // The room keeps a live connection open and says so with its one loop.
      if (path === '/room') continue;
      await p.goto(`${BASE}${path}`, { waitUntil: 'load' });
      await p.waitForTimeout(3200);
      expect((await running(p)).filter((a) => a.infinite), path).toEqual([]);
    }
    await p.context().close();
  });

  it('glides re-ranked rows to their new place', async () => {
    const p = await page(false);
    await p.goto(`${BASE}/orchestrate`, { waitUntil: 'load' });
    await p.waitForTimeout(800);
    expect(await p.locator('tbody tr').first().getAttribute('data-flip')).not.toBe('idea_4');
    await boost(p);
    await expect.poll(() => p.locator('tbody tr').first().getAttribute('data-flip')).toBe('idea_4');
    expect(await rowGlides(p)).toBeGreaterThan(0);
    await p.context().close();
  });

  it('plays the docs sequence from the scroll position, not a clock', async () => {
    const p = await page(false, 1280, 700);
    await p.goto(`${BASE}/docs`, { waitUntil: 'load' });
    const marker = p.locator('.stepsMarker').first();
    const at = async (y: number) => {
      await p.evaluate((top) => window.scrollTo(0, top), y);
      await p.waitForTimeout(150);
      return marker.evaluate((el) => new DOMMatrix(getComputedStyle(el).transform).e);
    };
    const top = await marker.evaluate((el) => el.getBoundingClientRect().top + window.scrollY);
    const early = await at(top - 650);
    const late = await at(top - 120);
    expect(late).toBeGreaterThan(early + 50);
    // Holding still, it holds still.
    expect(await at(top - 120)).toBeCloseTo(late, 0);
    await p.context().close();
  });

  it('keeps every step’s label clear of its neighbours and inside the figure', async () => {
    for (const [path, width] of [['/docs', 1280], ['/open-source', 1280], ['/docs', 390]] as const) {
      const p = await page(true, width, 800);
      await p.goto(`${BASE}${path}`, { waitUntil: 'load' });
      const clash = await p.locator('.scrollSteps').first().evaluate((fig) => {
        const box = fig.getBoundingClientRect();
        const notes = [...fig.querySelectorAll('.stepsName, .stepsNote')].map((t) => t.getBoundingClientRect());
        const rows = [notes.filter((_, i) => i % 2 === 0), notes.filter((_, i) => i % 2 === 1)];
        const problems: string[] = [];
        for (const row of rows) {
          row.forEach((r, i) => {
            if (r.left < box.left - 1 || r.right > box.right + 1) problems.push(`label ${i} spills out`);
            if (i > 0 && r.left < row[i - 1].right) problems.push(`label ${i} overlaps ${i - 1}`);
          });
        }
        return problems;
      });
      expect(clash, `${path} at ${width}px`).toEqual([]);
      await p.context().close();
    }
  });

  it('draws the steps lit and still when motion is reduced', async () => {
    const p = await page(true, 1280, 700);
    await p.goto(`${BASE}/docs`, { waitUntil: 'load' });
    const fills = await p.locator('.stepsStage circle').evaluateAll((els) => els.map((el) => getComputedStyle(el).fill));
    expect(new Set(fills).size).toBe(1);
    await p.context().close();
  });

  it('keeps a countdown’s clock where it started, instead of counting time twice', async () => {
    const p = await page(false);
    await p.goto(`${BASE}/preload`, { waitUntil: 'load' });
    // Move one item's window three hours out, so there is something to count down to.
    await p.evaluate(() => {
      const w = JSON.parse(localStorage.getItem('tidepool.workspace.v1')!);
      const item = w.preload.find((i: { enabled: boolean }) => i.enabled);
      Object.assign(item, { tz: 'UTC', anchorHour: (new Date().getUTCHours() + 3) % 24, windowHours: 1 });
      localStorage.setItem('tidepool.workspace.v1', JSON.stringify(w));
    });
    await p.reload({ waitUntil: 'load' });
    const fill = p.locator('.drainFill').first();
    await fill.waitFor();
    const delay = () => fill.evaluate((el) => getComputedStyle(el).animationDelay);
    const before = await delay();
    await p.waitForTimeout(2600); // a few ticks of the workspace clock
    expect(await delay()).toBe(before);
    await p.context().close();
  });

  it('draws the settle-up flow and then stops', async () => {
    const p = await page(false);
    await p.goto(`${BASE}/ledger`, { waitUntil: 'load' });
    await owe(p);
    await p.reload({ waitUntil: 'load' });
    await p.locator('.settleFlow').waitFor();
    expect((await running(p)).some((a) => a.on.includes('settle'))).toBe(true);
    await p.waitForTimeout(3600);
    expect((await running(p)).filter((a) => a.on.includes('settle'))).toEqual([]);
    expect(await p.locator('.settleFlow').getAttribute('aria-label')).toBe('Kwame pays Ada $4.20');
    await p.context().close();
  });
});
