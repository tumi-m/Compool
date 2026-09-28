'use client';

/**
 * The request graph from the plan, drawn and animated by real run state.
 *
 * Every inference request walks the same seven stages. Three of them have side
 * effects and the rest are pure — the single most useful thing to know about this
 * system, and a diagram that animates it teaches that faster than the paragraph
 * does. Packets travel the edges while work is in flight; the stage a run is in
 * lights up; effect stages carry a ring.
 *
 * It is a liveness indicator, so it only moves while something is running. Idle,
 * it is a static diagram — and the motion is CSS, so the reduced-motion rule in
 * the stylesheet stops all of it without this component knowing.
 */

export const STAGES = [
  { id: 'admit', label: 'admit', sub: 'authn · quota · idempotency', effect: false },
  { id: 'resolve', label: 'resolve', sub: 'pool · budget · caps', effect: false },
  { id: 'select', label: 'select', sub: 'policy guard · scoring', effect: false },
  { id: 'reserve', label: 'reserve', sub: 'headroom · lock', effect: true },
  { id: 'execute', label: 'execute', sub: 'provider call · stream', effect: true },
  { id: 'meter', label: 'meter', sub: 'usage · price lookup', effect: false },
  { id: 'post', label: 'post', sub: 'ledger write · events', effect: true },
] as const;

export type StageId = (typeof STAGES)[number]['id'];

const W = 1060;
const H = 128;
const PAD = 66;
const GAP = (W - PAD * 2) / (STAGES.length - 1);
const Y = 50;
const x = (i: number) => PAD + i * GAP;

export function Flow({
  active,
  activeStage,
  failedStage = null,
}: {
  /** Runs in flight. Zero holds the diagram still. */
  active: number;
  activeStage: StageId | null;
  failedStage?: StageId | null;
}) {
  const idx = activeStage ? STAGES.findIndex((s) => s.id === activeStage) : -1;
  const failIdx = failedStage ? STAGES.findIndex((s) => s.id === failedStage) : -1;
  const live = active > 0;

  return (
    <div className="flowWrap">
      {/* Narrow screens: the same seven stages as a vertical stepper. A 1060px
          diagram scaled onto a phone is a diagram with nine-pixel labels. */}
      <ol className={`flowTall${live ? ' live' : ''}`} aria-label="Request pipeline">
        {STAGES.map((st, i) => {
          const state = i === failIdx ? 'failed' : i === idx ? 'now' : idx > i ? 'done' : 'todo';
          return (
            <li key={st.id} data-state={state} aria-current={state === 'now' ? 'step' : undefined}>
              <span className="flowTallDot" aria-hidden="true" />
              <span className="flowTallText">
                <span className="flowTallLabel">{st.label}</span>
                <span className="flowTallSub">{st.sub}</span>
              </span>
              {st.effect ? <span className="flowTallEffect">effect</span> : null}
            </li>
          );
        })}
      </ol>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className={`flow${live ? ' live' : ''}`}
        role="img"
        aria-label={
          activeStage
            ? `Request pipeline. ${active} run${active === 1 ? '' : 's'} in flight, currently at ${activeStage}.`
            : 'Request pipeline: admit, resolve, select, reserve, execute, meter, post. Idle.'
        }
      >
        {STAGES.slice(0, -1).map((s, i) => {
          const done = idx > i;
          return (
            <g key={`edge-${s.id}`}>
              <line
                x1={x(i) + 9}
                y1={Y}
                x2={x(i + 1) - 9}
                y2={Y}
                stroke={done ? 'var(--water)' : 'var(--line)'}
                strokeWidth={done ? 2 : 1}
              />
              {live && idx >= i ? (
                <circle
                  cx={x(i) + 9}
                  cy={Y}
                  r={3}
                  fill="var(--water)"
                  className="flowPacket"
                  style={
                    {
                      '--travel': `${GAP - 18}px`,
                      animationDelay: `${i * 0.14}s`,
                    } as React.CSSProperties
                  }
                />
              ) : null}
            </g>
          );
        })}

        {STAGES.map((s, i) => {
          const isNow = i === idx;
          const done = idx > i;
          const failed = i === failIdx;
          const colour = failed ? 'var(--coral)' : isNow ? 'var(--water)' : done ? 'var(--done)' : 'var(--ink-2)';
          // Dots are graphics (3:1); labels are text (4.5:1) and take the ink
          // variant of the same hue.
          const ink = failed ? 'var(--coral-ink)' : isNow ? 'var(--link)' : done ? 'var(--done)' : 'var(--ink-2)';
          return (
            <g key={s.id}>
              {s.effect ? (
                <circle cx={x(i)} cy={Y} r={12} fill="none" stroke={colour} strokeWidth={1} opacity={0.4} />
              ) : null}
              {isNow && live ? (
                <circle cx={x(i)} cy={Y} r={9} fill="var(--water)" className="flowHalo" />
              ) : null}
              <circle
                cx={x(i)}
                cy={Y}
                r={isNow ? 7 : 5}
                fill={done || isNow || failed ? colour : 'var(--panel)'}
                stroke={colour}
                strokeWidth={1.5}
              />
              <text x={x(i)} y={Y - 22} textAnchor="middle" className="flowLabel" fill={ink}>
                {s.label}
              </text>
              <text x={x(i)} y={Y + 28} textAnchor="middle" className="flowSub">
                {s.sub}
              </text>
              {s.effect ? (
                <text x={x(i)} y={Y + 42} textAnchor="middle" className="flowEffect">
                  effect
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>
      <div className="flowFoot small">
        <span className="muted">
          <strong>resolve</strong>, <strong>select</strong> and <strong>meter</strong> are pure — same inputs,
          same outputs, no I/O. That is what makes the two hardest parts of this system testable in milliseconds.
        </span>
        <span className={`badge${live ? ' water' : ''}`}>{live ? `${active} in flight` : 'idle'}</span>
      </div>
    </div>
  );
}
