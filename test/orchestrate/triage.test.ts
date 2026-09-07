import { describe, expect, it } from 'vitest';
import { estimateTokens, order, priorityOf, tierFor, triage, type Idea } from '@/lib/orchestrate/triage';
import type { LadderContext, Rung } from '@/lib/ladder/rungs';
import type { Candidate, CapacitySource } from '@/lib/types';

const idea = (over: Partial<Idea> = {}): Idea => ({
  id: 'i1', text: 'do a thing', impact: 3, effort: 3, urgency: 3,
  blockedBy: [], status: 'inbox', createdAt: '2026-09-01T00:00:00Z', ...over,
});

const rungs: Rung[] = [
  { id: 'top', name: 'Frontier one', tier: 'frontier', provider: 'anthropic', openWeight: false, canPlan: false, verified: false },
  { id: 'mid', name: 'Strong one', tier: 'strong', provider: 'openai', openWeight: true, canPlan: true, verified: false },
  { id: 'floor', name: 'Local', tier: 'free', provider: 'ollama', openWeight: true, canPlan: true, verified: true },
];

const src = (provider: string): CapacitySource => ({
  id: provider, ownerUserId: 'me', provider, credentialTypeId: `${provider}.api_key`,
  cls: 'A', label: provider, storageLocation: 'vault', last4: null, nodeId: null,
  status: 'active', contributedToPool: null, priority: 100, monthlyCapUsd: null,
  createdAt: '2026-01-01T00:00:00Z', preview: true,
});

const cand = (provider: string, tokens: number | null): Candidate => ({
  source: src(provider),
  headroom: tokens === null ? null : {
    tokens, limitTokens: 1_000_000,
    resetAt: '2026-09-07T12:00:00Z', observedAt: '2026-09-06T12:00:00Z',
    requestsRemaining: 10, consecutive429: 0, coolingUntil: null,
  },
  estCostUsd: 0.1, observedLatencyMs: 400, recentErrorRate: 0,
});

const ctx = (candidates: Candidate[]): LadderContext => ({
  now: Date.parse('2026-09-06T12:00:00Z'), candidates, minFill: 0.05, estimatedTokens: 20_000,
});

describe('priority', () => {
  it('rewards impact and urgency, penalises effort', () => {
    expect(priorityOf(idea({ impact: 5, urgency: 5, effort: 1 }))).toBe(25);
    expect(priorityOf(idea({ impact: 1, urgency: 1, effort: 5 }))).toBeCloseTo(0.2, 5);
  });

  it('clamps nonsense rather than dividing by zero', () => {
    expect(Number.isFinite(priorityOf(idea({ effort: 0, impact: 99, urgency: -4 })))).toBe(true);
  });
});

describe('tier assignment', () => {
  it('sends big consequential work to the frontier rung', () => {
    expect(tierFor(idea({ impact: 5, effort: 5 }))).toBe('frontier');
  });

  it('sends small mechanical work to a light rung', () => {
    expect(tierFor(idea({ impact: 1, effort: 1 }))).toBe('light');
  });

  it('sizes the estimate off effort', () => {
    expect(estimateTokens(idea({ effort: 1 }))).toBeLessThan(estimateTokens(idea({ effort: 5 })));
  });
});

describe('ordering', () => {
  it('puts the highest priority first when nothing blocks', () => {
    const { ordered } = order([
      idea({ id: 'low', impact: 1, urgency: 1, effort: 5 }),
      idea({ id: 'high', impact: 5, urgency: 5, effort: 1 }),
    ]);
    expect(ordered.map((i) => i.id)).toEqual(['high', 'low']);
  });

  it('respects a dependency even against priority', () => {
    const { ordered } = order([
      idea({ id: 'big', impact: 5, urgency: 5, effort: 1, blockedBy: ['small'] }),
      idea({ id: 'small', impact: 1, urgency: 1, effort: 5 }),
    ]);
    expect(ordered.map((i) => i.id)).toEqual(['small', 'big']);
  });

  it('reports a cycle rather than quietly dropping a dependency', () => {
    const { ordered, cycles } = order([
      idea({ id: 'a', blockedBy: ['b'] }),
      idea({ id: 'b', blockedBy: ['a'] }),
    ]);
    expect(ordered).toHaveLength(0);
    expect(cycles[0].sort()).toEqual(['a', 'b']);
  });

  it('ignores a dependency on something not in the plan', () => {
    const { ordered, cycles } = order([idea({ id: 'a', blockedBy: ['already_done'] })]);
    expect(ordered.map((i) => i.id)).toEqual(['a']);
    expect(cycles).toEqual([]);
  });

  it('breaks ties by capture order, so the list is stable while you edit it', () => {
    const { ordered } = order([
      idea({ id: 'second', createdAt: '2026-09-01T00:00:02Z' }),
      idea({ id: 'first', createdAt: '2026-09-01T00:00:01Z' }),
    ]);
    expect(ordered.map((i) => i.id)).toEqual(['first', 'second']);
  });
});

describe('the plan', () => {
  it('slots work as runnable now when a rung can serve it', () => {
    const p = triage([idea({ impact: 5, effort: 5 })], rungs, ctx([cand('anthropic', 900_000)]));
    expect(p.tasks[0].slot).toBe('now');
    expect(p.tasks[0].tier).toBe('frontier');
  });

  it('holds work for the tide when nothing can serve its tier', () => {
    const p = triage([idea({ impact: 5, effort: 5 })], rungs, ctx([]));
    expect(p.tasks[0].slot).toBe('next_tide');
  });

  it('marks a task blocked while its dependency is outstanding', () => {
    const p = triage(
      [idea({ id: 'a' }), idea({ id: 'b', blockedBy: ['a'] })],
      rungs,
      ctx([cand('anthropic', 900_000)]),
    );
    expect(p.tasks.find((t) => t.ideaId === 'b')!.slot).toBe('blocked');
  });

  it('leaves finished and parked ideas out of the plan entirely', () => {
    const p = triage(
      [idea({ id: 'a', status: 'done' }), idea({ id: 'b', status: 'parked' }), idea({ id: 'c' })],
      rungs,
      ctx([cand('anthropic', 900_000)]),
    );
    expect(p.tasks.map((t) => t.ideaId)).toEqual(['c']);
  });

  it('scopes with the cheapest rung that can plan', () => {
    const p = triage([idea()], rungs, ctx([cand('anthropic', 900_000), cand('ollama', null)]));
    expect(p.plannerRungId).toBe('floor');
  });

  it('totals the estimate across the whole burst', () => {
    const p = triage([idea({ id: 'a' }), idea({ id: 'b' })], rungs, ctx([cand('ollama', null)]));
    expect(p.totalEstimatedTokens).toBe(p.tasks.reduce((a, t) => a + t.estimatedTokens, 0));
    expect(p.totalEstimatedTokens).toBeGreaterThan(0);
  });
});
