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

// ---- compaction -----------------------------------------------------------

export interface Carried {
  contributedUsd: number;
  consumedUsd: number;
}

/**
 * Keep the stored ledger bounded without changing anybody's balance.
 *
 * The first version sliced usage events at 300 and ledger entries at 600,
 * independently and by position. It happened to keep pairs together only
 * because pairs were adjacent — and every entry that fell off the end silently
 * changed somebody's position in the Stack, so a settlement computed on Friday
 * disagreed with the one computed on Monday. For the one part of the system
 * the plan calls the product, that is not a storage detail.
 *
 * This drops whole usage events, oldest first, removes their entries by id
 * rather than by position, and folds what they carried into a per-person
 * balance brought forward. positions() over the kept entries plus the carried
 * balance is exactly positions() over everything.
 */
export function compact(
  usage: UsageEvent[],
  ledger: LedgerEntry[],
  carried: Record<string, Carried>,
  keepEvents: number,
): { usage: UsageEvent[]; ledger: LedgerEntry[]; carried: Record<string, Carried> } {
  if (usage.length <= keepEvents) return { usage, ledger, carried };

  const byAge = [...usage].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const keep = byAge.slice(0, keepEvents);
  const keepIds = new Set(keep.map((u) => u.id));
  const next: Record<string, Carried> = Object.fromEntries(
    Object.entries(carried).map(([k, v]) => [k, { ...v }]),
  );

  const kept: LedgerEntry[] = [];
  for (const e of ledger) {
    if (keepIds.has(e.usageEventId)) {
      kept.push(e);
      continue;
    }
    const c = (next[e.userId] ??= { contributedUsd: 0, consumedUsd: 0 });
    if (e.direction === 'credit') c.contributedUsd += e.amountUsd;
    else c.consumedUsd += e.amountUsd;
  }

  return { usage: usage.filter((u) => keepIds.has(u.id)), ledger: kept, carried: next };
}

/** positions() including whatever compaction brought forward. */
export function positionsWithCarried(
  entries: LedgerEntry[],
  userIds: string[],
  carried: Record<string, Carried> = {},
): Position[] {
  return positions(entries, userIds).map((p) => {
    const c = carried[p.userId];
    if (!c) return p;
    const contributedUsd = p.contributedUsd + c.contributedUsd;
    const consumedUsd = p.consumedUsd + c.consumedUsd;
    return { ...p, contributedUsd, consumedUsd, netUsd: contributedUsd - consumedUsd };
  });
}
