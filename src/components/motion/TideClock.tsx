'use client';

import { duration } from '@/lib/format';

/**
 * A 24-hour dial with the preload window shaded and a hand at the current local
 * hour. The arc fills as the window approaches and turns over when it opens.
 *
 * A countdown in words tells you how long; a dial tells you *where in the day* —
 * and since the whole feature is an argument about when the quiet hours are, the
 * dial is the part that makes the argument.
 */

const R = 46;
const C = 2 * Math.PI * R;
const SIZE = 116;
const MID = SIZE / 2;

const angle = (hour: number) => (hour / 24) * 360 - 90;
const point = (hour: number, radius: number) => {
  const a = (angle(hour) * Math.PI) / 180;
  return [MID + Math.cos(a) * radius, MID + Math.sin(a) * radius] as const;
};

export function TideClock({
  anchorHour,
  windowHours,
  localHour,
  localMinute,
  msUntil,
  open,
}: {
  anchorHour: number;
  windowHours: number;
  localHour: number;
  localMinute: number;
  msUntil: number | null;
  open: boolean;
}) {
  const nowHour = localHour + localMinute / 60;
  const windowFraction = windowHours / 24;

  // The arc is the gap you are actually waiting through: it starts at the hand
  // and runs clockwise to the moment the window opens. Reading it takes no
  // arithmetic — you can see how much of the day is between here and there.
  const waitHours = open ? windowHours : msUntil === null ? 0 : msUntil / 3_600_000;
  const arcFraction = Math.max(0, Math.min(1, waitHours / 24));
  const arcStartHour = open ? anchorHour : nowHour;

  const [hx, hy] = point(nowHour, R - 10);

  return (
    <div className="row" style={{ gap: 14, alignItems: 'center' }}>
      <svg
        width={SIZE}
        height={SIZE}
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        className="tideClock"
        role="img"
        aria-label={
          open
            ? `The preload window is open now. It runs from ${String(anchorHour).padStart(2, '0')}:00 for ${windowHours} hours.`
            : `The preload window opens at ${String(anchorHour).padStart(2, '0')}:00 local, ${duration(msUntil)} from now.`
        }
      >
        <circle cx={MID} cy={MID} r={R} className="tideClockTrack" strokeWidth={7} />

        {/* the window itself, drawn as an arc segment of the dial */}
        <circle
          cx={MID}
          cy={MID}
          r={R}
          stroke="var(--foam)"
          strokeWidth={7}
          fill="none"
          strokeDasharray={`${C * windowFraction} ${C}`}
          strokeDashoffset={-C * (anchorHour / 24)}
          transform={`rotate(-90 ${MID} ${MID})`}
        />

        {/* the wait itself: from the hand, clockwise, to the window opening */}
        <circle
          cx={MID}
          cy={MID}
          r={R}
          className="tideClockArc"
          data-open={String(open)}
          strokeWidth={open ? 7 : 4}
          strokeDasharray={`${C * (open ? windowFraction : arcFraction)} ${C}`}
          strokeDashoffset={-C * (arcStartHour / 24)}
          transform={`rotate(-90 ${MID} ${MID})`}
        />

        {/* hour pips, with the window's own hours marked */}
        {Array.from({ length: 24 }, (_, h) => {
          const [px, py] = point(h, R - 13);
          const inWindow = (h - anchorHour + 24) % 24 < windowHours;
          return (
            <circle key={h} cx={px} cy={py} r={h % 6 === 0 ? 1.6 : 1} className="tideClockPip" data-in={String(inWindow)} />
          );
        })}

        <line x1={MID} y1={MID} x2={hx} y2={hy} className="tideClockHand" />
        <circle cx={MID} cy={MID} r={2.5} fill="var(--ink-1)" />

        <text x={MID} y={MID + 26} textAnchor="middle" className="num" style={{ fontSize: 10, fill: 'var(--ink-2)' }}>
          {String(localHour).padStart(2, '0')}:{String(localMinute).padStart(2, '0')}
        </text>
      </svg>

      <div>
        <div className="sectionLabel">{open ? 'Window is open' : 'Window opens'}</div>
        <div className="num" style={{ fontSize: 25, lineHeight: 1.1 }}>
          {String(anchorHour).padStart(2, '0')}:00
        </div>
        <div className="hint" style={{ marginTop: 2 }}>
          {open ? `${windowHours}h window, running now` : `${duration(msUntil)} from now · ${windowHours}h long`}
        </div>
      </div>
    </div>
  );
}
