'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { nextId, useWorkspace } from '@/components/WorkspaceProvider';
import { estimateTokens, priorityOf, tierFor, triage, type Idea } from '@/lib/orchestrate/triage';
import { TIER_COPY, type Tier } from '@/lib/ladder/rungs';
import { tokens } from '@/lib/format';

const truncate = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

const SLOT_COPY = {
  now: { badge: 'water', label: 'now' },
  next_tide: { badge: 'shallow', label: 'next tide' },
  blocked: { badge: '', label: 'blocked' },
} as const;

export default function OrchestratePage() {
  const { ws, ladderCtx, upsertIdea, removeIdea, startRun, reworkQueue, runRework } = useWorkspace();
  const [dump, setDump] = useState('');

  const plan = useMemo(() => triage(ws.ideas, ws.rungs, ladderCtx), [ws.ideas, ws.rungs, ladderCtx]);
  const byId = useMemo(() => new Map(ws.ideas.map((i) => [i.id, i])), [ws.ideas]);

  /** Thirty ideas arrive at once, so intake takes them thirty at a time. */
  const capture = () => {
    const lines = dump.split('\n').map((l) => l.replace(/^[-*\d.)\s]+/, '').trim()).filter(Boolean);
    const now = Date.now();
    lines.forEach((text, i) => {
      upsertIdea({
        id: nextId('idea'),
        text,
        // Everything lands mid-scale; the point is to get it out of your head,
        // not to make you rate it while you are still thinking of the next one.
        impact: 3, effort: 3, urgency: 3,
        blockedBy: [], status: 'inbox',
        createdAt: new Date(now + i).toISOString(),
      });
    });
    setDump('');
  };

  const dispatch = (idea: Idea, tier: Tier) => {
    startRun({
      title: idea.text.slice(0, 60),
      kind: 'bulk',
      estimatedTokens: idea.estimatedTokens ?? estimateTokens(idea),
      targetTier: tier,
    });
    upsertIdea({ ...idea, status: 'running' });
  };

  return (
    <div className="stackv" style={{ gap: 18 }}>
      <div className="pageHead">
        <h1>Orchestrate</h1>
        <p>
          Ideas do not arrive one at a time. They arrive thirty at once, usually while you are busy with the
          twenty-ninth. What kills the burst is not capacity — it is that ordering them is itself work, and doing
          it by hand costs exactly the attention the ideas needed. Dump them here and get back an order.
        </p>
      </div>

      <div className="grid cols2">
        <section className="panel">
          <h2>Dump</h2>
          <p className="hint">One idea per line. Nothing is rated, ordered or costed until you press the button.</p>
          <div className="field">
            <label htmlFor="dump" className="srOnly">Ideas, one per line</label>
            <textarea
              id="dump"
              rows={7}
              value={dump}
              onChange={(e) => setDump(e.target.value)}
              placeholder={'Swap the SSE parser for the adapter interface\nRecord abort-midstream fixtures\nVirtualise the runs list'}
            />
          </div>
          <div className="row">
            <button type="button" className="primary" onClick={capture} disabled={!dump.trim()}>
              Capture {dump.split('\n').filter((l) => l.trim()).length || ''}
            </button>
            <span className="hint" style={{ margin: 0 }}>
              Scoped by <strong>{plan.plannerRungName ?? 'no available planner'}</strong> — deliberately the
              cheapest rung that can plan, because scoping is small work and should never spend the expensive one.
            </span>
          </div>
        </section>

        <section className="panel stackv">
          <div className="spread">
            <div>
              <div className="sectionLabel">In the plan</div>
              <div className="bigNum">{plan.tasks.length}</div>
            </div>
            <div>
              <div className="sectionLabel">Runnable now</div>
              <div className="num" style={{ fontSize: 25 }}>{plan.tasks.filter((t) => t.slot === 'now').length}</div>
            </div>
            <div>
              <div className="sectionLabel">Waiting for the tide</div>
              <div className="num" style={{ fontSize: 25 }}>{plan.tasks.filter((t) => t.slot === 'next_tide').length}</div>
            </div>
            <div>
              <div className="sectionLabel">Estimated</div>
              <div className="num" style={{ fontSize: 25 }}>{tokens(plan.totalEstimatedTokens)}</div>
            </div>
          </div>
          <div>
            <div className="sectionLabel">Where the plan lands</div>
            {(['frontier', 'strong', 'light', 'free'] as Tier[]).map((t) => {
              const n = plan.tasks.filter((x) => x.tier === t).length;
              if (n === 0) return null;
              return (
                <div className="row small" key={t} style={{ gap: 8, marginBottom: 4 }}>
                  <span className="badge" style={{ minWidth: 118 }}>{TIER_COPY[t].label}</span>
                  <div className="meterBar" style={{ flex: 1 }}>
                    <span style={{ width: `${(n / Math.max(1, plan.tasks.length)) * 100}%` }} />
                  </div>
                  <span className="num" style={{ width: 24, textAlign: 'right' }}>{n}</span>
                </div>
              );
            })}
          </div>
          {plan.cycles.length > 0 ? (
            <div className="notice stop">
              <strong>Circular dependency.</strong> These block each other and cannot be ordered:{' '}
              {plan.cycles[0].map((id) => byId.get(id)?.text ?? id).join(' → ')}. An agent that quietly drops a
              dependency produces work in the wrong order and nobody notices until it has been done twice, so
              this is reported rather than guessed at.
            </div>
          ) : (
            <p className="hint">
              Ordered by impact × urgency ÷ effort, respecting dependencies. Crude on purpose: an order you can
              predict is worth more than an accurate one you cannot, because you have to trust it enough to stop
              re-sorting it yourself.
            </p>
          )}
        </section>
      </div>

      {reworkQueue.length > 0 ? (
        <section className="panel">
          <div className="spread">
            <h2>Waiting to be rewritten</h2>
            <span className="badge water">{reworkQueue.length} ready</span>
          </div>
          <p className="hint">
            These ran on a lower rung while the tide was out. A capable rung is available again, so they can be
            rewritten now — or left for the 3am window, which is where they go by default.
          </p>
          {reworkQueue.map((r) => (
            <div className="runRow" key={r.id}>
              <div>
                <div className="runTitle">{r.title}</div>
                <div className="runMeta">ran on {r.rungName} · wanted {r.targetTier}</div>
              </div>
              <button type="button" className="tiny primary" onClick={() => runRework(r)}>Rewrite now</button>
            </div>
          ))}
        </section>
      ) : null}

      <section>
        <div className="spread">
          <h2>The plan</h2>
          <span className="hint">drag nothing — change impact, effort or urgency and the order follows</span>
        </div>
        {plan.tasks.length === 0 ? (
          <div className="emptyState" style={{ marginTop: 10 }}>
            <h3>Nothing captured yet</h3>
            <p className="hint">Paste the backlog in your head into the box above. It does not have to be tidy.</p>
          </div>
        ) : (
          <div className="panel tableWrap" style={{ marginTop: 10, padding: 0 }}>
            <table>
              <caption className="srOnly">Triaged execution plan</caption>
              <thead>
                <tr>
                  <th scope="col" className="n">#</th>
                  <th scope="col">Idea</th>
                  <th scope="col" className="n">Impact</th>
                  <th scope="col" className="n">Effort</th>
                  <th scope="col" className="n">Urgency</th>
                  <th scope="col" className="n">Priority</th>
                  <th scope="col">Rung</th>
                  <th scope="col">Slot</th>
                  <th scope="col" />
                </tr>
              </thead>
              <tbody>
                {plan.tasks.map((t) => {
                  const idea = byId.get(t.ideaId);
                  if (!idea) return null;
                  const slot = SLOT_COPY[t.slot];
                  return (
                    <tr key={t.ideaId}>
                      <td className="n">{t.order}</td>
                      <td>
                        <div style={{ fontWeight: 500 }}>{idea.text}</div>
                        {t.blockedBy.length > 0 ? (
                          <div className="hint">after: {t.blockedBy.map((b) => truncate(byId.get(b)?.text ?? b, 42)).join(', ')}</div>
                        ) : null}
                      </td>
                      {(['impact', 'effort', 'urgency'] as const).map((k) => (
                        <td className="n" key={k}>
                          <label className="srOnly" htmlFor={`${k}-${idea.id}`}>{k} for {idea.text}</label>
                          <select
                            id={`${k}-${idea.id}`}
                            value={idea[k]}
                            onChange={(e) => upsertIdea({ ...idea, [k]: Number(e.target.value) })}
                            style={{ width: 54, minHeight: 28, padding: '2px 4px' }}
                          >
                            {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
                          </select>
                        </td>
                      ))}
                      <td className="n">{priorityOf(idea)}</td>
                      <td className="small">
                        <span className="badge">{TIER_COPY[t.tier].label}</span>
                        {t.degraded ? <div className="hint">will run lower and be reworked</div> : null}
                      </td>
                      <td><span className={`badge ${slot.badge}`}>{slot.label}</span></td>
                      <td>
                        <div className="row" style={{ gap: 4, flexWrap: 'nowrap' }}>
                          <button
                            type="button"
                            className="tiny"
                            disabled={t.slot === 'blocked'}
                            onClick={() => dispatch(idea, t.tier)}
                          >
                            Run
                          </button>
                          <button type="button" className="tiny danger" onClick={() => removeIdea(idea.id)}>×</button>
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
        <h2>Why this is not a to-do list</h2>
        <p className="hint">
          A to-do list assumes the constraint is you. Here the constraint is capacity, and it moves through the
          day: the same task is a frontier job at 9am and a light-rung job at 4pm with a rewrite queued for 3am.
          The plan is therefore a function of the tide, not a fixed order — which is why the slot column changes
          on its own while you watch it. <Link href="/models">See what is available right now →</Link>
        </p>
      </section>
    </div>
  );
}
