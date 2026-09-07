'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useWorkspace } from '@/components/WorkspaceProvider';
import { TIER_COPY, TIER_ORDER, tierRank, type Tier } from '@/lib/ladder/rungs';
import { fillFraction } from '@/lib/router/headroom';
import { clientSnippet } from '@/lib/integrations/catalog';
import { clockAt, pct } from '@/lib/format';

/**
 * The catalogue. A dense, searchable list of every rung with the provider that
 * serves it and how much of that provider's window is left right now — the one
 * screen where you can see the whole ladder at once and understand why a request
 * landed where it did.
 */
export default function ModelsPage() {
  const { ws, now, candidates } = useWorkspace();
  const [q, setQ] = useState('');
  const [tier, setTier] = useState<Tier | 'all'>('all');
  const [openOnly, setOpenOnly] = useState(false);
  const [origin, setOrigin] = useState('https://your-deployment.vercel.app');

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    return ws.rungs
      .filter((r) => (tier === 'all' ? true : r.tier === tier))
      .filter((r) => (openOnly ? r.openWeight : true))
      .filter((r) => !term || r.name.toLowerCase().includes(term) || r.provider.includes(term))
      .map((r) => {
        const anyForProvider = candidates.some((c) => c.source.provider === r.provider);
        const serving = candidates.filter(
          (c) => c.source.provider === r.provider && (c.source.status === 'active' || c.source.status === 'cooling'),
        );
        const best = serving
          .map((c) => ({ c, f: fillFraction(c.headroom, now) }))
          .sort((a, b) => (b.f ?? 1) - (a.f ?? 1))[0];
        return {
          rung: r,
          fill: best ? best.f : (undefined as number | null | undefined),
          sourceLabel: best?.c.source.label ?? null,
          resetAt: best?.c.headroom?.resetAt ?? null,
          latency: best?.c.observedLatencyMs ?? null,
          // "not connected" and "connected but spent" are different problems and
          // need different answers, so the table never conflates them.
          connected: anyForProvider,
        };
      })
      .sort((a, b) => tierRank(a.rung.tier) - tierRank(b.rung.tier) || a.rung.name.localeCompare(b.rung.name));
  }, [ws.rungs, candidates, now, q, tier, openOnly]);

  const availableCount = rows.filter((r) => r.sourceLabel && (r.fill === null || (r.fill ?? 0) > 0.03)).length;

  return (
    <div className="stackv" style={{ gap: 18 }}>
      <div className="pageHead">
        <h1>Models</h1>
        <p>
          Every rung on the ladder, the provider that serves it, and how much of that provider’s window is left
          right now. This is the screen that explains why a request landed where it did.
        </p>
      </div>

      <div className="notice warn">
        <strong>These names came from you, not from a provider catalogue.</strong> Confirm the exact model ids
        with each provider before this routes real traffic — a wrong id is a run that fails at dispatch, and a
        silently retired one is a production incident. The ladder mechanism does not depend on the names;
        <code> scripts/sync-models.ts</code> reconciles them against each provider’s own models endpoint and
        opens a diff for review rather than auto-applying it.
      </div>

      <div className="panel">
        <div className="row" style={{ gap: 10 }}>
          <div style={{ flex: '2 1 240px' }}>
            <label htmlFor="q" className="srOnly">Search models</label>
            <input id="q" type="text" value={q} placeholder="Search models or providers…" onChange={(e) => setQ(e.target.value)} />
          </div>
          <div style={{ flex: '1 1 150px' }}>
            <label htmlFor="tier" className="srOnly">Filter by tier</label>
            <select id="tier" value={tier} onChange={(e) => setTier(e.target.value as Tier | 'all')}>
              <option value="all">All tiers</option>
              {TIER_ORDER.map((t) => <option key={t} value={t}>{TIER_COPY[t].label}</option>)}
            </select>
          </div>
          <label className="row small" style={{ gap: 6, margin: 0, fontWeight: 500 }}>
            <input type="checkbox" checked={openOnly} onChange={(e) => setOpenOnly(e.target.checked)} style={{ width: 16, height: 16, minHeight: 0 }} />
            Open weights only
          </label>
          <span className="badge water" style={{ marginLeft: 'auto' }}>
            {availableCount} of {rows.length} available now
          </span>
        </div>
      </div>

      <div className="panel tableWrap" style={{ padding: 0 }}>
        <table>
          <caption className="srOnly">Model ladder with live availability</caption>
          <thead>
            <tr>
              <th scope="col">Model</th>
              <th scope="col">Tier</th>
              <th scope="col">Served by</th>
              <th scope="col">Weights</th>
              <th scope="col">Availability</th>
              <th scope="col" className="n">Latency</th>
              <th scope="col">Next tide</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ rung, fill, sourceLabel, resetAt, latency, connected }) => {
              const unlimited = sourceLabel !== null && fill === null;
              const out = sourceLabel !== null && fill !== null && fill !== undefined && fill <= 0.03;
              return (
                <tr key={rung.id}>
                  <td>
                    <div style={{ fontWeight: 500 }}>{rung.name}</div>
                    {rung.note ? <div className="hint">{rung.note}</div> : null}
                    {!rung.verified ? <span className="badge shallow">unverified id</span> : null}
                  </td>
                  <td><span className="badge">{TIER_COPY[rung.tier].label}</span></td>
                  <td className="small">
                    {sourceLabel ?? (
                      <span className="muted">{connected ? 'every source spent' : 'not connected'}</span>
                    )}
                    <div className="hint">{rung.provider}</div>
                  </td>
                  <td className="small">{rung.openWeight ? <span className="badge water">open</span> : <span className="badge">closed</span>}</td>
                  <td style={{ minWidth: 150 }}>
                    {sourceLabel === null ? (
                      connected ? <span className="badge coral">out</span> : <span className="muted small">—</span>
                    ) : unlimited ? (
                      <span className="badge water">always on</span>
                    ) : (
                      <>
                        <div className="meterBar" style={{ marginBottom: 3 }}>
                          <span data-over={String(out)} style={{ width: `${Math.max(2, (fill ?? 0) * 100)}%` }} />
                        </div>
                        <span className="num small">{pct(fill ?? null)} {out ? '· out' : ''}</span>
                      </>
                    )}
                  </td>
                  <td className="n small">{latency === null ? '—' : `${latency}ms`}</td>
                  <td className="small num">{resetAt ? clockAt(Date.parse(resetAt)) : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <section className="panel">
        <h2>One endpoint, every rung</h2>
        <p className="hint">
          TIDEPOOL speaks the OpenAI shape, so anything that can talk to an OpenAI-compatible provider can talk
          to the whole ladder — OpenCode, Cline, Continue, Aider, Goose. Ask for <code>tidepool/auto</code> and
          it picks the highest rung with capacity; when that rung is spent it drops to the next one and keeps
          going rather than returning an error.
        </p>
        <div className="field" style={{ maxWidth: 460 }}>
          <label htmlFor="origin">Your deployment</label>
          <input id="origin" type="text" value={origin} onChange={(e) => setOrigin(e.target.value)} />
        </div>
        <pre style={{ background: 'var(--paper)', border: '1px solid var(--line)', borderLeft: '3px solid var(--water)', padding: '12px 14px', overflowX: 'auto', fontSize: 12 }}>
{clientSnippet(origin)}
        </pre>
        <p className="hint">
          <Link href="/open-source">Which clients this covers →</Link>{' '}
          <Link href="/orchestrate">Queue a burst of ideas against it →</Link>
        </p>
      </section>
    </div>
  );
}
