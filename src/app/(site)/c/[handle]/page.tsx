'use client';

import { use } from 'react';
import Link from 'next/link';
import { useWorkspace, nextId } from '@/components/WorkspaceProvider';
import { SupportWidget } from '@/components/support/SupportWidget';
import { CapacityField } from '@/components/motion/CapacityField';
import { newPledge } from '@/lib/support/pledge';
import { describeTokens } from '@/lib/support/units';
import { isValidHandle } from '@/lib/support/embed';

/**
 * The public support page — the link a creator puts in a bio, a talk slide or a
 * README. It is the one page here written for somebody who has never heard of
 * TIDEPOOL, so it explains what they are giving before it asks for anything.
 */
export default function CreatorPage({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = use(params);
  const { ws, hydrated, now, update } = useWorkspace();
  const profile = ws.support;

  if (!isValidHandle(handle)) {
    return (
      <div className="stackv" style={{ gap: 14, maxWidth: 560 }}>
        <h1>No such page</h1>
        <p className="hint">That is not a valid handle.</p>
        <Link href="/" className="btn" style={{ alignSelf: 'flex-start' }}>Back to the pool</Link>
      </div>
    );
  }

  if (hydrated && (!profile.enabled || profile.handle !== handle)) {
    return (
      <div className="stackv" style={{ gap: 14, maxWidth: 560 }}>
        <h1>Nobody here yet</h1>
        <p className="hint">
          <code>{handle}</code> has not opened a support page. If it is yours, you can turn one on in a minute.
        </p>
        <Link href="/support" className="btn primary" style={{ alignSelf: 'flex-start' }}>Open yours</Link>
      </div>
    );
  }

  const addPledge = (unitId: Parameters<NonNullable<Parameters<typeof SupportWidget>[0]['onPledge']>>[0], count: number, name: string, message: string) => {
    update((w) => ({
      ...w,
      support: {
        ...w.support,
        pledges: [
          newPledge({
            id: nextId('pl'),
            creatorHandle: w.support.handle,
            kind: 'cash',
            supporterName: name,
            message: message || null,
            unitId,
            count,
            sourceId: null,
            supporterUserId: null,
            expiresAt: null,
            createdAt: new Date().toISOString(),
          }),
          ...w.support.pledges,
        ],
      },
    }));
  };

  return (
    <div className="stackv" style={{ gap: 18 }}>
      <div className="heroBand">
        <CapacityField
          sources={ws.sources.filter((s) => s.status !== 'revoked')}
          headroom={ws.headroom}
          streaming={new Set()}
          height={150}
        />
        <div className="heroInner">
          <h1>{profile.displayName}</h1>
          <p style={{ marginBottom: 0 }}>{profile.blurb}</p>
        </div>
      </div>

      <div className="grid cols2" style={{ alignItems: 'start' }}>
        <div className="stackv" style={{ gap: 14 }}>
          <section className="panel">
            <h2>What you are actually giving</h2>
            <p className="hint">
              Not a coffee — a unit of work. A tide is one overnight run: the thing that reads everything merged
              yesterday and has an answer waiting in the morning. You are buying the run, and the page tells you
              what it costs at the going rate rather than picking a round number and hoping.
            </p>
          </section>

          <section className="panel">
            <h2>Two ways to give</h2>
            <div className="stackv" style={{ gap: 10, marginTop: 8 }}>
              <div>
                <span className="badge">cash</span>
                <p className="hint" style={{ marginTop: 5, marginBottom: 0 }}>
                  You pay {profile.displayName.split(' ')[0]} directly, through their own payment link. TIDEPOOL
                  records the gift and raises their budget — it never holds the money, routes it, or takes a cut.
                </p>
              </div>
              <div>
                <span className="badge classB">capacity</span>
                <p className="hint" style={{ marginTop: 5, marginBottom: 0 }}>
                  If you have an API key or a GPU box of your own, you can lend a capped, time-boxed window of it
                  instead. Nothing is bought or sold — you are handing over compute that would otherwise sit idle.
                  <Link href="/connect"> Connect a source →</Link>
                </p>
              </div>
              <div>
                <span className="badge classC">never</span>
                <p className="hint" style={{ marginTop: 5, marginBottom: 0 }}>
                  A personal subscription seat cannot be given, here or anywhere else in TIDEPOOL. It is a
                  personal entitlement, not a developer credential, and the rule does not bend for a good cause.
                </p>
              </div>
            </div>
          </section>

          <section className="panel">
            <h2>Where it goes</h2>
            <p className="hint">
              Straight into the basin. Every gift is spent through the same router, metered by the same code and
              written to the same double-entry ledger as everything else, so{' '}
              {profile.displayName.split(' ')[0]} can show you exactly what your tide paid for.{' '}
              <Link href="/ledger">The ledger →</Link>
            </p>
          </section>
        </div>

        <div style={{ position: 'sticky', top: 16 }}>
          <SupportWidget
            handle={profile.handle}
            displayName={profile.displayName}
            goal={profile.goal}
            pledges={profile.pledges}
            payLink={profile.payLink}
            variant="wall"
            now={now}
            onPledge={addPledge}
          />
          <p className="hint" style={{ marginTop: 8 }}>
            Given so far: {describeTokens(profile.pledges.reduce((a, p) => (p.state === 'active' || p.state === 'spent' ? a + p.tokens : a), 0))}.
          </p>
        </div>
      </div>
    </div>
  );
}
