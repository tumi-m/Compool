'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Basin } from '@/components/Basin';
import { Stack } from '@/components/Stack';
import { Tide } from '@/components/Tide';
import { ME, useWorkspace } from '@/components/WorkspaceProvider';
import { positions } from '@/lib/meter/ledger';
import { PRESETS, type PresetName } from '@/lib/router/select';
import { fillFraction } from '@/lib/router/headroom';
import { findTrough } from '@/lib/preload/schedule';
import { localParts } from '@/lib/preload/schedule';
import { duration, relative, usd } from '@/lib/format';

export default function PoolPage() {
  const { ws, now, spentTodayUsd, budgetRemainingUsd, streamingSourceIds, startRun, revokeSource, setPreset, reseed } = useWorkspace();
  const [busy, setBusy] = useState(false);

  const live = ws.sources.filter((s) => s.status !== 'revoked');
  const pos = useMemo(() => positions(ws.ledger, ws.users.map((u) => u.id)), [ws.ledger, ws.users]);

  // Burn measured over the session so far, not asserted.
  const elapsedH = Math.max(1 / 60, (now - Date.parse(ws.seededAt)) / 3_600_000);
  const burn = spentTodayUsd / elapsedH;
  const emptyIn = budgetRemainingUsd === null || burn <= 0 ? null : (budgetRemainingUsd / burn) * 3_600_000;

  const trough = findTrough(ws.hourlyLoad, 3);
  const nowHour = localParts(now, Intl.DateTimeFormat().resolvedOptions().timeZone).hour;

  const running = ws.runs.filter((r) => r.state === 'streaming');
  const lastFail = ws.runs.find((r) => r.state === 'failed');

  const fire = (kind: 'interactive' | 'bulk') => {
    setBusy(true);
    startRun({
      title: kind === 'bulk' ? 'Batch: regenerate fixtures' : 'Interactive: explain the router',
      kind,
      estimatedTokens: kind === 'bulk' ? 120_000 : 24_000,
    });
    window.setTimeout(() => setBusy(false), 2200);
  };

  if (live.length === 0) {
    return <EmptyState />;
  }

  return (
    <div className="stackv" style={{ gap: 20 }}>
      <div className="pageHead spread">
        <div>
          <h1>{ws.pool.name}</h1>
          <p>
            {live.length} sources · {ws.members.length} members · settle {ws.pool.settlePolicy.replace('_', ' ')}
          </p>
        </div>
        <div className="row">
          <label htmlFor="preset" className="srOnly">Routing intent</label>
          <select
            id="preset"
            value={ws.preset}
            onChange={(e) => setPreset(e.target.value as PresetName)}
            style={{ width: 'auto', minWidth: 150 }}
          >
            {Object.keys(PRESETS).map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
          <button type="button" onClick={() => fire('interactive')} disabled={busy} className="primary">
            Run something
          </button>
          <button type="button" onClick={() => fire('bulk')} disabled={busy}>
            Run a batch
          </button>
        </div>
      </div>

      <Tide
        spentUsd={spentTodayUsd}
        budgetUsd={ws.pool.budgetCapUsd}
        burnUsdPerHour={burn}
        emptyInMs={emptyIn}
        hourly={ws.hourlyLoad}
        windowStart={trough.startHour}
        windowHours={trough.windowHours}
        nowHour={nowHour}
      />

      {lastFail?.errorCode ? (
        <div className="notice warn">
          <strong>Last run did not dispatch.</strong> {lastFail.errorCode}{' '}
          <Link href="/connect">Connect another source →</Link>
        </div>
      ) : null}

      <section>
        <div className="spread">
          <h2>Basins</h2>
          <span className="hint">A personal seat never joins the pool. It still breaks your own stall.</span>
        </div>
        <div className="grid cols3" style={{ marginTop: 10 }}>
          {live.map((s) => (
            <Basin
              key={s.id}
              source={s}
              headroom={ws.headroom[s.id] ?? null}
              now={now}
              live={streamingSourceIds.has(s.id)}
              onRevoke={revokeSource}
            />
          ))}
        </div>
      </section>

      <div className="grid cols2">
        <section className="panel">
          <div className="spread">
            <h2>The stack</h2>
            <span className="hint">who put in, who took out</span>
          </div>
          <div style={{ marginTop: 10 }}>
            {ws.ledger.length === 0 ? (
              <p className="hint">No runs yet. Chips appear the moment anyone spends anything.</p>
            ) : (
              <Stack positions={pos} users={ws.users} />
            )}
          </div>
        </section>

        <section className="panel">
          <div className="spread">
            <h2>Runs</h2>
            <span className="hint">{running.length ? `${running.length} streaming` : 'idle'}</span>
          </div>
          <div style={{ marginTop: 6 }}>
            {ws.runs.length === 0 ? (
              <p className="hint">Nothing has run in this session yet.</p>
            ) : (
              ws.runs.slice(0, 8).map((r) => {
                const src = ws.sources.find((s) => s.id === r.sourceId);
                return (
                  <div className="runRow" key={r.id}>
                    <div>
                      <div className="runTitle">
                        {r.title}
                        {r.preloadItemId ? <span className="badge" style={{ marginLeft: 6 }}>preloaded</span> : null}
                      </div>
                      <div className="runMeta">
                        {r.state} · {src?.label ?? 'unrouted'} · {relative(r.createdAt, now)}
                      </div>
                    </div>
                    <div className="num" style={{ textAlign: 'right' }}>
                      {usd(r.costUsd)}
                      <div className="runMeta">{r.outputTokens.toLocaleString()} out</div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>
      </div>

      <section className="panel">
        <div className="spread">
          <h2>Next tide</h2>
          <span className="hint">
            quietest three hours: {String(trough.startHour).padStart(2, '0')}:00–{String((trough.startHour + 3) % 24).padStart(2, '0')}:00
          </span>
        </div>
        <p className="hint" style={{ marginTop: 8 }}>
          {ws.preload.filter((p) => p.enabled).length} preload items are queued for it, and the fullest basin at that
          hour takes them. <Link href="/preload">Open the preload queue →</Link>
        </p>
        <div className="row small muted">
          <span>
            budget left {budgetRemainingUsd === null ? 'uncapped' : usd(budgetRemainingUsd)} · empties in {duration(emptyIn)}
          </span>
          <button type="button" className="tiny ghost" onClick={reseed} style={{ marginLeft: 'auto' }}>
            Reset preview workspace
          </button>
        </div>
      </section>
    </div>
  );
}

/** §14.8 state 1. The screen that decides whether anyone finishes onboarding. */
function EmptyState() {
  return (
    <div className="stackv" style={{ gap: 18 }}>
      <div className="pageHead">
        <h1>An empty basin</h1>
        <p>
          Nothing is connected yet, so there is nothing to spend. Capacity comes in three kinds, and the kind
          decides what TIDEPOOL is allowed to do with it.
        </p>
      </div>
      <div className="grid cols3">
        <div className="panel">
          <span className="badge classA">A · metered key</span>
          <h3 style={{ marginTop: 10 }}>Pools freely</h3>
          <p className="hint">
            An API key exists to serve traffic from people who are not you. Contributing one to a pool is what it
            is for. Encrypted at rest, decrypted only at dispatch, revocable in one click.
          </p>
        </div>
        <div className="panel">
          <span className="badge classB">B · owned compute</span>
          <h3 style={{ marginTop: 10 }}>Pools freely</h3>
          <p className="hint">
            It is hardware. Renting cycles on a machine you own raises no question at all. No credential exists
            to handle — a node holds an outbound socket and reports signed usage.
          </p>
        </div>
        <div className="panel">
          <span className="badge classC">C · personal seat</span>
          <h3 style={{ marginTop: 10 }}>Never pools</h3>
          <p className="hint">
            A subscription is a personal entitlement, not a developer credential. The credential never enters
            TIDEPOOL. Your own node runs your own work under your own seat — which is what breaks your stall.
          </p>
        </div>
      </div>
      <div>
        <Link href="/connect" className="btn primary" style={{ display: 'inline-block', textDecoration: 'none' }}>
          Connect your first source
        </Link>
      </div>
    </div>
  );
}
