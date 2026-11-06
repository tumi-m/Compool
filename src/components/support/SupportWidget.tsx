'use client';

import { useState } from 'react';
import { DEFAULT_UNIT, describeTokens, unit, unitCostUsd, unitPhrase, type UnitId } from '@/lib/support/units';
import { MAX_COUNT, clampCount, goalProgress, wallEntries, type Goal, type Pledge, type WallEntry } from '@/lib/support/pledge';
import type { EmbedVariant } from '@/lib/support/embed';
import { relative, usd } from '@/lib/format';

/** Quotes are at the going rate for a capable model, from the ledger's own book. */
const QUOTE_MODEL = 'anthropic:workhorse';
const QUICK = [1, 3, 5];

export interface PledgeChoice {
  unitId: UnitId;
  count: number;
  name: string;
  message: string;
  monthly: boolean;
  privateMessage: boolean;
}

export const firstName = (displayName: string) => displayName.trim().split(/\s+/)[0] || displayName;

/**
 * The widget, used identically by the public page and by the embed that lives on
 * a creator's own site. One component, so what a supporter sees on a blog is
 * exactly what the creator previewed — a widget that drifts from its preview is
 * a widget nobody trusts.
 *
 * Without an `onPledge` there is nowhere to record anything (the embed, the
 * preview), so the button takes the supporter to the full page with their
 * choice carried over, instead of thanking them for a pledge that went nowhere.
 */
export function SupportWidget({
  handle,
  displayName,
  blurb,
  goal,
  pledges,
  payLink,
  variant = 'card',
  showSupporters = true,
  showGoal = true,
  now = Date.now(),
  onPledge,
  compact = false,
  unitId = DEFAULT_UNIT,
  initialCount,
}: {
  handle: string;
  displayName: string;
  blurb?: string;
  goal: Goal | null;
  pledges: Pledge[];
  payLink: string | null;
  variant?: EmbedVariant;
  showSupporters?: boolean;
  showGoal?: boolean;
  now?: number;
  onPledge?: (choice: PledgeChoice) => void;
  compact?: boolean;
  /** The creator's "coffee": what one gift buys on this page. */
  unitId?: UnitId;
  initialCount?: number;
}) {
  const start = initialCount ? clampCount(initialCount) : 1;
  const [count, setCount] = useState(start);
  const [custom, setCustom] = useState(QUICK.includes(start) ? '' : String(start));
  const [name, setName] = useState('');
  const [message, setMessage] = useState('');
  const [monthly, setMonthly] = useState(false);
  const [priv, setPriv] = useState(false);
  const [sent, setSent] = useState(false);

  const first = firstName(displayName);

  if (variant === 'button') {
    return (
      <a className="supportButton" href={`/c/${handle}`} target="_blank" rel="noopener">
        <span className="supportButtonCup" aria-hidden="true">☕</span>
        <span className="supportButtonText">Buy {first} compute</span>
      </a>
    );
  }

  const g = goalProgress(pledges, showGoal ? goal : null, now);
  const each = unitCostUsd(unitId, QUOTE_MODEL);
  const total = each * count;
  const fullPage = `/c/${handle}?n=${count}`;
  const id = (k: string) => `${k}-${handle}`;

  const give = () => {
    onPledge?.({ unitId, count, name: name.trim() || 'Someone', message: message.trim(), monthly, privateMessage: priv });
    if (payLink) window.open(payLink, '_blank', 'noopener,noreferrer');
    setSent(true);
  };

  const reset = () => {
    setSent(false);
    setMessage('');
    setPriv(false);
    setMonthly(false);
  };

  return (
    <div className={`supportWidget${compact ? ' compact' : ''}`} data-variant={variant}>
      <h2 className="tipTitle">Buy {first} compute</h2>
      {blurb ? <p className="tipBlurb">{blurb}</p> : null}

      {showGoal && goal ? (
        <div className="goalBlock">
          <div className="goalTop">
            <strong>{goal.label}</strong>
            <span className="num">{Math.round(g.fraction * 100)}%</span>
          </div>
          <div
            className="goalBar"
            role="progressbar"
            aria-label={`Progress toward ${goal.label}`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(g.fraction * 100)}
          >
            <span style={{ width: `${Math.max(3, g.fraction * 100)}%` }} />
          </div>
          <div className="hint" style={{ marginTop: 5 }}>
            {g.reached ? `Funded — ${describeTokens(g.pledgedTokens)} given.` : `${describeTokens(g.remaining)} to go.`}
          </div>
        </div>
      ) : null}

      {sent ? (
        <div className="tipThanks" role="status">
          <span className="tipHeart"><HeartMark /></span>
          <h3>Thank you{name.trim() ? `, ${name.trim()}` : ''}!</h3>
          {/* It once said "your gift is on the wall" — but a cash pledge waits
              for the creator to confirm it, and does not appear until they do.
              Unconfirmed pledges stay off the public wall on purpose: otherwise
              anyone could put any name and message on somebody else's page. */}
          <p>
            {payLink
              ? `Finish up on the payment page that just opened. Your name goes on the wall once ${first} confirms it.`
              : `Your pledge is with ${first}. It goes on the wall once they confirm it.`}
            {monthly ? ' Set the monthly payment up on their page too — nothing here can charge you.' : ''}
          </p>
          <button type="button" className="pillBtn" onClick={reset}>Give again</button>
        </div>
      ) : (
        <>
          <div className="qtyBox" role="group" aria-label={`How many ${unit(unitId).label.replace(/^A /, '').toLowerCase()}s`}>
            <span className="qtyCup" aria-hidden="true">☕</span>
            <span className="qtyTimes" aria-hidden="true">×</span>
            {QUICK.map((n) => (
              <button
                key={n}
                type="button"
                className="qtyChip"
                aria-pressed={custom === '' && count === n}
                aria-label={`${n}`}
                onClick={() => {
                  setCustom('');
                  setCount(n);
                }}
              >
                {n}
              </button>
            ))}
            <label htmlFor={id('qty')} className="srOnly">Another number, up to {MAX_COUNT}</label>
            <input
              id={id('qty')}
              className="qtyInput"
              type="number"
              inputMode="numeric"
              min={1}
              max={MAX_COUNT}
              placeholder="10"
              value={custom}
              onChange={(e) => {
                setCustom(e.target.value);
                const n = Number(e.target.value);
                if (e.target.value !== '' && Number.isFinite(n)) setCount(clampCount(n));
                if (e.target.value === '') setCount(1);
              }}
            />
          </div>

          <p className="unitNote">
            {cap(unitPhrase(unitId, 1))} is {unit(unitId).buys} · <span className="num">{usd(each)}</span> each
          </p>

          {onPledge && !compact ? (
            <>
              <div className="tipFields">
                <label htmlFor={id('name')} className="srOnly">Your name</label>
                <input
                  id={id('name')}
                  type="text"
                  value={name}
                  maxLength={40}
                  autoComplete="nickname"
                  placeholder="Name or @yoursocial"
                  onChange={(e) => setName(e.target.value)}
                />
                <label htmlFor={id('msg')} className="srOnly">A message</label>
                <textarea
                  id={id('msg')}
                  value={message}
                  maxLength={280}
                  rows={3}
                  placeholder="Say something nice…"
                  onChange={(e) => setMessage(e.target.value)}
                />
              </div>
              <div className="tipChecks">
                <label className="tipCheck">
                  <input type="checkbox" className="check" checked={priv} onChange={(e) => setPriv(e.target.checked)} />
                  Keep my message private
                </label>
                <label className="tipCheck">
                  <input type="checkbox" className="check" checked={monthly} onChange={(e) => setMonthly(e.target.checked)} />
                  Make this monthly
                </label>
              </div>
            </>
          ) : null}

          {onPledge ? (
            <button type="button" className="tipCta" onClick={give}>
              {payLink ? 'Support' : 'Pledge'} <span className="num">{usd(total)}</span>
              {monthly ? <span className="tipCtaPer">/ month</span> : null}
            </button>
          ) : (
            <a className="tipCta" href={fullPage} target="_blank" rel="noopener">
              Support <span className="num">{usd(total)}</span>
            </a>
          )}
          <p className="tipFine">
            {cap(unitPhrase(unitId, count))} · {payLink
              ? `paid to ${first} directly — TIDEPOOL never touches the money.`
              : `${first} has no payment link yet, so this records a pledge.`}
          </p>
        </>
      )}

      {showSupporters ? (
        <div className="tipFeed">
          <SupporterFeed
            entries={wallEntries(pledges)}
            creator={first}
            now={now}
            limit={compact ? 6 : 20}
            maxHeight={variant === 'wall' ? 236 : 168}
          />
        </div>
      ) : null}
    </div>
  );
}

