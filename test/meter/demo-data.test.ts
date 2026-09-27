import { describe, expect, it } from 'vitest';
import { seedSaturated, seedWorkspace } from '@/lib/demo/seed';
import { findImbalances, positions } from '@/lib/meter/ledger';

describe('the shipped demo data', () => {
  it('never ships an unbalanced ledger', () => {
    expect(findImbalances(seedSaturated(Date.parse('2026-09-27T12:00:00Z')).ledger)).toEqual([]);
    expect(findImbalances(seedWorkspace(Date.parse('2026-09-27T12:00:00Z')).ledger)).toEqual([]);
  });

  it('writes exactly two entries per usage event', () => {
    const w = seedSaturated(Date.parse('2026-09-27T12:00:00Z'));
    expect(w.ledger).toHaveLength(w.usage.length * 2);
  });

  it('nets to zero across every member of the pool', () => {
    const w = seedSaturated(Date.parse('2026-09-27T12:00:00Z'));
    const total = positions(w.ledger, w.users.map((u) => u.id)).reduce((a, p) => a + p.netUsd, 0);
    expect(Math.abs(total)).toBeLessThan(1e-6);
  });

  it('never contributes a personal seat to a pool', () => {
    for (const seed of [seedWorkspace(), seedSaturated()]) {
      for (const s of seed.sources) {
        if (s.cls !== 'C') continue;
        expect(s.contributedToPool).toBeNull();
        expect(s.storageLocation).toBe('device');
      }
    }
  });

  it('is saturated enough to exercise grouping and windowing', () => {
    const w = seedSaturated();
    expect(w.sources.length).toBeGreaterThan(12);
    expect(w.runs.length).toBeGreaterThanOrEqual(300);
    expect(w.users.length).toBeGreaterThan(10);
  });
});
