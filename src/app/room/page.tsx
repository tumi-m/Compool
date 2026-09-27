'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useWorkspace, ME } from '@/components/WorkspaceProvider';
import { Flow, type StageId } from '@/components/motion/Flow';
import { CapacityField } from '@/components/motion/CapacityField';
import { TaskGraph } from '@/components/TaskGraph';
import { Odometer } from '@/components/motion/Odometer';
import { Sparkline } from '@/components/motion/Sparkline';
import { claim, complete, release, settleStates, progress, type Task } from '@/lib/room/graph';
import type { RoomEvent } from '@/lib/room/events';
import { clockAt, usd } from '@/lib/format';

const ROOM_ID = 'harbour';

const SEED_TASKS: Task[] = settleStates([
  { id: 't1', title: 'Record SSE fixtures', blockedBy: [], state: 'ready', claimedBy: null, attempt: 0, maxAttempts: 3, estimatedTokens: 60_000, costUsd: 0 },
  { id: 't2', title: 'Adapter interface', blockedBy: [], state: 'ready', claimedBy: null, attempt: 0, maxAttempts: 3, estimatedTokens: 140_000, costUsd: 0 },
  { id: 't3', title: 'Failover run events', blockedBy: ['t2'], state: 'blocked', claimedBy: null, attempt: 0, maxAttempts: 3, estimatedTokens: 90_000, costUsd: 0 },
  { id: 't4', title: 'Reconciliation job', blockedBy: ['t1'], state: 'blocked', claimedBy: null, attempt: 0, maxAttempts: 3, estimatedTokens: 120_000, costUsd: 0 },
  { id: 't5', title: 'Ledger invariant check', blockedBy: ['t3', 't4'], state: 'blocked', claimedBy: null, attempt: 0, maxAttempts: 3, estimatedTokens: 40_000, costUsd: 0 },
]);

/** Which pipeline stage an event type implies. Drives the Flow diagram. */
const STAGE_OF: Partial<Record<RoomEvent['type'], StageId>> = {
  'run.queued': 'admit',
  'run.routing': 'select',
  'run.source_selected': 'reserve',
  'text.delta': 'execute',
  'reasoning.delta': 'execute',
  'tool.call': 'execute',
  'tool.result': 'execute',
  'cost.tick': 'meter',
  'run.done': 'post',
};

type Conn = 'connecting' | 'live' | 'replaying' | 'dropped';

