'use client';

import { useRef, useState } from 'react';

/**
 * §14.8 state 5. A real hackathon produces three hundred runs in hour one, so
 * the list is windowed before the data exists rather than after someone reports
 * that the room got slow.
 *
 * Fixed row height, which is the honest trade: it keeps the maths to arithmetic
 * and the scrollbar accurate, and every row here is the same shape anyway.
 */
export function VirtualList<T>({
  items,
  rowHeight,
  height,
  overscan = 4,
  renderRow,
  emptyLabel = 'Nothing here yet.',
}: {
  items: T[];
  rowHeight: number;
  height: number;
  overscan?: number;
  renderRow: (item: T, index: number) => React.ReactNode;
  emptyLabel?: string;
}) {
  const [scrollTop, setScrollTop] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  if (items.length === 0) return <p className="hint">{emptyLabel}</p>;

  const total = items.length * rowHeight;
  const first = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
  const visible = Math.ceil(height / rowHeight) + overscan * 2;
  const slice = items.slice(first, first + visible);

  return (
    <div
      ref={ref}
      className="scroller"
      style={{ height, maxHeight: height }}
      onScroll={(e) => setScrollTop((e.target as HTMLDivElement).scrollTop)}
      // A windowed list is still a list to anyone not looking at it.
      role="feed"
      aria-label={`${items.length} items`}
    >
      <div style={{ height: total, position: 'relative' }}>
        <div style={{ position: 'absolute', top: first * rowHeight, left: 0, right: 0 }}>
          {slice.map((item, i) => (
            <div key={first + i} style={{ height: rowHeight, overflow: 'hidden' }}>
              {renderRow(item, first + i)}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
