import { describe, expect, it } from 'vitest';
import {
  GiftError, assertGiftable, giftableSources, goalProgress, isExpired, newPledge, redeem,
  settlePledges, totals, type Pledge,
} from '@/lib/support/pledge';
import { describeTokens, tokensToUnits, unit, unitCostUsd, UNITS } from '@/lib/support/units';
import type { CapacitySource } from '@/lib/types';

const NOW = Date.parse('2026-09-28T12:00:00Z');

const src = (over: Partial<CapacitySource> = {}): CapacitySource => ({
  id: 'src_a', ownerUserId: 'user_supporter', provider: 'anthropic',
  credentialTypeId: 'anthropic.api_key', cls: 'A', label: 'key',
  storageLocation: 'vault', last4: null, nodeId: null, status: 'active',
  contributedToPool: null, priority: 100, monthlyCapUsd: null,
  createdAt: '2026-01-01T00:00:00Z', preview: true, ...over,
});

const pledge = (over: Partial<Pledge> = {}): Pledge =>
  newPledge({
    id: 'pl_1', creatorHandle: 'ada', kind: 'capacity', supporterName: 'Kwame',
    message: null, unitId: 'tide', count: 1, sourceId: 'src_a',
    supporterUserId: 'user_supporter', expiresAt: null,
    createdAt: '2026-09-28T10:00:00Z', ...over,
  });

describe('units', () => {
  it('names what the money buys, not how many tokens it is', () => {
    for (const u of UNITS) {
      expect(u.buys.length).toBeGreaterThan(0);
      expect(u.buys).not.toMatch(/token/i);
    }
  });

  it('prices from the same book the ledger uses', () => {
    const cup = unitCostUsd('cup', 'anthropic:workhorse');
    const tide = unitCostUsd('tide', 'anthropic:workhorse');
    expect(cup).toBeGreaterThan(0);
    // Five times the tokens costs five times as much, because the mix is fixed.
    expect(tide / cup).toBeCloseTo(unit('tide').tokens / unit('cup').tokens, 6);
  });

  it('prices output at the output rate rather than quoting everything as input', () => {
    const asAllInput = (50_000 / 1e6) * 3; // the anthropic:workhorse input rate
    expect(unitCostUsd('cup', 'anthropic:workhorse')).toBeGreaterThan(asAllInput);
  });

  it('costs nothing on owned compute', () => {
    expect(unitCostUsd('spring', 'ollama:local')).toBe(0);
  });

  it('breaks a total down the way a supporter would say it', () => {
    expect(tokensToUnits(1_300_000)).toEqual([
      { id: 'spring', count: 1 },
      { id: 'tide', count: 1 },
      { id: 'cup', count: 1 },
    ]);
    expect(describeTokens(500_000)).toBe('2 tides');
    expect(describeTokens(0)).toBe('less than a cup');
    expect(describeTokens(10_000)).toBe('less than a cup');
  });
});

