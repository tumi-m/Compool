'use client';

import { use, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useWorkspace, nextId } from '@/components/WorkspaceProvider';
import { SupportWidget, SupporterFeed, firstName, type PledgeChoice } from '@/components/support/SupportWidget';
import { CapacityField } from '@/components/motion/CapacityField';
import { GoalRing } from '@/components/motion/GoalRing';
import { Odometer } from '@/components/motion/Odometer';
import { useToast } from '@/components/Toaster';
import { goalProgress, newPledge, totals, wallEntries } from '@/lib/support/pledge';
import { DEFAULT_UNIT } from '@/lib/support/units';
import { isValidHandle } from '@/lib/support/embed';

/**
 * The public support page — the link a creator puts in a bio, a talk slide or a
 * README. It is the one page here written for somebody who has never heard of
 * TIDEPOOL, so it reads like a tip jar first and explains the plumbing after.
 */
export default function CreatorPage({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = use(params);
  const { ws, hydrated, now, update } = useWorkspace();
  const { toast } = useToast();
  const profile = ws.support;
  const t = useMemo(() => totals(profile.pledges, now), [profile.pledges, now]);
  const entries = useMemo(() => wallEntries(profile.pledges), [profile.pledges]);
  const goal = useMemo(() => goalProgress(profile.pledges, profile.goal, now), [profile.pledges, profile.goal, now]);

  // The embed hands a supporter over with their count in the query string, so
  // they finish what they started rather than picking it again.
  const [initialCount, setInitialCount] = useState<number | undefined>(undefined);
  useEffect(() => {
    const n = Number(new URLSearchParams(window.location.search).get('n'));
    if (Number.isFinite(n) && n > 0) setInitialCount(n);
  }, []);

  if (!isValidHandle(handle)) {
    return (
      <div className="tipHero">
        <h1>No such page</h1>
        <p>That is not a valid handle.</p>
        <div className="tipHeroActions"><Link href="/" className="pillBtn">Back to the pool</Link></div>
      </div>
    );
  }

  if (hydrated && (!profile.enabled || profile.handle !== handle)) {
    return (
      <div className="tipHero">
        <h1>Nobody here yet</h1>
        <p>
          <code>{handle}</code> has not opened a support page. If it is yours, you can turn one on in a minute.
        </p>
        <div className="tipHeroActions"><Link href="/support" className="tipCta">Open yours</Link></div>
      </div>
    );
  }

  const first = firstName(profile.displayName);

  const addPledge = (c: PledgeChoice) => {
    update((w) => ({
      ...w,
      support: {
        ...w.support,
        pledges: [
          {
            ...newPledge({
              id: nextId('pl'),
              creatorHandle: w.support.handle,
              kind: 'cash',
              supporterName: c.name,
              message: c.message || null,
              unitId: c.unitId,
              count: c.count,
              sourceId: null,
              supporterUserId: null,
              expiresAt: null,
              createdAt: new Date().toISOString(),
            }),
            monthly: c.monthly,
            privateMessage: c.privateMessage,
          },
          ...w.support.pledges,
        ],
      },
    }));
  };

  const share = async () => {
    const url = window.location.origin + `/c/${profile.handle}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: `Buy ${first} compute`, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      toast('Link copied. Paste it anywhere people already follow you.', { tone: 'good' });
    } catch {
      // A dismissed share sheet throws; that is a choice, not an error.
    }
  };

  return (
    <div className="tipPage" data-tip-theme={profile.theme}>
      <div className="heroBand tipCover">
        <CapacityField
          sources={ws.sources.filter((s) => s.status !== 'revoked')}
          headroom={ws.headroom}
          streaming={new Set()}
          height={172}
        />
      </div>

      <header className="tipProfile">
        <span className="tipAvatarWrap">
          {profile.goal ? (
            <GoalRing
              fraction={goal.fraction}
              label={`${Math.round(goal.fraction * 100)}% of ${profile.goal.label}`}
            />
          ) : null}
          <span className="tipAvatar" aria-hidden="true">{initials(profile.displayName)}</span>
        </span>
        <h1 className="tipName">{profile.displayName}</h1>
        <p className="tipBlurb">{profile.blurb}</p>
        <div className="tipMeta">
          <span>
            <strong><Odometer value={t.supporters} decimals={0} className="num" /></strong>{' '}
            {t.supporters === 1 ? 'supporter' : 'supporters'}
          </span>
          {t.monthlySupporters > 0 ? (
            <span><strong className="num">{t.monthlySupporters}</strong> monthly</span>
          ) : null}
          <button type="button" className="pillBtn" onClick={share}>
            <ShareMark /> Share
          </button>
        </div>
      </header>

      <div className="tipGrid">
        <div className="tipGive">
          <SupportWidget
            key={initialCount ?? 'fresh'}
            handle={profile.handle}
            displayName={profile.displayName}
            goal={profile.goal}
            pledges={profile.pledges}
            payLink={profile.payLink}
            variant="card"
            showSupporters={false}
            now={now}
            onPledge={addPledge}
            unitId={profile.unitId ?? DEFAULT_UNIT}
            theme={profile.theme}
            initialCount={initialCount}
          />
        </div>

        <section className="tipCard tipFeedCard" aria-label="Supporters">
          <SupporterFeed entries={entries} creator={first} now={now} heading="Recent supporters" level="h2" />
        </section>

        <section className="tipCard tipAbout">
          <h2>What your support buys</h2>
          <p>
            Not a coffee — a unit of work. A tide is one overnight run: the thing that reads everything merged
            yesterday and has an answer waiting in the morning. Prices are quoted at the going rate, from the
            same book the ledger uses, rather than a round number and a hope.
          </p>
          <div className="tipWays">
            <div className="tipWay">
              <span className="tipWayDot" aria-hidden="true" />
              <p>
                <strong>Money</strong>
                You pay {first} directly, through their own payment link. TIDEPOOL records the gift and raises
                their budget — it never holds the money, routes it, or takes a cut.
              </p>
            </div>
            <div className="tipWay">
              <span className="tipWayDot" data-k="capacity" aria-hidden="true" />
              <p>
                <strong>Capacity</strong>
                Got an API key or a GPU box? Lend a capped, time-boxed window of it instead. Nothing is bought or
                sold. <Link href="/connect">Connect a source →</Link>
              </p>
            </div>
            <div className="tipWay">
              <span className="tipWayDot" data-k="never" aria-hidden="true" />
              <p>
                <strong>Never a personal seat</strong>
                A subscription is a personal entitlement, not a developer credential, and the rule does not bend
                for a good cause.
              </p>
            </div>
          </div>
          <p style={{ marginTop: 14, marginBottom: 0 }}>
            Every gift is spent through the same router and written to the same double-entry ledger as
            everything else, so {first} can show you exactly what your tide paid for.{' '}
            <Link href="/ledger">The ledger →</Link>
          </p>
        </section>
      </div>
    </div>
  );
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '?') + (parts[1]?.[0] ?? '')).toUpperCase();
}

function ShareMark() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M12 3v12M7 8l5-5 5 5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
