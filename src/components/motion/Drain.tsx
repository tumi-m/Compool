'use client';

import { useState } from 'react';
import { drainTiming } from '@/lib/motion';

/**
 * Time running out, as a bar: a code expiring, a window coming up. One CSS
 * animation across the whole window, entered part-way with a negative delay —
 * right on first paint, and no timer keeps it right. Under reduced motion the
 * animation is off and the bar is drawn at its current value instead,
 * re-rendered as `now` moves.
 *
 * Presentation only: whatever this shows is also said in words beside it.
 */
export function Drain({
  from,
  to,
  now,
  tone = 'water',
  className = '',
}: {
  from: number;
  to: number;
  now: number;
  tone?: 'water' | 'shallow' | 'coral';
  className?: string;
}) {
  return (
    <span className={`drain ${className}`} data-tone={tone} aria-hidden="true">
      {/* A new window restarts the bar; a new `now` must not. */}
      <DrainFill key={`${from}-${to}`} from={from} to={to} now={now} />
    </span>
  );
}

function DrainFill({ from, to, now }: { from: number; to: number; now: number }) {
  // The animation's clock starts when it mounts, so its delay is fixed then.
  // Recomputing it on every tick would count the elapsed time twice and run
  // the bar at double speed.
  const [timing] = useState(() => drainTiming(from, to, now));
  return (
    <span
      className="drainFill"
      style={
        {
          '--left': drainTiming(from, to, now).left,
          animationDuration: `${timing.durationS}s`,
          animationDelay: `${timing.delayS}s`,
        } as React.CSSProperties
      }
    />
  );
}
