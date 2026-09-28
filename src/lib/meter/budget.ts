import type { Pool, UsageEvent } from '../types';

/**
 * §8.5. Budget as a constraint — computed over the budget's own period.
 *
 * The first version summed every usage event ever written, so a pool with a
 * $40 *daily* budget that spent $40 on Monday was still out of budget on
 * Friday, and on every day after. A daily budget resets at midnight; that is
 * what the word means.
 */

export type BudgetPeriod = Pool['budgetPeriod'];

/** Start of the current period, in the viewer's local time. */
export function periodStart(period: BudgetPeriod, now: number, sessionStart: number): number {
  const d = new Date(now);
  switch (period) {
    case 'session':
      return sessionStart;
    case 'day':
      return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    case 'week': {
      // Weeks start on Monday, which is where most people's working week starts.
      const offset = (d.getDay() + 6) % 7;
      return new Date(d.getFullYear(), d.getMonth(), d.getDate() - offset).getTime();
    }
    case 'month':
      return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
  }
}

export function periodEnd(period: BudgetPeriod, now: number, sessionStart: number): number | null {
  const d = new Date(periodStart(period, now, sessionStart));
  switch (period) {
    case 'session':
      return null;
    case 'day':
      return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime();
    case 'week':
      return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 7).getTime();
    case 'month':
      return new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime();
  }
}

export function spendInPeriod(
  usage: UsageEvent[],
  period: BudgetPeriod,
  now: number,
  sessionStart: number,
): number {
  const from = periodStart(period, now, sessionStart);
  return usage.reduce((a, u) => {
    const t = Date.parse(u.createdAt);
    return Number.isFinite(t) && t >= from && t <= now ? a + u.costUsd : a;
  }, 0);
}

/**
 * Burn over a trailing window, not since some fixed origin. The previous
 * version divided everything ever spent by the time since the workspace was
 * seeded — so a workspace opened a week later reported a burn rate a hundred
 * times too low, and a time-to-empty measured in months.
 */
export function burnUsdPerHour(usage: UsageEvent[], now: number, windowMs = 3_600_000): number {
  const from = now - windowMs;
  const spent = usage.reduce((a, u) => {
    const t = Date.parse(u.createdAt);
    return Number.isFinite(t) && t > from && t <= now ? a + u.costUsd : a;
  }, 0);
  return spent / (windowMs / 3_600_000);
}

/** "daily", not "dayly" — which is what `period + 'ly'` produced. */
const ADJ: Record<BudgetPeriod, string> = { session: 'session', day: 'daily', week: 'weekly', month: 'monthly' };

export type Admission =
  | { ok: true; warning: string | null; remainingUsd: number | null }
  | { ok: false; code: 'BUDGET_EXHAUSTED'; message: string; remainingUsd: number };

export const WARN_AT = 0.8;

/**
 * admit() in §6.3's request graph. Estimating high is correct: an over-estimate
 * blocks a request, an under-estimate blows a budget silently. The earlier code
 * costed every run as a 20k-token interactive exchange, so a 120k batch run was
 * admitted against a budget it would overrun six times over.
 *
 * `freeAvailable` is what makes this compatible with always-on: when the money
 * is spent, owned compute costs nothing and can still take the work. The
 * message says so, rather than reporting "low tide" for what is really "no
 * budget".
 */
export function admit(input: {
  capUsd: number | null;
  spentUsd: number;
  estCostUsd: number;
  period: BudgetPeriod;
  resetsAt: number | null;
  freeAvailable: boolean;
}): Admission {
  if (input.capUsd === null) return { ok: true, warning: null, remainingUsd: null };
  const remaining = Math.max(0, input.capUsd - input.spentUsd);
  const when = input.resetsAt ? ` It resets ${describeReset(input.period)}.` : '';

  if (input.estCostUsd > remaining) {
    if (input.freeAvailable) {
      return {
        ok: true,
        warning: `The ${ADJ[input.period]} budget is spent, so this goes to owned compute, which costs nothing.${when}`,
        remainingUsd: remaining,
      };
    }
    return {
      ok: false,
      code: 'BUDGET_EXHAUSTED',
      message:
        `This would cost about $${input.estCostUsd.toFixed(2)} and $${remaining.toFixed(2)} of the ` +
        `$${input.capUsd.toFixed(2)} ${ADJ[input.period]} budget is left.` +
        `${when} The pool owner can raise the cap, or connect owned compute, which costs nothing.`,
      remainingUsd: remaining,
    };
  }

  const after = input.spentUsd + input.estCostUsd;
  return {
    ok: true,
    warning:
      after >= input.capUsd * WARN_AT
        ? `${Math.round((after / input.capUsd) * 100)}% of the ${ADJ[input.period]} budget will be used after this.`
        : null,
    remainingUsd: remaining,
  };
}

function describeReset(period: BudgetPeriod): string {
  return period === 'day' ? 'at midnight' : period === 'week' ? 'on Monday' : period === 'month' ? 'on the 1st' : 'with a new session';
}
