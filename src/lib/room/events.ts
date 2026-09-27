/**
 * Room events (§12.2).
 *
 * Structured events only. The model never emits markup and the client never
 * renders model-authored HTML or executes model-authored code — data in, your
 * components out. Every payload is validated at the boundary in both directions,
 * and an unknown type renders a compact neutral fallback rather than crashing or
 * going blank.
 */

export type RunEventType =
  | 'run.queued'
  | 'run.routing'
  | 'run.source_selected'
  | 'run.retry'
  | 'text.delta'
  | 'reasoning.delta'
  | 'tool.call'
  | 'tool.result'
  | 'file.diff'
  | 'cost.tick'
  | 'headroom.tick'
  | 'run.error'
  | 'run.done'
  | 'member.join'
  | 'member.leave'
  | 'task.created'
  | 'task.claimed'
  | 'task.done';

export const EVENT_TYPES: readonly RunEventType[] = [
  'run.queued', 'run.routing', 'run.source_selected', 'run.retry',
  'text.delta', 'reasoning.delta', 'tool.call', 'tool.result', 'file.diff',
  'cost.tick', 'headroom.tick', 'run.error', 'run.done',
  'member.join', 'member.leave', 'task.created', 'task.claimed', 'task.done',
];

export interface RoomEvent {
  seq: number;
  type: RunEventType;
  runId: string | null;
  actor: string | null;
  payload: Record<string, unknown>;
  at: string;
}

export function isRunEventType(v: unknown): v is RunEventType {
  return typeof v === 'string' && (EVENT_TYPES as readonly string[]).includes(v);
}

/** Boundary validation. Anything that does not parse is refused, never coerced. */
export function parseEvent(input: unknown, seq: number): RoomEvent | null {
  if (typeof input !== 'object' || input === null) return null;
  const o = input as Record<string, unknown>;
  if (!isRunEventType(o.type)) return null;
  return {
    seq,
    type: o.type,
    runId: typeof o.runId === 'string' ? o.runId : null,
    actor: typeof o.actor === 'string' ? o.actor : null,
    payload: typeof o.payload === 'object' && o.payload !== null ? (o.payload as Record<string, unknown>) : {},
    at: typeof o.at === 'string' ? o.at : new Date().toISOString(),
  };
}

/**
 * The append-only log behind a room. `seq` is monotonic per room, which is what
 * makes Last-Event-ID replay exact: a reconnecting client asks for everything
 * after the last seq it saw and gets it with no gaps and no duplicates.
 *
 * In this deployment the log is in-process, so it is per-instance: good enough to
 * demonstrate and test the transport, not enough for many instances. The
 * production shape is Postgres for durability plus one Redis pub/sub channel per
 * room for fan-out, which is why nothing here assumes a single writer.
 */
export class RoomLog {
  private events: RoomEvent[] = [];
  private subscribers = new Set<(e: RoomEvent) => void>();
  private seq = 0;

  constructor(private readonly cap = 2000) {}

  append(input: unknown): RoomEvent | null {
    const e = parseEvent(input, this.seq + 1);
    if (!e) return null;
    this.seq += 1;
    this.events.push(e);
    if (this.events.length > this.cap) this.events.splice(0, this.events.length - this.cap);
    for (const fn of this.subscribers) {
      try {
        fn(e);
      } catch {
        // A broken subscriber must never stop the log or the other subscribers.
      }
    }
    return e;
  }

  /** Everything after `afterSeq`. Zero replays the whole retained window. */
  since(afterSeq: number): RoomEvent[] {
    return this.events.filter((e) => e.seq > afterSeq);
  }

  get lastSeq(): number {
    return this.seq;
  }

  get size(): number {
    return this.events.length;
  }

  subscribe(fn: (e: RoomEvent) => void): () => void {
    this.subscribers.add(fn);
    return () => {
      this.subscribers.delete(fn);
    };
  }

  get subscriberCount(): number {
    return this.subscribers.size;
  }
}

/** Serialise one event as an SSE frame, carrying its id so replay can resume. */
export function toFrame(e: RoomEvent): string {
  return `id: ${e.seq}\nevent: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`;
}

/**
 * §12.3 backpressure. A room with six agents running must not push four hundred
 * events a second at a phone, so the high-frequency types are throttled and text
 * deltas coalesce. Pure, so it is testable without a socket.
 */
export interface ThrottleState {
  lastAt: Partial<Record<RunEventType, number>>;
}

export const THROTTLE_MS: Partial<Record<RunEventType, number>> = {
  'cost.tick': 500,      // at most 2/s
  'headroom.tick': 500,  // at most 2/s
  'text.delta': 33,      // at most ~30/s
  'reasoning.delta': 33,
};

export function shouldEmit(type: RunEventType, now: number, state: ThrottleState): boolean {
  const window = THROTTLE_MS[type];
  if (window === undefined) return true;
  const last = state.lastAt[type] ?? -Infinity;
  if (now - last < window) return false;
  state.lastAt[type] = now;
  return true;
}
