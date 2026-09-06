import { plannerRung, tierRank, type LadderContext, type Rung, type Tier } from '../ladder/rungs';

/**
 * Orchestration.
 *
 * Ideas do not arrive one at a time. They arrive in a burst — thirty of them, at
 * once, usually while you are already busy with the twenty-ninth. The thing that
 * kills the burst is not a lack of capacity; it is that ordering them is itself
 * work, and doing it by hand costs exactly the attention the ideas needed.
 *
 * So: dump them all, let the cheapest rung scope them, and get back an ordered
 * plan. Priority, dependencies, a tier per task, and a slot — now, or the next
 * time the tide is in. Nothing here dispatches; it decides what should.
 */

export type IdeaStatus = 'inbox' | 'planned' | 'running' | 'done' | 'parked';

export interface Idea {
  id: string;
  text: string;
  /** 1–5. What it is worth if it lands. */
  impact: number;
  /** 1–5. How much it costs to do. */
  effort: number;
  /** 1–5. How much worse it gets by waiting. */
  urgency: number;
  /** Ids of ideas that must finish first. */
  blockedBy: string[];
  status: IdeaStatus;
  createdAt: string;
  /** Set once triaged. */
  tier?: Tier;
  estimatedTokens?: number;
}

export interface PlannedTask {
  ideaId: string;
  order: number;
  priority: number;
  tier: Tier;
  estimatedTokens: number;
  blockedBy: string[];
  /** 'now' when a rung can serve it immediately, otherwise it waits for the tide. */
  slot: 'now' | 'next_tide' | 'blocked';
  rungId: string | null;
  rungName: string | null;
  degraded: boolean;
}

export interface Plan {
  tasks: PlannedTask[];
  plannerRungId: string | null;
  plannerRungName: string | null;
  cycles: string[][];
  totalEstimatedTokens: number;
}

/**
 * Impact times urgency, over effort. Deliberately the crudest scoring that works:
 * a triage heuristic people can predict is worth more than an accurate one they
 * cannot, because they have to trust the order to stop re-sorting it themselves.
 */
export function priorityOf(i: Idea): number {
  const impact = clamp(i.impact);
  const urgency = clamp(i.urgency);
  const effort = clamp(i.effort);
  return Math.round(((impact * urgency) / effort) * 100) / 100;
}

function clamp(n: number): number {
  return Math.max(1, Math.min(5, Math.round(n || 1)));
}

/** Big and consequential earns the capable rung; small and mechanical does not. */
export function tierFor(i: Idea): Tier {
  const impact = clamp(i.impact);
  const effort = clamp(i.effort);
  if (impact >= 4 && effort >= 4) return 'frontier';
  if (impact >= 4 || effort >= 4) return 'strong';
  if (effort <= 2 && impact <= 2) return 'light';
  return 'strong';
}

export function estimateTokens(i: Idea): number {
  return clamp(i.effort) * 45_000;
}

/**
 * Kahn's algorithm, highest priority first among the ready set. Anything left over
 * when nothing is ready is a cycle, and a cycle is reported rather than guessed at:
 * an agent that quietly drops a dependency produces work in the wrong order and
 * nobody notices until it has all been done twice.
 */
export function order(ideas: Idea[]): { ordered: Idea[]; cycles: string[][] } {
  const byId = new Map(ideas.map((i) => [i.id, i]));
  const remaining = new Set(ideas.map((i) => i.id));
  const done = new Set<string>();
  const ordered: Idea[] = [];

  while (remaining.size > 0) {
    const ready = [...remaining]
      .map((id) => byId.get(id)!)
      .filter((i) => i.blockedBy.every((b) => done.has(b) || !byId.has(b)))
      .sort((a, b) => priorityOf(b) - priorityOf(a) || a.createdAt.localeCompare(b.createdAt));

    if (ready.length === 0) {
      // Everything left depends on something else left: report it as one cycle.
      return { ordered, cycles: [[...remaining]] };
    }
    const next = ready[0];
    ordered.push(next);
    done.add(next.id);
    remaining.delete(next.id);
  }

  return { ordered, cycles: [] };
}

export function triage(ideas: Idea[], rungs: Rung[], ctx: LadderContext): Plan {
  const live = ideas.filter((i) => i.status !== 'done' && i.status !== 'parked');
  const { ordered, cycles } = order(live);
  const planner = plannerRung(rungs, ctx);

  // Which tiers can actually be served right now, so a slot is a fact rather than
  // a hope. Reuses the ladder's own notion of servable via a cheap probe.
  const servableTiers = new Set(
    rungs
      .filter((r) => {
        const probe = plannerRung([r], { ...ctx, estimatedTokens: ctx.estimatedTokens });
        return probe !== null || probeServable(r, ctx);
      })
      .map((r) => r.tier),
  );

  const tasks: PlannedTask[] = ordered.map((idea, index) => {
    const tier = idea.tier ?? tierFor(idea);
    const est = idea.estimatedTokens ?? estimateTokens(idea);
    const blocked = idea.blockedBy.filter((b) => live.some((x) => x.id === b));
    const servedNow = [...servableTiers].some((t) => tierRank(t) >= tierRank(tier));
    const exact = servableTiers.has(tier);
    const rung = rungs.find((r) => r.tier === tier) ?? null;

    return {
      ideaId: idea.id,
      order: index + 1,
      priority: priorityOf(idea),
      tier,
      estimatedTokens: est,
      blockedBy: blocked,
      slot: blocked.length > 0 ? 'blocked' : servedNow ? 'now' : 'next_tide',
      rungId: rung?.id ?? null,
      rungName: rung?.name ?? null,
      degraded: servedNow && !exact,
    };
  });

  return {
    tasks,
    plannerRungId: planner?.id ?? null,
    plannerRungName: planner?.name ?? null,
    cycles,
    totalEstimatedTokens: tasks.reduce((a, t) => a + t.estimatedTokens, 0),
  };
}

function probeServable(rung: Rung, ctx: LadderContext): boolean {
  return ctx.candidates.some(
    (c) =>
      c.source.provider === rung.provider &&
      (c.source.status === 'active' || c.source.status === 'cooling') &&
      (c.headroom === null || c.headroom.tokens >= ctx.estimatedTokens),
  );
}
