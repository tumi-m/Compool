import { ringDash } from '@/lib/motion';

/**
 * Progress toward the creator's goal, as a ring around their face. It draws
 * itself from empty to the real fraction on arrival and glides when a gift
 * moves it. The percentage is in the label; the ring is how it feels.
 */
export function GoalRing({ fraction, size = 122, stroke = 6, label }: {
  fraction: number;
  size?: number;
  stroke?: number;
  label: string;
}) {
  const r = (size - stroke) / 2;
  const { circumference, offset } = ringDash(fraction, r);
  return (
    <svg className="goalRing" width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={label}>
      <circle className="goalRingTrack" cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke} fill="none" />
      <circle
        className="goalRingFill"
        cx={size / 2}
        cy={size / 2}
        r={r}
        strokeWidth={stroke}
        fill="none"
        strokeLinecap="round"
        strokeDasharray={circumference}
        style={{ strokeDashoffset: offset, '--c': `${circumference}px` } as React.CSSProperties}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
    </svg>
  );
}
