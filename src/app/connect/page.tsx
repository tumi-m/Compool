'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { ME, nextId, useWorkspace } from '@/components/WorkspaceProvider';
import { register, freshness } from '@/lib/policy/register';
import { INTEGRATIONS } from '@/lib/integrations/catalog';
import type { CapacityClass, CapacitySource } from '@/lib/types';

type Choice = {
  key: string;
  provider: string;
  credentialTypeId: string;
  cls: CapacityClass;
  name: string;
  line: string;
  needsBaseUrl: boolean;
  needsKey: boolean;
};

/** Built from the policy register, so a provider with no policy entry cannot appear. */
function choices(): Choice[] {
  const out: Choice[] = [];
  for (const p of Object.values(register)) {
    for (const c of p.credentials) {
      out.push({
        key: c.id,
        provider: p.provider,
        credentialTypeId: c.id,
        cls: c.class,
        name:
          c.class === 'C'
            ? `${p.display_name} — personal seat`
            : c.class === 'B'
              ? p.display_name
              : `${p.display_name} — API key`,
        line:
          c.class === 'C'
            ? 'Runs through the vendor’s own signed-in CLI, on your machine. The credential never reaches us.'
            : c.class === 'B'
              ? 'Owned compute. A paired node serves it and reports signed usage.'
              : 'A metered key. Encrypted at rest, decrypted only at dispatch, poolable across the team.',
        needsBaseUrl: c.class === 'B',
        needsKey: c.class === 'A',
      });
    }
  }
  // Gateways from the open-source catalog with no policy file yet appear as
  // explicitly unverified rather than being silently omitted.
  for (const i of INTEGRATIONS) {
    if (i.role !== 'gateway' || register[i.id]) continue;
    out.push({
      key: `${i.id}.api_key`,
      provider: i.id,
      credentialTypeId: `${i.id}.api_key`,
      cls: 'A',
      name: `${i.name} — API key`,
      line: i.blurb,
      needsBaseUrl: true,
      needsKey: true,
    });
  }
  return out;
}

const VAULT_LIVE = false; // flips when KMS_KEY_ID and the gateway are configured

