'use client';

import { clockAt, duration, usd } from '@/lib/format';

/**
 * §14.7. The rate panel: spend across the session, the current burn, and a
 * projected time-to-empty. The projection is the product's promise made literal —
 * you find out hours early, not at the moment it stops.
 */
export function Tide({
  spentUsd,
  budgetUsd,
  burnUsdPerHour,
  emptyInMs,
  hourly,
  windowStart,
  windowHours,
  nowHour,
}: {
  spentUsd: number;
  budgetUsd: number | null;
  burnUsdPerHour: number;
  emptyInMs: number | null;
  hourly: number[];
  windowStart: number;
  windowHours: number;
  nowHour: number;
}) {
  const max = Math.max(1, ...hourly);
  const inWindow = (h: number) => {
    const rel = (h - windowStart + 24) % 24;
    return rel < windowHours;
  };
  const over = budgetUsd !== null && spentUsd > budgetUsd;

  return (
    <div className="panel stackv">
      <div className="spread">
        <div>
          <div className="sectionLabel">Spent this session</div>
          <div className="bigNum">
            {usd(spentUsd)}
            {budgetUsd !== null ? <span className="unit">of {usd(budgetUsd)}</span> : null}
          </div>
        </div>
        <div>
          <div className="sectionLabel">Burn</div>
          <div className="num" style={{ fontSize: 20 }}>{usd(burnUsdPerHour)}<span className="muted small">/h</span></div>
        </div>
        <div>
          <div className="sectionLabel">Time to empty</div>
          <div className="num" style={{ fontSize: 20 }}>{duration(emptyInMs)}</div>
        </div>
      </div>

      {budgetUsd !== null ? (
        <div className="meterBar" aria-hidden="true">
          <span data-over={String(over)} style={{ width: `${Math.min(100, (spentUsd / budgetUsd) * 100)}%` }} />
        </div>
      ) : null}

      <div>
        <div className="sectionLabel">Load through the day · preload window shaded</div>
        <div className="tideChart" role="img" aria-label={`Hourly load. The preload window runs from ${String(windowStart).padStart(2, '0')}:00 for ${windowHours} hours.`}>
          {hourly.map((v, h) => (
            <div
              key={h}
              className={`bar${inWindow(h) ? ' inWindow' : ''}${h === nowHour ? ' now' : ''}`}
              style={{ height: `${Math.max(2, (v / max) * 100)}%` }}
              title={`${String(h).padStart(2, '0')}:00`}
            />
          ))}
        </div>
        <div className="tideAxis">
          <span>00</span><span>06</span><span>12</span><span>18</span><span>23</span>
        </div>
      </div>
    </div>
  );
}

export function nextTideLabel(ms: number | null): string {
  return ms === null ? 'no window scheduled' : `next tide ${clockAt(Date.now() + ms)}`;
}
