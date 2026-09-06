import { describe, expect, it } from 'vitest';
import { register } from '@/lib/policy/register';
import {
  PRELOAD_DEFAULTS,
  alreadyRanThisWindow,
  estimatedCostUsd,
  evaluate,
  findTrough,
  isWindowOpen,
  localParts,
  msUntilWindow,
  plan,
  type PreloadContext,
  type PreloadItem,
} from '@/lib/preload/schedule';
import type { Candidate, CapacitySource, Headroom, NodeRecord } from '@/lib/types';

const item = (over: Partial<PreloadItem> = {}): PreloadItem => ({
  id: 'pl_1', title: 'digest', prompt: 'summarise', kind: 'digest', model: '*',
  estimatedTokens: 100_000, maxCostUsd: null, repeat: 'daily', tz: 'UTC',
  anchorHour: PRELOAD_DEFAULTS.anchorHour, windowHours: PRELOAD_DEFAULTS.windowHours,
  requireHeadroomFraction: PRELOAD_DEFAULTS.requireHeadroomFraction,
  enabled: true, state: 'queued', lastRunAt: null, lastSkipReason: null, lastCostUsd: null,
  createdAt: '2026-09-01T00:00:00Z', ...over,
});

const at = (s: string) => Date.parse(s);

const hr = (frac: number, now: number): Headroom => ({
  tokens: 1_000_000 * frac, limitTokens: 1_000_000,
  resetAt: new Date(now + 3_600_000).toISOString(),
  observedAt: new Date(now).toISOString(),
  requestsRemaining: 100, consecutive429: 0, coolingUntil: null,
});

const src = (over: Partial<CapacitySource> = {}): CapacitySource => ({
  id: 'src_a', ownerUserId: 'me', provider: 'anthropic', credentialTypeId: 'anthropic.api_key',
  cls: 'A', label: 'key', storageLocation: 'vault', last4: null, nodeId: null, status: 'active',
  contributedToPool: null, priority: 100, monthlyCapUsd: null, createdAt: '2026-01-01T00:00:00Z',
  preview: true, ...over,
});

const ctx = (now: number, over: Partial<PreloadContext> = {}): PreloadContext => ({
  now, policies: register, ownerUserId: 'me', poolId: null, budgetRemainingUsd: null,
  nodes: [],
  candidates: [{ source: src(), headroom: hr(0.9, now), estCostUsd: 0.1, observedLatencyMs: 500, recentErrorRate: 0 }],
  ...over,
});

