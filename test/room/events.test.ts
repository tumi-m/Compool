import { describe, expect, it, vi } from 'vitest';
import { RoomLog, parseEvent, shouldEmit, toFrame, type ThrottleState } from '@/lib/room/events';

const ev = (type: string, payload: Record<string, unknown> = {}) => ({ type, payload, actor: 'user_a', runId: 'run_1' });

describe('boundary validation', () => {
  it('refuses an unknown event type rather than coercing it', () => {
    expect(parseEvent({ type: 'run.explode' }, 1)).toBeNull();
    expect(parseEvent('not an object', 1)).toBeNull();
    expect(parseEvent(null, 1)).toBeNull();
  });

  it('accepts a known type and fills the missing fields safely', () => {
    const e = parseEvent({ type: 'text.delta' }, 7)!;
    expect(e.seq).toBe(7);
    expect(e.payload).toEqual({});
    expect(e.runId).toBeNull();
    expect(Date.parse(e.at)).toBeGreaterThan(0);
  });

  it('never lets a non-object payload through as a payload', () => {
    const e = parseEvent({ type: 'text.delta', payload: 'haha' }, 1)!;
    expect(e.payload).toEqual({});
  });
});

describe('the append-only log', () => {
  it('assigns a monotonic seq and rejects invalid appends without consuming one', () => {
    const log = new RoomLog();
    expect(log.append(ev('run.queued'))!.seq).toBe(1);
    expect(log.append({ type: 'nope' })).toBeNull();
    expect(log.append(ev('text.delta'))!.seq).toBe(2);
    expect(log.lastSeq).toBe(2);
  });

  it('replays exactly the gap after a given seq — no gaps and no duplicates', () => {
    const log = new RoomLog();
    for (let i = 0; i < 10; i += 1) log.append(ev('text.delta', { i }));

    // A client that saw up to 4 reconnects and asks for the rest.
    const replay = log.since(4);
    expect(replay.map((e) => e.seq)).toEqual([5, 6, 7, 8, 9, 10]);
    // Nothing it already had comes back.
    expect(replay.every((e) => e.seq > 4)).toBe(true);
    // And nothing in between is missing.
    for (let i = 1; i < replay.length; i += 1) {
      expect(replay[i].seq - replay[i - 1].seq).toBe(1);
    }
  });

  it('replays everything from zero for a fresh client', () => {
    const log = new RoomLog();
    for (let i = 0; i < 3; i += 1) log.append(ev('text.delta'));
    expect(log.since(0)).toHaveLength(3);
  });

  it('fans out to every subscriber', () => {
    const log = new RoomLog();
    const a = vi.fn();
    const b = vi.fn();
    log.subscribe(a);
    const off = log.subscribe(b);
    log.append(ev('run.queued'));
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
    off();
    log.append(ev('run.done'));
    expect(a).toHaveBeenCalledTimes(2);
    expect(b).toHaveBeenCalledTimes(1);
    expect(log.subscriberCount).toBe(1);
  });

  it('keeps going when one subscriber throws', () => {
    const log = new RoomLog();
    const good = vi.fn();
    log.subscribe(() => {
      throw new Error('bad client');
    });
    log.subscribe(good);
    expect(() => log.append(ev('run.queued'))).not.toThrow();
    expect(good).toHaveBeenCalledTimes(1);
  });

  it('keeps seq monotonic even once old events fall out of the window', () => {
    const log = new RoomLog(5);
    for (let i = 0; i < 12; i += 1) log.append(ev('text.delta'));
    expect(log.lastSeq).toBe(12);
    expect(log.size).toBe(5);
    expect(log.since(0).map((e) => e.seq)).toEqual([8, 9, 10, 11, 12]);
  });
});

describe('the SSE frame', () => {
  it('carries the id so a reconnect can resume from it', () => {
    const log = new RoomLog();
    const e = log.append(ev('cost.tick', { costUsd: 0.5 }))!;
    const frame = toFrame(e);
    expect(frame).toMatch(/^id: 1\n/);
    expect(frame).toContain('event: cost.tick\n');
    expect(frame.endsWith('\n\n')).toBe(true);
    expect(JSON.parse(frame.split('data: ')[1]).payload.costUsd).toBe(0.5);
  });
});

describe('backpressure', () => {
  it('caps cost and headroom ticks at two a second', () => {
    const s: ThrottleState = { lastAt: {} };
    expect(shouldEmit('cost.tick', 1000, s)).toBe(true);
    expect(shouldEmit('cost.tick', 1200, s)).toBe(false);
    expect(shouldEmit('cost.tick', 1501, s)).toBe(true);
  });

  it('coalesces text deltas to about thirty a second', () => {
    const s: ThrottleState = { lastAt: {} };
    let emitted = 0;
    for (let t = 0; t < 1000; t += 10) if (shouldEmit('text.delta', t, s)) emitted += 1;
    expect(emitted).toBeLessThanOrEqual(31);
    expect(emitted).toBeGreaterThan(20);
  });

  it('never throttles the events that carry state transitions', () => {
    const s: ThrottleState = { lastAt: {} };
    expect(shouldEmit('run.done', 0, s)).toBe(true);
    expect(shouldEmit('run.done', 1, s)).toBe(true);
    expect(shouldEmit('task.claimed', 1, s)).toBe(true);
  });

  it('throttles each type on its own clock', () => {
    const s: ThrottleState = { lastAt: {} };
    expect(shouldEmit('cost.tick', 0, s)).toBe(true);
    expect(shouldEmit('headroom.tick', 0, s)).toBe(true); // not blocked by cost.tick
    expect(shouldEmit('cost.tick', 100, s)).toBe(false);
  });
});
