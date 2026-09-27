/**
 * The task graph (§12.4).
 *
 * An explicit DAG, not a chat transcript. Independent tasks dispatch
 * concurrently, and the topological order *is* the execution plan. A cycle
 * introduced by an agent is rejected at insert with a clear error rather than
 * silently reordered — an agent that quietly drops a dependency produces work in
 * the wrong order and nobody notices until it has been done twice.
 */

export type TaskState = 'blocked' | 'ready' | 'claimed' | 'running' | 'done' | 'failed';

export interface Task {
  id: string;
  title: string;
  blockedBy: string[];
  state: TaskState;
  /** Who picked it up. `task.claimed` is what stops two people doing the same
   *  thing at 2am, which is the actual failure mode of a hackathon. */
  claimedBy: string | null;
  attempt: number;
  maxAttempts: number;
  estimatedTokens: number;
  costUsd: number;
}

export class CycleError extends Error {
  constructor(readonly cycle: string[]) {
    super(`Cycle: ${cycle.join(' → ')}`);
    this.name = 'CycleError';
  }
}

/** Depth-first cycle detection. Returns the offending path, not just a boolean. */
export function findCycle(tasks: Task[]): string[] | null {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const state = new Map<string, 0 | 1 | 2>(); // unvisited | on stack | done
  const stack: string[] = [];

  const visit = (id: string): string[] | null => {
    const s = state.get(id) ?? 0;
    if (s === 1) return [...stack.slice(stack.indexOf(id)), id];
    if (s === 2) return null;
    state.set(id, 1);
    stack.push(id);
    for (const dep of byId.get(id)?.blockedBy ?? []) {
      if (!byId.has(dep)) continue;
      const hit = visit(dep);
      if (hit) return hit;
    }
    stack.pop();
    state.set(id, 2);
    return null;
  };

  for (const t of tasks) {
    const hit = visit(t.id);
    if (hit) return hit;
  }
  return null;
}

/** Insert with validation. Throws rather than accepting an unorderable graph. */
export function insertTask(tasks: Task[], task: Task): Task[] {
  const next = [...tasks, task];
  const cycle = findCycle(next);
  if (cycle) throw new CycleError(cycle);
  return next;
}

/**
 * Longest-path layering: a task sits one layer below its deepest dependency, so
 * everything in a layer is genuinely concurrent. That is the execution plan and
 * it is also the drawing.
 */
export function layers(tasks: Task[]): Task[][] {
  if (findCycle(tasks)) return [tasks];
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const depth = new Map<string, number>();

  const depthOf = (id: string): number => {
    const cached = depth.get(id);
    if (cached !== undefined) return cached;
    const deps = (byId.get(id)?.blockedBy ?? []).filter((d) => byId.has(d));
    const d = deps.length === 0 ? 0 : Math.max(...deps.map(depthOf)) + 1;
    depth.set(id, d);
    return d;
  };

  for (const t of tasks) depthOf(t.id);
  const max = Math.max(0, ...[...depth.values()]);
  const out: Task[][] = Array.from({ length: max + 1 }, () => []);
  for (const t of tasks) out[depth.get(t.id) ?? 0].push(t);
  return out;
}

/** A task is ready when every dependency in the graph has finished. */
export function isReady(task: Task, tasks: Task[]): boolean {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  return task.blockedBy.every((d) => !byId.has(d) || byId.get(d)!.state === 'done');
}

/** Recompute blocked/ready across the graph after any state change. */
export function settleStates(tasks: Task[]): Task[] {
  return tasks.map((t) => {
    if (t.state === 'done' || t.state === 'failed' || t.state === 'running' || t.state === 'claimed') return t;
    return { ...t, state: isReady(t, tasks) ? 'ready' : 'blocked' };
  });
}

/**
 * Claiming is first-write-wins and idempotent for the same person. Two people
 * clicking the same task a second apart must not both get it.
 */
export function claim(tasks: Task[], taskId: string, userId: string): { tasks: Task[]; ok: boolean; heldBy: string | null } {
  const t = tasks.find((x) => x.id === taskId);
  if (!t) return { tasks, ok: false, heldBy: null };
  if (t.claimedBy && t.claimedBy !== userId) return { tasks, ok: false, heldBy: t.claimedBy };
  if (t.state === 'done') return { tasks, ok: false, heldBy: t.claimedBy };
  return {
    tasks: tasks.map((x) => (x.id === taskId ? { ...x, claimedBy: userId, state: 'claimed' } : x)),
    ok: true,
    heldBy: userId,
  };
}

/** Release a claim — someone went to bed, someone else picks it up. */
export function release(tasks: Task[], taskId: string): Task[] {
  return settleStates(
    tasks.map((x) => (x.id === taskId && x.state !== 'done' ? { ...x, claimedBy: null, state: 'ready' } : x)),
  );
}

export function complete(tasks: Task[], taskId: string, costUsd: number): Task[] {
  return settleStates(
    tasks.map((x) => (x.id === taskId ? { ...x, state: 'done', costUsd: x.costUsd + costUsd } : x)),
  );
}

export function progress(tasks: Task[]): { done: number; total: number; fraction: number } {
  const done = tasks.filter((t) => t.state === 'done').length;
  return { done, total: tasks.length, fraction: tasks.length === 0 ? 0 : done / tasks.length };
}
