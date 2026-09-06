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
import { seedWorkspace, type Workspace, ME } from '@/lib/demo/seed';
import { register } from '@/lib/policy/register';
import { PRESETS, select, type PresetName } from '@/lib/router/select';
import { HEADROOM_MARGIN_TOKENS, fillFraction } from '@/lib/router/headroom';
import { costUsd } from '@/lib/meter/price-book';
import { entriesFor, positions } from '@/lib/meter/ledger';
import type { Candidate, CapacitySource, Run, Usage, UsageEvent, WorkKind } from '@/lib/types';
import type { PreloadItem } from '@/lib/preload/schedule';

const KEY = 'tidepool.workspace.v1';

interface Ctx {
  ws: Workspace;
  now: number;
  candidates: Candidate[];
  streamingSourceIds: Set<string>;
  spentTodayUsd: number;
  budgetRemainingUsd: number | null;
  update: (fn: (w: Workspace) => Workspace) => void;
  startRun: (opts: { title: string; kind: WorkKind; estimatedTokens: number; model?: string; preloadItemId?: string }) => string | null;
  reseed: () => void;
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
      if (raw) restored = JSON.parse(raw) as Workspace;
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

  const spentTodayUsd = useMemo(
    () => ws.usage.reduce((a, u) => a + u.costUsd, 0),
    [ws.usage],
  );

  const budgetRemainingUsd =
    ws.pool.budgetCapUsd === null ? null : Math.max(0, ws.pool.budgetCapUsd - spentTodayUsd);

  const streaming = useMemo(
    () => new Set(ws.runs.filter((r) => r.state === 'streaming').map((r) => r.sourceId!).filter(Boolean)),
    [ws.runs],
  );

  // ---- the run engine ------------------------------------------------------
  // Stands in for the gateway: it walks the same state machine, drains the same
  // headroom and writes the same usage + double-entry pair, so every number on
  // screen comes from the real metering code rather than from a mock.
  const timers = useRef<number[]>([]);
  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);

  const startRun = useCallback<Ctx['startRun']>(
    (opts) => {
      const at = Date.now();
      const pos = positions(ws.ledger, ws.users.map((u) => u.id));
      const contribution = new Map(pos.map((p) => [p.userId, p.contributedUsd]));
      const consumption = new Map(pos.map((p) => [p.userId, p.consumedUsd]));
      const spread = Math.max(1, Math.max(...pos.map((p) => Math.abs(p.netUsd)), 1) * 2);

      const sel = select(
        {
          id: nextId('work'),
          model: opts.model ?? '*',
          kind: opts.kind,
          estimatedTokens: opts.estimatedTokens,
          attributedUserId: ME,
          poolId: ws.pool.id,
        },
        candidates,
        {
          now: at,
          poolId: ws.pool.id,
          consumerUserId: ME,
          excludedSourceIds: new Set(),
          headroomMarginTokens: HEADROOM_MARGIN_TOKENS,
          costSensitivity: 40,
          stickySourceId: ws.runs.find((r) => r.state === 'done')?.sourceId ?? null,
          contributionUsd: contribution,
          consumptionUsd: consumption,
          poolNetSpreadUsd: spread,
          w: PRESETS[(ws.preset as PresetName) in PRESETS ? (ws.preset as PresetName) : 'Balanced'],
          policies: register,
          budgetRemainingUsd,
          memberCapRemainingUsd: null,
        },
      );

      const runId = nextId('run');
      if (sel.kind === 'no_capacity') {
        update((w) => ({
          ...w,
          runs: [
            {
              id: runId, poolId: w.pool.id, title: opts.title, requestedBy: ME, attributedTo: ME,
              state: 'failed' as const, sourceId: null, kind: opts.kind, attempt: 1, maxAttempts: 3,
              errorCode: sel.reason, costUsd: 0, outputTokens: 0, estimatedTokens: opts.estimatedTokens,
              createdAt: new Date(at).toISOString(), finishedAt: new Date(at).toISOString(),
              preloadItemId: opts.preloadItemId,
            },
            ...w.runs,
          ].slice(0, 60),
        }));
        return null;
      }

      const source = sel.source;
      const run: Run = {
        id: runId, poolId: ws.pool.id, title: opts.title, requestedBy: ME, attributedTo: ME,
        state: 'streaming', sourceId: source.id, kind: opts.kind, attempt: 1, maxAttempts: 3,
        errorCode: null, costUsd: 0, outputTokens: 0, estimatedTokens: opts.estimatedTokens,
        createdAt: new Date(at).toISOString(), finishedAt: null, preloadItemId: opts.preloadItemId,
      };
      update((w) => ({ ...w, runs: [run, ...w.runs].slice(0, 60) }));

      // Stream in ticks, draining the basin as it goes.
      const ticks = 8;
      const perTick = Math.round(opts.estimatedTokens / ticks);
      for (let i = 1; i <= ticks; i += 1) {
        timers.current.push(
          window.setTimeout(() => {
            update((w) => {
              const h = w.headroom[source.id];
              return {
                ...w,
                headroom: h
                  ? { ...w.headroom, [source.id]: { ...h, tokens: Math.max(0, h.tokens - perTick), observedAt: new Date().toISOString() } }
                  : w.headroom,
                runs: w.runs.map((r) =>
                  r.id === runId
                    ? { ...r, outputTokens: r.outputTokens + Math.round(perTick * 0.45), costUsd: costUsd(usageFor(perTick * i, opts.kind), modelFor(source)) }
                    : r,
                ),
              };
            });
          }, i * 220),
        );
      }

      // metering is a state, not a callback: no run reaches done without it.
      timers.current.push(
        window.setTimeout(() => {
          update((w) => {
            const usage = usageFor(opts.estimatedTokens, opts.kind);
            const model = modelFor(source);
            const cost = costUsd(usage, model);
            const eventId = nextId('ue');
            const event: UsageEvent = {
              ...usage, id: eventId, runId, sourceId: source.id, poolId: w.pool.id,
              consumerUserId: ME, contributorUserId: source.ownerUserId,
              provider: source.provider, model, priceBookVersion: 'unseeded-synthetic',
              costUsd: cost, estimated: false, createdAt: new Date().toISOString(),
            };
            return {
              ...w,
              usage: [event, ...w.usage].slice(0, 300),
              ledger: [...entriesFor(event, (s) => `${eventId}_${s}`), ...w.ledger].slice(0, 600),
              runs: w.runs.map((r) =>
                r.id === runId
                  ? { ...r, state: 'done', costUsd: cost, outputTokens: usage.outputTokens, finishedAt: new Date().toISOString() }
                  : r,
              ),
            };
          });
        }, (ticks + 1) * 220),
      );

      return runId;
    },
    [candidates, ws, budgetRemainingUsd, update],
  );

  const value: Ctx = {
    ws, now, candidates, streamingSourceIds: streaming, spentTodayUsd, budgetRemainingUsd, update, startRun,
    reseed: () => setWs(seedWorkspace(Date.now())),
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
    revokeSource: (id) =>
      update((w) => ({ ...w, sources: w.sources.map((s) => (s.id === id ? { ...s, status: 'revoked', contributedToPool: null } : s)) })),
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
