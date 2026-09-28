'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { isWorkspace, seedWorkspace, type Workspace, ME } from '@/lib/demo/seed';
import { register } from '@/lib/policy/register';
import { PRESETS, select, type PresetName } from '@/lib/router/select';
import { HEADROOM_MARGIN_TOKENS, fillFraction } from '@/lib/router/headroom';
import { costUsd } from '@/lib/meter/price-book';
import { compact, entriesFor, positionsWithCarried } from '@/lib/meter/ledger';
import { admit, burnUsdPerHour, periodEnd, spendInPeriod } from '@/lib/meter/budget';
import type { Candidate, CapacitySource, Run, Usage, UsageEvent, WorkKind } from '@/lib/types';
import type { PreloadItem } from '@/lib/preload/schedule';
import { pickRung, promotionAvailable, tierRank, type LadderContext, type Tier } from '@/lib/ladder/rungs';
import { reconcileIdeas, type Idea } from '@/lib/orchestrate/triage';

const KEY = 'tidepool.workspace.v1';

/** Stored history bounds. Usage is compacted without changing any balance;
 *  runs are a display list, windowed on screen, so the cap can be generous. */
const KEEP_EVENTS = 400;
const RUN_CAP = 320;

interface Ctx {
  ws: Workspace;
  /** False until localStorage has been read. Pages show skeletons until then,
   *  which is also what stops a flash of seeded content on first paint. */
  hydrated: boolean;
  now: number;
  candidates: Candidate[];
  streamingSourceIds: Set<string>;
  /** Spend inside the pool's budget period — not all time. */
  spentTodayUsd: number;
  budgetRemainingUsd: number | null;
  /** USD/hour over the trailing hour. */
  burnUsdPerHour: number;
  /** When the current budget period ends, for the "resets at" copy. */
  budgetResetsAt: number | null;
  update: (fn: (w: Workspace) => Workspace) => void;
  startRun: (opts: {
    title: string;
    kind: WorkKind;
    estimatedTokens: number;
    model?: string;
    preloadItemId?: string;
    targetTier?: Tier;
    reworkOfRunId?: string;
  }) => string | null;
  /** Why the most recent startRun() returned null, for a caller that wants to
   *  tell the person rather than pointing them at another page. */
  lastRefusal: () => string | null;
  ladderCtx: LadderContext;
  reworkQueue: Run[];
  runRework: (run: Run) => void;
  upsertIdea: (i: Idea) => void;
  removeIdea: (id: string) => void;
  reseed: () => void;
  /** §14.8 state 5, on demand: forty sources, twelve members, three hundred runs. */
  saturate: () => void;
  addSource: (s: CapacitySource) => void;
  revokeSource: (id: string) => void;
  setPreset: (p: PresetName) => void;
  upsertPreload: (item: PreloadItem) => void;
  removePreload: (id: string) => void;
}

const WorkspaceCtx = createContext<Ctx | null>(null);

