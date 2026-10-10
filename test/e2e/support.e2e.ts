import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';
import { DEFAULT_EMBED, embedHeight, EMBED_WIDTH, type EmbedOptions } from '@/lib/support/embed';

/**
 * Buy me compute, through the real interface: the promises the page makes to a
 * supporter, and the one the snippet makes to a creator's website.
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

const SECRET = 'my flat is 4B, ring twice';

async function fresh(width = 1280, height = 900): Promise<Page> {
  const ctx = await browser.newContext({ viewport: { width, height } });
  const p = await ctx.newPage();
  await p.goto(`${BASE}/c/harbour`, { waitUntil: 'networkidle' });
  return p;
}

/** A wall as long and wordy as it gets, so the height is tested at its worst. */
async function crowd(p: Page) {
  await p.evaluate(() => {
    const w = JSON.parse(localStorage.getItem('tidepool.workspace.v1')!);
    for (let i = 0; i < 12; i++) {
      w.support.pledges.unshift({
        id: `pl_crowd_${i}`, creatorHandle: 'harbour', kind: 'cash', supporterName: `Supporter number ${i}`,
        message: 'A long and heartfelt note that wraps onto several lines in a narrow widget, as notes do.',
        unitId: 'spring', count: 10, tokens: 10_000_000, redeemedTokens: 0, sourceId: null,
        supporterUserId: null, expiresAt: null, state: 'active', monthly: true,
        reply: 'Thank you so much, this pays for a week of runs!',
        createdAt: new Date(Date.now() - i * 3_600_000).toISOString(),
      });
    }
    localStorage.setItem('tidepool.workspace.v1', JSON.stringify(w));
  });
}

d('the embed', () => {
  it('fits inside the height its own snippet gives it, for every option', async () => {
    const p = await fresh(340, 1600);
    await crowd(p);
    for (const variant of ['card', 'wall'] as const) {
      for (const showGoal of [true, false]) {
        for (const showSupporters of [true, false]) {
          const o: EmbedOptions = { ...DEFAULT_EMBED, variant, showGoal, showSupporters };
          await p.setViewportSize({ width: EMBED_WIDTH[variant], height: embedHeight(o) });
          await p.goto(
            `${BASE}/embed/harbour?variant=${variant}&supporters=${showSupporters ? 1 : 0}&goal=${showGoal ? 1 : 0}`,
            { waitUntil: 'networkidle' },
          );
          const { content, frame, ctaBottom } = await p.evaluate(() => {
            const el = document.querySelector<HTMLElement>('.supportWidget')!;
            const cta = document.querySelector<HTMLElement>('.tipCta')!.getBoundingClientRect();
            return { content: el.scrollHeight, frame: window.innerHeight, ctaBottom: cta.bottom };
          });
          const label = `${variant} goal=${showGoal} supporters=${showSupporters}`;
          expect(content, label).toBeLessThanOrEqual(frame);
          expect(ctaBottom, label).toBeLessThanOrEqual(frame);
        }
      }
    }
    await p.context().close();
  });

  it('hands the supporter to the full page with their choice, instead of thanking them for nothing', async () => {
    const p = await fresh(340, 700);
    await p.goto(`${BASE}/embed/harbour?variant=card`, { waitUntil: 'networkidle' });
    await p.getByRole('button', { name: 'Spring tide' }).click();
    await p.getByRole('button', { name: '5', exact: true }).click();
    const href = await p.locator('a.tipCta').getAttribute('href');
    expect(href).toBe('/c/harbour?unit=spring&n=5');

    await p.setViewportSize({ width: 1280, height: 900 });
    await p.goto(`${BASE}${href}`, { waitUntil: 'networkidle' });
    await expect.poll(() => p.getByRole('button', { name: 'Spring tide' }).getAttribute('aria-pressed')).toBe('true');
    expect(await p.getByRole('button', { name: '5', exact: true }).getAttribute('aria-pressed')).toBe('true');
    await p.context().close();
  });
});

d('the public page', () => {
  it('keeps a private note off the wall and the embed, and shows the creator’s thanks', async () => {
    const p = await fresh();
    await p.getByPlaceholder('Name or @yoursocial').fill('Thandi');
    await p.getByPlaceholder('Say something nice…').fill(SECRET);
    await p.getByLabel('Keep my message private').check();
    await p.getByLabel('Make this monthly').check();
    await p.locator('button.tipCta').click();
    await p.getByRole('heading', { name: 'Thank you, Thandi!' }).waitFor();

    // The creator confirms it and replies.
    await p.goto(`${BASE}/support`, { waitUntil: 'networkidle' });
    const row = p.locator('.runRow', { hasText: 'Thandi' }).first();
    await expect.poll(() => row.textContent()).toContain('private');
    await row.getByRole('button', { name: 'Confirm' }).click();
    await p.getByLabel('Reply to Thandi').fill('You are a star.');
    await p.getByLabel('Reply to Thandi').press('Enter');

    for (const path of ['/c/harbour', '/embed/harbour?variant=wall']) {
      await p.goto(`${BASE}${path}`, { waitUntil: 'networkidle' });
      const item = p.locator('.feedItem', { hasText: 'Thandi' });
      await item.waitFor();
      const html = await p.content();
      expect(html, path).not.toContain('ring twice');
      expect(await item.textContent(), path).toContain('Sent a private message');
      expect(await item.textContent(), path).toContain('You are a star.');
      expect(await item.textContent(), path).toContain('monthly');
    }
    await p.context().close();
  });

  it('lays out on a phone without sideways scrolling', async () => {
    const p = await fresh(390, 844);
    const overflow = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    await p.context().close();
  });
});
