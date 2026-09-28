'use client';

import Link from 'next/link';
import { useState } from 'react';
import { INTEGRATIONS, ROLE_COPY, clientSnippet, type IntegrationRole } from '@/lib/integrations/catalog';

const ROLES: IntegrationRole[] = ['runtime', 'gateway', 'client'];

export default function OpenSourcePage() {
  const [origin, setOrigin] = useState('https://your-deployment.vercel.app');
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(clientSnippet(origin));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="stackv" style={{ gap: 18 }}>
      <div className="pageHead">
        <h1>Open source</h1>
        <p>
          Three different things get called open-source support, and running them together is how you end up with
          a connect screen nobody understands. A runtime <em>is</em> capacity. A gateway <em>meters</em> capacity.
          A client <em>spends</em> it. They belong in different columns.
        </p>
      </div>

      {ROLES.map((role) => (
        <section key={role}>
          <div className="spread">
            <h2>{ROLE_COPY[role].title}</h2>
          </div>
          <p className="hint" style={{ marginTop: 2 }}>{ROLE_COPY[role].sub}</p>
          <div className="grid cols3" style={{ marginTop: 10 }}>
            {INTEGRATIONS.filter((i) => i.role === role).map((i) => (
              <div className="panel stackv" key={i.id} style={{ gap: 8 }}>
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <strong>{i.name}</strong>
                  {i.cls ? <span className={`badge class${i.cls}`}>class {i.cls}</span> : <span className="badge">consumer</span>}
                </div>
                <div className="hint" style={{ flex: 1 }}>{i.blurb}</div>
                <div className="row small" style={{ gap: 6 }}>
                  {i.openaiCompatible ? <span className="badge">OpenAI-compatible</span> : null}
                  <span className="badge">{i.license}</span>
                </div>
                <div className="hint" style={{ borderTop: '1px solid var(--line)', paddingTop: 7 }}>
                  <strong>{i.baseUrl ? 'Endpoint' : 'Before you wire it'}</strong>{' '}
                  {i.baseUrl ? <code>{i.baseUrl}</code> : i.verification}
                </div>
                <div className="row" style={{ gap: 6 }}>
                  <a className="badge" href={i.homepage} target="_blank" rel="noreferrer noopener">project ↗</a>
                  {i.role !== 'client' ? <Link className="badge water" href="/connect">connect →</Link> : null}
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}

      <section className="panel">
        <h2>Point a client at the pool</h2>
        <p className="hint">
          Every client above speaks the OpenAI shape, so the wiring is two values. Set them wherever that client
          configures a custom OpenAI-compatible provider — TIDEPOOL supplies the endpoint and the key, and makes
          no assumptions about anyone else’s config file.
        </p>
        <div className="field" style={{ maxWidth: 460 }}>
          <label htmlFor="origin">Your deployment</label>
          <input id="origin" type="text" value={origin} onChange={(e) => setOrigin(e.target.value)} />
        </div>
        <pre style={{ borderLeft: '3px solid var(--water)', background: 'var(--paper)', border: '1px solid var(--line)', borderLeftWidth: 3, padding: '12px 14px', overflowX: 'auto', fontSize: 12 }}>
{clientSnippet(origin)}
        </pre>
        <div className="row">
          <button type="button" onClick={copy}>{copied ? 'Copied' : 'Copy'}</button>
          <span className="hint" style={{ margin: 0 }}>
            Requests arriving this way are routed by the same selector, metered by the same code, and land in the
            same ledger as anything started in the UI.
          </span>
        </div>
      </section>

      <section className="panel">
        <h2>Why the gateway is the part that gets open-sourced</h2>
        <p className="hint">
          The thing people are actually afraid of is the component that touches their keys. Publishing that one,
          and offering a self-host path, turns the biggest objection into the reason to choose it. The app, the
          ledger and the marketplace can stay closed; the credential path cannot, or the trust argument is just
          an assertion. Every font here is open-licensed for the same reason — an open-source project that ships
          a proprietary webfont is a licensing problem for everyone who self-hosts it.
        </p>
      </section>
    </div>
  );
}
