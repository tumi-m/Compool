/**
 * A sequence that plays as you read it: a marker travels the steps and each
 * lights as it is reached. Driven by the scroll position (a CSS view timeline),
 * not a clock, so it moves only while the reader does, and it runs backwards
 * when they scroll back up. Where the browser has no scroll timelines, or
 * motion is reduced, every step is simply drawn lit. No script ships for it.
 */
export function ScrollSteps({ steps, label }: { steps: { name: string; note: string }[]; label: string }) {
  // Drawn at a fixed size (the figure caps its width) with room for a note of
  // about twenty characters under each step without touching its neighbours.
  const w = 760;
  const pad = 70;
  const span = w - pad * 2;
  const gap = span / Math.max(1, steps.length - 1);
  return (
    <figure className="scrollSteps">
      <svg viewBox={`0 0 ${w} 96`} role="img" aria-label={label}>
        <line className="stepsTrack" x1={pad} y1={34} x2={w - pad} y2={34} />
        <line className="stepsDone" x1={pad} y1={34} x2={w - pad} y2={34} pathLength={1} />
        {steps.map((s, i) => (
          <g
            key={s.name}
            className="stepsStage"
            // Where along the read this step is reached: 20% to 65% of the
            // figure's pass through the viewport, in equal shares.
            style={{ '--at': `${20 + (45 * i) / Math.max(1, steps.length - 1)}%` } as React.CSSProperties}
          >
            <circle cx={pad + i * gap} cy={34} r={9} />
            <text x={pad + i * gap} y={64} textAnchor="middle" className="stepsName">{s.name}</text>
            <text x={pad + i * gap} y={80} textAnchor="middle" className="stepsNote">{s.note}</text>
          </g>
        ))}
        <circle className="stepsMarker" cx={pad} cy={34} r={5} style={{ '--travel': `${span}px` } as React.CSSProperties} />
      </svg>
    </figure>
  );
}
