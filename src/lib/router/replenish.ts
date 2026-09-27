import type { Headroom } from '../types';

/**
 * How fast a bucket is actually refilling, in tokens per second.
 *
 * This is the number that makes an ambient background honest. A token-bucket
 * provider replenishes continuously — capacity is coming back right now, while
 * nobody is looking — so a field that drifts at this rate is not decoration
 * sitting on top of an idle system. It is the system, drawn.
 */
export function replenishRate(h: Headroom | null, now: number): number {
  if (!h) return 0;
  const observed = Date.parse(h.observedAt);
  const reset = Date.parse(h.resetAt);
  if (!Number.isFinite(observed) || !Number.isFinite(reset) || reset <= now) return 0;
  const missing = Math.max(0, h.limitTokens - h.tokens);
  if (missing === 0) return 0;
  const secondsToFull = (reset - now) / 1000;
  return secondsToFull <= 0 ? 0 : missing / secondsToFull;
}

/** Aggregate replenishment across every source, tokens per second. */
export function poolReplenishRate(headrooms: (Headroom | null)[], now: number): number {
  return headrooms.reduce((a, h) => a + replenishRate(h, now), 0);
}
