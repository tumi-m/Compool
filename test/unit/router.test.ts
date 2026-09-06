import { describe, expect, it } from 'vitest';
import { projectedHeadroom, fillFraction, tideLevel, timeToEmptyMs } from '@/lib/router/headroom';
import { DEFAULT_WEIGHTS, select } from '@/lib/router/select';
import { register } from '@/lib/policy/register';
import type { Candidate, CapacitySource, Headroom, SelectionContext, WorkUnit } from '@/lib/types';

const T0 = Date.parse('2026-09-06T12:00:00Z');

const hr = (over: Partial<Headroom> = {}): Headroom => ({
  tokens: 500_000, limitTokens: 1_000_000,
  resetAt: new Date(T0 + 60 * 60_000).toISOString(),
  observedAt: new Date(T0).toISOString(),
  requestsRemaining: 500, consecutive429: 0, coolingUntil: null, ...over,
});

const src = (over: Partial<CapacitySource> = {}): CapacitySource => ({
  id: 'src_1', ownerUserId: 'user_a', provider: 'anthropic', credentialTypeId: 'anthropic.api_key',
  cls: 'A', label: 'k', storageLocation: 'vault', last4: null, nodeId: null, status: 'active',
  contributedToPool: null, priority: 100, monthlyCapUsd: null, createdAt: '2026-01-01T00:00:00Z',
  preview: true, ...over,
});

const ctx = (over: Partial<SelectionContext> = {}): SelectionContext => ({
  now: T0, poolId: null, consumerUserId: 'user_a', excludedSourceIds: new Set(),
  headroomMarginTokens: 2000, costSensitivity: 40, stickySourceId: null,
  contributionUsd: new Map(), consumptionUsd: new Map(), poolNetSpreadUsd: 1,
  w: DEFAULT_WEIGHTS, policies: register, budgetRemainingUsd: null, memberCapRemainingUsd: null, ...over,
});

const work = (over: Partial<WorkUnit> = {}): WorkUnit => ({
  id: 'w', model: '*', kind: 'interactive', estimatedTokens: 20_000,
  attributedUserId: 'user_a', poolId: null, ...over,
});

const cand = (over: Partial<Candidate> = {}): Candidate => ({
  source: src(), headroom: hr(), estCostUsd: 0.05, observedLatencyMs: 500, recentErrorRate: 0, ...over,
});

describe('token-bucket interpolation', () => {
  it('replenishes continuously rather than waiting for the reset', () => {
    const half = projectedHeadroom(hr({ tokens: 0 }), T0 + 30 * 60_000)!;
    expect(half.tokens).toBe(500_000);
  });

  it('never exceeds the limit', () => {
    const past = projectedHeadroom(hr({ tokens: 900_000 }), T0 + 10 * 3_600_000)!;
    expect(past.tokens).toBe(1_000_000);
  });

  it('leaves headroom alone before the observation', () => {
    expect(projectedHeadroom(hr(), T0 - 1000)!.tokens).toBe(500_000);
  });

  it('reports the four tide levels off the fill fraction', () => {
    expect(tideLevel(fillFraction(hr({ tokens: 800_000 }), T0))).toBe('flood');
    expect(tideLevel(0.2)).toBe('ebb');
    expect(tideLevel(0.08)).toBe('shallow');
    expect(tideLevel(0.01)).toBe('slack');
    expect(tideLevel(null)).toBe('flood');
  });

  it('projects time to empty from the current burn', () => {
    const ms = timeToEmptyMs(hr({ tokens: 102_000 }), 1000, T0)!;
    expect(Math.round(ms / 1000)).toBe(100); // (102000 - 2000 margin) / 1000 tok/s
  });
});

describe('selection', () => {
  it('never picks a source that cannot finish the work', () => {
    const doomed = cand({ source: src({ id: 'doomed' }), headroom: hr({ tokens: 100, limitTokens: 100, resetAt: new Date(T0).toISOString() }) });
    const fine = cand({ source: src({ id: 'fine' }) });
    const s = select(work(), [doomed, fine], ctx());
    expect(s.kind).toBe('selected');
    if (s.kind === 'selected') expect(s.source.id).toBe('fine');
  });

  it('keeps bulk work off a draining window but still serves interactive work there', () => {
    const draining = cand({ source: src({ id: 'draining' }), headroom: hr({ tokens: 50_000 }) }); // 5%
    expect(select(work({ kind: 'bulk' }), [draining], ctx()).kind).toBe('no_capacity');
    expect(select(work({ kind: 'interactive' }), [draining], ctx()).kind).toBe('selected');
  });

  it('excludes a source that already failed this run', () => {
    const s = select(work(), [cand()], ctx({ excludedSourceIds: new Set(['src_1']) }));
    expect(s.kind).toBe('no_capacity');
  });

  it('leaves a personal seat out of pooled capacity, and explains why', () => {
    const seat = cand({
      source: src({ id: 'seat', cls: 'C', credentialTypeId: 'anthropic.subscription_oauth', storageLocation: 'device' }),
    });
    const s = select(work({ poolId: 'pool_1', attributedUserId: 'user_b' }), [seat], ctx({ poolId: 'pool_1', consumerUserId: 'user_b' }));
    expect(s.kind).toBe('no_capacity');
    if (s.kind === 'no_capacity') expect(s.reason).toMatch(/personal seat/i);
  });

  it('shifts toward the net-under-consuming contributor', () => {
    const mine = cand({ source: src({ id: 'mine', ownerUserId: 'user_generous' }) });
    const theirs = cand({ source: src({ id: 'theirs', ownerUserId: 'user_greedy' }) });
    const base = ctx({
      poolId: 'pool_1', consumerUserId: 'user_a',
      contributionUsd: new Map([['user_generous', 10], ['user_greedy', 1]]),
      consumptionUsd: new Map([['user_generous', 1], ['user_greedy', 10]]),
      poolNetSpreadUsd: 18,
    });
    const s = select(work({ poolId: 'pool_1' }), [mine, theirs], base);
    expect(s.kind).toBe('selected');
    if (s.kind === 'selected') expect(s.source.id).toBe('mine');
  });

  it('treats owned compute with no window as mildly optimistic, not unusable', () => {
    const local = cand({ source: src({ id: 'local', provider: 'ollama', credentialTypeId: 'ollama.local_server', cls: 'B', storageLocation: 'device' }), headroom: null });
    const s = select(work({ kind: 'bulk' }), [local], ctx());
    expect(s.kind).toBe('selected');
  });

  it('says something useful when nothing is connected', () => {
    const s = select(work(), [], ctx());
    expect(s.kind).toBe('no_capacity');
    if (s.kind === 'no_capacity') expect(s.reason).toMatch(/no capacity sources/i);
  });
});
