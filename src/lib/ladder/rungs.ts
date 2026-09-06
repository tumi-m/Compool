import { fillFraction, projectedHeadroom } from '../router/headroom';
import type { Candidate } from '../types';

/**
 * The ladder — the always-on mechanism.
 *
 * Running out of frontier capacity is not a reason to stop working. It is a
 * reason to drop a rung. A lighter or open-weight model can keep the build moving
 * at three in the morning, and when the tide comes back in the capable model
 * comes back with it and rewrites what the light rung left behind.
 *
 * So a stall becomes a *quality dip that repairs itself*, which is a completely
 * different experience from a wall. The work never stops; only the ceiling moves.
 *
 * Model names are USER-SUPPLIED and unverified. Rule 1 forbids inventing model
 * ids, pricing or limits, so every rung ships with `verified: false` and the UI
 * says plainly that you must confirm the exact id with your provider before this
 * routes real traffic. The ladder mechanism does not care what the names are.
 */

export type Tier = 'frontier' | 'strong' | 'light' | 'free';

export const TIER_ORDER: Tier[] = ['frontier', 'strong', 'light', 'free'];

export const TIER_COPY: Record<Tier, { label: string; line: string }> = {
  frontier: { label: 'Frontier', line: 'The most capable rung. Used when the tide is in, and for rework afterwards.' },
  strong: { label: 'Strong', line: 'Most work lands here. Capable enough that rework is usually unnecessary.' },
  light: { label: 'Light', line: 'Fast and cheap. Keeps momentum through a drained window; output is flagged for rework.' },
  free: { label: 'Free / open weight', line: 'Open-weight models on your own hardware or a free tier. The floor that makes always-on true.' },
};

export interface Rung {
  id: string;
  name: string;
  tier: Tier;
  /** Which connected provider serves it. 'ollama' means owned compute. */
  provider: string;
  openWeight: boolean;
  /** Can this rung scope work as well as execute it? */
  canPlan: boolean;
  /** Names came from the operator, not from a provider catalogue. */
  verified: boolean;
  note?: string;
}

export function tierRank(t: Tier): number {
  return TIER_ORDER.indexOf(t);
}

export function isBelow(a: Tier, b: Tier): boolean {
  return tierRank(a) > tierRank(b);
}

export type LadderPick =
  | {
      kind: 'picked';
      rung: Rung;
      sourceId: string;
      /** True when we came down the ladder to find this one. */
      degraded: boolean;
      target: Tier;
      /** Why we dropped, in one line, for the run event. */
      reason: string | null;
      fill: number | null;
    }
  | { kind: 'stalled'; reason: string };

export interface LadderContext {
  now: number;
  candidates: Candidate[];
  /** Fraction of a window a rung needs before it is considered servable. */
  minFill: number;
  /** Tokens the work is expected to need. */
  estimatedTokens: number;
}

function servable(rung: Rung, ctx: LadderContext): { sourceId: string; fill: number | null } | null {
  const usable = ctx.candidates.filter(
    (c) =>
      c.source.provider === rung.provider &&
      (c.source.status === 'active' || c.source.status === 'cooling'),
  );
  let best: { sourceId: string; fill: number | null } | null = null;
  for (const c of usable) {
    // Owned compute reports no window at all. It is the floor precisely because
    // it never runs out — it only gets slower.
    if (c.headroom === null) return { sourceId: c.source.id, fill: null };
    const f = fillFraction(c.headroom, ctx.now);
    const p = projectedHeadroom(c.headroom, ctx.now);
    if (f === null || p === null) continue;
    if (f < ctx.minFill) continue;
    if (p.tokens < ctx.estimatedTokens) continue;
    if (!best || (best.fill ?? 0) < f) best = { sourceId: c.source.id, fill: f };
  }
  return best;
}

/**
 * Walk down from the target tier until something can actually serve the work.
 * Never returns "no capacity" while any rung is servable — that is the promise.
 */
export function pickRung(target: Tier, rungs: Rung[], ctx: LadderContext): LadderPick {
  const enabled = rungs.filter((r) => tierRank(r.tier) >= tierRank(target));
  const ordered = [...enabled].sort((a, b) => tierRank(a.tier) - tierRank(b.tier));

  for (const rung of ordered) {
    const hit = servable(rung, ctx);
    if (!hit) continue;
    const degraded = isBelow(rung.tier, target);
    return {
      kind: 'picked',
      rung,
      sourceId: hit.sourceId,
      degraded,
      target,
      reason: degraded
        ? `${TIER_COPY[target].label} capacity is spent, so this ran on ${rung.name}. It will be reworked when the tide comes back in.`
        : null,
      fill: hit.fill,
    };
  }

  return {
    kind: 'stalled',
    reason:
      'Every rung on the ladder is out, including the floor. Connect owned compute — a local open-weight model never runs out, it only gets slower, which is what makes always-on true.',
  };
}

/** Is a rung at or above `tier` servable right now? Drives the rework trigger. */
export function promotionAvailable(tier: Tier, rungs: Rung[], ctx: LadderContext): Rung | null {
  const higher = rungs
    .filter((r) => tierRank(r.tier) <= tierRank(tier))
    .sort((a, b) => tierRank(a.tier) - tierRank(b.tier));
  for (const r of higher) if (servable(r, ctx)) return r;
  return null;
}

/**
 * Scoping is small work, so it should never spend the expensive rung. The planner
 * is deliberately the cheapest thing that can plan — which is also why running it
 * locally is fine, and why "plan mode" costs nothing worth measuring.
 */
export function plannerRung(rungs: Rung[], ctx: LadderContext): Rung | null {
  const planners = rungs
    .filter((r) => r.canPlan)
    .sort((a, b) => tierRank(b.tier) - tierRank(a.tier)); // cheapest first
  for (const r of planners) if (servable(r, ctx)) return r;
  return null;
}