export default function ConnectPage() {
  const { ws, addSource } = useWorkspace();
  const all = useMemo(choices, []);
  const [pick, setPick] = useState<Choice | null>(null);
  const [label, setLabel] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [contribute, setContribute] = useState(true);
  const [cap, setCap] = useState('50');
  const [done, setDone] = useState<string | null>(null);

  const connected = new Set(ws.sources.filter((s) => s.status !== 'revoked').map((s) => s.credentialTypeId));

  const connect = () => {
    if (!pick) return;
    const s: CapacitySource = {
      id: nextId('src'),
      ownerUserId: ME,
      provider: pick.provider,
      credentialTypeId: pick.credentialTypeId,
      cls: pick.cls,
      label: label.trim() || pick.name,
      // The §3 invariant applied at creation: a personal seat is device-only and
      // can never carry a pool id, whatever the form said.
      storageLocation: pick.cls === 'A' ? 'vault' : 'device',
      last4: null,
      nodeId: pick.cls === 'A' ? null : (ws.nodes[0]?.id ?? null),
      status: 'active',
      contributedToPool: pick.cls === 'C' ? null : contribute ? ws.pool.id : null,
      priority: 100,
      monthlyCapUsd: pick.cls === 'A' && cap ? Number(cap) : null,
      createdAt: new Date().toISOString(),
      preview: true,
    };
    addSource(s);
    setDone(s.label);
    setPick(null);
    setLabel('');
    setBaseUrl('');
  };

  return (
    <div className="stackv" style={{ gap: 18 }}>
      <div className="pageHead">
        <h1>Connect capacity</h1>
        <p>
          Pick a source, tell us what it is, and it appears as a basin. What TIDEPOOL may do with it is decided
          by its class, and the class comes from the policy register — not from this form.
        </p>
      </div>

      {done ? (
        <div className="notice">
          <strong>{done} connected.</strong> It is on the <Link href="/">pool page</Link> now, and available to
          the <Link href="/preload">preload queue</Link> tonight.
        </div>
      ) : null}

      <div className="notice warn">
        <strong>Preview build — no key is accepted.</strong> The vault (envelope encryption under a managed KMS)
        lives in the gateway, and this deployment has no KMS configured, so the key field is deliberately
        disabled rather than collecting a secret it cannot protect. Sources connected here are stand-ins with
        simulated headroom, which is enough to exercise routing, metering and preload end to end.
      </div>

      <section>
        <h2>Click to connect</h2>
        <div className="grid cols3" style={{ marginTop: 10 }}>
          {all.map((c) => {
            const p = register[c.provider];
            const fresh = p ? freshness(p) : 'unverified';
            const already = connected.has(c.credentialTypeId);
            const selected = pick?.key === c.key;
            return (
              <button
                key={c.key}
                type="button"
                onClick={() => { setPick(selected ? null : c); setLabel(''); setDone(null); }}
                aria-pressed={selected}
                className="panel"
                style={{
                  textAlign: 'left',
                  display: 'block',
                  minHeight: 0,
                  borderColor: selected ? 'var(--water)' : undefined,
                  borderWidth: selected ? 2 : 1,
                  padding: 14,
                }}
              >
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <span className={`badge class${c.cls}`}>class {c.cls}</span>
                  {already ? <span className="badge water">connected</span> : null}
                </div>
                <div style={{ fontWeight: 600, margin: '9px 0 4px' }}>{c.name}</div>
                <div className="hint">{c.line}</div>
                {fresh !== 'fresh' ? (
                  <div className="badge shallow" style={{ marginTop: 9 }}>policy {fresh.replace('_', ' ')}</div>
                ) : null}
              </button>
            );
          })}
        </div>
      </section>

      {pick ? (
        <section className="panel">
          <h2>{pick.name}</h2>
          <p className="hint">{pick.line}</p>

          <div className="grid cols2" style={{ marginTop: 12 }}>
            <div>
              <div className="field">
                <label htmlFor="label">Label</label>
                <input id="label" type="text" value={label} placeholder={pick.name} onChange={(e) => setLabel(e.target.value)} />
              </div>

              {pick.needsKey ? (
                <div className="field">
                  <label htmlFor="key">API key</label>
                  <input id="key" type="password" disabled readOnly value="" placeholder="vault not configured in this deployment" />
                  <div className="hint" style={{ marginTop: 4 }}>
                    Create a <strong>scoped, capped, revocable</strong> key rather than pasting your default one.
                    A key that can only spend a fixed amount on one model is a much smaller thing to hand over.
                  </div>
                </div>
              ) : null}

              {pick.needsBaseUrl ? (
                <div className="field">
                  <label htmlFor="baseurl">Base URL</label>
                  <input id="baseurl" type="text" value={baseUrl} placeholder="http://127.0.0.1:11434" onChange={(e) => setBaseUrl(e.target.value)} />
                  <div className="hint" style={{ marginTop: 4 }}>
                    We ask instead of guessing. Endpoints that were not read from a primary source during the
                    build are never pre-filled.
                  </div>
                </div>
              ) : null}

              {pick.cls === 'A' ? (
                <div className="field">
                  <label htmlFor="cap">Monthly cap (USD)</label>
                  <input id="cap" type="number" min="0" value={cap} onChange={(e) => setCap(e.target.value)} />
                </div>
              ) : null}
            </div>

            <div>
              {pick.cls === 'C' ? (
                <div className="notice">
                  <strong>This one stays on your machine.</strong> A personal seat is not a developer credential,
                  so it is never stored, never proxied, and never contributed to a pool. Your node invokes the
                  vendor’s own signed-in CLI, for your own work, and forwards nothing but the remaining numbers.
                  <div style={{ marginTop: 8 }}>
                    <span className="badge">may_store_credential false</span>{' '}
                    <span className="badge">poolable false</span>{' '}
                    <span className="badge">storage device</span>
                  </div>
                </div>
              ) : (
                <div className="field">
                  <label htmlFor="contribute">Contribute to {ws.pool.name}</label>
                  <div className="row">
                    <input
                      id="contribute"
                      type="checkbox"
                      checked={contribute}
                      onChange={(e) => setContribute(e.target.checked)}
                      style={{ width: 18, height: 18, minHeight: 0 }}
                    />
                    <span className="hint" style={{ margin: 0, flex: 1 }}>
                      Members submit work; they never obtain the credential. Every use is written to the audit
                      log with who ran it and what it cost.
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="row" style={{ marginTop: 8 }}>
            <button type="button" className="primary" onClick={connect}>Connect</button>
            <button type="button" className="ghost" onClick={() => setPick(null)}>Cancel</button>
            {VAULT_LIVE ? null : (
              <span className="hint" style={{ margin: 0 }}>
                Live connection needs <code>KMS_KEY_ID</code> and a reachable gateway.
              </span>
            )}
          </div>
        </section>
      ) : null}

      <section className="panel">
        <h2>Client keys</h2>
        <p className="hint">
          Open-source agents — Cline, OpenCode, Continue, Aider, Goose — spend capacity rather than supplying it.
          Point them at TIDEPOOL and every request they make is routed, metered and attributed like any other
          run. <Link href="/open-source">See the open-source page →</Link>
        </p>
      </section>
    </div>
  );
}