describe('the 3am window', () => {
  it('is open at 3am local and shut at midday', () => {
    expect(isWindowOpen(item(), at('2026-09-06T03:30:00Z'))).toBe(true);
    expect(isWindowOpen(item(), at('2026-09-06T12:00:00Z'))).toBe(false);
  });

  it('opens at the anchor and closes exactly windowHours later', () => {
    expect(isWindowOpen(item(), at('2026-09-06T02:59:00Z'))).toBe(false);
    expect(isWindowOpen(item(), at('2026-09-06T03:00:00Z'))).toBe(true);
    expect(isWindowOpen(item(), at('2026-09-06T05:59:00Z'))).toBe(true);
    expect(isWindowOpen(item(), at('2026-09-06T06:00:00Z'))).toBe(false);
  });

  it('means 3am where the person is, not 3am UTC', () => {
    // 03:30 in Johannesburg (UTC+2) is 01:30 UTC.
    const jhb = item({ tz: 'Africa/Johannesburg' });
    expect(isWindowOpen(jhb, at('2026-09-06T01:30:00Z'))).toBe(true);
    expect(isWindowOpen(jhb, at('2026-09-06T08:00:00Z'))).toBe(false); // 10:00 there
    // ...and a Lisbon queue is open at 03:30 UTC+1 instead.
    const lis = item({ tz: 'Europe/Lisbon' });
    expect(isWindowOpen(lis, at('2026-09-06T02:30:00Z'))).toBe(true);
  });

  it('wraps a window that crosses midnight', () => {
    const late = item({ anchorHour: 23, windowHours: 3 });
    expect(isWindowOpen(late, at('2026-09-06T23:30:00Z'))).toBe(true);
    expect(isWindowOpen(late, at('2026-09-07T01:30:00Z'))).toBe(true);
    expect(isWindowOpen(late, at('2026-09-06T03:00:00Z'))).toBe(false);
  });

  it('skips the weekend for a weekdays item', () => {
    // 2026-09-05 is a Saturday, 2026-09-07 a Monday.
    const wd = item({ repeat: 'weekdays' });
    expect(isWindowOpen(wd, at('2026-09-05T03:30:00Z'))).toBe(false);
    expect(isWindowOpen(wd, at('2026-09-07T03:30:00Z'))).toBe(true);
  });

  it('counts down to the next opening, to the minute', () => {
    const ms = msUntilWindow(item(), at('2026-09-06T00:00:00Z'));
    expect(Math.round(ms / 60_000)).toBe(180);
    expect(msUntilWindow(item(), at('2026-09-06T03:30:00Z'))).toBe(0);
  });

  it('skips the weekend when counting down too', () => {
    const wd = item({ repeat: 'weekdays' });
    const friAfter = at('2026-09-04T07:00:00Z'); // Friday, window already shut
    const ms = msUntilWindow(wd, friAfter);
    expect(localParts(friAfter + ms, 'UTC').weekday).toBe(1); // Monday
  });

  it('will not run twice in the same local day', () => {
    const ran = item({ lastRunAt: '2026-09-06T03:10:00Z' });
    expect(alreadyRanThisWindow(ran, at('2026-09-06T04:00:00Z'))).toBe(true);
    expect(alreadyRanThisWindow(ran, at('2026-09-07T03:10:00Z'))).toBe(false);
  });
});

describe('the trough finder', () => {
  it('finds the quietest stretch rather than assuming 3am', () => {
    const hourly = Array.from({ length: 24 }, (_, h) => (h >= 13 && h < 16 ? 1 : 100));
    expect(findTrough(hourly, 3).startHour).toBe(13);
  });

  it('wraps past midnight when the quiet does', () => {
    const hourly = Array.from({ length: 24 }, (_, h) => (h === 23 || h === 0 || h === 1 ? 1 : 100));
    expect(findTrough(hourly, 3).startHour).toBe(23);
  });

  it('lands on the small hours for a day shaped like a person', () => {
    const shape = [4, 2, 1, 0, 0, 1, 6, 22, 61, 88, 96, 74, 52, 70, 85, 91, 78, 64, 47, 58, 72, 66, 41, 17];
    expect(findTrough(shape, 3).startHour).toBe(2);
  });
});

describe('cost estimation by kind', () => {
  it('prices a cache warm off the cache-write rate, well under bulk generation', () => {
    const warm = estimatedCostUsd(item({ kind: 'warm_cache' }), 'anthropic:workhorse');
    const bulk = estimatedCostUsd(item({ kind: 'bulk' }), 'anthropic:workhorse');
    expect(warm).toBeGreaterThan(0);
    expect(warm).toBeLessThan(bulk);
  });
});