describe('what may be gifted', () => {
  it('accepts a metered key the supporter owns', () => {
    expect(() => assertGiftable(src(), 'user_supporter')).not.toThrow();
  });

  it('accepts owned compute', () => {
    expect(() => assertGiftable(src({ cls: 'B', storageLocation: 'device' }), 'user_supporter')).not.toThrow();
  });

  it('never lets a personal seat be gifted', () => {
    try {
      assertGiftable(src({ cls: 'C', storageLocation: 'device' }), 'user_supporter');
      throw new Error('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(GiftError);
      expect((e as GiftError).code).toBe('CLASS_C_NEVER_GIFTED');
    }
  });

  it('refuses a source the supporter does not own', () => {
    expect(() => assertGiftable(src(), 'somebody_else')).toThrowError(/SOURCE_NOT_OWNED/);
  });

  it('refuses an exhausted or revoked source', () => {
    expect(() => assertGiftable(src({ status: 'exhausted' }), 'user_supporter')).toThrowError(/SOURCE_NOT_ACTIVE/);
    expect(() => assertGiftable(src({ status: 'revoked' }), 'user_supporter')).toThrowError(/SOURCE_NOT_ACTIVE/);
  });

  it('filters a list down to what is actually offerable', () => {
    const list = [
      src({ id: 'a' }),
      src({ id: 'seat', cls: 'C', storageLocation: 'device' }),
      src({ id: 'theirs', ownerUserId: 'other' }),
      src({ id: 'dead', status: 'exhausted' }),
    ];
    expect(giftableSources(list, 'user_supporter').map((s) => s.id)).toEqual(['a']);
  });
});

describe('totals and the wall', () => {
  it('counts tokens from the unit and the count', () => {
    expect(pledge({ unitId: 'tide', count: 3 }).tokens).toBe(750_000);
  });

  it('does not count a cash pledge until it is confirmed', () => {
    const p = [pledge({ id: 'p1', kind: 'cash', sourceId: null, supporterUserId: null })];
    expect(p[0].state).toBe('pending');
    expect(totals(p, NOW).pledgedTokens).toBe(0);
    expect(totals(p, NOW).pendingTokens).toBe(250_000);
  });

  it('counts a capacity pledge immediately, because the capacity is already there', () => {
    expect(pledge().state).toBe('active');
    expect(totals([pledge()], NOW).pledgedTokens).toBe(250_000);
  });

  it('counts each supporter once however many times they give', () => {
    const t = totals(
      [pledge({ id: 'a', supporterName: 'Kwame' }), pledge({ id: 'b', supporterName: ' kwame ' }), pledge({ id: 'c', supporterName: 'Ada' })],
      NOW,
    );
    expect(t.supporters).toBe(2);
  });

  it('stops counting a window that has closed', () => {
    const stale = pledge({ expiresAt: '2026-09-27T00:00:00Z' });
    expect(isExpired(stale, NOW)).toBe(true);
    expect(totals([stale], NOW).pledgedTokens).toBe(0);
    expect(settlePledges([stale], NOW)[0].state).toBe('expired');
  });

  it('never reports more redeemed than was pledged', () => {
    const over = { ...pledge(), redeemedTokens: 999_999_999 };
    expect(totals([over], NOW).redeemedTokens).toBe(250_000);
    expect(totals([over], NOW).remainingTokens).toBe(0);
  });
});

describe('goals', () => {
  it('reports progress toward the stated goal', () => {
    const g = goalProgress([pledge({ unitId: 'tide', count: 2 })], { label: 'a week of writing', tokens: 1_000_000 }, NOW);
    expect(g.fraction).toBeCloseTo(0.5, 6);
    expect(g.reached).toBe(false);
    expect(g.remaining).toBe(500_000);
  });

  it('caps the bar at full rather than overflowing past it', () => {
    const g = goalProgress([pledge({ unitId: 'spring', count: 5 })], { label: 'x', tokens: 1_000_000 }, NOW);
    expect(g.fraction).toBe(1);
    expect(g.reached).toBe(true);
    expect(g.remaining).toBe(0);
  });

  it('does not divide by zero when no goal is set', () => {
    expect(goalProgress([pledge()], null, NOW).fraction).toBe(0);
  });
});

describe('redeeming', () => {
  it('draws the oldest gift first, so nobody sits behind newer ones forever', () => {
    const old = pledge({ id: 'old', createdAt: '2026-09-01T00:00:00Z', unitId: 'cup', count: 1 });
    const recent = pledge({ id: 'new', createdAt: '2026-09-27T00:00:00Z', unitId: 'cup', count: 1 });
    const { pledges } = redeem([recent, old], 30_000, NOW);
    expect(pledges.find((p) => p.id === 'old')!.redeemedTokens).toBe(30_000);
    expect(pledges.find((p) => p.id === 'new')!.redeemedTokens).toBe(0);
  });

  it('spills into the next gift once the first is used up', () => {
    const a = pledge({ id: 'a', createdAt: '2026-09-01T00:00:00Z', unitId: 'cup', count: 1 });
    const b = pledge({ id: 'b', createdAt: '2026-09-02T00:00:00Z', unitId: 'cup', count: 1 });
    const { pledges, uncovered } = redeem([a, b], 70_000, NOW);
    expect(pledges.find((p) => p.id === 'a')!.redeemedTokens).toBe(50_000);
    expect(pledges.find((p) => p.id === 'b')!.redeemedTokens).toBe(20_000);
    expect(uncovered).toBe(0);
  });

  it('marks a gift spent once it is fully drawn', () => {
    const { pledges } = redeem([pledge({ unitId: 'cup', count: 1 })], 50_000, NOW);
    expect(pledges[0].state).toBe('spent');
  });

  it('reports what it could not cover rather than going negative', () => {
    const { pledges, uncovered } = redeem([pledge({ unitId: 'cup', count: 1 })], 90_000, NOW);
    expect(uncovered).toBe(40_000);
    expect(pledges[0].redeemedTokens).toBe(50_000);
  });

  it('will not draw against an expired window or an unconfirmed cash pledge', () => {
    const expired = pledge({ id: 'x', expiresAt: '2026-09-01T00:00:00Z' });
    const unpaid = pledge({ id: 'c', kind: 'cash', sourceId: null, supporterUserId: null });
    const { uncovered } = redeem([expired, unpaid], 10_000, NOW);
    expect(uncovered).toBe(10_000);
  });
});
