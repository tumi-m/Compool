import { fillFraction } from '../router/headroom';
import { costUsd } from '../meter/price-book';
import { policyAllows } from '../policy/guard';
import type { Candidate, NodeRecord, PolicyRegister, Usage, WorkUnit } from '../types';

/**
 * Tide Preload.
 *
 * Capacity you don't spend before the window turns over is capacity you never had.
 * A Max window replenishes at 3am whether or not anyone is awake for it; a prepaid
 * balance ages; a GPU under the desk idles twenty hours a day. Preload spends that
 * capacity on work you already know you want done — a repo digest, a test-failure
 * triage, a cache warm for the context you'll open the laptop to — so the session
 * that starts at 9am starts full and warm instead of cold and half-drained.
 *
 * Every function here is pure. Headroom, budget and node state arrive as arguments,
 * which is what makes the whole scheduler testable offline in milliseconds.
 */

export type PreloadKind = 'warm_cache' | 'bulk' | 'digest';
export type PreloadRepeat = 'once' | 'daily' | 'weekdays';
export type PreloadState = 'queued' | 'running' | 'done' | 'failed' | 'skipped';

export interface PreloadItem {
  id: string;
  title: string;
  prompt: string;
  kind: PreloadKind;
  model: string;
  estimatedTokens: number;
  maxCostUsd: number | null;
  repeat: PreloadRepeat;
  /** IANA zone. Vercel Cron fires in UTC; 3am is only meaningful locally. */
  tz: string;
  anchorHour: number;
  windowHours: number;
  /** Only dispatch when the chosen source is at least this full. */
  requireHeadroomFraction: number;
  enabled: boolean;
  state: PreloadState;
  lastRunAt: string | null;
  lastSkipReason: string | null;
  lastCostUsd: number | null;
  createdAt: string;
}

export const PRELOAD_DEFAULTS = {
  anchorHour: 3,
  windowHours: 3,
  requireHeadroomFraction: 0.7,
} as const;

// ---- local time, without pulling in a date library --------------------------

export function localParts(now: number, tz: string): { hour: number; weekday: number; ymd: string } {
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    hourCycle: 'h23',
    hour: '2-digit',
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = Object.fromEntries(fmt.formatToParts(new Date(now)).map((p) => [p.type, p.value]));
  const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return {
    hour: Number(parts.hour),
    weekday: Math.max(0, weekdays.indexOf(String(parts.weekday))),
    ymd: `${parts.year}-${parts.month}-${parts.day}`,
  };
}

export function isWindowOpen(item: PreloadItem, now: number): boolean {
  const { hour, weekday } = localParts(now, item.tz);
  if (item.repeat === 'weekdays' && (weekday === 0 || weekday === 6)) return false;
  const end = item.anchorHour + item.windowHours;
  return end <= 24
    ? hour >= item.anchorHour && hour < end
    : hour >= item.anchorHour || hour < end - 24;
}

/** Milliseconds until the window next opens. Drives the "next tide" countdown. */
export function msUntilWindow(item: PreloadItem, now: number): number {
  if (isWindowOpen(item, now)) return 0;
  for (let ahead = 0; ahead <= 8 * 24; ahead += 1) {
    const t = now + ahead * 3_600_000;
    if (isWindowOpen(item, t)) {
      // Step back to the minute the window actually opens.
      let lo = Math.max(now, t - 3_600_000);
      let hi = t;
      while (hi - lo > 60_000) {
        const mid = lo + Math.floor((hi - lo) / 2);
        if (isWindowOpen(item, mid)) hi = mid;
        else lo = mid;
      }
      return hi - now;
    }
  }
  return Number.POSITIVE_INFINITY;
}

/** Already ran during this calendar day in the item's own zone. */
export function alreadyRanThisWindow(item: PreloadItem, now: number): boolean {
  if (!item.lastRunAt) return false;
  const last = Date.parse(item.lastRunAt);
  if (!Number.isFinite(last)) return false;
  return localParts(last, item.tz).ymd === localParts(now, item.tz).ymd;
}

