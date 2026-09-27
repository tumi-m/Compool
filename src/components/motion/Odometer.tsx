'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * §14.6. Numbers change by odometer roll, not crossfade — the direction of travel
 * is information. A cost counter that ticks upward should *look* like it is going
 * up, and a headroom counter draining should look like it is going down.
 *
 * Each digit is its own strip of 0–9 translated into place, so only the digits
 * that actually changed move. Reduced motion collapses it to an instant swap.
 */
export function Odometer({
  value,
  decimals = 2,
  prefix = '',
  suffix = '',
  className = '',
  ariaLabel,
}: {
  value: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  className?: string;
  ariaLabel?: string;
}) {
  const text = value.toFixed(decimals);
  const prev = useRef(text);
  const [direction, setDirection] = useState<1 | -1>(1);

  useEffect(() => {
    if (text !== prev.current) {
      setDirection(Number(text) >= Number(prev.current) ? 1 : -1);
      prev.current = text;
    }
  }, [text]);

  return (
    <span className={`odometer ${className}`} aria-label={ariaLabel ?? `${prefix}${text}${suffix}`} role="text">
      {prefix ? <span aria-hidden="true">{prefix}</span> : null}
      {text.split('').map((ch, i) => (
        <Digit key={`${i}-${ch === '.' ? 'dot' : 'd'}`} ch={ch} direction={direction} />
      ))}
      {suffix ? <span aria-hidden="true" className="odoSuffix">{suffix}</span> : null}
    </span>
  );
}

function Digit({ ch, direction }: { ch: string; direction: 1 | -1 }) {
  if (!/\d/.test(ch)) return <span aria-hidden="true" className="odoSep">{ch}</span>;
  const n = Number(ch);
  return (
    <span className="odoDigit" aria-hidden="true" data-dir={direction}>
      <span className="odoStrip" style={{ transform: `translateY(${-n * 10}%)` }}>
        {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => (
          <span key={d}>{d}</span>
        ))}
      </span>
    </span>
  );
}
