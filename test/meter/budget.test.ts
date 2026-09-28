import { describe, expect, it } from 'vitest';
import { admit, burnUsdPerHour, periodEnd, periodStart, spendInPeriod } from '@/lib/meter/budget';
import type { UsageEvent } from '@/lib/types';

// Local-time dates, because budget periods are local by design.
const at = (y: number, mo: number, d: number, h = 12, mi = 0) => new Date(y, mo - 1, d, h, mi).getTime();

const ev = (t: number, costUsd: number): UsageEvent => ({
  id: `ue_${t}`, runId: 'r', sourceId: 's', poolId: 'p', consumerUserId: 'a', contributorUserId: 'b',
  provider: 'anthropic', model: 'anthropic:workhorse', inputTokens: 0, outputTokens: 0,
  cacheWriteTokens: 0, cacheReadTokens: 0, reasoningTokens: 0, gpuSeconds: 0,
  priceBookVersion: 'x', costUsd, estimated: false, createdAt: new Date(t).toISOString(),
});

describe('budget periods', () => {
  it('starts a day at local midnight and ends at the next', () => {
    const now = at(2026, 9, 30, 15, 30);
    expect(periodStart('day', now, 0)).toBe(at(2026, 9, 30, 0));
    expect(periodEnd('day', now, 0)).toBe(at(2026, 10, 1, 0));
  });

  it('starts a week on Monday', () => {
    // 30 Sep 2026 is a Wednesday; the Monday before is the 28th.
    expect(periodStart('week', at(2026, 9, 30), 0)).toBe(at(2026, 9, 28, 0));
    // A Sunday belongs to the week that began six days earlier.
    expect(periodStart('week', at(2026, 10, 4), 0)).toBe(at(2026, 9, 28, 0));
  });

  it('starts a month on the first, and rolls the year over in December', () => {
    expect(periodStart('month', at(2026, 9, 30), 0)).toBe(at(2026, 9, 1, 0));
    expect(periodEnd('month', at(2026, 12, 15), 0)).toBe(at(2027, 1, 1, 0));
  });

  it('uses the session start for a session budget and never ends it', () => {
    expect(periodStart('session', at(2026, 9, 30), 12345)).toBe(12345);
    expect(periodEnd('session', at(2026, 9, 30), 12345)).toBeNull();
  });
});

describe('spend within a period — the bug this replaces', () => {
  it('does not count yesterday against today’s budget', () => {
    const now = at(2026, 9, 30, 9);
    const usage = [ev(at(2026, 9, 29, 20), 40), ev(at(2026, 9, 30, 8), 3)];
    expect(spendInPeriod(usage, 'day', now, 0)).toBeCloseTo(3, 10);
  });

  it('does count yesterday against this week’s budget', () => {
    const now = at(2026, 9, 30, 9);
    const usage = [ev(at(2026, 9, 29, 20), 40), ev(at(2026, 9, 30, 8), 3)];
    expect(spendInPeriod(usage, 'week', now, 0)).toBeCloseTo(43, 10);
  });

  it('ignores anything stamped in the future, and anything unparseable', () => {
    const now = at(2026, 9, 30, 9);
    const bad = { ...ev(now, 5), createdAt: 'not a date' };
    expect(spendInPeriod([ev(now + 3_600_000, 99), bad], 'day', now, 0)).toBe(0);
  });
});

describe('burn rate', () => {
  it('measures the trailing hour, not the life of the workspace', () => {
    const now = at(2026, 9, 30, 12);
    const usage = [ev(now - 10 * 60_000, 1), ev(now - 40 * 60_000, 1), ev(now - 5 * 3_600_000, 50)];
    expect(burnUsdPerHour(usage, now)).toBeCloseTo(2, 10);
  });

  it('scales a shorter window to an hourly rate', () => {
    const now = at(2026, 9, 30, 12);
    expect(burnUsdPerHour([ev(now - 60_000, 1)], now, 15 * 60_000)).toBeCloseTo(4, 10);
  });

  it('is zero when nothing has run lately', () => {
    expect(burnUsdPerHour([], at(2026, 9, 30))).toBe(0);
  });
});

describe('admit', () => {
  const base = { capUsd: 40, spentUsd: 10, estCostUsd: 1, period: 'day' as const, resetsAt: 1, freeAvailable: false };

  it('lets an uncapped pool through with nothing to say', () => {
    expect(admit({ ...base, capUsd: null })).toEqual({ ok: true, warning: null, remainingUsd: null });
  });

  it('admits comfortably inside the budget without a warning', () => {
    const r = admit(base);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.warning).toBeNull();
  });

  it('warns once the run would take the pool past 80%', () => {
    const r = admit({ ...base, spentUsd: 30, estCostUsd: 3 });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.warning).toMatch(/83%/);
  });

  it('refuses a run that would overrun, naming the numbers and who can fix it', () => {
    const r = admit({ ...base, spentUsd: 39.5, estCostUsd: 2 });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe('BUDGET_EXHAUSTED');
      expect(r.message).toContain('$2.00');
      expect(r.message).toContain('$0.50');
      expect(r.message).toContain('midnight');
      expect(r.message).toMatch(/pool owner/);
    }
  });

  it('refuses based on this run’s estimate, not a fixed small one', () => {
    // A batch run that alone exceeds what is left must be stopped even when a
    // typical interactive exchange would fit.
    expect(admit({ ...base, spentUsd: 38, estCostUsd: 0.1 }).ok).toBe(true);
    expect(admit({ ...base, spentUsd: 38, estCostUsd: 2.5 }).ok).toBe(false);
  });

  it('writes the period as a word a person would use', () => {
    for (const [period, word] of [['day', 'daily'], ['week', 'weekly'], ['month', 'monthly'], ['session', 'session']] as const) {
      const r = admit({ ...base, period, spentUsd: 39.9, estCostUsd: 5 });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.message).toContain(`${word} budget`);
    }
    const r = admit({ ...base, spentUsd: 56, estCostUsd: 1, freeAvailable: true });
    if (r.ok) expect(r.warning).not.toMatch(/dayly/);
  });

  it('keeps going on owned compute when the money is spent, and says so', () => {
    const r = admit({ ...base, spentUsd: 56, estCostUsd: 1, freeAvailable: true });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.warning).toMatch(/owned compute/);
  });
});