// ---- the trough finder ------------------------------------------------------

export interface Trough {
  startHour: number;
  windowHours: number;
  meanLoad: number;
}

/**
 * 3am is the default, not the answer. Given 24 hourly load buckets, find the
 * quietest contiguous window of the requested length — wrapping past midnight,
 * because the quiet hours always do.
 */
export function findTrough(hourly: number[], windowHours: number): Trough {
  const n = 24;
  const w = Math.max(1, Math.min(n, Math.round(windowHours)));
  let best: Trough = { startHour: PRELOAD_DEFAULTS.anchorHour, windowHours: w, meanLoad: Infinity };
  for (let start = 0; start < n; start += 1) {
    let sum = 0;
    for (let k = 0; k < w; k += 1) sum += hourly[(start + k) % n] ?? 0;
    const mean = sum / w;
    if (mean < best.meanLoad - 1e-9) best = { startHour: start, windowHours: w, meanLoad: mean };
  }
  return best;
}

// ---- cost estimation --------------------------------------------------------

/**
 * A cache warm is mostly cache-write tokens and almost no output; a digest is
 * read-heavy with a short answer; bulk work generates. Pricing them identically
 * would make the preload budget meaningless, since cache writes and base input
 * are priced differently on most providers.
 */
export function estimatedUsage(item: PreloadItem): Usage {
  const t = Math.max(0, item.estimatedTokens);
  switch (item.kind) {
    case 'warm_cache':
      return { inputTokens: Math.round(t * 0.05), outputTokens: Math.round(t * 0.01), cacheWriteTokens: Math.round(t * 0.95), cacheReadTokens: 0, reasoningTokens: 0, gpuSeconds: 0 };
    case 'digest':
      return { inputTokens: Math.round(t * 0.8), outputTokens: Math.round(t * 0.08), cacheWriteTokens: 0, cacheReadTokens: Math.round(t * 0.2), reasoningTokens: 0, gpuSeconds: 0 };
    case 'bulk':
    default:
      return { inputTokens: Math.round(t * 0.55), outputTokens: Math.round(t * 0.45), cacheWriteTokens: 0, cacheReadTokens: 0, reasoningTokens: 0, gpuSeconds: 0 };
  }
}

export function estimatedCostUsd(item: PreloadItem, modelId: string): number {
  return costUsd(estimatedUsage(item), modelId);
}

// ---- the decision -----------------------------------------------------------

export type HoldReason =
  | 'disabled'
  | 'window_closed'
  | 'already_ran'
  | 'no_source'
  | 'headroom_too_low'
  | 'over_item_cap'
  | 'over_budget'
  | 'node_offline'
  | 'consent_not_given'
  | 'policy_refused';

export const HOLD_COPY: Record<HoldReason, string> = {
  disabled: 'Paused.',
  window_closed: 'Waiting for the tide.',
  already_ran: 'Ran in this window already.',
  no_source: 'No connected source can serve it.',
  headroom_too_low: 'The tide has not come back in far enough.',
  over_item_cap: 'Estimated cost exceeds this item’s own cap.',
  over_budget: 'Estimated cost exceeds the remaining pool budget.',
  node_offline: 'Your node is offline, so a personal seat cannot run it.',
  consent_not_given: 'This node has not opted in to unattended runs.',
  policy_refused: 'Policy refuses this source for this work.',
};

export interface PreloadContext {
  now: number;
  policies: PolicyRegister;
  candidates: Candidate[];
  nodes: NodeRecord[];
  ownerUserId: string;
  poolId: string | null;
  budgetRemainingUsd: number | null;
}

export interface PreloadDecision {
  itemId: string;
  dispatch: boolean;
  sourceId: string | null;
  estCostUsd: number;
  fillFraction: number | null;
  hold: HoldReason | null;
  /** Non-null when the window is shut: how long until it opens. */
  msUntilWindow: number | null;
}

