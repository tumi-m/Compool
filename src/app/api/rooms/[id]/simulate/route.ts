import { NextResponse } from 'next/server';
import { roomLog } from '@/lib/room/registry';
import { shouldEmit, type ThrottleState } from '@/lib/room/events';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

const SLEEP = (ms: number) => new Promise((r) => setTimeout(r, ms));

const CHUNKS = [
  'Reading packages/router/src/select.ts. ',
  'The survival term already excludes a source that cannot finish, ',
  'so the failover path only needs the exclusion set. ',
  'Adding a run event on each attempt so the room shows what happened ',
  'rather than a mystery pause. ',
];

/**
 * A teammate's agent, running in this room.
 *
 * Every event goes through the same throttle the real fan-out uses, so what a
 * client receives here has exactly the shape it would in production — text
 * deltas coalesced, cost and headroom ticks capped at two a second. A room with
 * six agents must not push four hundred events a second at a phone.
 *
 * The work is awaited rather than detached: a serverless instance can be frozen
 * the moment it responds, and a half-written run is worse than a slow one.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const log = roomLog(id);
  const actor = new URL(req.url).searchParams.get('actor') ?? 'user_ada';
  const runId = `run_${Math.random().toString(36).slice(2, 9)}`;
  const throttle: ThrottleState = { lastAt: {} };

  const emit = (type: Parameters<typeof shouldEmit>[0], payload: Record<string, unknown>) => {
    if (!shouldEmit(type, Date.now(), throttle)) return false;
    log.append({ type, runId, actor, payload, at: new Date().toISOString() });
    return true;
  };

  log.append({ type: 'run.queued', runId, actor, payload: { title: 'Wire failover into the run events' }, at: new Date().toISOString() });
  await SLEEP(220);
  log.append({ type: 'run.routing', runId, actor, payload: { candidates: 4 }, at: new Date().toISOString() });
  await SLEEP(200);
  log.append({
    type: 'run.source_selected',
    runId,
    actor,
    payload: { source: 'OpenAI · scoped $50', rung: 'GLM 5.3', survival: 0.94 },
    at: new Date().toISOString(),
  });

  let cost = 0;
  for (const chunk of CHUNKS) {
    await SLEEP(420);
    emit('text.delta', { text: chunk });
    cost += 0.0031;
    emit('cost.tick', { costUsd: Number(cost.toFixed(4)) });
    emit('headroom.tick', { fraction: Number((0.42 - cost * 6).toFixed(3)) });
  }

  await SLEEP(260);
  log.append({
    type: 'tool.call',
    runId,
    actor,
    payload: { name: 'edit_file', path: 'packages/router/src/select.ts' },
    at: new Date().toISOString(),
  });
  await SLEEP(320);
  log.append({ type: 'tool.result', runId, actor, payload: { ok: true, linesChanged: 14 }, at: new Date().toISOString() });
  await SLEEP(200);
  log.append({
    type: 'run.done',
    runId,
    actor,
    payload: { costUsd: Number(cost.toFixed(4)), outputTokens: 1480 },
    at: new Date().toISOString(),
  });

  return NextResponse.json({ runId, lastSeq: log.lastSeq });
}
