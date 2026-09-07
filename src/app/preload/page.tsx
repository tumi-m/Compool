'use client';

import { useMemo, useState } from 'react';
import { nextId, useWorkspace, ME } from '@/components/WorkspaceProvider';
import { register } from '@/lib/policy/register';
import {
  HOLD_COPY,
  PRELOAD_DEFAULTS,
  estimatedCostUsd,
  findTrough,
  isWindowOpen,
  localParts,
  msUntilWindow,
  plan,
  type PreloadItem,
  type PreloadKind,
} from '@/lib/preload/schedule';
import { clockAt, duration, pct, tokens, usd } from '@/lib/format';

const KIND_COPY: Record<PreloadKind, string> = {
  warm_cache: 'Warm cache — loads context and holds it, so the morning session reads from cache instead of paying full input.',
  digest: 'Digest — reads a lot, answers briefly. Overnight summaries, triage, review notes.',
  bulk: 'Bulk — generates. Batch jobs you would never run while you are waiting on them.',
};

const TZ = typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : 'UTC';

export default function PreloadPage() {
  const { ws, now, candidates, budgetRemainingUsd, upsertPreload, removePreload, startRun, update, reworkQueue, runRework } = useWorkspace();
  const [open, setOpen] = useState(false);

  const ctx = useMemo(
    () => ({
      now,
      policies: register,
      candidates,
      nodes: ws.nodes,
      ownerUserId: ME,
      poolId: ws.pool.id,
      budgetRemainingUsd,
    }),
    [now, candidates, ws.nodes, ws.pool.id, budgetRemainingUsd],
  );

  const p = useMemo(() => plan(ws.preload, ctx), [ws.preload, ctx]);
  const trough = findTrough(ws.hourlyLoad, PRELOAD_DEFAULTS.windowHours);
  const localHour = localParts(now, TZ).hour;

  const anchors = new Set(ws.preload.map((i) => i.anchorHour));
  const anchor = anchors.size === 1 ? [...anchors][0] : PRELOAD_DEFAULTS.anchorHour;

  const runNow = (item: PreloadItem) => {
    const d = p.decisions.find((x) => x.itemId === item.id);
    const id = startRun({
      title: item.title,
      kind: 'bulk',
      estimatedTokens: item.estimatedTokens,
      model: item.model,
      preloadItemId: item.id,
    });
    upsertPreload({
      ...item,
      state: id ? 'done' : 'failed',
      lastRunAt: new Date(now).toISOString(),
      lastSkipReason: id ? null : (d?.hold ? HOLD_COPY[d.hold] : 'No source took it.'),
      lastCostUsd: d?.estCostUsd ?? null,
    });
  };

  const applyTrough = () =>
    update((w) => ({ ...w, preload: w.preload.map((i) => ({ ...i, anchorHour: trough.startHour })) }));

  return (
    <div className="stackv" style={{ gap: 18 }}>
      <div className="pageHead spread">
        <div>
          <h1>Tide preload</h1>
          <p>
            Your window replenishes at three in the morning whether or not anyone is awake for it. Capacity you
            do not spend before it turns over is capacity you never had. Queue the work you already know you
            want, and it runs while the tide is in.
          </p>
        </div>
        <button type="button" className="primary" onClick={() => setOpen((v) => !v)}>
          {open ? 'Close' : 'Queue a prompt'}
        </button>
      </div>

      <div className="grid cols2">
        <div className="panel stackv">
          <div className="spread">
            <div>
              <div className="sectionLabel">Next window opens</div>
              <div className="bigNum">
                {p.nextWindowMs === null && p.dispatchCount === 0
                  ? '—'
                  : p.nextWindowMs === null
                    ? 'open now'
                    : clockAt(now + p.nextWindowMs)}
                <span className="unit">{p.nextWindowMs ? `in ${duration(p.nextWindowMs)}` : 'local'}</span>
              </div>
            </div>
            <div>
              <div className="sectionLabel">Queued for it</div>
              <div className="num" style={{ fontSize: 25 }}>{p.dispatchCount}<span className="muted small"> / {ws.preload.length}</span></div>
            </div>
            <div>
              <div className="sectionLabel">Estimated</div>
              <div className="num" style={{ fontSize: 25 }}>{usd(p.estTotalUsd)}</div>
            </div>
          </div>
          <div className="hint">
            Times are local ({TZ}). The scheduler runs hourly in UTC and dispatches only the items whose own
            local window is open, so 3am means 3am wherever the person is.
          </div>
        </div>

        <div className="panel stackv">
          <div className="spread">
            <div className="sectionLabel">Where the quiet actually is</div>
            <span className="badge">{String(trough.startHour).padStart(2, '0')}:00–{String((trough.startHour + trough.windowHours) % 24).padStart(2, '0')}:00</span>
          </div>
          <div className="tideChart" role="img" aria-label={`Load through the day. The quietest ${trough.windowHours} hours start at ${trough.startHour}:00. The current window is anchored at ${anchor}:00.`}>
            {ws.hourlyLoad.map((v, h) => {
              const inWin = (h - anchor + 24) % 24 < PRELOAD_DEFAULTS.windowHours;
              const max = Math.max(1, ...ws.hourlyLoad);
              return (
                <div
                  key={h}
                  className={`bar${inWin ? ' inWindow' : ''}${h === localHour ? ' now' : ''}`}
                  style={{ height: `${Math.max(2, (v / max) * 100)}%` }}
                  title={`${String(h).padStart(2, '0')}:00 · ${tokens(v)} tokens`}
                />
              );
            })}
          </div>
          <div className="tideAxis"><span>00</span><span>06</span><span>12</span><span>18</span><span>23</span></div>
          <div className="row">
            <span className="hint" style={{ margin: 0, flex: 1 }}>
              3am is the default, not the answer. Your own quietest stretch starts at{' '}
              {String(trough.startHour).padStart(2, '0')}:00.
            </span>
            {trough.startHour !== anchor ? (
              <button type="button" className="tiny" onClick={applyTrough}>
                Move the window there
              </button>
            ) : null}
          </div>
        </div>
      </div>

      {reworkQueue.length > 0 ? (
        <section className="panel">
          <div className="spread">
            <h2>Rework rides the same tide</h2>
            <span className="badge water">{reworkQueue.length} queued</span>
          </div>
          <p className="hint" style={{ marginTop: 6 }}>
            Work that ran a rung down while the tide was out goes into this window automatically. It is the
            cheapest possible moment to rewrite it: the capable rung has replenished, and nobody is waiting.
          </p>
          {reworkQueue.slice(0, 6).map((r) => (
            <div className="runRow" key={r.id}>
              <div>
                <div className="runTitle">{r.title}</div>
                <div className="runMeta">ran on {r.rungName} · wanted {r.targetTier}</div>
              </div>
              <button type="button" className="tiny" onClick={() => runRework(r)}>Rewrite now</button>
            </div>
          ))}
        </section>
      ) : null}

      {open ? <NewItem onAdd={(i) => { upsertPreload(i); setOpen(false); }} /> : null}

      <section>
        <h2>The queue</h2>
        {ws.preload.length === 0 ? (
          <div className="emptyState" style={{ marginTop: 10 }}>
            <h3>Nothing queued</h3>
            <p className="hint">
              Good candidates: a digest of everything merged overnight, a triage pass over last night’s failing
              suite, or a cache warm of the files you will open first. Anything you would be annoyed to sit and
              watch.
            </p>
            <button type="button" className="primary" onClick={() => setOpen(true)}>Queue the first one</button>
          </div>
        ) : (
          <div className="tableWrap panel" style={{ marginTop: 10, padding: 0 }}>
            <table>
              <caption className="srOnly">Preload queue</caption>
              <thead>
                <tr>
                  <th scope="col">Item</th>
                  <th scope="col">Kind</th>
                  <th scope="col">Window</th>
                  <th scope="col" className="n">Tokens</th>
                  <th scope="col" className="n">Est.</th>
                  <th scope="col">State</th>
                  <th scope="col" />
                </tr>
              </thead>
              <tbody>
                {ws.preload.map((item) => {
                  const d = p.decisions.find((x) => x.itemId === item.id)!;
                  const src = ws.sources.find((s) => s.id === d.sourceId);
                  return (
                    <tr key={item.id}>
                      <td>
                        <div style={{ fontWeight: 500 }}>{item.title}</div>
                        <div className="hint" style={{ maxWidth: '46ch' }}>{item.prompt.slice(0, 110)}{item.prompt.length > 110 ? '…' : ''}</div>
                      </td>
                      <td><span className="badge">{item.kind.replace('_', ' ')}</span></td>
                      <td className="num small">
                        {String(item.anchorHour).padStart(2, '0')}:00 +{item.windowHours}h
                        <div className="hint">{item.repeat}</div>
                      </td>
                      <td className="n">{tokens(item.estimatedTokens)}</td>
                      <td className="n">
                        {usd(estimatedCostUsd(item, item.model === '*' ? 'anthropic:workhorse' : item.model))}
                      </td>
                      <td>
                        {d.dispatch ? (
                          <>
                            <span className="badge water">ready</span>
                            <div className="hint">{src?.label} · {pct(d.fillFraction)} full</div>
                          </>
                        ) : (
                          <>
                            <span className={`badge ${d.hold === 'disabled' ? '' : 'shallow'}`}>
                              {d.hold === 'window_closed' ? 'waiting' : d.hold?.replace(/_/g, ' ')}
                            </span>
                            <div className="hint">
                              {d.hold ? HOLD_COPY[d.hold] : ''}
                              {d.msUntilWindow ? ` ${duration(d.msUntilWindow)} to go.` : ''}
                            </div>
                          </>
                        )}
                        {item.lastRunAt ? (
                          <div className="hint">last ran {clockAt(Date.parse(item.lastRunAt))}</div>
                        ) : null}
                      </td>
                      <td>
                        <div className="row" style={{ gap: 4, flexWrap: 'nowrap' }}>
                          <button
                            type="button"
                            className="tiny"
                            onClick={() => upsertPreload({ ...item, enabled: !item.enabled })}
                          >
                            {item.enabled ? 'Pause' : 'Resume'}
                          </button>
                          <button type="button" className="tiny" onClick={() => runNow(item)}>Run now</button>
                          <button type="button" className="tiny danger" onClick={() => removePreload(item.id)}>×</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="panel">
        <h2>What preload will not do</h2>
        <ul className="hint" style={{ marginTop: 6, paddingLeft: 18 }}>
          <li>
            It never competes with a person. Every preload item dispatches as <code>bulk</code>, so a source
            below 10% of its window stops taking it while your interactive work keeps running.
          </li>
          <li>
            It only spends a basin that is already near full — {pct(PRELOAD_DEFAULTS.requireHeadroomFraction)} by
            default. Preload exists to use capacity that would otherwise expire, not to borrow tomorrow’s.
          </li>
          <li>
            On a personal seat it runs only on your own online node, with unattended mode explicitly turned on.
            Every node here is on <strong>offer</strong> by default: nothing runs while you are asleep unless you
            said it could.
          </li>
          <li>
            It respects the pool budget and its own per-item cap, and it stops rather than exceeding either.
          </li>
        </ul>
        <div className="row" style={{ marginTop: 10 }}>
          {ws.nodes.map((n) => (
            <span key={n.id} className="badge">
              {n.name} · {n.status} · {n.poolMode}
            </span>
          ))}
          <button
            type="button"
            className="tiny"
            onClick={() =>
              update((w) => ({
                ...w,
                nodes: w.nodes.map((n) => ({ ...n, poolMode: n.poolMode === 'auto' ? 'offer' : 'auto' })),
              }))
            }
          >
            Toggle unattended mode
          </button>
        </div>
      </section>
    </div>
  );
}

function NewItem({ onAdd }: { onAdd: (i: PreloadItem) => void }) {
  const [title, setTitle] = useState('');
  const [prompt, setPrompt] = useState('');
  const [kind, setKind] = useState<PreloadKind>('digest');
  const [anchorHour, setAnchorHour] = useState<number>(PRELOAD_DEFAULTS.anchorHour);
  const [windowHours, setWindowHours] = useState<number>(PRELOAD_DEFAULTS.windowHours);
  const [estimatedTokens, setEstimatedTokens] = useState(120_000);
  const [maxCostUsd, setMaxCostUsd] = useState('0.75');
  const [repeat, setRepeat] = useState<'once' | 'daily' | 'weekdays'>('daily');
  const [requireFrac, setRequireFrac] = useState<number>(PRELOAD_DEFAULTS.requireHeadroomFraction);

  const draft: PreloadItem = {
    id: 'draft',
    title: title || 'Untitled',
    prompt,
    kind,
    model: '*',
    estimatedTokens,
    maxCostUsd: maxCostUsd === '' ? null : Number(maxCostUsd),
    repeat,
    tz: TZ,
    anchorHour,
    windowHours,
    requireHeadroomFraction: requireFrac,
    enabled: true,
    state: 'queued',
    lastRunAt: null,
    lastSkipReason: null,
    lastCostUsd: null,
    createdAt: new Date().toISOString(),
  };
  const est = estimatedCostUsd(draft, 'anthropic:workhorse');

  return (
    <section className="panel">
      <h2>Queue a prompt for the quiet hours</h2>
      <div className="grid cols2" style={{ marginTop: 10 }}>
        <div>
          <div className="field">
            <label htmlFor="t">Title</label>
            <input id="t" type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Overnight repo digest" />
          </div>
          <div className="field">
            <label htmlFor="pr">Prompt</label>
            <textarea id="pr" rows={5} value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Summarise every commit merged to main since the last digest…" />
          </div>
          <div className="field">
            <label htmlFor="k">Kind</label>
            <select id="k" value={kind} onChange={(e) => setKind(e.target.value as PreloadKind)}>
              <option value="digest">Digest</option>
              <option value="warm_cache">Warm cache</option>
              <option value="bulk">Bulk</option>
            </select>
            <div className="hint" style={{ marginTop: 4 }}>{KIND_COPY[kind]}</div>
          </div>
        </div>

        <div>
          <div className="row" style={{ gap: 10, alignItems: 'flex-start' }}>
            <div className="field" style={{ flex: 1 }}>
              <label htmlFor="ah">Window opens (local)</label>
              <select id="ah" value={anchorHour} onChange={(e) => setAnchorHour(Number(e.target.value))}>
                {Array.from({ length: 24 }, (_, h) => (
                  <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>
                ))}
              </select>
            </div>
            <div className="field" style={{ flex: 1 }}>
              <label htmlFor="wh">Length</label>
              <select id="wh" value={windowHours} onChange={(e) => setWindowHours(Number(e.target.value))}>
                {[1, 2, 3, 4, 6].map((h) => <option key={h} value={h}>{h}h</option>)}
              </select>
            </div>
          </div>

          <div className="row" style={{ gap: 10, alignItems: 'flex-start' }}>
            <div className="field" style={{ flex: 1 }}>
              <label htmlFor="rp">Repeat</label>
              <select id="rp" value={repeat} onChange={(e) => setRepeat(e.target.value as 'once' | 'daily' | 'weekdays')}>
                <option value="daily">Every day</option>
                <option value="weekdays">Weekdays</option>
                <option value="once">Once</option>
              </select>
            </div>
            <div className="field" style={{ flex: 1 }}>
              <label htmlFor="tk">Estimated tokens</label>
              <input id="tk" type="number" min={1000} step={10_000} value={estimatedTokens} onChange={(e) => setEstimatedTokens(Number(e.target.value))} />
            </div>
          </div>

          <div className="field">
            <label htmlFor="rf">Only run when the basin is at least {pct(requireFrac)} full</label>
            <input id="rf" type="range" min={0} max={0.95} step={0.05} value={requireFrac} onChange={(e) => setRequireFrac(Number(e.target.value))} style={{ width: '100%' }} />
          </div>

          <div className="field">
            <label htmlFor="mc">Cap this item at (USD)</label>
            <input id="mc" type="number" min={0} step={0.05} value={maxCostUsd} onChange={(e) => setMaxCostUsd(e.target.value)} />
          </div>

          <div className="notice">
            Estimated <strong className="num">{usd(est)}</strong> per run
            {repeat !== 'once' ? <> · about <span className="num">{usd(est * 30)}</span> a month</> : null}.
            {' '}Priced from the current price book; a cache warm is billed mostly at the cache-write rate, which
            is why the kinds cost differently.
          </div>
        </div>
      </div>

      <div className="row">
        <button
          type="button"
          className="primary"
          disabled={!title.trim() || !prompt.trim()}
          onClick={() => onAdd({ ...draft, id: nextId('pl') })}
        >
          Add to the queue
        </button>
        <span className="hint" style={{ margin: 0 }}>
          {isWindowOpen(draft, Date.now())
            ? 'That window is open right now.'
            : `Next opens in ${duration(msUntilWindow(draft, Date.now()))}.`}
        </span>
      </div>
    </section>
  );
}
