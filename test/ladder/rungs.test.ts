import { describe, expect, it } from 'vitest';
import { pickRung, plannerRung, promotionAvailable, tierRank, type LadderContext, type Rung } from '@/lib/ladder/rungs';
import type { Candidate, CapacitySource, Headroom } from '@/lib/types';

const T0 = Date.parse('2026-09-06T12:00:00Z');

const rungs: Rung[] = [
  { id: 'top', name: 'Frontier one', tier: 'frontier', provider: 'anthropic', openWeight: false, canPlan: false, verified: false },
  { id: 'mid', name: 'Strong one', tier: 'strong', provider: 'openai', openWeight: true, canPlan: true, verified: false },
  { id: 'lite', name: 'Light one', tier: 'light', provider: 'google', openWeight: true, canPlan: true, verified: false },
  { id: 'floor', name: 'Local open weight', tier: 'free', provider: 'ollama', openWeight: true, canPlan: true, verified: true },
];

const src = (provider: string, id = provider): CapacitySource => ({
  id, ownerUserId: 'me', provider, credentialTypeId: `${provider}.api_key`,
  cls: provider === 'ollama' ? 'B' : 'A', label: provider,
  storageLocation: provider === 'ollama' ? 'device' : 'vault',
  last4: null, nodeId: null, status: 'active', contributedToPool: null,
  priority: 100, monthlyCapUsd: null, createdAt: '2026-01-01T00:00:00Z', preview: true,
});

const hr = (frac: number): Headroom => ({
  tokens: 1_000_000 * frac, limitTokens: 1_000_000,
  // Reset far out so interpolation does not quietly refill it mid-test.
  resetAt: new Date(T0 + 24 * 3_600_000).toISOString(),
  observedAt: new Date(T0).toISOString(),
  requestsRemaining: 10, consecutive429: 0, coolingUntil: null,
});

const cand = (provider: string, frac: number | null): Candidate => ({
  source: src(provider),
  headroom: frac === null ? null : hr(frac),
  estCostUsd: 0.1, observedLatencyMs: 500, recentErrorRate: 0,
});

const ctx = (candidates: Candidate[], over: Partial<LadderContext> = {}): LadderContext => ({
  now: T0, candidates, minFill: 0.05, estimatedTokens: 20_000, ...over,
});

describe('the ladder', () => {
  it('takes the top rung when the tide is in', () => {
    const p = pickRung('frontier', rungs, ctx([cand('anthropic', 0.9), cand('ollama', null)]));
    expect(p.kind).toBe('picked');
    if (p.kind === 'picked') {
      expect(p.rung.id).toBe('top');
      expect(p.degraded).toBe(false);
      expect(p.reason).toBeNull();
    }
  });

  it('drops a rung rather than stalling, and says so', () => {
    const p = pickRung('frontier', rungs, ctx([cand('anthropic', 0), cand('openai', 0.8)]));
    expect(p.kind).toBe('picked');
    if (p.kind === 'picked') {
      expect(p.rung.id).toBe('mid');
      expect(p.degraded).toBe(true);
      expect(p.reason).toMatch(/reworked/i);
    }
  });

  it('walks all the way to the floor when everything metered is spent', () => {
    const p = pickRung('frontier', rungs, ctx([cand('anthropic', 0), cand('openai', 0), cand('google', 0), cand('ollama', null)]));
    expect(p.kind).toBe('picked');
    if (p.kind === 'picked') expect(p.rung.id).toBe('floor');
  });

  it('treats owned compute as the floor because it never runs out', () => {
    const p = pickRung('free', rungs, ctx([cand('ollama', null)], { estimatedTokens: 5_000_000 }));
    expect(p.kind).toBe('picked');
  });

  it('never climbs above the tier that was asked for', () => {
    const p = pickRung('light', rungs, ctx([cand('anthropic', 1), cand('google', 0.9)]));
    expect(p.kind).toBe('picked');
    if (p.kind === 'picked') expect(tierRank(p.rung.tier)).toBeGreaterThanOrEqual(tierRank('light'));
  });

  it('will not pick a rung that cannot fit the work', () => {
    const p = pickRung('frontier', rungs, ctx([cand('anthropic', 0.5), cand('ollama', null)], { estimatedTokens: 900_000 }));
    expect(p.kind).toBe('picked');
    if (p.kind === 'picked') expect(p.rung.id).toBe('floor');
  });

  it('stalls only when even the floor is gone, and says what to connect', () => {
    const p = pickRung('frontier', rungs, ctx([cand('anthropic', 0)]));
    expect(p.kind).toBe('stalled');
    if (p.kind === 'stalled') expect(p.reason).toMatch(/owned compute/i);
  });

  it('ignores a revoked or exhausted source entirely', () => {
    const dead = { ...cand('anthropic', 0.9), source: { ...src('anthropic'), status: 'revoked' as const } };
    const p = pickRung('frontier', rungs, ctx([dead, cand('ollama', null)]));
    expect(p.kind).toBe('picked');
    if (p.kind === 'picked') expect(p.rung.id).toBe('floor');
  });
});

describe('promotion, which is what triggers rework', () => {
  it('reports nothing while the capable rung is still out', () => {
    expect(promotionAvailable('frontier', rungs, ctx([cand('anthropic', 0), cand('ollama', null)]))).toBeNull();
  });

  it('reports the rung as soon as the tide comes back in', () => {
    const r = promotionAvailable('frontier', rungs, ctx([cand('anthropic', 0.8)]));
    expect(r?.id).toBe('top');
  });
});

describe('the planner rung', () => {
  it('is the cheapest thing that can plan, not the most capable', () => {
    const r = plannerRung(rungs, ctx([cand('anthropic', 1), cand('openai', 1), cand('ollama', null)]));
    expect(r?.id).toBe('floor');
  });

  it('climbs only as far as it must to find one that can plan', () => {
    const r = plannerRung(rungs, ctx([cand('openai', 0.9)]));
    expect(r?.id).toBe('mid');
  });

  it('reports none when nothing available can plan', () => {
    expect(plannerRung(rungs, ctx([cand('anthropic', 0.9)]))).toBeNull();
  });
});
