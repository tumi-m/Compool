import type { CapacityClass, CapacitySource } from '../types';
import { UNITS, type UnitId, unit } from './units';

/**
 * A pledge is a promise of compute, and there are exactly two honest ways to
 * make one.
 *
 *   'cash'     the supporter pays the creator directly, through the creator's
 *              own payment link. TIDEPOOL records the pledge and raises the
 *              creator's own budget. It never holds, routes or takes a cut of
 *              the money — being a middleman on somebody else's inference bill
 *              is the one revenue model the plan rules out, and it is also what
 *              would drag a creator's support page into payment regulation.
 *
 *   'capacity' the supporter grants a time-boxed, capped window on capacity they
 *              already own. Nothing is bought or sold, which is what keeps this
 *              clear of the unresolved question about reselling prepaid credit:
 *              there is no consideration, so there is nothing to resell.
 *
 * A personal seat can be neither. §3 holds here exactly as it holds everywhere.
 */

export type PledgeKind = 'cash' | 'capacity';
export type PledgeState = 'pending' | 'active' | 'spent' | 'expired' | 'declined';

export interface Pledge {
  id: string;
  /** Who it is for. */
  creatorHandle: string;
  kind: PledgeKind;
  /** Display name the supporter chose. Never an email, never an account. */
  supporterName: string;
  message: string | null;
  unitId: UnitId;
  count: number;
  /** Tokens promised: unit size times count, denormalised for the wall. */
  tokens: number;
  /** Tokens the creator has actually drawn against it. */
  redeemedTokens: number;
  /** capacity pledges only: whose source, and until when. */
  sourceId: string | null;
  supporterUserId: string | null;
  expiresAt: string | null;
  state: PledgeState;
  createdAt: string;
}

export class GiftError extends Error {
  constructor(readonly code: 'CLASS_C_NEVER_GIFTED' | 'SOURCE_NOT_OWNED' | 'SOURCE_NOT_ACTIVE') {
    super(code);
    this.name = 'GiftError';
  }
}

/**
 * The §3 invariant, at the gifting boundary. A personal seat is a personal
 * entitlement — it cannot be lent to a stranger on the internet any more than it
 * can be pooled with a teammate, and a support page is exactly where somebody
 * would try.
 */
export function assertGiftable(source: CapacitySource, supporterUserId: string): void {
  if (source.cls === ('C' satisfies CapacityClass)) throw new GiftError('CLASS_C_NEVER_GIFTED');
  if (source.ownerUserId !== supporterUserId) throw new GiftError('SOURCE_NOT_OWNED');
  if (source.status !== 'active') throw new GiftError('SOURCE_NOT_ACTIVE');
}

export function giftableSources(sources: CapacitySource[], supporterUserId: string): CapacitySource[] {
  return sources.filter((s) => {
    try {
      assertGiftable(s, supporterUserId);
      return true;
    } catch {
      return false;
    }
  });
}

export function newPledge(
  input: Omit<Pledge, 'tokens' | 'redeemedTokens' | 'state'> & { state?: PledgeState },
): Pledge {
  return {
    ...input,
    tokens: unit(input.unitId).tokens * Math.max(1, Math.floor(input.count)),
    redeemedTokens: 0,
    state: input.state ?? (input.kind === 'cash' ? 'pending' : 'active'),
  };
}

// ---- totals ---------------------------------------------------------------

export interface SupportTotals {
  supporters: number;
  pledgedTokens: number;
  redeemedTokens: number;
  remainingTokens: number;
  /** Pledges that have been promised but not yet confirmed as paid. */
  pendingTokens: number;
}

const COUNTS = (p: Pledge) => p.state === 'active' || p.state === 'spent';

export function totals(pledges: Pledge[], now = Date.now()): SupportTotals {
  const live = pledges.filter((p) => COUNTS(p) && !isExpired(p, now));
  const pledged = live.reduce((a, p) => a + p.tokens, 0);
  const redeemed = live.reduce((a, p) => a + Math.min(p.tokens, p.redeemedTokens), 0);
  return {
    supporters: new Set(live.map((p) => p.supporterName.trim().toLowerCase())).size,
    pledgedTokens: pledged,
    redeemedTokens: redeemed,
    remainingTokens: Math.max(0, pledged - redeemed),
    pendingTokens: pledges.filter((p) => p.state === 'pending').reduce((a, p) => a + p.tokens, 0),
  };
}

export function isExpired(p: Pledge, now = Date.now()): boolean {
  if (!p.expiresAt) return false;
  const t = Date.parse(p.expiresAt);
  return Number.isFinite(t) && t <= now;
}

/** Fold expiry into state, so a stale window stops counting without a cron. */
export function settlePledges(pledges: Pledge[], now = Date.now()): Pledge[] {
  return pledges.map((p) => {
    if (p.state === 'active' && isExpired(p, now)) return { ...p, state: 'expired' };
    if (p.state === 'active' && p.redeemedTokens >= p.tokens) return { ...p, state: 'spent' };
    return p;
  });
}

// ---- goals ----------------------------------------------------------------

export interface Goal {
  label: string;
  tokens: number;
}

export function goalProgress(pledges: Pledge[], goal: Goal | null, now = Date.now()) {
  const t = totals(pledges, now);
  if (!goal || goal.tokens <= 0) return { fraction: 0, reached: false, remaining: 0, ...t };
  const fraction = Math.min(1, t.pledgedTokens / goal.tokens);
  return {
    fraction,
    reached: t.pledgedTokens >= goal.tokens,
    remaining: Math.max(0, goal.tokens - t.pledgedTokens),
    ...t,
  };
}

/**
 * Draw against the oldest pledge first, so a supporter's gift is used rather
 * than sitting behind newer ones forever. Returns the updated pledges and what
 * could not be covered.
 */
export function redeem(pledges: Pledge[], tokens: number, now = Date.now()): { pledges: Pledge[]; uncovered: number } {
  let left = Math.max(0, tokens);
  const order = [...pledges].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const byId = new Map(order.map((p) => [p.id, { ...p }]));

  for (const p of order) {
    if (left <= 0) break;
    const live = byId.get(p.id)!;
    if (live.state !== 'active' || isExpired(live, now)) continue;
    const room = live.tokens - live.redeemedTokens;
    if (room <= 0) continue;
    const take = Math.min(room, left);
    live.redeemedTokens += take;
    left -= take;
  }

  return {
    pledges: settlePledges(
      pledges.map((p) => byId.get(p.id) ?? p),
      now,
    ),
    uncovered: left,
  };
}
