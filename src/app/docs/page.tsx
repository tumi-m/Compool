import Link from 'next/link';
import { register, freshness } from '@/lib/policy/register';

export const metadata = { title: 'Docs — TIDEPOOL' };

/**
 * §14.3: docs are a product surface, sharing the app's chrome. An open-source
 * project whose documentation looks like its app is one people trust.
 */
export default function DocsPage() {
  const providers = Object.values(register);
  return (
    <div className="docs stackv" style={{ gap: 8 }}>
      <div className="pageHead">
        <h1>Docs</h1>
        <p>What this deployment actually is, what it is not yet, and where the constraints come from.</p>
      </div>

      <h2>The capacity model</h2>
      <p>
        A capacity source has a class, and the class is a discriminated union that gates every code path
        touching it — not advisory metadata.
      </p>
      <ul>
        <li><strong>Class A — metered API credentials.</strong> Pools across people. An API key exists to serve traffic from third parties; that is its designed purpose.</li>
        <li><strong>Class B — owned compute.</strong> Pools across people. It is hardware; renting cycles on a machine you own raises no vendor question.</li>
        <li><strong>Class C — personal seats.</strong> Never pools. A subscription is a personal entitlement, not a developer credential, and the credential never enters the system at all.</li>
      </ul>
      <p>
        The invariant: <em>a unit of work may execute against a Class C source if and only if the human who owns
        that source is the human the work is attributed to.</em> It is enforced in the dispatch guard, mirrored by
        database check constraints, and re-checked on the node itself.
      </p>

      <h2>Policy as code</h2>
      <p>
        Vendor terms change, and a paragraph in a README does not stop a router. Terms live in a machine-readable
        register the guard consults on every dispatch. A source whose credential type has no policy entry cannot
        be dispatched to at all.
      </p>
      <div className="tableWrap">
        <table>
          <thead>
            <tr><th scope="col">Provider</th><th scope="col">Credential types</th><th scope="col">Verified</th><th scope="col">State</th></tr>
          </thead>
          <tbody>
            {providers.map((p) => (
              <tr key={p.provider}>
                <td>{p.display_name}</td>
                <td className="small">
                  {p.credentials.map((c) => (
                    <span key={c.id} className={`badge class${c.class}`} style={{ marginRight: 4 }}>{c.id}</span>
                  ))}
                </td>
                <td className="small num">{p.verified_at ?? '—'}</td>
                <td className="small">{freshness(p).replace(/_/g, ' ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="hint">
        Only the Anthropic file was populated from a primary source during this build; the others could not be
        read because their documentation hosts were unreachable from the build environment. They ship marked
        unverified rather than filled in from memory, and the connect screen says so. Populate them with{' '}
        <code>scripts/verify-policy.ts</code>.
      </p>

      <h2>Tide preload</h2>
      <p>
        A rolling window replenishes on its own schedule whether or not anyone is awake for it. Preload spends
        that replenishment on work you already know you want done.
      </p>
      <ul>
        <li>The window defaults to 03:00 local for three hours, and the <strong>trough finder</strong> proposes your own quietest stretch from the hourly load.</li>
        <li>Every item dispatches as <code>bulk</code>, so §8.4 keeps it out of any window a person is still drawing on.</li>
        <li>An item runs only against a basin already at or above its headroom threshold — 70% by default.</li>
        <li>On a personal seat it runs only on the owner’s own online node with unattended mode explicitly enabled. Nodes default to <code>offer</code>.</li>
        <li>Per-item caps and the pool budget both hard-stop it.</li>
      </ul>
      <pre>{`# Vercel Cron fires hourly in UTC; the scheduler dispatches only the
# items whose own local window is open, so 3am means 3am per person.
vercel.json  ->  { "crons": [{ "path": "/api/cron/preload", "schedule": "0 * * * *" }] }`}</pre>

      <h2>Always on, and the rework loop</h2>
      <p>
        Running out of frontier capacity is not a reason to stop; it is a reason to drop a rung. The ladder walks
        down from the tier the work asked for until it finds one a connected provider can serve, and returns
        “stalled” only when even the floor is gone.
      </p>
      <ul>
        <li><strong>Owned compute is the floor.</strong> An open-weight model on your own hardware never runs out — it only gets slower. That is what makes always-on true rather than aspirational.</li>
        <li>Work that ran below its target is <strong>flagged for rework</strong>, not silently accepted. When a capable rung replenishes, flagged runs surface on the pool page and in the 3am window — the cheapest moment to rewrite them, because the capable rung is full and nobody is waiting.</li>
        <li>Scoping runs on the cheapest rung that can plan. Planning is small work and should never spend the expensive rung.</li>
        <li>Model names in the ladder are supplied by the operator and unverified. Confirm them against each provider’s own catalogue before routing real traffic; the mechanism does not depend on the names.</li>
      </ul>

      <h2>Rooms</h2>
      <p>
        A room holds the people present, a context reference, a task graph and the run history. The
        distinguishing feature is not chat — it is that <strong>a run is a first-class shared object</strong>:
        anyone can watch it live, see what it costs as it costs it, or pick it up if the person who started it
        went to bed.
      </p>
      <ul>
        <li><strong>SSE, not WebSockets.</strong> The room is one-directional and every client action is an ordinary POST. SSE survives proxies and reconnects natively; a second protocol would buy nothing.</li>
        <li><strong>Every event carries a sequence number.</strong> On reconnect the client sends the last one it actually saw and the server replays exactly the gap — no gaps and no duplicates. Drop the connection in the room to watch it happen.</li>
        <li><strong>A heartbeat comment frame every 15 seconds</strong>, regardless of model output. Intermediaries close long-lived connections when they go quiet, and this is what keeps a slow run alive.</li>
        <li><strong>Backpressure.</strong> Cost and headroom ticks are capped at two a second, text deltas coalesce to thirty. A room with six agents must not push four hundred events a second at a phone.</li>
        <li><strong>Structured events only.</strong> The model never emits markup and the client never renders model-authored HTML. Anything that fails validation at the boundary is refused, not coerced.</li>
      </ul>
      <p>
        The task graph is an explicit DAG, not a transcript. Independent tasks dispatch concurrently and the
        topological order is the execution plan. A cycle is rejected at insert with the offending path, and
        claiming is first-write-wins — which is what stops two people doing the same thing at 2am.
      </p>

      <h2>Motion</h2>
      <p>
        Motion here shows a value changing; that is its whole job. The request pipeline animates off real run
        state, a droplet lands on a basin each time tokens are actually drawn, numbers roll rather than
        crossfade because the direction of travel is information, and the surface line on a basin moves only
        while a run is streaming against that source.
      </p>
      <p>
        None of it is SMIL or a JavaScript timer, which means the single <code>prefers-reduced-motion</code>{' '}
        rule in the stylesheet stops all of it at once. Nothing animates while the system is idle.
      </p>

      <h2>What this deployment is</h2>
      <p>
        The app in §6.1 — the UI, the pure router, the pure meter, the ledger and the preload scheduler — running
        as one Next.js app that deploys to Vercel with no configuration. What it is <em>not</em> yet:
      </p>
      <ul>
        <li>No vault. There is no KMS configured, so the connect flow refuses to accept a key rather than collecting a secret it cannot protect.</li>
        <li>No gateway. Long agent runs exceed a serverless function’s ceiling, and a run that dies at the ceiling loses its metering tail — which is the one thing that must never be lost. That service is separate by design.</li>
        <li>No node daemon. The pairing screen shows the real flow and the real constraints, but Class B and Class C sources here are stand-ins with simulated headroom.</li>
        <li>The room log is per-instance. That is enough to demonstrate and test the transport contract and not enough to fan out across instances; the production shape is Postgres plus one Redis channel per room, and <code>src/lib/room/registry.ts</code> is the only file that changes.</li>
        <li>The price book is synthetic and labelled as such on every screen that shows money.</li>
      </ul>
      <p>
        Everything that <em>is</em> here is the real code: selection, headroom interpolation, pricing, the
        double-entry ledger and the preload scheduler are pure functions with unit tests, and every number on
        screen comes from them rather than from a mock.
      </p>

      <h2>Open questions carried forward</h2>
      <ul>
        <li>Does a dispatcher offering pool tasks to a member’s own node, executing under that member’s own seat, stay within each vendor’s personal-use terms? Until resolved: <code>offer</code> mode only.</li>
        <li>Is reselling prepaid API credit permitted, per provider? Gated behind a separate <code>resellable</code> flag, not reused from <code>poolable_across_people</code>.</li>
        <li>Automated terms re-verification, or human review on a 90-day timer? Default human.</li>
      </ul>

      <p><Link href="/">← Back to the pool</Link></p>
    </div>
  );
}
