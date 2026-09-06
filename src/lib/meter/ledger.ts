import type { LedgerEntry, UsageEvent } from '../types';

/**
 * §9.4. Double entry, no special case for self-use: consumer and contributor being
 * the same person still writes the pair and still nets to zero, which is what keeps
 * the invariant query in §7.5 a one-liner.
 */
export function entriesFor(e: UsageEvent, id: (suffix: string) => string): LedgerEntry[] {
  return [
    {
      id: id('debit'),
      poolId: e.poolId,
      usageEventId: e.id,
      userId: e.consumerUserId,
      direction: 'debit',
      amountUsd: e.costUsd,
      createdAt: e.createdAt,
    },
    {
      id: id('credit'),
      poolId: e.poolId,
      usageEventId: e.id,
      userId: e.contributorUserId,
      direction: 'credit',
      amountUsd: e.costUsd,
      createdAt: e.createdAt,
    },
  ];
}

export interface Imbalance {
  usageEventId: string;
  net: number;
  count: number;
}

/** The invariant. Must return an empty array, always, everywhere. */
export function findImbalances(entries: LedgerEntry[]): Imbalance[] {
  const byEvent = new Map<string, { net: number; count: number }>();
  for (const e of entries) {
    const cur = byEvent.get(e.usageEventId) ?? { net: 0, count: 0 };
    cur.net += e.direction === 'debit' ? e.amountUsd : -e.amountUsd;
    cur.count += 1;
    byEvent.set(e.usageEventId, cur);
  }
  const out: Imbalance[] = [];
  for (const [usageEventId, v] of byEvent) {
    if (Math.abs(v.net) > 1e-9 || v.count !== 2) {
      out.push({ usageEventId, net: v.net, count: v.count });
    }
  }
  return out;
}

export interface Position {
  userId: string;
  contributedUsd: number;
  consumedUsd: number;
  netUsd: number;
}

export function positions(entries: LedgerEntry[], userIds: string[]): Position[] {
  const m = new Map<string, Position>(
    userIds.map((userId) => [userId, { userId, contributedUsd: 0, consumedUsd: 0, netUsd: 0 }]),
  );
  for (const e of entries) {
    const p = m.get(e.userId);
    if (!p) continue;
    if (e.direction === 'credit') p.contributedUsd += e.amountUsd;
    else p.consumedUsd += e.amountUsd;
  }
  for (const p of m.values()) p.netUsd = p.contributedUsd - p.consumedUsd;
  return [...m.values()];
}

export interface Transfer {
  from: string;
  to: string;
  amountUsd: number;
}

/**
 * Minimal transfer set: greedily match the largest debtor against the largest
 * creditor. n-1 transfers at worst, which is what people will actually settle.
 */
export function settle(pos: Position[]): Transfer[] {
  const debtors = pos.filter((p) => p.netUsd < -1e-6).map((p) => ({ ...p })).sort((a, b) => a.netUsd - b.netUsd);
  const creditors = pos.filter((p) => p.netUsd > 1e-6).map((p) => ({ ...p })).sort((a, b) => b.netUsd - a.netUsd);
  const out: Transfer[] = [];
  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const amount = Math.min(-debtors[i].netUsd, creditors[j].netUsd);
    if (amount > 1e-6) {
      out.push({ from: debtors[i].userId, to: creditors[j].userId, amountUsd: Math.round(amount * 1e6) / 1e6 });
    }
    debtors[i].netUsd += amount;
    creditors[j].netUsd -= amount;
    if (Math.abs(debtors[i].netUsd) < 1e-6) i += 1;
    if (Math.abs(creditors[j].netUsd) < 1e-6) j += 1;
  }
  return out;
}
