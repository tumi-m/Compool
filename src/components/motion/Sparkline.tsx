'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * A line that draws itself once, then only animates when the data it shows
 * changes. The draw-on is not decoration: it is how you tell a series that just
 * arrived from one that has been sitting there.
 */
export function Sparkline({
  points,
  width = 120,
  height = 30,
  stroke = 'var(--water)',
  fill = true,
  label,
}: {
  points: number[];
  width?: number;
  height?: number;
  stroke?: string;
  fill?: boolean;
  label?: string;
}) {
  const ref = useRef<SVGPathElement>(null);
  const [len, setLen] = useState(0);

  useEffect(() => {
    if (ref.current) setLen(ref.current.getTotalLength());
  }, [points]);

  if (points.length < 2) {
    return <svg width={width} height={height} aria-hidden="true" />;
  }

  const max = Math.max(...points, 1);
  const min = Math.min(...points, 0);
  const span = max - min || 1;
  const step = width / (points.length - 1);
  const xy = points.map((p, i) => [i * step, height - ((p - min) / span) * (height - 2) - 1] as const);
  const d = xy.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  const area = `${d} L${width} ${height} L0 ${height} Z`;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="sparkline"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : 'true'}
      preserveAspectRatio="none"
    >
      {fill ? <path d={area} fill={stroke} opacity={0.12} /> : null}
      <path
        ref={ref}
        d={d}
        fill="none"
        stroke={stroke}
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
        style={len ? { strokeDasharray: len, strokeDashoffset: 0 } : undefined}
        className="sparkPath"
      />
      <circle cx={xy[xy.length - 1][0]} cy={xy[xy.length - 1][1]} r={2} fill={stroke} className="sparkHead" />
    </svg>
  );
}
