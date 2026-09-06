'use client';

import { fillFraction, projectedHeadroom, tideLevel } from '@/lib/router/headroom';
import { clockAt, pct, tokens } from '@/lib/format';
import type { CapacitySource, Headroom } from '@/lib/types';

const CLASS_LABEL: Record<string, string> = { A: 'metered key', B: 'owned compute', C: 'personal seat' };
const LEVEL_WORD: Record<string, string> = { flood: 'high', ebb: 'ebbing', shallow: 'shallow', slack: 'slack water' };

/**
 * §14.7. One per capacity source. A flat-bottomed vessel with a fill level that
 * recedes while work runs against it. Colour never carries the meaning alone:
 * the level is also stated as a word and as a number.
 */
export function Basin({
  source,
  headroom,
  now,
  live,
  onRevoke,
}: {
  source: CapacitySource;
  headroom: Headroom | null;
  now: number;
  live: boolean;
  onRevoke?: (id: string) => void;
}) {
  const f = fillFraction(headroom, now);
  const level = tideLevel(f);
  const p = projectedHeadroom(headroom, now);
  const dead = source.status === 'revoked' || source.status === 'exhausted';
  const shown = dead ? 0 : (f ?? 0);

  return (
    <div className="basin panel">
      <div className="basinHead">
        <span className="basinName">{source.label}</span>
        <span className={`badge class${source.cls}`}>{source.cls} · {CLASS_LABEL[source.cls]}</span>
      </div>

      <div
        className={`vessel${live ? ' live' : ''}`}
        role="meter"
        aria-valuenow={f === null ? undefined : Math.round(f * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${source.label} capacity`}
        aria-valuetext={
          f === null
            ? 'Owned compute — no usage window to report'
            : `${Math.round(f * 100)} percent remaining, ${LEVEL_WORD[level]}${p ? `, ${tokens(p.tokens)} tokens left` : ''}`
        }
      >
        {headroom === null && !dead ? (
          <div className="unknown">no window · owned compute</div>
        ) : (
          <>
            <div className="fill" data-level={dead ? 'slack' : level} style={{ height: `${shown * 100}%` }} />
            <div className="waterline" style={{ bottom: `calc(${shown * 100}% - 1px)` }} />
          </>
        )}
      </div>

      <div className="basinFoot">
        <span>
          {dead
            ? source.status === 'revoked' ? 'revoked' : 'exhausted'
            : headroom === null
              ? 'always on'
              : `${tokens(p?.tokens ?? 0)} / ${tokens(headroom.limitTokens)}`}
        </span>
        <span>
          {dead || !headroom ? '—' : `${pct(f)} · next tide ${clockAt(Date.parse(headroom.resetAt))}`}
        </span>
      </div>

      <div className="row small" style={{ justifyContent: 'space-between' }}>
        <span className="muted">
          {LEVEL_WORD[level]}
          {source.cls === 'C' ? ' · never pooled' : source.contributedToPool ? ' · in the pool' : ' · personal'}
        </span>
        {onRevoke && source.status !== 'revoked' ? (
          <button type="button" className="tiny danger" onClick={() => onRevoke(source.id)}>
            Revoke
          </button>
        ) : null}
      </div>
    </div>
  );
}
