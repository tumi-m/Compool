'use client';

import { layers, type Task } from '@/lib/room/graph';

/**
 * The task graph, drawn from its own layering. A task sits one layer below its
 * deepest dependency, so everything in a column is genuinely concurrent — the
 * drawing and the execution plan are the same object.
 *
 * Edges march while the dependency they carry is actually running. A satisfied
 * edge is solid; an unsatisfied one is dashed and still.
 */

const COL = 176;
const ROW = 58;
const PAD = 14;
const NODE_W = 138;
const NODE_H = 42;

const STATE_COLOUR: Record<Task['state'], string> = {
  blocked: 'var(--ink-2)',
  ready: 'var(--water)',
  claimed: 'var(--chip)',
  running: 'var(--water)',
  done: 'var(--done)',
  failed: 'var(--coral)',
};

export function TaskGraph({
  tasks,
  onClaim,
  me,
}: {
  tasks: Task[];
  onClaim?: (id: string) => void;
  me: string;
}) {
  const cols = layers(tasks);
  const rows = Math.max(1, ...cols.map((c) => c.length));
  const width = PAD * 2 + Math.max(1, cols.length) * COL;
  const height = PAD * 2 + rows * ROW;

  const pos = new Map<string, { x: number; y: number }>();
  cols.forEach((col, ci) => {
    col.forEach((t, ri) => {
      pos.set(t.id, { x: PAD + ci * COL, y: PAD + ri * ROW });
    });
  });

  return (
    <div className="tableWrap">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width={width}
        height={height}
        className="graph"
        role="img"
        aria-label={`Task graph: ${tasks.length} tasks in ${cols.length} dependency layers.`}
      >
        {tasks.flatMap((t) =>
          t.blockedBy
            .filter((d) => pos.has(d))
            .map((d) => {
              const from = pos.get(d)!;
              const to = pos.get(t.id)!;
              const dep = tasks.find((x) => x.id === d)!;
              const x1 = from.x + NODE_W;
              const y1 = from.y + NODE_H / 2;
              const x2 = to.x;
              const y2 = to.y + NODE_H / 2;
              const mid = (x1 + x2) / 2;
              return (
                <path
                  key={`${d}->${t.id}`}
                  d={`M${x1} ${y1} C${mid} ${y1} ${mid} ${y2} ${x2} ${y2}`}
                  className="graphEdge"
                  data-satisfied={dep.state === 'done'}
                  data-flowing={dep.state === 'running'}
                />
              );
            }),
        )}

        {tasks.map((t) => {
          const p = pos.get(t.id);
          if (!p) return null;
          const colour = STATE_COLOUR[t.state];
          const mine = t.claimedBy === me;
          return (
            <g
              key={t.id}
              className="graphNode"
              transform={`translate(${p.x} ${p.y})`}
              onClick={() => onClaim?.(t.id)}
              role={onClaim ? 'button' : undefined}
              tabIndex={onClaim ? 0 : undefined}
              onKeyDown={(e) => {
                if (onClaim && (e.key === 'Enter' || e.key === ' ')) {
                  e.preventDefault();
                  onClaim(t.id);
                }
              }}
              aria-label={`${t.title} — ${t.state}${t.claimedBy ? `, claimed by ${t.claimedBy}` : ''}`}
            >
              {t.state === 'running' ? (
                <rect x={-3} y={-3} width={NODE_W + 6} height={NODE_H + 6} rx={6} fill={colour} opacity={0.18} className="graphPulse" />
              ) : null}
              <rect
                width={NODE_W}
                height={NODE_H}
                rx={4}
                fill="var(--panel)"
                stroke={colour}
                strokeWidth={t.state === 'blocked' ? 1 : 1.5}
                strokeDasharray={t.state === 'blocked' ? '3 3' : undefined}
              />
              <rect width={3} height={NODE_H} rx={1.5} fill={colour} />
              <text x={11} y={17} fill="var(--ink-0)" style={{ fontWeight: 500 }}>
                {t.title.length > 21 ? `${t.title.slice(0, 20)}…` : t.title}
              </text>
              <text x={11} y={31} fill="var(--ink-2)" style={{ fontSize: 9.5 }}>
                {t.state}
                {t.claimedBy ? ` · ${mine ? 'you' : t.claimedBy.replace('user_', '')}` : ''}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
