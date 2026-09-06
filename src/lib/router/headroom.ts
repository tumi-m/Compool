import type { Headroom } from '../types';

export const HEADROOM_MARGIN_TOKENS = 2000;

/** §8.4 thresholds. Fractions of the source's own limit, not absolute numbers. */
export const WINDOW_WARN_FRACTION = 0.25;
export const WINDOW_SWITCH_FRACTION = 0.1;
export const WINDOW_RESERVE_FRACTION = 0.03;

/**
 * Anthropic (and most token-bucket providers) replenish continuously: `reset` is
 * "fully replenished at", not "dead until". Interpolating between observation and
 * reset is the difference between a source the router writes off for three hours
 * and one it correctly picks up again in twenty minutes.
 */
export function projectedHeadroom(h: Headroom | null, now: number): Headroom | null {
  if (!h) return null;
  const observed = Date.parse(h.observedAt);
  const reset = Date.parse(h.resetAt);
  if (!Number.isFinite(observed) || !Number.isFinite(reset) || reset <= observed) return h;
  if (now <= observed) return h;

  const progress = Math.min(1, (now - observed) / (reset - observed));
  const replenished = h.tokens + (h.limitTokens - h.tokens) * progress;
  return { ...h, tokens: Math.min(h.limitTokens, Math.round(replenished)) };
}

export function fillFraction(h: Headroom | null, now: number): number | null {
  const p = projectedHeadroom(h, now);
  if (!p || p.limitTokens <= 0) return null;
  return Math.max(0, Math.min(1, p.tokens / p.limitTokens));
}

export type TideLevel = 'flood' | 'ebb' | 'shallow' | 'slack';

/** The four labels the UI speaks in. Colour is never the only carrier (§14.4). */
export function tideLevel(fraction: number | null): TideLevel {
  if (fraction === null) return 'flood';
  if (fraction <= WINDOW_RESERVE_FRACTION) return 'slack';
  if (fraction <= WINDOW_SWITCH_FRACTION) return 'shallow';
  if (fraction <= WINDOW_WARN_FRACTION) return 'ebb';
  return 'flood';
}

/** Projected exhaustion given the current burn. The product's actual promise. */
export function timeToEmptyMs(
  h: Headroom | null,
  tokensPerSecond: number,
  now: number,
): number | null {
  const p = projectedHeadroom(h, now);
  if (!p || tokensPerSecond <= 0) return null;
  const usable = Math.max(0, p.tokens - HEADROOM_MARGIN_TOKENS);
  return (usable / tokensPerSecond) * 1000;
}