/**
 * Preload never competes with a person. It only runs against a source that is
 * already near full, it always runs as `bulk` (so §8.4 keeps it out of a draining
 * window), and on a personal seat it runs only on the owner's own online node with
 * unattended mode explicitly turned on.
 */
export function evaluate(item: PreloadItem, ctx: PreloadContext): PreloadDecision {
  const base = { itemId: item.id, dispatch: false, sourceId: null, estCostUsd: 0, fillFraction: null, msUntilWindow: null } as PreloadDecision;

  if (!item.enabled) return { ...base, hold: 'disabled' };
  if (!isWindowOpen(item, ctx.now)) {
    return { ...base, hold: 'window_closed', msUntilWindow: msUntilWindow(item, ctx.now) };
  }
  if (alreadyRanThisWindow(item, ctx.now)) return { ...base, hold: 'already_ran' };

  const work: WorkUnit = {
    id: `work_${item.id}`,
    model: item.model,
    kind: 'bulk',
    estimatedTokens: item.estimatedTokens,
    attributedUserId: ctx.ownerUserId,
    poolId: ctx.poolId,
  };

  const usable = ctx.candidates.filter(
    (c) =>
      (c.source.status === 'active' || c.source.status === 'cooling') &&
      (item.model === '*' || item.model.startsWith(c.source.provider) || c.source.cls === 'B') &&
      policyAllows(c.source, work, ctx.policies),
  );
  if (usable.length === 0) return { ...base, hold: ctx.candidates.length ? 'policy_refused' : 'no_source' };

  // Rank by how full each source is: preload spends the fullest basin, never the
  // one a person is about to need.
  const ranked = usable
    .map((c) => ({ c, f: fillFraction(c.headroom, ctx.now) }))
    .sort((a, b) => (b.f ?? 0.75) - (a.f ?? 0.75));

  const consented = (c: Candidate): HoldReason | null => {
    if (c.source.cls !== 'C') return null;
    const node = ctx.nodes.find((n) => n.id === c.source.nodeId);
    if (!node || node.status !== 'online') return 'node_offline';
    if (node.poolMode !== 'auto') return 'consent_not_given';
    return null;
  };

  let lastHold: HoldReason = 'headroom_too_low';
  for (const { c, f } of ranked) {
    const gate = consented(c);
    if (gate) {
      lastHold = gate;
      continue;
    }
    if (f !== null && f < item.requireHeadroomFraction) {
      lastHold = 'headroom_too_low';
      continue;
    }
    const modelId = item.model === '*' ? `${c.source.provider}:workhorse` : item.model;
    const est = estimatedCostUsd(item, modelId);
    if (item.maxCostUsd !== null && est > item.maxCostUsd) {
      return { ...base, sourceId: c.source.id, estCostUsd: est, fillFraction: f, hold: 'over_item_cap' };
    }
    if (ctx.budgetRemainingUsd !== null && est > ctx.budgetRemainingUsd) {
      return { ...base, sourceId: c.source.id, estCostUsd: est, fillFraction: f, hold: 'over_budget' };
    }
    return { itemId: item.id, dispatch: true, sourceId: c.source.id, estCostUsd: est, fillFraction: f, hold: null, msUntilWindow: 0 };
  }

  return { ...base, hold: lastHold, fillFraction: ranked[0]?.f ?? null };
}

export interface PreloadPlan {
  decisions: PreloadDecision[];
  dispatchCount: number;
  estTotalUsd: number;
  nextWindowMs: number | null;
}

export function plan(items: PreloadItem[], ctx: PreloadContext): PreloadPlan {
  const decisions = items.map((i) => evaluate(i, ctx));
  const waits = decisions.map((d) => d.msUntilWindow).filter((m): m is number => m !== null && Number.isFinite(m) && m > 0);
  return {
    decisions,
    dispatchCount: decisions.filter((d) => d.dispatch).length,
    estTotalUsd: decisions.filter((d) => d.dispatch).reduce((a, d) => a + d.estCostUsd, 0),
    nextWindowMs: waits.length ? Math.min(...waits) : null,
  };
}
