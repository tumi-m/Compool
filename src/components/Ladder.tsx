'use client';

import { TIER_COPY, TIER_ORDER, tierRank, type Rung, type Tier } from '@/lib/ladder/rungs';
import { fillFraction } from '@/lib/router/headroom';
import { pct } from '@/lib/format';
import type { Candidate } from '@/lib/types';

/**
 * The ladder, standing up.
 *
 * Dropping a rung is a movement, so it looks like one: the rung currently taking
 * work slides out from the stack, spent rungs above it fade, and an arrow nudges
 * downward while the system is running degraded. You can see at a glance how far
 * down the ladder you are and how far there is left to fall.
 */
export function Ladder({
  rungs,
  candidates,
  now,
  currentRungId,
  target,
}: {
  rungs: Rung[];
  candidates: Candidate[];
  now: number;
  currentRungId: string | null;
  target: Tier;
}) {
  const currentRank = currentRungId
    ? tierRank(rungs.find((r) => r.id === currentRungId)?.tier ?? target)
    : tierRank(target);

  const byTier = TIER_ORDER.map((t) => ({ tier: t, rungs: rungs.filter((r) => r.tier === t) })).filter(
    (g) => g.rungs.length > 0,
  );

  return (
    <div className="ladder">
      {byTier.map(({ tier, rungs: group }) => {
        const rank = tierRank(tier);
        const state = rank === currentRank ? 'current' : rank < currentRank ? 'spent' : 'above';
        // Best available fill across every source that can serve this tier.
        const fills = group
          .flatMap((r) => candidates.filter((c) => c.source.provider === r.provider))
          .map((c) => (c.headroom === null ? 1 : (fillFraction(c.headroom, now) ?? 0)));
        const best = fills.length ? Math.max(...fills) : 0;

        return (
          <div className="ladderRung" data-state={state} key={tier}>
            <span className="badge rungTier" style={{ minWidth: 118 }}>{TIER_COPY[tier].label}</span>
            <span className="small rungNames" style={{ flex: '1 1 160px', minWidth: 0 }}>
              {group.map((r) => r.name).join(' · ')}
            </span>
            <span className="srOnly">
              {state === 'current'
                ? 'This tier is taking work.'
                : state === 'spent'
                  ? 'This tier is spent.'
                  : 'This tier is in reserve; a higher one is still serving.'}
            </span>
            <div className="meterBar rungFill" style={{ maxWidth: 140 }}>
              <span style={{ width: `${Math.max(2, best * 100)}%` }} data-over={best <= 0.03 ? 'true' : 'false'} />
            </div>
            <span className="num small rungPct" style={{ width: 40, textAlign: 'right' }}>{pct(best)}</span>
            <span className="small rungState" style={{ width: 74, textAlign: 'right', color: 'var(--ink-2)' }}>
              {state === 'current' ? 'taking work' : state === 'spent' ? 'spent' : 'in reserve'}
            </span>
          </div>
        );
      })}
      {currentRank > tierRank(target) ? (
        <div className="row small" style={{ gap: 6, color: 'var(--shallow)' }}>
          <span className="ladderDrop" aria-hidden="true">↓</span>
          <span>
            Running {currentRank - tierRank(target)} rung
            {currentRank - tierRank(target) === 1 ? '' : 's'} below target. Output is flagged and gets rewritten
            when the tide comes back in.
          </span>
        </div>
      ) : null}
    </div>
  );
}
