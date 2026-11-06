'use client';

import { useLayoutEffect, useRef } from 'react';
import { flipOffsets } from '@/lib/motion';

/**
 * Reordering, shown as movement: when a list re-sorts, each item glides from
 * where it was to where it now is, so the eye can follow what moved and which
 * way. Mark items with `data-flip="<stable key>"` inside the returned ref.
 *
 * This is the one animation driven from script, so it checks reduced motion
 * itself — the stylesheet's reduced-motion rule cannot reach element.animate().
 */
export function useFlip<T extends HTMLElement>(order: string) {
  const ref = useRef<T>(null);
  const tops = useRef(new Map<string, number>());

  useLayoutEffect(() => {
    const root = ref.current;
    if (!root) return;
    const els = [...root.querySelectorAll<HTMLElement>('[data-flip]')];
    // Relative to the list, so scrolling the page between renders is not mistaken for a move.
    const origin = root.getBoundingClientRect().top;
    const now = new Map(els.map((el) => [el.dataset.flip!, el.getBoundingClientRect().top - origin]));
    const moves = flipOffsets(tops.current, now);
    tops.current = now;
    if (moves.size === 0 || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    for (const el of els) {
      const dy = moves.get(el.dataset.flip!);
      if (dy === undefined) continue;
      el.animate(
        [{ transform: `translateY(${dy}px)` }, { transform: 'none' }],
        { duration: 460, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' },
      );
    }
  }, [order]);

  return ref;
}