describe('the dispatch decision', () => {
  const night = at('2026-09-06T03:30:00Z');

  it('dispatches a due item against a full basin', () => {
    const d = evaluate(item(), ctx(night));
    expect(d.dispatch).toBe(true);
    expect(d.sourceId).toBe('src_a');
  });

  it('holds outside the window and says how long is left', () => {
    const d = evaluate(item(), ctx(at('2026-09-06T12:00:00Z')));
    expect(d.dispatch).toBe(false);
    expect(d.hold).toBe('window_closed');
    expect(d.msUntilWindow).toBeGreaterThan(0);
  });

  it('will not spend a basin that has not come back in', () => {
    const c = ctx(night, {
      candidates: [{ source: src(), headroom: hr(0.3, night), estCostUsd: 0.1, observedLatencyMs: 500, recentErrorRate: 0 }],
    });
    const d = evaluate(item(), c);
    expect(d.dispatch).toBe(false);
    expect(d.hold).toBe('headroom_too_low');
  });

  it('prefers the fullest basin', () => {
    const c = ctx(night, {
      candidates: [
        { source: src({ id: 'low' }), headroom: hr(0.72, night), estCostUsd: 0.1, observedLatencyMs: 100, recentErrorRate: 0 },
        { source: src({ id: 'high' }), headroom: hr(0.98, night), estCostUsd: 0.9, observedLatencyMs: 900, recentErrorRate: 0 },
      ],
    });
    expect(evaluate(item(), c).sourceId).toBe('high');
  });

  it('stops at the item cap and at the pool budget', () => {
    expect(evaluate(item({ maxCostUsd: 0.000001 }), ctx(night)).hold).toBe('over_item_cap');
    expect(evaluate(item(), ctx(night, { budgetRemainingUsd: 0.000001 })).hold).toBe('over_budget');
  });

  it('holds a paused item without looking at anything else', () => {
    expect(evaluate(item({ enabled: false }), ctx(night)).hold).toBe('disabled');
  });

  it('holds an item that already ran tonight', () => {
    expect(evaluate(item({ lastRunAt: '2026-09-06T03:05:00Z' }), ctx(night)).hold).toBe('already_ran');
  });
});

describe('the Class C consent gate', () => {
  const night = at('2026-09-06T03:30:00Z');
  const seat = src({ id: 'seat', cls: 'C', credentialTypeId: 'anthropic.subscription_oauth', storageLocation: 'device', nodeId: 'node_1' });
  const node = (over: Partial<NodeRecord> = {}): NodeRecord => ({
    id: 'node_1', ownerUserId: 'me', name: 'laptop', platform: 'darwin-arm64',
    status: 'online', poolMode: 'offer', lastSeenAt: '2026-09-06T03:29:00Z', ...over,
  });
  const seatOnly = (n: NodeRecord[]): Partial<PreloadContext> => ({
    nodes: n,
    candidates: [{ source: seat, headroom: hr(0.95, night), estCostUsd: 0, observedLatencyMs: 400, recentErrorRate: 0 } as Candidate],
  });

  it('will not run unattended on a seat that has not opted in', () => {
    expect(evaluate(item(), ctx(night, seatOnly([node()]))).hold).toBe('consent_not_given');
  });

  it('runs on a seat only once its owner turns unattended mode on', () => {
    const d = evaluate(item(), ctx(night, seatOnly([node({ poolMode: 'auto' })])));
    expect(d.dispatch).toBe(true);
    expect(d.sourceId).toBe('seat');
  });

  it('holds when the node is asleep, however willing it was', () => {
    expect(evaluate(item(), ctx(night, seatOnly([node({ poolMode: 'auto', status: 'offline' })]))).hold).toBe('node_offline');
  });

  it('never runs another member’s work on a seat, even in auto', () => {
    const c = ctx(night, { ...seatOnly([node({ poolMode: 'auto' })]), ownerUserId: 'someone_else', poolId: 'pool_1' });
    const d = evaluate(item(), c);
    expect(d.dispatch).toBe(false);
    expect(d.hold).toBe('policy_refused');
  });
});

describe('planning the whole queue', () => {
  it('totals only what it will actually dispatch', () => {
    const night = at('2026-09-06T03:30:00Z');
    const p = plan([item({ id: 'a' }), item({ id: 'b', enabled: false }), item({ id: 'c', anchorHour: 14 })], ctx(night));
    expect(p.dispatchCount).toBe(1);
    expect(p.estTotalUsd).toBeGreaterThan(0);
    expect(p.nextWindowMs).toBeGreaterThan(0); // item c is still waiting
  });

  it('reports no capacity rather than dispatching into an empty pool', () => {
    const p = plan([item()], ctx(at('2026-09-06T03:30:00Z'), { candidates: [] }));
    expect(p.dispatchCount).toBe(0);
    expect(p.decisions[0].hold).toBe('no_source');
  });
});
