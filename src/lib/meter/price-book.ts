import book from '../../../data/price-book.json';
import type { PriceBook, Usage } from '../types';

export const priceBook = book as unknown as PriceBook;

/**
 * §9.3. Micro-dollar precision, computed in integer micro-dollars so a session of
 * ten thousand small runs doesn't accumulate float drift into the ledger.
 * A per-1M-token rate times a token count, at 1e-10 USD resolution.
 */
const SCALE = 1e10;

export function costUsd(usage: Usage, modelId: string, bookIn: PriceBook = priceBook): number {
  const p = bookIn.prices[modelId];
  if (!p) return 0;
  const rate = (tokens: number, usdPerMillion: number | null | undefined, fallback: number) =>
    Math.round((tokens / 1e6) * (usdPerMillion ?? fallback) * SCALE);

  const micro =
    rate(usage.inputTokens, p.inputUsd, 0) +
    rate(usage.outputTokens, p.outputUsd, 0) +
    rate(usage.cacheWriteTokens, p.cacheWriteUsd, p.inputUsd) +
    rate(usage.cacheReadTokens, p.cacheReadUsd, p.inputUsd) +
    rate(usage.reasoningTokens, p.reasoningUsd, p.outputUsd);

  return micro / SCALE;
}

export function modelIdsFor(provider: string): string[] {
  return Object.keys(priceBook.prices).filter((id) => id.startsWith(`${provider}:`));
}