/**
 * The wall: who gave, what, and what they said. It is handed WallEntry, not
 * Pledge, so a private note is not even in its props.
 */
export function SupporterFeed({
  entries,
  creator,
  now,
  limit = 20,
  maxHeight,
  heading = 'Recent supporters',
}: {
  entries: WallEntry[];
  creator: string;
  now: number;
  limit?: number;
  maxHeight?: number;
  heading?: string;
}) {
  return (
    <>
      <h3 className="tipFeedHead">{heading}</h3>
      {entries.length === 0 ? (
        <p className="feedEmpty">Nobody yet. The first one gets the top spot.</p>
      ) : (
        <ul className="feedList scroller" style={maxHeight ? { maxHeight } : undefined}>
          {entries.slice(0, limit).map((e) => (
            <li className="feedItem" key={e.id}>
              <span className="feedAvatar" data-tone={tone(e.name)} aria-hidden="true">
                {e.name.trim()[0]?.toUpperCase() ?? '?'}
              </span>
              <div className="feedBody">
                <div className="feedLine">
                  <span>
                    <strong>{e.name}</strong> {e.verb} {unitPhrase(e.unitId, e.count)}
                  </span>
                  {e.monthly ? <span className="feedMonthly">monthly</span> : null}
                  <span className="feedWhen">{relative(e.createdAt, now)}</span>
                </div>
                {e.message ? (
                  <p className="feedNote">{e.message}</p>
                ) : e.sentPrivately ? (
                  <p className="feedPrivate"><LockMark /> Sent a private message</p>
                ) : null}
                {e.reply ? (
                  <p className="feedReply"><strong>{creator}</strong> {e.reply}</p>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** A stable colour per name, so the same supporter looks the same everywhere. */
function tone(name: string): number {
  let h = 0;
  for (const ch of name.trim().toLowerCase()) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return Math.abs(h) % 4;
}

function HeartMark() {
  return (
    <svg width="40" height="40" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        d="M12 20.3 4.6 13a4.6 4.6 0 0 1 6.5-6.5l.9.9.9-.9a4.6 4.6 0 0 1 6.5 6.5Z"
        fill="currentColor"
      />
    </svg>
  );
}

function LockMark() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <rect x="5" y="11" width="14" height="9" rx="2" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" fill="none" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}
