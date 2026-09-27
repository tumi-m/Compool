'use client';

import { useEffect, useRef, useState } from 'react';
import { fillFraction, projectedHeadroom, tideLevel } from '@/lib/router/headroom';
import { clockAt, pct, tokens } from '@/lib/format';
import type { CapacitySource, Headroom } from '@/lib/types';

/** Emit a droplet whenever the reported token count actually falls. */
function useDroplets(tokens: number | null, live: boolean): number[] {
  const [drops, setDrops] = useState<number[]>([]);
  const prev = useRef<number | null>(tokens);
  useEffect(() => {
    if (tokens === null || prev.current === null) {
      prev.current = tokens;
      return;
    }
    if (live && tokens < prev.current) {
      const id = Date.now() + Math.random();
      setDrops((d) => [...d.slice(-2), id]);
      window.setTimeout(() => setDrops((d) => d.filter((x) => x !== id)), 1400);
    }
    prev.current = tokens;
  }, [tokens, live]);
  return drops;
}

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
  const drops = useDroplets(headroom?.tokens ?? null, live);
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
            {/* A droplet lands each time tokens are actually drawn, and the
                surface rings where it hits. Consumption you can see. */}
            {drops.map((d) => (
              <span key={d} aria-hidden="true">
                <span className="drop" style={{ ['--fall' as string]: `${(1 - shown) * 88 - 6}px` }} />
                <span
                  className="ripple"
                  style={{ bottom: `calc(${shown * 100}% - 17px)`, animationDelay: '380ms' }}
                />
              </span>
            ))}
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
