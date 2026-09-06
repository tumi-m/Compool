import { policyAllows } from '../policy/guard';
import type {
  Candidate,
  CapacitySource,
  ScoreBreakdown,
  Selection,
  SelectionContext,
  WorkUnit,
} from '../types';
import { WINDOW_SWITCH_FRACTION, fillFraction, projectedHeadroom } from './headroom';

export const DEFAULT_WEIGHTS = {
  survival: 0.4,
  reliability: 0.2,
  fairness: 0.15,
  latency: 0.1,
  cost: 0.1,
  affinity: 0.05,
};

export const PRESETS = {
  "Don't stall": { survival: 0.55, reliability: 0.2, fairness: 0.1, latency: 0.08, cost: 0.02, affinity: 0.05 },
  Balanced: DEFAULT_WEIGHTS,
  Cheapest: { survival: 0.2, reliability: 0.15, fairness: 0.1, latency: 0.05, cost: 0.45, affinity: 0.05 },
} as const;

export type PresetName = keyof typeof PRESETS;

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

export function supportsModel(source: CapacitySource, model: string): boolean {
  // Sources advertise a provider; the demo workspace keeps model routing coarse.
  // A real adapter consults `models` (§7.6) rather than a prefix.
  return model === '*' || model.startsWith(source.provider) || source.cls === 'B';
}

function withinBudget(c: Candidate, ctx: SelectionContext): boolean {
  if (ctx.budgetRemainingUsd !== null && c.estCostUsd > ctx.budgetRemainingUsd) return false;
  if (ctx.memberCapRemainingUsd !== null && c.estCostUsd > ctx.memberCapRemainingUsd) return false;
  return true;
}

/** §8.6. A pool where one person burns everyone else's keys dies in a week. */
export function fairnessBonus(source: CapacitySource, ctx: SelectionContext): number {
  if (!ctx.poolId || source.ownerUserId === ctx.consumerUserId) return 0.5;
  const contributed = ctx.contributionUsd.get(source.ownerUserId) ?? 0;
  const consumed = ctx.consumptionUsd.get(source.ownerUserId) ?? 0;
  const spread = ctx.poolNetSpreadUsd || 1;
  return clamp01(0.5 + ((contributed - consumed) / spread) * 0.5);
}

export function scoreCandidate(
  c: Candidate,
  work: WorkUnit,
  ctx: SelectionContext,
): ScoreBreakdown {
  const need = work.estimatedTokens + ctx.headroomMarginTokens;
  const h = projectedHeadroom(c.headroom, ctx.now);

  const survival =
    h === null
      ? 0.75 // unknown headroom (owned compute, unverified policy) — mildly optimistic
      : h.tokens >= need * 3
        ? 1
        : h.tokens >= need
          ? 0.6 + 0.4 * ((h.tokens - need) / (need * 2))
          : 0;

  const reliability = 1 - c.recentErrorRate;
  const latency = 1 / (1 + c.observedLatencyMs / 1000);
  const cost = 1 / (1 + c.estCostUsd * ctx.costSensitivity);
  const fairness = fairnessBonus(c.source, ctx);
  const affinity = c.source.id === ctx.stickySourceId ? 1 : 0;

  const score =
    survival === 0
      ? Number.NEGATIVE_INFINITY
      : ctx.w.survival * survival +
        ctx.w.reliability * reliability +
        ctx.w.latency * latency +
        ctx.w.cost * cost +
        ctx.w.fairness * fairness +
        ctx.w.affinity * affinity;

  return { sourceId: c.source.id, score, survival, reliability, latency, cost, fairness, affinity };
}

function diagnose(candidates: Candidate[], work: WorkUnit, ctx: SelectionContext): string {
  if (candidates.length === 0) return 'No capacity sources are connected.';
  const live = candidates.filter((c) => c.source.status === 'active' || c.source.status === 'cooling');
  if (live.length === 0) return 'Every source is exhausted, revoked or awaiting verification.';
  const allowed = live.filter((c) => policyAllows(c.source, work, ctx.policies));
  if (allowed.length === 0) {
    return work.poolId
      ? 'Only personal seats are left, and a personal seat can never serve pooled work.'
      : 'No source has a policy entry permitting this work.';
  }
  if (!allowed.some((c) => supportsModel(c.source, work.model))) {
    return `No connected source serves ${work.model}.`;
  }
  return 'Every eligible source is at low tide for a task this size. Wait for the next tide, or connect another source.';
}

export function select(
  work: WorkUnit,
  candidates: Candidate[],
  ctx: SelectionContext,
): Selection {
  const eligible = candidates
    .filter((c) => c.source.status === 'active' || c.source.status === 'cooling')
    .filter((c) => !ctx.excludedSourceIds.has(c.source.id))
    .filter((c) => policyAllows(c.source, work, ctx.policies))
    .filter((c) => supportsModel(c.source, work.model))
    .filter((c) => withinBudget(c, ctx))
    // §8.4: below the switch threshold a source keeps serving interactive work
    // and stops taking batch work. You keep your chat; the bulk jobs move.
    .filter((c) => {
      if (work.kind !== 'bulk') return true;
      const f = fillFraction(c.headroom, ctx.now);
      return f === null || f > WINDOW_SWITCH_FRACTION;
    });

  if (eligible.length === 0) {
    return { kind: 'no_capacity', reason: diagnose(candidates, work, ctx) };
  }

  const scored = eligible
    .map((c) => ({ c, s: scoreCandidate(c, work, ctx) }))
    .filter((x) => Number.isFinite(x.s.score))
    .sort((a, b) => b.s.score - a.s.score);

  if (scored.length === 0) {
    return { kind: 'no_capacity', reason: diagnose(candidates, work, ctx) };
  }

  return {
    kind: 'selected',
    source: scored[0].c.source,
    alternatives: scored.slice(1, 4).map((x) => x.c.source),
    scores: scored.map((x) => x.s),
  };
}
