import { describe, expect, it } from 'vitest';
import { drainTiming, flipOffsets, ringDash, settleLayout, steamLevel } from '@/lib/motion';

describe('drain timing', () => {
  it('starts the bar part-way through, so it is right on first paint', () => {
    const t = drainTiming(0, 600_000, 150_000);
    expect(t.durationS).toBe(600);
    expect(t.delayS).toBe(-150);
    expect(t.left).toBeCloseTo(0.75);
  });

  it('waits full before the window opens, and is empty after it closes', () => {
    expect(drainTiming(1000, 2000, 0).left).toBe(1);
    expect(drainTiming(1000, 2000, 0).delayS).toBe(1);
    expect(drainTiming(1000, 2000, 9000).left).toBe(0);
    expect(drainTiming(1000, 2000, 9000).delayS).toBe(-1);
  });

  it('does not divide by zero on an empty or backwards window', () => {
    expect(drainTiming(5, 5, 5)).toMatchObject({ durationS: 0, left: 0 });
    expect(drainTiming(9, 3, 5)).toMatchObject({ durationS: 0, left: 0 });
  });
});

describe('flip offsets', () => {
  it('pushes moved elements back to where they were', () => {
    const before = new Map([['a', 0], ['b', 40], ['c', 80]]);
    const after = new Map([['a', 40], ['b', 0], ['c', 80]]);
    expect([...flipOffsets(before, after)]).toEqual([['a', -40], ['b', 40]]);
  });

  it('leaves new arrivals and sub-pixel jitter alone', () => {
    const out = flipOffsets(new Map([['a', 0]]), new Map([['a', 0.5], ['new', 10]]));
    expect(out.size).toBe(0);
  });
});

describe('ring dash', () => {
  it('leaves exactly the fraction drawn', () => {
    const { circumference, offset } = ringDash(0.25, 10);
    expect(circumference).toBeCloseTo(2 * Math.PI * 10);
    expect(offset).toBeCloseTo(circumference * 0.75);
  });

  it('clamps rather than drawing past full or before empty', () => {
    expect(ringDash(3, 10).offset).toBe(0);
    expect(ringDash(-1, 10).offset).toBeCloseTo(ringDash(0, 10).circumference);
    expect(ringDash(Number.NaN, 10).offset).toBeCloseTo(ringDash(0, 10).circumference);
  });
});

describe('steam', () => {
  it('rises with the count', () => {
    expect([1, 2, 3, 4, 5, 50].map(steamLevel)).toEqual([1, 2, 2, 2, 3, 3]);
  });
});

describe('settle-up layout', () => {
  const transfers = [
    { from: 'kwame', to: 'ada', amountUsd: 9 },
    { from: 'lin', to: 'ada', amountUsd: 3 },
    { from: 'lin', to: 'me', amountUsd: 1 },
  ];

  it('puts payers on the left and payees on the right, once each', () => {
    const l = settleLayout(transfers, 500);
    expect(l.payers.map((p) => p.id)).toEqual(['kwame', 'lin']);
    expect(l.payees.map((p) => p.id)).toEqual(['ada', 'me']);
    expect(Math.max(...l.payers.map((p) => p.x))).toBeLessThan(Math.min(...l.payees.map((p) => p.x)));
  });

  it('draws one link per transfer, thicker for more money, with more coins', () => {
    const l = settleLayout(transfers, 500);
    expect(l.links).toHaveLength(3);
    const [big, mid, small] = l.links;
    expect(big.stroke).toBeGreaterThan(mid.stroke);
    expect(mid.stroke).toBeGreaterThan(small.stroke);
    expect([big.coins, mid.coins, small.coins]).toEqual([3, 2, 1]);
  });

  it('sits each amount above its own curve, between the two ends', () => {
    const l = settleLayout(transfers, 500);
    for (const k of l.links) {
      const a = l.payers.find((p) => p.id === k.from)!;
      const b = l.payees.find((p) => p.id === k.to)!;
      expect(k.label.x).toBeGreaterThan(a.x);
      expect(k.label.x).toBeLessThan(b.x);
      expect(k.label.y).toBeLessThan(Math.max(a.y, b.y));
    }
  });

  it('keeps every node inside the drawing', () => {
    const l = settleLayout(transfers, 500);
    for (const n of [...l.payers, ...l.payees]) {
      expect(n.y).toBeGreaterThan(0);
      expect(n.y).toBeLessThan(l.height);
    }
  });

  it('draws nothing, without failing, when everyone is square', () => {
    expect(settleLayout([]).links).toEqual([]);
  });
});
