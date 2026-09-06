import { describe, expect, it } from 'vitest';
import { costUsd, priceBook } from '@/lib/meter/price-book';
import { entriesFor, findImbalances, positions, settle } from '@/lib/meter/ledger';
import type { LedgerEntry, UsageEvent } from '@/lib/types';

const event = (over: Partial<UsageEvent> = {}): UsageEvent => ({
  id: 'ue_1', runId: 'run_1', sourceId: 'src_1', poolId: 'pool_1',
  consumerUserId: 'user_a', contributorUserId: 'user_b',
  provider: 'anthropic', model: 'anthropic:workhorse',
  inputTokens: 1_000_000, outputTokens: 0, cacheWriteTokens: 0, cacheReadTokens: 0,
  reasoningTokens: 0, gpuSeconds: 0,
  priceBookVersion: priceBook.version, costUsd: 3, estimated: false,
  createdAt: '2026-09-06T00:00:00Z', ...over,
});

describe('pricing', () => {
  it('prices a million input tokens at the per-million input rate', () => {
    const p = priceBook.prices['anthropic:workhorse'];
    const c = costUsd({ inputTokens: 1_000_000, outputTokens: 0, cacheWriteTokens: 0, cacheReadTokens: 0, reasoningTokens: 0, gpuSeconds: 0 }, 'anthropic:workhorse');
    expect(c).toBeCloseTo(p.inputUsd, 10);
  });

  it('prices cache reads and cache writes off their own rates, not the base input rate', () => {
    const p = priceBook.prices['anthropic:workhorse'];
    const read = costUsd({ inputTokens: 0, outputTokens: 0, cacheWriteTokens: 0, cacheReadTokens: 1_000_000, reasoningTokens: 0, gpuSeconds: 0 }, 'anthropic:workhorse');
    const write = costUsd({ inputTokens: 0, outputTokens: 0, cacheWriteTokens: 1_000_000, cacheReadTokens: 0, reasoningTokens: 0, gpuSeconds: 0 }, 'anthropic:workhorse');
    expect(read).toBeCloseTo(p.cacheReadUsd!, 10);
    expect(write).toBeCloseTo(p.cacheWriteUsd!, 10);
    expect(read).not.toBeCloseTo(p.inputUsd, 6);
  });

  it('falls back to the base input rate where a provider prices no cache tier', () => {
    const p = priceBook.prices['openai:workhorse'];
    expect(p.cacheWriteUsd).toBeNull();
    const c = costUsd({ inputTokens: 0, outputTokens: 0, cacheWriteTokens: 1_000_000, cacheReadTokens: 0, reasoningTokens: 0, gpuSeconds: 0 }, 'openai:workhorse');
    expect(c).toBeCloseTo(p.inputUsd, 10);
  });

  it('costs nothing for owned compute', () => {
    expect(costUsd({ inputTokens: 5_000_000, outputTokens: 5_000_000, cacheWriteTokens: 0, cacheReadTokens: 0, reasoningTokens: 0, gpuSeconds: 900 }, 'ollama:local')).toBe(0);
  });

  it('does not drift over ten thousand small runs', () => {
    const one = { inputTokens: 1234, outputTokens: 567, cacheWriteTokens: 0, cacheReadTokens: 0, reasoningTokens: 0, gpuSeconds: 0 };
    let total = 0;
    for (let i = 0; i < 10_000; i += 1) total += costUsd(one, 'anthropic:workhorse');
    const bulk = costUsd({ ...one, inputTokens: one.inputTokens * 10_000, outputTokens: one.outputTokens * 10_000 }, 'anthropic:workhorse');
    expect(Math.abs(total - bulk)).toBeLessThan(1e-6);
  });

  it('is flagged synthetic until someone seeds it', () => {
    expect(priceBook.synthetic).toBe(true);
    expect(priceBook.sourceUrl).toBeNull();
  });
});

describe('double entry', () => {
  const id = (s: string) => `ue_1_${s}`;

  it('writes exactly two entries that sum to zero', () => {
    const e = entriesFor(event(), id);
    expect(e).toHaveLength(2);
    expect(findImbalances(e)).toEqual([]);
  });

  it('still writes the pair when consumer and contributor are the same person', () => {
    const e = entriesFor(event({ contributorUserId: 'user_a' }), id);
    expect(e).toHaveLength(2);
    expect(findImbalances(e)).toEqual([]);
    const p = positions(e, ['user_a']);
    expect(p[0].netUsd).toBeCloseTo(0, 10);
  });

  it('catches a single orphaned entry', () => {
    const [debit] = entriesFor(event(), id);
    expect(findImbalances([debit])).toHaveLength(1);
  });

  it('catches a pair that does not balance', () => {
    const [debit, credit] = entriesFor(event(), id);
    const broken: LedgerEntry[] = [debit, { ...credit, amountUsd: credit.amountUsd + 1 }];
    expect(findImbalances(broken)).toHaveLength(1);
  });
});

describe('settlement', () => {
  it('produces a transfer set that clears every position', () => {
    const entries = [
      ...entriesFor(event({ id: 'ue_1', consumerUserId: 'user_a', contributorUserId: 'user_b', costUsd: 6 }), (s) => `ue_1_${s}`),
      ...entriesFor(event({ id: 'ue_2', consumerUserId: 'user_c', contributorUserId: 'user_b', costUsd: 4 }), (s) => `ue_2_${s}`),
    ];
    const pos = positions(entries, ['user_a', 'user_b', 'user_c']);
    const transfers = settle(pos);
    expect(findImbalances(entries)).toEqual([]);

    const after = new Map(pos.map((p) => [p.userId, p.netUsd]));
    for (const t of transfers) {
      after.set(t.from, (after.get(t.from) ?? 0) + t.amountUsd);
      after.set(t.to, (after.get(t.to) ?? 0) - t.amountUsd);
    }
    for (const v of after.values()) expect(Math.abs(v)).toBeLessThan(1e-6);
  });

  it('proposes nothing when everyone is square', () => {
    const entries = entriesFor(event({ contributorUserId: 'user_a' }), (s) => `ue_1_${s}`);
    expect(settle(positions(entries, ['user_a']))).toEqual([]);
  });
});
