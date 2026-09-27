'use client';

import { useState } from 'react';
import { Basin } from './Basin';
import type { CapacitySource, Headroom } from '@/lib/types';

const GROUP_ABOVE = 12;

/**
 * §14.8 state 5, for basins. Under a dozen sources they all show. Past that they
 * group by provider and collapse, because forty open basins is not a dashboard,
 * it is a wall — and a hackathon pool reaches forty within the hour.
 */
export function BasinGrid({
  sources,
  headroom,
  now,
  streaming,
  onRevoke,
}: {
  sources: CapacitySource[];
  headroom: Record<string, Headroom | null>;
  now: number;
  streaming: Set<string>;
  onRevoke: (id: string) => void;
}) {
  const [open, setOpen] = useState<Set<string>>(new Set());

  if (sources.length <= GROUP_ABOVE) {
    return (
      <div className="grid cols3 riseIn">
        {sources.map((s) => (
          <Basin key={s.id} source={s} headroom={headroom[s.id] ?? null} now={now} live={streaming.has(s.id)} onRevoke={onRevoke} />
        ))}
      </div>
    );
  }

  const groups = new Map<string, CapacitySource[]>();
  for (const s of sources) {
    const list = groups.get(s.provider) ?? [];
    list.push(s);
    groups.set(s.provider, list);
  }

  const toggle = (k: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });

  return (
    <div className="stackv" style={{ gap: 8 }}>
      {[...groups.entries()].map(([provider, list]) => {
        const isOpen = open.has(provider);
        const live = list.filter((s) => streaming.has(s.id)).length;
        return (
          <div key={provider} className="stackv" style={{ gap: 8 }}>
            <button type="button" className="groupBar" aria-expanded={isOpen} onClick={() => toggle(provider)}>
              <span className="groupCaret" aria-hidden="true">›</span>
              <strong style={{ textTransform: 'capitalize' }}>{provider}</strong>
              <span className="badge">{list.length} sources</span>
              {live > 0 ? <span className="badge water">{live} streaming</span> : null}
              <span className="hint" style={{ marginLeft: 'auto', margin: 0 }}>
                {isOpen ? 'collapse' : 'expand'}
              </span>
            </button>
            {isOpen ? (
              <div className="grid cols3 riseIn">
                {list.map((s) => (
                  <Basin key={s.id} source={s} headroom={headroom[s.id] ?? null} now={now} live={streaming.has(s.id)} onRevoke={onRevoke} />
                ))}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