let seq = 0;
const nextId = (p: string) => `${p}_${Date.now().toString(36)}${(seq++).toString(36)}`;

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const [ws, setWs] = useState<Workspace>(() => seedWorkspace(Date.parse('2026-09-06T09:00:00Z')));
  const [hydrated, setHydrated] = useState(false);
  const [now, setNow] = useState(() => Date.parse('2026-09-06T09:00:00Z'));

  // Hydrate after mount so server and client render identically on first paint.
  useEffect(() => {
    const t = Date.now();
    let restored: Workspace | null = null;
    try {
      const raw = window.localStorage.getItem(KEY);
      const parsed: unknown = raw ? JSON.parse(raw) : null;
      // A workspace saved by an older build has an older shape, and rendering
      // against it is a white screen rather than a degraded page. Validate, and
      // start fresh when it does not match.
      restored = isWorkspace(parsed) ? parsed : null;
      if (raw && !restored) window.localStorage.removeItem(KEY);
    } catch {
      restored = null;
    }
    setWs(restored ?? seedWorkspace(t));
    setNow(t);
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(KEY, JSON.stringify(ws));
    } catch {
      /* private mode, quota, blocked site data — the app still works */
    }
  }, [ws, hydrated]);

  // One clock for the whole tree. Headroom interpolation is a pure function of it.
  useEffect(() => {
    if (!hydrated) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [hydrated]);

  const update = useCallback((fn: (w: Workspace) => Workspace) => setWs((w) => fn(w)), []);

  // An idea's status follows its run wherever the run ends — the engine, an
  // abort, a reset — rather than depending on the orchestrate page being open.
  useEffect(() => {
    if (!hydrated) return;
    setWs((w) => {
      const ideas = reconcileIdeas(w.ideas, w.runs);
      return ideas === w.ideas ? w : { ...w, ideas };
    });
  }, [ws.runs, hydrated]);

  const candidates = useMemo<Candidate[]>(
    () =>
      ws.sources.map((source, i) => ({
        source,
        headroom: ws.headroom[source.id] ?? null,
        estCostUsd: costUsd(
          { inputTokens: 20_000, outputTokens: 2_000, cacheWriteTokens: 0, cacheReadTokens: 0, reasoningTokens: 0, gpuSeconds: 0 },
          `${source.provider}:workhorse`,
        ),
        observedLatencyMs: [640, 810, 1200, 320, 900][i % 5],
        recentErrorRate: source.status === 'exhausted' ? 1 : [0.01, 0.03, 0.2, 0, 0.02][i % 5],
      })),
    [ws.sources, ws.headroom],
  );

  const sessionStart = useMemo(() => Date.parse(ws.seededAt), [ws.seededAt]);

  const spentTodayUsd = useMemo(
    () => spendInPeriod(ws.usage, ws.pool.budgetPeriod, now, sessionStart),
    [ws.usage, ws.pool.budgetPeriod, now, sessionStart],
  );
  const budgetRemainingUsd =
    ws.pool.budgetCapUsd === null ? null : Math.max(0, ws.pool.budgetCapUsd - spentTodayUsd);
  const burn = useMemo(() => burnUsdPerHour(ws.usage, now), [ws.usage, now]);
  const budgetResetsAt = periodEnd(ws.pool.budgetPeriod, now, sessionStart);

  const streaming = useMemo(
    () => new Set(ws.runs.filter((r) => r.state === 'streaming').map((r) => r.sourceId!).filter(Boolean)),
    [ws.runs],
  );

  const ladderCtx = useMemo<LadderContext>(
    () => ({ now, candidates, minFill: 0.05, estimatedTokens: 20_000 }),
    [now, candidates],
  );

  // Work that ran below its target tier and is waiting for the tide to come back
  // in. A stall becomes a quality dip that repairs itself.
  const reworkQueue = useMemo(
    () =>
      ws.runs.filter(
        (r) =>
          r.needsRework &&
          r.state === 'done' &&
          !ws.runs.some((x) => x.reworkOfRunId === r.id) &&
          promotionAvailable((r.targetTier ?? 'frontier') as Tier, ws.rungs, ladderCtx) !== null,
      ),
    [ws.runs, ws.rungs, ladderCtx],
  );

  // ---- the run engine ------------------------------------------------------
  // Stands in for the gateway: it walks the same state machine, drains the same
  // headroom and writes the same usage + double-entry pair, so every number on
  // screen comes from the real metering code rather than from a mock.

  /** Latest workspace, readable synchronously. startRun used to close over the
   *  render-time `ws`, so anything fired from a timer or twice in one tick
   *  decided against state that was already out of date. */
  const wsRef = useRef(ws);
  wsRef.current = ws;

  /**
   * In-flight runs and what each still holds in reserve.
   *
   * §6.3's reserve step, which the first engine skipped: a burst of five batch
   * runs all read the same full basin and all picked it, because headroom only
   * fell as tokens streamed. Each run now reserves its estimate the moment it is
   * dispatched — synchronously, so two clicks in one tick cannot both see the
   * same headroom — and gives back whatever it did not use at metering.
   */
  const inflight = useRef(
    new Map<string, { sourceId: string; reserved: number; drawn: number; timers: number[]; kind: WorkKind; model: string; ownerUserId: string; provider: string }>(),
  );
  const reservedOn = (sourceId: string) => {
    let t = 0;
    for (const f of inflight.current.values()) if (f.sourceId === sourceId) t += f.reserved;
    return t;
  };

  const refusal = useRef<string | null>(null);

  const cancelAll = () => {
    for (const f of inflight.current.values()) f.timers.forEach((t) => window.clearTimeout(t));
    inflight.current.clear();
  };
  useEffect(() => () => cancelAll(), []);

  /** Write a usage event and its ledger pair, then compact. One code path for
   *  finished and aborted runs alike, so an abort cannot skip the ledger. */
  const meter = (w: Workspace, runId: string, f: { sourceId: string; ownerUserId: string; provider: string; model: string }, usage: Usage, estimated: boolean): { w: Workspace; cost: number } => {
    const cost = costUsd(usage, f.model);
    const eventId = nextId('ue');
    const event: UsageEvent = {
      ...usage, id: eventId, runId, sourceId: f.sourceId, poolId: w.pool.id,
      consumerUserId: ME, contributorUserId: f.ownerUserId,
      provider: f.provider, model: f.model, priceBookVersion: 'unseeded-synthetic',
      costUsd: cost, estimated, createdAt: new Date().toISOString(),
    };
    const packed = compact(
      [event, ...w.usage],
      [...entriesFor(event, (x) => `${eventId}_${x}`), ...w.ledger],
      w.carried ?? {},
      KEEP_EVENTS,
    );
    return { w: { ...w, usage: packed.usage, ledger: packed.ledger, carried: packed.carried }, cost };
  };

  /**
   * §9.2. A stream that dies mid-flight still consumed tokens, and the provider
   * bills for them — so an aborted run writes an estimated usage event for what
   * it drew, rather than vanishing. Used when a source is revoked mid-run.
   */
  const abortRun = (runId: string, reason: string) => {
    const f = inflight.current.get(runId);
    if (!f) return;
    f.timers.forEach((t) => window.clearTimeout(t));
    inflight.current.delete(runId);
    update((w) => {
      let next = w;
      let cost = 0;
      if (f.drawn > 0) {
        const r = meter(w, runId, f, usageFor(f.drawn, f.kind), true);
        next = r.w;
        cost = r.cost;
      }
      return {
        ...next,
        runs: next.runs.map((r) =>
          r.id === runId
            ? { ...r, state: 'failed', errorCode: reason, costUsd: cost, finishedAt: new Date().toISOString() }
            : r,
        ),
      };
    });
  };

  const startRun = useCallback<Ctx['startRun']>(
    (opts) => {
      const at = Date.now();
      const w0 = wsRef.current;
      const runId = nextId('run');
      const usageEstimate = usageFor(opts.estimatedTokens, opts.kind);

      // Candidates as they stand *after* everything already in flight — and
      // costed for this run, not for a fixed 20k-token exchange.
      const live = w0.sources.map((source, i) => {
        const h = w0.headroom[source.id] ?? null;
        return {
          source,
          headroom: h ? { ...h, tokens: Math.max(0, h.tokens - reservedOn(source.id)) } : null,
          estCostUsd: costUsd(usageEstimate, modelFor(source)),
          observedLatencyMs: [640, 810, 1200, 320, 900][i % 5],
          recentErrorRate: source.status === 'exhausted' ? 1 : [0.01, 0.03, 0.2, 0, 0.02][i % 5],
        };
      });

      const fail = (reason: string) => {
        refusal.current = reason;
        update((w) => ({
          ...w,
          runs: [
            {
              id: runId, poolId: w.pool.id, title: opts.title, requestedBy: ME, attributedTo: ME,
              state: 'failed' as const, sourceId: null, kind: opts.kind, attempt: 1, maxAttempts: 3,
              errorCode: reason, costUsd: 0, outputTokens: 0, estimatedTokens: opts.estimatedTokens,
              createdAt: new Date(at).toISOString(), finishedAt: new Date(at).toISOString(),
              preloadItemId: opts.preloadItemId,
            },
            ...w.runs,
          ].slice(0, RUN_CAP),
        }));
        return null;
      };

      // ---- admit (§8.5) ------------------------------------------------------
      const active = live.filter((c) => c.source.status === 'active' || c.source.status === 'cooling');
      const priced = active.filter((c) => c.estCostUsd > 0);
      const freeAvailable = active.some((c) => c.estCostUsd === 0 && c.source.cls !== 'C');
      const spent = spendInPeriod(w0.usage, w0.pool.budgetPeriod, at, Date.parse(w0.seededAt));
      const admission = admit({
        capUsd: w0.pool.budgetCapUsd,
        spentUsd: spent,
        // Estimating high is correct: the dearest source this run could land on.
        estCostUsd: priced.length ? Math.max(...priced.map((c) => c.estCostUsd)) : 0,
        period: w0.pool.budgetPeriod,
        resetsAt: periodEnd(w0.pool.budgetPeriod, at, Date.parse(w0.seededAt)),
        freeAvailable,
      });
      if (!admission.ok) return fail(admission.message);
      const budgetSpent = admission.remainingUsd !== null && priced.every((c) => c.estCostUsd > admission.remainingUsd!);
      const eligible = budgetSpent ? live.filter((c) => c.estCostUsd === 0) : live;

      // ---- resolve + select ---------------------------------------------------
      const pos = positionsWithCarried(w0.ledger, w0.users.map((u) => u.id), w0.carried);
      const target: Tier = opts.targetTier ?? 'strong';
      const rung = pickRung(target, w0.rungs, {
        now: at,
        candidates: eligible,
        minFill: 0.03,
        estimatedTokens: opts.estimatedTokens,
      });

      const sel = select(
        {
          id: nextId('work'),
          model: opts.model ?? '*',
          kind: opts.kind,
          estimatedTokens: opts.estimatedTokens,
          attributedUserId: ME,
          poolId: w0.pool.id,
        },
        eligible,
        {
          now: at,
          poolId: w0.pool.id,
          consumerUserId: ME,
          excludedSourceIds: new Set(),
          headroomMarginTokens: HEADROOM_MARGIN_TOKENS,
          costSensitivity: 40,
          contributionUsd: new Map(pos.map((p) => [p.userId, p.contributedUsd])),
          consumptionUsd: new Map(pos.map((p) => [p.userId, p.consumedUsd])),
          poolNetSpreadUsd: Math.max(1, Math.max(...pos.map((p) => Math.abs(p.netUsd)), 1) * 2),
          w: PRESETS[(w0.preset as PresetName) in PRESETS ? (w0.preset as PresetName) : 'Balanced'],
          policies: register,
          // admit() has already decided the budget, with this run's own estimate.
          budgetRemainingUsd: null,
          memberCapRemainingUsd: null,
          // Prefer the source the ladder landed on, so the rung and the basin
          // agree about where the work actually went.
          stickySourceId: rung.kind === 'picked' ? rung.sourceId : null,
        },
      );

      if (sel.kind === 'no_capacity') return fail(rung.kind === 'stalled' ? rung.reason : sel.reason);
      refusal.current = null;

      // ---- reserve (§6.3) ------------------------------------------------------
      const source = sel.source;
      const model = modelFor(source);
      const flight = {
        sourceId: source.id, reserved: opts.estimatedTokens, drawn: 0, timers: [] as number[],
        kind: opts.kind, model, ownerUserId: source.ownerUserId, provider: source.provider,
      };
      inflight.current.set(runId, flight);

      const run: Run = {
        id: runId, poolId: w0.pool.id, title: opts.title, requestedBy: ME, attributedTo: ME,
        state: 'streaming', sourceId: source.id, kind: opts.kind, attempt: 1, maxAttempts: 3,
        errorCode: null, costUsd: 0, outputTokens: 0, estimatedTokens: opts.estimatedTokens,
        createdAt: new Date(at).toISOString(), finishedAt: null, preloadItemId: opts.preloadItemId,
        rungId: rung.kind === 'picked' ? rung.rung.id : undefined,
        rungName: rung.kind === 'picked' ? rung.rung.name : undefined,
        targetTier: target,
        ranTier: rung.kind === 'picked' ? rung.rung.tier : undefined,
        needsRework: rung.kind === 'picked' ? rung.degraded : false,
        reworkOfRunId: opts.reworkOfRunId,
        notice: admission.warning ?? undefined,
      };
      update((w) => ({ ...w, runs: [run, ...w.runs].slice(0, RUN_CAP) }));

      // ---- execute: stream in ticks, draining the basin as it goes -----------
      const ticks = 8;
      const perTick = Math.round(opts.estimatedTokens / ticks);
      for (let i = 1; i <= ticks; i += 1) {
        flight.timers.push(
          window.setTimeout(() => {
            flight.drawn += perTick;
            flight.reserved = Math.max(0, flight.reserved - perTick);
            update((w) => {
              const h = w.headroom[source.id];
              return {
                ...w,
                headroom: h
                  ? { ...w.headroom, [source.id]: { ...h, tokens: Math.max(0, h.tokens - perTick), observedAt: new Date().toISOString() } }
                  : w.headroom,
                runs: w.runs.map((r) =>
                  r.id === runId
                    ? { ...r, outputTokens: r.outputTokens + Math.round(perTick * 0.45), costUsd: costUsd(usageFor(perTick * i, opts.kind), model) }
                    : r,
                ),
              };
            });
          }, i * 220),
        );
      }

      // ---- meter: a real state, not a callback (§7.4) --------------------------
      // A run cannot reach done without passing through metering, which is what
      // makes "no run completes without a usage record" structural.
      flight.timers.push(
        window.setTimeout(() => {
          update((w) => ({ ...w, runs: w.runs.map((r) => (r.id === runId ? { ...r, state: 'metering' } : r)) }));
        }, (ticks + 1) * 220),
      );
      flight.timers.push(
        window.setTimeout(() => {
          inflight.current.delete(runId); // releases whatever reservation is left
          update((w) => {
            const { w: metered, cost } = meter(w, runId, flight, usageFor(opts.estimatedTokens, opts.kind), false);
            return {
              ...metered,
              runs: metered.runs.map((r) =>
                r.id === runId
                  ? { ...r, state: 'done', costUsd: cost, outputTokens: usageFor(opts.estimatedTokens, opts.kind).outputTokens, finishedAt: new Date().toISOString() }
                  : r,
              ),
            };
          });
        }, (ticks + 1) * 220 + 420),
      );

      return runId;
    },
    [update],
  );

  const value: Ctx = {
    ws, hydrated, now, candidates, streamingSourceIds: streaming, spentTodayUsd, budgetRemainingUsd,
    burnUsdPerHour: burn, budgetResetsAt, update, startRun,
    lastRefusal: () => refusal.current,
    ladderCtx,
    reworkQueue,
    runRework: (run) => {
      startRun({
        title: `Rework: ${run.title.replace(/^Rework: /, '')}`,
        kind: 'bulk',
        estimatedTokens: Math.round(run.estimatedTokens * 0.7),
        targetTier: (run.targetTier ?? 'frontier') as Tier,
        reworkOfRunId: run.id,
      });
    },
    upsertIdea: (i) =>
      update((w) => ({
        ...w,
        ideas: w.ideas.some((x) => x.id === i.id) ? w.ideas.map((x) => (x.id === i.id ? i : x)) : [...w.ideas, i],
      })),
    removeIdea: (id) => update((w) => ({ ...w, ideas: w.ideas.filter((i) => i.id !== id) })),
    // Replacing the workspace under running timers used to let them land in the
    // new one: headroom drained from a source with the same id, and usage events
    // written for runs that no longer existed.
    reseed: () => {
      cancelAll();
      setWs(seedWorkspace(Date.now()));
    },
    // Loaded on demand: three hundred generated runs for one demo button have
    // no business in the chunk every route downloads.
    saturate: () => {
      cancelAll();
      void import('@/lib/demo/saturated').then(({ seedSaturated }) => setWs(seedSaturated(Date.now())));
    },
    addSource: (s) =>
      update((w) => ({
        ...w,
        sources: [...w.sources, s],
        headroom: {
          ...w.headroom,
          [s.id]:
            s.cls === 'B'
              ? null
              : {
                  tokens: 1_000_000, limitTokens: 1_000_000,
                  resetAt: new Date(Date.now() + 3_600_000).toISOString(),
                  observedAt: new Date().toISOString(),
                  requestsRemaining: 1000, consecutive429: 0, coolingUntil: null,
                },
        },
      })),
    revokeSource: (id) => {
      // Anything streaming against it stops now, and what it already drew is
      // metered as an estimate rather than lost.
      for (const [runId, f] of inflight.current) {
        if (f.sourceId === id) abortRun(runId, 'The source was revoked mid-run. What it had already drawn is metered as an estimate.');
      }
      update((w) => ({ ...w, sources: w.sources.map((s) => (s.id === id ? { ...s, status: 'revoked', contributedToPool: null } : s)) }));
    },
    setPreset: (p) => update((w) => ({ ...w, preset: p })),
    upsertPreload: (item) =>
      update((w) => ({
        ...w,
        preload: w.preload.some((p) => p.id === item.id)
          ? w.preload.map((p) => (p.id === item.id ? item : p))
          : [...w.preload, item],
      })),
    removePreload: (id) => update((w) => ({ ...w, preload: w.preload.filter((p) => p.id !== id) })),
  };

  return <WorkspaceCtx.Provider value={value}>{children}</WorkspaceCtx.Provider>;
}

function modelFor(s: CapacitySource): string {
  return s.cls === 'B' ? 'ollama:local' : `${s.provider}:workhorse`;
}

function usageFor(total: number, kind: WorkKind): Usage {
  return {
    inputTokens: Math.round(total * (kind === 'bulk' ? 0.6 : 0.7)),
    outputTokens: Math.round(total * (kind === 'bulk' ? 0.4 : 0.3)),
    cacheWriteTokens: 0,
    cacheReadTokens: 0,
    reasoningTokens: 0,
    gpuSeconds: 0,
  };
}

export function useWorkspace(): Ctx {
  const c = useContext(WorkspaceCtx);
  if (!c) throw new Error('useWorkspace must be used inside WorkspaceProvider');
  return c;
}

export { ME, fillFraction, nextId };
