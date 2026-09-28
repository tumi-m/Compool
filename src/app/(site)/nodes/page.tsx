'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useWorkspace, ME } from '@/components/WorkspaceProvider';
import { relative } from '@/lib/format';

const MODE_COPY = {
  off: 'This node never takes pool work. Recommend this to anyone in an organisation with a compliance function.',
  offer: 'Pool tasks appear as offers. You accept them. Nothing runs unattended.',
  auto: 'This node auto-accepts pool tasks for you, including while you are asleep.',
} as const;

/**
 * M2. The local agent is what makes Class B and Class C possible at all, so the
 * pairing screen has to make three things obvious: it is outbound-only, it signs
 * what it reports, and it never touches a vendor's credential store.
 */
export default function NodesPage() {
  const { ws, now, update } = useWorkspace();
  const [pairing, setPairing] = useState(false);
  const [code] = useState(() => 'TIDE-' + Math.random().toString(36).slice(2, 6).toUpperCase() + '-' + Math.random().toString(36).slice(2, 6).toUpperCase());
  const [copied, setCopied] = useState(false);

  const mine = ws.nodes.filter((n) => n.ownerUserId === ME);
  const install = `curl -fsSL https://your-deployment.vercel.app/install.sh | sh
tidepool pair ${code}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(install);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  const setMode = (id: string, poolMode: 'off' | 'offer' | 'auto') =>
    update((w) => ({ ...w, nodes: w.nodes.map((n) => (n.id === id ? { ...n, poolMode } : n)) }));

  const toggleStatus = (id: string) =>
    update((w) => ({
      ...w,
      nodes: w.nodes.map((n) => (n.id === id ? { ...n, status: n.status === 'online' ? 'offline' : 'online' } : n)),
    }));

  return (
    <div className="stackv" style={{ gap: 18 }}>
      <div className="pageHead spread">
        <div>
          <h1>Nodes</h1>
          <p>
            A small daemon on your machine. It is what lets owned compute serve the pool, and what lets a
            personal seat break your own stall without the credential ever leaving the device.
          </p>
        </div>
        <button type="button" className="primary" onClick={() => setPairing((v) => !v)}>
          {pairing ? 'Close' : 'Pair a machine'}
        </button>
      </div>

      {pairing ? (
        <section className="panel stackv">
          <h2>One command</h2>
          <p className="hint">
            The node generates a keypair on first run; the private key never leaves the device. It holds one
            outbound connection — no inbound ports, no tunnel to configure, nothing to open on a router — and
            signs every report it sends, which the gateway verifies against the public key recorded at pairing.
          </p>
          <pre style={{ background: 'var(--paper)', border: '1px solid var(--line)', borderLeft: '3px solid var(--water)', padding: '12px 14px', overflowX: 'auto', fontSize: 12, margin: 0 }}>
{install}
          </pre>
          <div className="row">
            <button type="button" onClick={copy}>{copied ? 'Copied' : 'Copy'}</button>
            <span className="badge water">code {code}</span>
            <span className="hint" style={{ margin: 0 }}>Expires in 10 minutes.</span>
          </div>
          <div className="notice">
            <strong>What the node may not do, with no flag that enables it:</strong> read, copy, export or
            transmit a vendor CLI’s credential store; run work attributed to anyone else; or accept a dispatch
            for a source it does not own. It spawns the vendor’s own client, which authenticates itself against
            its own store — and the environment it spawns into is stripped of every credential-bearing variable
            named in any policy file first, so one vendor’s key can never be injected into another’s client.
          </div>
        </section>
      ) : null}

      <div className="grid cols2 riseIn">
        {mine.map((n) => {
          const cls = ws.sources.filter((s) => s.nodeId === n.id && s.status !== 'revoked');
          return (
            <section className="panel stackv" key={n.id}>
              <div className="spread">
                <div>
                  <h3>{n.name}</h3>
                  <div className="hint">{n.platform} · seen {relative(n.lastSeenAt, now)}</div>
                </div>
                <span className={`badge ${n.status === 'online' ? 'water' : ''}`}>{n.status}</span>
              </div>

              <div>
                <div className="sectionLabel">Serves</div>
                {cls.length === 0 ? (
                  <span className="hint">Nothing yet.</span>
                ) : (
                  <div className="row" style={{ gap: 6 }}>
                    {cls.map((s) => (
                      <span key={s.id} className={`badge class${s.cls}`}>{s.label}</span>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <div className="sectionLabel">Unattended pool work</div>
                <div className="row" style={{ gap: 6 }}>
                  {(['off', 'offer', 'auto'] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      className={`tiny${n.poolMode === m ? ' primary' : ''}`}
                      onClick={() => setMode(n.id, m)}
                      aria-pressed={n.poolMode === m}
                    >
                      {m}
                    </button>
                  ))}
                </div>
                <div className="hint" style={{ marginTop: 6 }}>{MODE_COPY[n.poolMode]}</div>
              </div>

              <div className="row small">
                <button type="button" className="tiny ghost" onClick={() => toggleStatus(n.id)}>
                  Simulate {n.status === 'online' ? 'going offline' : 'coming back'}
                </button>
              </div>
            </section>
          );
        })}
      </div>

      <section className="panel">
        <h2>Why the default is <code>offer</code></h2>
        <p className="hint">
          Whether an automated dispatcher assigning pool tasks to a member’s own seat stays inside a vendor’s
          personal-use terms is genuinely unresolved — it is the single most consequential open question in the
          plan, and the honest answer is that it depends on terms that change. So the conservative setting is
          the default, <code>auto</code> is opt-in per node and per pool with a plain-language explanation, and
          a pool-level switch can force <code>off</code> for everyone.
        </p>
        <p className="hint">
          When the answer arrives it lands in a policy file, not in code: set{' '}
          <code>poolable_across_people: false</code> and the feature disappears for that vendor with no
          deployment. <Link href="/docs">The rest of the policy story →</Link>
        </p>
      </section>
    </div>
  );
}
