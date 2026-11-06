import { settleLayout, type FlowTransfer } from '@/lib/motion';
import { usd } from '@/lib/format';

/**
 * Settle up, drawn: who pays whom and how much. Each curve draws itself from
 * payer to payee, as thick as the amount, then sends one coin along it per
 * third of the largest transfer. It plays once when the numbers change — the
 * key is the amounts — and is still otherwise, because a debt sitting there is
 * not something happening.
 */
export function SettleFlow({ transfers, name }: { transfers: FlowTransfer[]; name: (id: string) => string }) {
  if (transfers.length === 0) return null;
  const l = settleLayout(transfers);
  const key = transfers.map((t) => `${t.from}>${t.to}:${t.amountUsd.toFixed(2)}`).join('|');
  return (
    <svg
      key={key}
      className="settleFlow"
      viewBox={`0 0 ${l.width} ${l.height}`}
      role="img"
      aria-label={transfers.map((t) => `${name(t.from)} pays ${name(t.to)} ${usd(t.amountUsd)}`).join('; ')}
    >
      {l.links.map((k, i) => (
        <g key={`${k.from}-${k.to}`} style={{ '--i': i } as React.CSSProperties}>
          <path className="settleLink" d={k.d} strokeWidth={k.stroke} pathLength={1} />
          {Array.from({ length: k.coins }, (_, c) => (
            <circle
              key={c}
              className="settleCoin"
              r={3.5}
              style={{ offsetPath: `path('${k.d}')`, '--c': c } as React.CSSProperties}
            />
          ))}
          <text className="settleAmount" x={k.label.x} y={k.label.y} textAnchor="middle">
            {usd(k.amountUsd)}
          </text>
        </g>
      ))}
      {l.payers.map((p) => (
        <g key={p.id} className="settleNode" data-side="pay">
          <circle cx={p.x} cy={p.y} r={14} />
          <text x={p.x} y={p.y + 4} textAnchor="middle" className="settleInitial">{name(p.id)[0]?.toUpperCase()}</text>
          <text x={p.x - 22} y={p.y + 4} textAnchor="end" className="settleName">{name(p.id)}</text>
        </g>
      ))}
      {l.payees.map((p) => (
        <g key={p.id} className="settleNode" data-side="get">
          <circle cx={p.x} cy={p.y} r={14} />
          <text x={p.x} y={p.y + 4} textAnchor="middle" className="settleInitial">{name(p.id)[0]?.toUpperCase()}</text>
          <text x={p.x + 22} y={p.y + 4} textAnchor="start" className="settleName">{name(p.id)}</text>
        </g>
      ))}
    </svg>
  );
}
