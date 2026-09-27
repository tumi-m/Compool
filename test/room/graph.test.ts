import { describe, expect, it } from 'vitest';
import {
  CycleError, claim, complete, findCycle, insertTask, isReady, layers, progress, release, settleStates,
  type Task,
} from '@/lib/room/graph';

const t = (id: string, blockedBy: string[] = [], over: Partial<Task> = {}): Task => ({
  id, title: id, blockedBy, state: 'ready', claimedBy: null,
  attempt: 0, maxAttempts: 3, estimatedTokens: 1000, costUsd: 0, ...over,
});

describe('cycles', () => {
  it('finds none in a plain chain', () => {
    expect(findCycle([t('a'), t('b', ['a']), t('c', ['b'])])).toBeNull();
  });

  it('reports the path of a direct cycle', () => {
    const c = findCycle([t('a', ['b']), t('b', ['a'])]);
    expect(c).not.toBeNull();
    expect(c!.length).toBeGreaterThanOrEqual(2);
  });

  it('finds a cycle three deep', () => {
    expect(findCycle([t('a', ['c']), t('b', ['a']), t('c', ['b'])])).not.toBeNull();
  });

  it('finds a self-dependency', () => {
    expect(findCycle([t('a', ['a'])])).not.toBeNull();
  });

  it('ignores a dependency on a task that is not in the graph', () => {
    expect(findCycle([t('a', ['ghost'])])).toBeNull();
  });

  it('rejects an insert that would create one, rather than reordering silently', () => {
    const base = [t('a'), t('b', ['a'])];
    expect(() => insertTask(base, t('c', ['b']))).not.toThrow();
    expect(() => insertTask(base, t('a2', ['b'], { id: 'a' }))).toThrow(CycleError);
  });

  it('leaves the original array untouched on a rejected insert', () => {
    const base = [t('a', ['b']), t('b')];
    try {
      insertTask(base, t('b2', ['a'], { id: 'b' }));
    } catch {
      /* expected */
    }
    expect(base).toHaveLength(2);
  });
});

describe('layering', () => {
  it('puts independent tasks in the same layer, so they are genuinely concurrent', () => {
    const l = layers([t('a'), t('b'), t('c', ['a', 'b'])]);
    expect(l[0].map((x) => x.id).sort()).toEqual(['a', 'b']);
    expect(l[1].map((x) => x.id)).toEqual(['c']);
  });

  it('places a task one below its deepest dependency, not its shallowest', () => {
    // d depends on a (depth 0) and c (depth 2), so d must be depth 3.
    const l = layers([t('a'), t('b', ['a']), t('c', ['b']), t('d', ['a', 'c'])]);
    expect(l).toHaveLength(4);
    expect(l[3].map((x) => x.id)).toEqual(['d']);
  });

  it('degrades to one layer rather than looping forever on a cycle', () => {
    const l = layers([t('a', ['b']), t('b', ['a'])]);
    expect(l).toHaveLength(1);
  });
});

describe('readiness', () => {
  it('blocks until every dependency is done', () => {
    const tasks = [t('a', [], { state: 'running' }), t('b', ['a'])];
    expect(isReady(tasks[1], tasks)).toBe(false);
    const after = complete(tasks, 'a', 0.1);
    expect(isReady(after.find((x) => x.id === 'b')!, after)).toBe(true);
    expect(after.find((x) => x.id === 'b')!.state).toBe('ready');
  });

  it('settles blocked and ready across the whole graph', () => {
    const settled = settleStates([t('a'), t('b', ['a']), t('c', ['b'])]);
    expect(settled.map((x) => x.state)).toEqual(['ready', 'blocked', 'blocked']);
  });

  it('never un-finishes or un-claims work while settling', () => {
    const settled = settleStates([
      t('a', [], { state: 'done' }),
      t('b', ['ghost'], { state: 'running' }),
      t('c', [], { state: 'claimed', claimedBy: 'user_a' }),
    ]);
    expect(settled.map((x) => x.state)).toEqual(['done', 'running', 'claimed']);
  });
});

describe('claiming — what stops two people doing the same thing at 2am', () => {
  it('gives the task to the first claimant', () => {
    const r = claim([t('a')], 'a', 'user_a');
    expect(r.ok).toBe(true);
    expect(r.tasks[0].claimedBy).toBe('user_a');
    expect(r.tasks[0].state).toBe('claimed');
  });

  it('refuses a second person and names who holds it', () => {
    const first = claim([t('a')], 'a', 'user_a');
    const second = claim(first.tasks, 'a', 'user_b');
    expect(second.ok).toBe(false);
    expect(second.heldBy).toBe('user_a');
    expect(second.tasks[0].claimedBy).toBe('user_a');
  });

  it('is idempotent for the same person', () => {
    const first = claim([t('a')], 'a', 'user_a');
    const again = claim(first.tasks, 'a', 'user_a');
    expect(again.ok).toBe(true);
    expect(again.tasks[0].claimedBy).toBe('user_a');
  });

  it('refuses a task that is already finished', () => {
    expect(claim([t('a', [], { state: 'done' })], 'a', 'user_a').ok).toBe(false);
  });

  it('refuses a task that does not exist', () => {
    expect(claim([t('a')], 'ghost', 'user_a').ok).toBe(false);
  });

  it('releases so someone else can pick it up after you go to bed', () => {
    const held = claim([t('a')], 'a', 'user_a').tasks;
    const freed = release(held, 'a');
    expect(freed[0].claimedBy).toBeNull();
    expect(freed[0].state).toBe('ready');
    expect(claim(freed, 'a', 'user_b').ok).toBe(true);
  });

  it('will not release finished work back into the queue', () => {
    const done = complete([t('a')], 'a', 0.2);
    expect(release(done, 'a')[0].state).toBe('done');
  });
});

describe('progress', () => {
  it('counts what is finished', () => {
    const p = progress([t('a', [], { state: 'done' }), t('b'), t('c')]);
    expect(p).toEqual({ done: 1, total: 3, fraction: 1 / 3 });
  });

  it('does not divide by zero on an empty graph', () => {
    expect(progress([]).fraction).toBe(0);
  });

  it('accumulates cost onto the task as it completes', () => {
    const done = complete([t('a', [], { costUsd: 0.1 })], 'a', 0.25);
    expect(done[0].costUsd).toBeCloseTo(0.35, 10);
  });
});