export default function RoomPage() {
  const { ws, now, streamingSourceIds } = useWorkspace();
  const [events, setEvents] = useState<RoomEvent[]>([]);
  const [conn, setConn] = useState<Conn>('connecting');
  const [tasks, setTasks] = useState<Task[]>(SEED_TASKS);
  const [busy, setBusy] = useState(false);
  const lastSeq = useRef(0);
  const esRef = useRef<EventSource | null>(null);

  // ---- the stream ----------------------------------------------------------
  const connect = useCallback(() => {
    esRef.current?.close();
    setConn(lastSeq.current > 0 ? 'replaying' : 'connecting');
    // EventSource cannot set headers, so the resume point rides as a query param.
    const es = new EventSource(`/api/rooms/${ROOM_ID}/stream?lastEventId=${lastSeq.current}`);
    esRef.current = es;

    es.onopen = () => setConn('live');
    es.onerror = () => setConn('dropped'); // EventSource retries on its own

    const onAny = (ev: MessageEvent) => {
      try {
        const parsed = JSON.parse(ev.data) as RoomEvent;
        // seq is monotonic, so a duplicate replay is dropped rather than shown
        // twice. No gaps and no duplicates is the whole contract.
        if (parsed.seq <= lastSeq.current) return;
        lastSeq.current = parsed.seq;
        setConn('live');
        setEvents((prev) => [...prev.slice(-199), parsed]);
      } catch {
        /* a frame we cannot parse is dropped, never rendered */
      }
    };

    // Named events, plus the default channel for anything unnamed.
    for (const t of ['run.queued', 'run.routing', 'run.source_selected', 'run.retry', 'text.delta', 'reasoning.delta', 'tool.call', 'tool.result', 'file.diff', 'cost.tick', 'headroom.tick', 'run.error', 'run.done', 'member.join', 'member.leave', 'task.created', 'task.claimed', 'task.done']) {
      es.addEventListener(t, onAny as EventListener);
    }
    es.onmessage = onAny;
  }, []);

  useEffect(() => {
    connect();
    return () => esRef.current?.close();
  }, [connect]);

  const publish = useCallback(async (body: unknown) => {
    try {
      await fetch(`/api/rooms/${ROOM_ID}/events`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
    } catch {
      /* the stream is the source of truth; a dropped publish shows as a gap */
    }
  }, []);

  // Announce presence once the stream is up.
  const announced = useRef(false);
  useEffect(() => {
    if (conn !== 'live' || announced.current) return;
    announced.current = true;
    void publish({ type: 'member.join', actor: ME, payload: { handle: 'you' } });
  }, [conn, publish]);

  // ---- derived -------------------------------------------------------------
  const text = useMemo(
    () => events.filter((e) => e.type === 'text.delta').map((e) => String(e.payload.text ?? '')).join(''),
    [events],
  );
  const costSeries = useMemo(
    () => events.filter((e) => e.type === 'cost.tick').map((e) => Number(e.payload.costUsd ?? 0)),
    [events],
  );
  const liveCost = costSeries.length ? costSeries[costSeries.length - 1] : 0;
  const lastStageEvent = [...events].reverse().find((e) => STAGE_OF[e.type]);
  const stage = lastStageEvent ? (STAGE_OF[lastStageEvent.type] ?? null) : null;
  const streaming = events.length > 0 && events[events.length - 1]?.type !== 'run.done';
  const present = useMemo(() => {
    const joined = new Set(events.filter((e) => e.type === 'member.join').map((e) => e.actor ?? ''));
    const active = new Set(events.filter((e) => e.actor).map((e) => e.actor!));
    return [...new Set([...joined, ...active, ME])].filter(Boolean);
  }, [events]);
  const prog = progress(tasks);

  // ---- actions -------------------------------------------------------------
  const teammateRuns = async () => {
    setBusy(true);
    try {
      await fetch(`/api/rooms/${ROOM_ID}/simulate?actor=user_ada`, { method: 'POST' });
    } finally {
      setBusy(false);
    }
  };

  const onClaim = (id: string) => {
    const t = tasks.find((x) => x.id === id);
    if (!t) return;
    if (t.state === 'claimed' && t.claimedBy === ME) {
      setTasks(complete(tasks, id, 0.04));
      void publish({ type: 'task.done', actor: ME, payload: { taskId: id, title: t.title } });
      return;
    }
    if (t.claimedBy && t.claimedBy !== ME) {
      setTasks(release(tasks, id));
      return;
    }
    const res = claim(tasks, id, ME);
    if (!res.ok) return;
    setTasks(res.tasks);
    void publish({ type: 'task.claimed', actor: ME, payload: { taskId: id, title: t.title } });
  };

  const dropAndResume = () => {
    // Exactly what a tunnel closing looks like. The next connect replays the gap
    // from the last seq this client actually saw.
    esRef.current?.close();
    setConn('dropped');
    window.setTimeout(connect, 900);
  };

  return (
    <div className="stackv" style={{ gap: 18 }}>
      <div className="heroBand">
        <CapacityField
          sources={ws.sources.filter((s) => s.status !== 'revoked')}
          headroom={ws.headroom}
          streaming={streamingSourceIds}
          height={168}
        />
        <div className="heroInner">
          <div className="spread">
            <div>
              <h1>{ws.pool.name} · room</h1>
              <p style={{ marginBottom: 0 }}>
                A run is a first-class shared object. Anyone here can watch it live, see what it costs as it
                costs it, or pick it up if the person who started it went to bed.
              </p>
            </div>
            <div className="heroStats">
              <div className="heroStat">
                <div className="sectionLabel">Present</div>
                <div className="num" style={{ fontSize: 25 }}>{present.length}</div>
              </div>
              <div className="heroStat">
                <div className="sectionLabel">Events</div>
                <div className="num" style={{ fontSize: 25 }}>{events.length}</div>
              </div>
              <div className="heroStat">
                <div className="sectionLabel">Connection</div>
                <div className="row" style={{ gap: 8 }}>
                  <Presence ids={present} />
                  <span className={`badge ${conn === 'live' ? 'water' : conn === 'dropped' ? 'coral' : 'shallow'}`}>
                    {conn === 'live' ? 'streaming' : conn}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="panel">
        <Flow active={streaming && events.length > 0 ? 1 : 0} activeStage={stage} />
      </div>

      <div className="grid cols2">
        <section className="panel stackv">
          <div className="spread">
            <div>
              <div className="sectionLabel">Cost, as it happens</div>
              <div className="bigNum">
                <Odometer value={liveCost} decimals={4} prefix="$" ariaLabel={`Live cost ${usd(liveCost, 4)}`} />
              </div>
            </div>
            <div style={{ alignSelf: 'flex-end' }}>
              <Sparkline points={costSeries.length > 1 ? costSeries : [0, 0]} width={150} height={34} label="Cost over this run" />
            </div>
          </div>
          <div className="hint">
            Ticks are throttled to two a second at the fan-out, and text deltas coalesce to thirty. A room with
            six agents must not push four hundred events a second at a phone.
          </div>
          <div className="row">
            <button type="button" className="primary" onClick={teammateRuns} disabled={busy}>
              {busy ? 'Ada is working…' : 'Have a teammate run something'}
            </button>
            <button type="button" onClick={dropAndResume}>Drop the connection</button>
          </div>
          <div className="hint">
            Dropping it proves the contract: the client reconnects on its own, sends the last sequence number it
            actually saw, and the server replays exactly the gap — no gaps, no duplicates.
          </div>
        </section>

        <section className="panel stackv">
          <div className="spread">
            <h2>Output</h2>
            <span className="badge">{events.length} events · seq {lastSeq.current}</span>
          </div>
          <div style={{ minHeight: 132, fontSize: 13, lineHeight: 1.6 }}>
            {text ? (
              <>
                {text}
                {streaming ? <span className="caret" aria-hidden="true" /> : null}
              </>
            ) : (
              <span className="hint">
                Nothing streaming. Start a run, or have a teammate start one — both land in the same log.
              </span>
            )}
          </div>
        </section>
      </div>

      <section className="panel">
        <div className="spread">
          <h2>Task graph</h2>
          <div className="row">
            <span className="badge">{prog.done} / {prog.total} done</span>
            <div className="meterBar" style={{ width: 120 }}>
              <span style={{ width: `${prog.fraction * 100}%` }} />
            </div>
          </div>
        </div>
        <p className="hint" style={{ marginTop: 6 }}>
          Not a transcript — an explicit DAG. Independent tasks dispatch concurrently and the topological order
          is the execution plan. Click to claim, click again to finish. Claiming is what stops two people doing
          the same thing at 2am, which is the actual failure mode of a hackathon.
        </p>
        <TaskGraph tasks={tasks} onClaim={onClaim} me={ME} />
      </section>

      <section className="panel">
        <div className="spread">
          <h2>Event log</h2>
          <span className="hint">append-only · the source of truth for replay</span>
        </div>
        <div style={{ maxHeight: 300, overflowY: 'auto', marginTop: 6 }}>
          {events.length === 0 ? (
            <p className="hint">Waiting for the first event.</p>
          ) : (
            [...events].reverse().slice(0, 60).map((e) => (
              <div className="eventRow" key={e.seq}>
                <span className="eventSeq">#{String(e.seq).padStart(3, '0')}</span>
                <span>
                  <span className="eventKind" data-k={e.type}>{e.type}</span>{' '}
                  <span className="muted small">{summarise(e)}</span>
                </span>
                <span className="eventSeq">{clockAt(Date.parse(e.at))}</span>
              </div>
            ))
          )}
        </div>
      </section>

      <div className="notice">
        <strong>This room is per-instance.</strong> The log lives in the serverless instance that served your
        stream, which is enough to demonstrate and test the transport contract — sequence numbers, replay,
        heartbeat, throttling — and not enough to fan out across instances. The production shape is Postgres for
        the append-only record plus one Redis channel per room; <code>src/lib/room/registry.ts</code> is the only
        file that changes. <Link href="/docs">How the rest of it fits →</Link>
      </div>
    </div>
  );
}

function summarise(e: RoomEvent): string {
  const p = e.payload;
  switch (e.type) {
    case 'run.source_selected': return `${p.source ?? ''} · ${p.rung ?? ''}`;
    case 'cost.tick': return usd(Number(p.costUsd ?? 0), 4);
    case 'headroom.tick': return `${Math.round(Number(p.fraction ?? 0) * 100)}% left`;
    case 'text.delta': return `${String(p.text ?? '').slice(0, 44)}…`;
    case 'tool.call': return `${p.name ?? ''} ${p.path ?? ''}`;
    case 'tool.result': return p.ok ? `ok · ${p.linesChanged ?? 0} lines` : 'failed';
    case 'run.done': return `${usd(Number(p.costUsd ?? 0), 4)} · ${p.outputTokens ?? 0} out`;
    case 'task.claimed':
    case 'task.done': return String(p.title ?? p.taskId ?? '');
    case 'member.join': return `${e.actor === 'user_me' ? 'you' : e.actor} joined`;
    default: return e.actor ? String(e.actor).replace('user_', '') : '';
  }
}

function Presence({ ids }: { ids: string[] }) {
  return (
    <div className="presence" aria-label={`${ids.length} people in the room`}>
      {ids.slice(0, 5).map((id) => (
        <span key={id} className="avatar" data-live="true" title={id.replace('user_', '')} style={{ position: 'relative' }}>
          {(id === ME ? 'you' : id.replace('user_', ''))[0]?.toUpperCase()}
        </span>
      ))}
    </div>
  );
}
