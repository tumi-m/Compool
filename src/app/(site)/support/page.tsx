'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useWorkspace, ME } from '@/components/WorkspaceProvider';
import { SupportWidget } from '@/components/support/SupportWidget';
import {
  DEFAULT_EMBED, embedSize, embedSnippet, isValidHandle, linkSnippet, normaliseHandle,
  type EmbedOptions, type EmbedVariant,
} from '@/lib/support/embed';
import { giftableSources, totals } from '@/lib/support/pledge';
import { describeTokens, UNITS } from '@/lib/support/units';
import { tokens as fmtTokens } from '@/lib/format';

/** The creator's side: turn it on, say what it is for, take the snippet. */
export default function SupportPage() {
  const { ws, hydrated, now, update } = useWorkspace();
  const p = ws.support;
  const [opts, setOpts] = useState<EmbedOptions>(DEFAULT_EMBED);
  const [copied, setCopied] = useState<string | null>(null);
  const [origin, setOrigin] = useState('https://your-deployment.vercel.app');

  const t = useMemo(() => totals(p.pledges, now), [p.pledges, now]);
  const mine = giftableSources(ws.sources, ME);
  const handleOk = isValidHandle(p.handle);

  const set = (patch: Partial<typeof p>) => update((w) => ({ ...w, support: { ...w.support, ...patch } }));

  const copy = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      window.setTimeout(() => setCopied(null), 1600);
    } catch {
      setCopied(null);
    }
  };

  const snippet = embedSnippet(origin, handleOk ? p.handle : 'your-handle', opts);

  return (
    <div className="stackv" style={{ gap: 18 }}>
      <div className="pageHead spread">
        <div>
          <h1>Buy me compute</h1>
          <p>
            A support page and a widget for your own site. People who like what you make can buy you the work
            rather than the coffee — an overnight run, a night of batch jobs — and it lands in your basin.
          </p>
        </div>
        <label className="row" style={{ gap: 8, margin: 0 }}>
          <input
            type="checkbox"
            checked={p.enabled}
            onChange={(e) => set({ enabled: e.target.checked })}
            style={{ width: 18, height: 18, minHeight: 0 }}
          />
          <span style={{ fontWeight: 600, color: 'var(--ink-0)' }}>Page is {p.enabled ? 'live' : 'off'}</span>
        </label>
      </div>

      <div className="grid cols2" style={{ alignItems: 'start' }}>
        <div className="stackv" style={{ gap: 14 }}>
        <section className="panel stackv">
          <h2>Your page</h2>

          <div className="field">
            <label htmlFor="handle">Handle</label>
            <div className="row" style={{ gap: 0 }}>
              <span className="badge" style={{ borderRadius: '4px 0 0 4px', borderRight: 0, minHeight: 36, alignItems: 'center' }}>
                /c/
              </span>
              <input
                id="handle"
                type="text"
                value={p.handle}
                onChange={(e) => set({ handle: normaliseHandle(e.target.value) })}
                style={{ borderRadius: '0 4px 4px 0', flex: 1 }}
                aria-invalid={!handleOk}
              />
            </div>
            {!handleOk ? (
              <div className="hint" style={{ color: 'var(--coral)', marginTop: 4 }}>
                Letters, numbers and single hyphens, 1–32 characters.
              </div>
            ) : null}
          </div>

          <div className="field">
            <label htmlFor="dn">Display name</label>
            <input id="dn" type="text" value={p.displayName} onChange={(e) => set({ displayName: e.target.value })} />
          </div>

          <div className="field">
            <label htmlFor="blurb">What the compute is for</label>
            <textarea id="blurb" rows={2} value={p.blurb} maxLength={180} onChange={(e) => set({ blurb: e.target.value })} />
            <div className="hint" style={{ marginTop: 4 }}>
              One line. People give to a person doing a thing, not to a capacity pool.
            </div>
          </div>

          <div className="row" style={{ gap: 10, alignItems: 'flex-start' }}>
            <div className="field" style={{ flex: 2 }}>
              <label htmlFor="goal">Goal</label>
              <input
                id="goal"
                type="text"
                value={p.goal?.label ?? ''}
                placeholder="a month of overnight digests"
                onChange={(e) =>
                  set({ goal: e.target.value ? { label: e.target.value, tokens: p.goal?.tokens ?? 5_000_000 } : null })
                }
              />
            </div>
            <div className="field" style={{ flex: 1 }}>
              <label htmlFor="goalsize">Size</label>
              <select
                id="goalsize"
                value={p.goal?.tokens ?? 5_000_000}
                onChange={(e) => set({ goal: { label: p.goal?.label ?? 'a goal', tokens: Number(e.target.value) } })}
              >
                {[1_000_000, 2_500_000, 5_000_000, 7_500_000, 15_000_000].map((n) => (
                  <option key={n} value={n}>
                    {n / 250_000} runs
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="field">
            <label htmlFor="pay">Your payment link</label>
            <input
              id="pay"
              type="text"
              value={p.payLink ?? ''}
              placeholder="https://buy.stripe.com/… · ko-fi.com/… · github.com/sponsors/…"
              onChange={(e) => set({ payLink: e.target.value.trim() || null })}
            />
          </div>

          <div className="notice">
            <strong>The money never comes through here.</strong> Supporters pay you directly on your own link,
            and TIDEPOOL records the gift and raises your budget. That is deliberate: taking a cut of somebody
            else’s inference bill is the one revenue model the plan rules out, and standing between a supporter
            and a creator’s money is how a side project acquires a compliance department.
          </div>
        </section>

        <div className="grid cols3 panel">
          <div>
            <div className="sectionLabel">Given</div>
            <div className="num" style={{ fontSize: 25 }}>{fmtTokens(t.pledgedTokens)}</div>
            <div className="hint">from {t.supporters} supporters</div>
          </div>
          <div>
            <div className="sectionLabel">Still in the basin</div>
            <div className="num" style={{ fontSize: 25 }}>{fmtTokens(t.remainingTokens)}</div>
            <div className="hint">{fmtTokens(t.redeemedTokens)} spent</div>
          </div>
          <div>
            <div className="sectionLabel">Awaiting payment</div>
            <div className="num" style={{ fontSize: 25 }}>{fmtTokens(t.pendingTokens)}</div>
            <div className="hint">a promise is not capacity</div>
          </div>
        </div>

        <section className="panel">
          <h2>Giving capacity instead of cash</h2>
          <p className="hint">
            A supporter with an API key or a GPU box can lend a capped, time-boxed window of it rather than
            paying anything. Nothing is bought or sold, which keeps it clear of the unresolved question about
            reselling prepaid credit — there is no consideration, so there is nothing to resell.
          </p>
          <div className="row" style={{ gap: 6, marginTop: 8 }}>
            {mine.length === 0 ? (
              <span className="hint" style={{ margin: 0 }}>
                You have nothing giftable connected. <Link href="/connect">Connect a source →</Link>
              </span>
            ) : (
              mine.map((s) => <span key={s.id} className={`badge class${s.cls}`}>{s.label}</span>)
            )}
          </div>
          <div className="hint" style={{ marginTop: 8 }}>
            Personal seats are absent from that list and always will be. A subscription is a personal
            entitlement, not a developer credential, and a good cause does not change that.
          </div>
        </section>

        <section className="panel">
          <h2>For a talk</h2>
          <p className="hint" style={{ marginBottom: 0 }}>
            Put <code>{origin.replace(/^https?:\/\//, '')}/c/{handleOk ? p.handle : 'your-handle'}</code> on
            your last slide. The wall updates while you are still on stage, and the units mean something to an
            audience that has never thought about a token in its life: {UNITS.map((u) => u.buys).join(', ')}.
          </p>
        </section>
        </div>

        <div className="stackv" style={{ gap: 14 }}>
          <section className="panel">
            <div className="spread">
              <h2>Preview</h2>
              <Link className="badge water" href={`/c/${handleOk ? p.handle : ''}`}>open the full page →</Link>
            </div>
            <div style={{ marginTop: 10, maxWidth: embedSize(opts).w }}>
              {hydrated ? (
                <SupportWidget
                  handle={p.handle}
                  displayName={p.displayName}
                  goal={p.goal}
                  pledges={p.pledges}
                  payLink={p.payLink}
                  variant={opts.variant}
                  showSupporters={opts.showSupporters}
                  showGoal={opts.showGoal}
                  now={now}
                  compact
                />
              ) : (
                <div className="skeleton" style={{ height: 240 }} />
              )}
            </div>
          </section>

          <section className="panel stackv">
            <h2>Put it on your site</h2>

            <div className="row" style={{ gap: 6 }}>
              {(['button', 'card', 'wall'] as EmbedVariant[]).map((v) => (
                <button
                  key={v}
                  type="button"
                  className={`tiny${opts.variant === v ? ' primary' : ''}`}
                  aria-pressed={opts.variant === v}
                  onClick={() => setOpts({ ...opts, variant: v })}
                >
                  {v}
                </button>
              ))}
              <label className="row small" style={{ gap: 5, margin: 0, marginLeft: 'auto' }}>
                <input
                  type="checkbox"
                  checked={opts.showGoal}
                  onChange={(e) => setOpts({ ...opts, showGoal: e.target.checked })}
                  style={{ width: 15, height: 15, minHeight: 0 }}
                />
                goal
              </label>
              <label className="row small" style={{ gap: 5, margin: 0 }}>
                <input
                  type="checkbox"
                  checked={opts.showSupporters}
                  onChange={(e) => setOpts({ ...opts, showSupporters: e.target.checked })}
                  style={{ width: 15, height: 15, minHeight: 0 }}
                />
                supporters
              </label>
            </div>

            <div className="field" style={{ margin: 0 }}>
              <label htmlFor="origin">Your deployment</label>
              <input id="origin" type="text" value={origin} onChange={(e) => setOrigin(e.target.value)} />
            </div>

            <pre className="snippetBox">{snippet}</pre>
            <div className="hint" style={{ margin: 0 }}>
              The height in that snippet is computed from the options you picked, because a frame on someone
              else’s page cannot resize itself without a script on their page — and a clipped Give button makes
              the whole widget decorative.
            </div>
            <div className="row">
              <button type="button" onClick={() => copy(snippet, 'iframe')}>
                {copied === 'iframe' ? 'Copied' : 'Copy the embed'}
              </button>
              <button type="button" className="ghost" onClick={() => copy(linkSnippet(origin, p.handle), 'link')}>
                {copied === 'link' ? 'Copied' : 'Copy a plain link'}
              </button>
            </div>

            <div className="hint">
              An iframe, not a script. A script tag on your site is code we could change under you at any time,
              with access to everything on the page; a frame can only ever draw inside its own box. For a widget
              that shows a number and links to a payment page, the script buys nothing and costs you your site’s
              integrity — so there isn’t one to offer.
            </div>
          </section>
        </div>
      </div>

    </div>
  );
}
