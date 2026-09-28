import { costUsd } from '../meter/price-book';

/**
 * Buy me compute.
 *
 * The thing that makes buy-me-a-coffee work is that a coffee is a unit everybody
 * already has a price and a feeling for. "500,000 tokens" is not that. So the
 * units here are named for the work they buy, not for the quantity they are:
 * nobody is buying tokens, they are buying you an overnight run.
 */

export type UnitId = 'cup' | 'tide' | 'spring';

export interface ComputeUnit {
  id: UnitId;
  label: string;
  /** What a supporter is actually paying for, in their terms. */
  buys: string;
  tokens: number;
}

export const UNITS: ComputeUnit[] = [
  { id: 'cup', label: 'A cup', buys: 'one long conversation', tokens: 50_000 },
  { id: 'tide', label: 'A tide', buys: 'one overnight run', tokens: 250_000 },
  { id: 'spring', label: 'A spring tide', buys: 'a full night of batch work', tokens: 1_000_000 },
];

export function unit(id: UnitId): ComputeUnit {
  const u = UNITS.find((x) => x.id === id);
  if (!u) throw new Error(`unknown unit: ${id}`);
  return u;
}

/**
 * What a unit costs at a given model's rate. Priced from the same book the
 * ledger uses, so what a supporter is quoted and what the creator is charged
 * cannot drift apart — a support page that quotes its own numbers is a support
 * page that will eventually lie to somebody.
 */
export function unitCostUsd(id: UnitId, modelId: string): number {
  const t = unit(id).tokens;
  return costUsd(
    {
      // A realistic mix rather than all-input, which would understate it by
      // roughly the output multiple and make every quote too cheap.
      inputTokens: Math.round(t * 0.7),
      outputTokens: Math.round(t * 0.3),
      cacheWriteTokens: 0,
      cacheReadTokens: 0,
      reasoningTokens: 0,
      gpuSeconds: 0,
    },
    modelId,
  );
}

export function tokensToUnits(tokens: number): { id: UnitId; count: number }[] {
  let left = Math.max(0, tokens);
  const out: { id: UnitId; count: number }[] = [];
  for (const u of [...UNITS].sort((a, b) => b.tokens - a.tokens)) {
    const count = Math.floor(left / u.tokens);
    if (count > 0) {
      out.push({ id: u.id, count });
      left -= count * u.tokens;
    }
  }
  return out;
}

/** "3 tides and a cup" — how a supporter would say it out loud. */
export function describeTokens(tokens: number): string {
  const parts = tokensToUnits(tokens);
  if (parts.length === 0) return 'less than a cup';
  return parts
    .map(({ id, count }) => {
      const u = unit(id);
      const name = count === 1 ? u.label.toLowerCase() : `${u.label.toLowerCase()}s`;
      return `${count} ${name.replace(/^a /, '')}`;
    })
    .join(' and ');
}
