import { describe, expect, it } from 'vitest';
import {
  GiftError, MAX_COUNT, MAX_REPLY, assertGiftable, clampCount, giftableSources, goalProgress, isExpired,
  newPledge, redeem, settlePledges, totals, wallEntries, type Pledge,
} from '@/lib/support/pledge';
import { describeTokens, tokensToUnits, unit, unitCostUsd, unitPhrase, UNITS } from '@/lib/support/units';
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

describe('the public wall', () => {
  const cash = (over: Partial<Pledge> = {}) =>
    pledge({ kind: 'cash', sourceId: null, supporterUserId: null, state: 'active', ...over });

  it('never carries the text of a private note', () => {
    const [e] = wallEntries([cash({ message: 'my address is 4 Elm St', privateMessage: true })]);
    expect(e.message).toBeNull();
    expect(e.sentPrivately).toBe(true);
    expect(JSON.stringify(e)).not.toContain('Elm');
  });

  it('does not claim a private note was sent when there was none', () => {
    const [e] = wallEntries([cash({ message: null, privateMessage: true })]);
    expect(e.sentPrivately).toBe(false);
  });

  it('keeps unconfirmed and declined pledges off it', () => {
    const shown = wallEntries([
      cash({ id: 'a', state: 'pending' }),
      cash({ id: 'b', state: 'declined' }),
      cash({ id: 'c', state: 'active' }),
    ]);
    expect(shown.map((e) => e.id)).toEqual(['c']);
  });

  it('says bought for money and lent for capacity', () => {
    expect(wallEntries([cash()])[0].verb).toBe('bought');
    expect(wallEntries([pledge()])[0].verb).toBe('lent');
  });

  it('shows the newest first, with the creator’s thanks trimmed and capped', () => {
    const shown = wallEntries([
      cash({ id: 'old', createdAt: '2026-09-01T00:00:00Z', reply: `  ${'x'.repeat(400)}  ` }),
      cash({ id: 'new', createdAt: '2026-09-20T00:00:00Z', reply: '   ' }),
    ]);
    expect(shown.map((e) => e.id)).toEqual(['new', 'old']);
    expect(shown[0].reply).toBeNull();
    expect(shown[1].reply).toHaveLength(MAX_REPLY);
  });

  it('loads a pledge saved before monthly and private notes existed', () => {
    const legacy = { ...cash({ message: 'hi' }) } as Partial<Pledge>;
    delete legacy.monthly;
    delete legacy.privateMessage;
    delete legacy.reply;
    const [e] = wallEntries([legacy as Pledge]);
    expect(e).toMatchObject({ message: 'hi', monthly: false, sentPrivately: false, reply: null });
  });
});

describe('monthly supporters', () => {
  it('counts confirmed monthly pledges, once per supporter', () => {
    const t = totals(
      [
        pledge({ id: 'a', supporterName: 'Ada', monthly: true }),
        pledge({ id: 'b', supporterName: 'ada ', monthly: true }),
        pledge({ id: 'c', supporterName: 'Kwame' }),
        pledge({ id: 'd', supporterName: 'Lin', monthly: true, kind: 'cash', sourceId: null }),
      ],
      NOW,
    );
    expect(t.monthlySupporters).toBe(1);
    expect(t.monthlyTokens).toBe(2 * unit('tide').tokens);
  });
});

describe('how many', () => {
  it('clamps a custom count to something a person meant', () => {
    expect(clampCount(0)).toBe(1);
    expect(clampCount(-4)).toBe(1);
    expect(clampCount(2.7)).toBe(2);
    expect(clampCount(Number.NaN)).toBe(1);
    expect(clampCount(10_000)).toBe(MAX_COUNT);
    expect(pledge({ count: 10_000 }).tokens).toBe(MAX_COUNT * unit('tide').tokens);
    expect(pledge({ count: 10_000 }).count).toBe(MAX_COUNT);
  });

  it('says a unit the way a person would', () => {
    expect(unitPhrase('tide', 1)).toBe('a tide');
    expect(unitPhrase('tide', 3)).toBe('3 tides');
    expect(unitPhrase('spring', 1)).toBe('a spring tide');
    expect(unitPhrase('cup', 5)).toBe('5 cups');
  });
});
