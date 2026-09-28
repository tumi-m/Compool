'use client';

import { useState } from 'react';
import { UNITS, describeTokens, unitCostUsd, type UnitId } from '@/lib/support/units';
import { goalProgress, type Pledge, type Goal } from '@/lib/support/pledge';
import type { EmbedVariant } from '@/lib/support/embed';
import { relative, tokens as fmtTokens, usd } from '@/lib/format';

/**
 * The widget, used identically by the public page and by the embed that lives on
 * a creator's own site. One component, so what a supporter sees on a blog is
 * exactly what the creator previewed — a widget that drifts from its preview is
 * a widget nobody trusts.
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
  onPledge?: (unitId: UnitId, count: number, name: string, message: string) => void;
  compact?: boolean;
}) {
  const [picked, setPicked] = useState<UnitId>('tide');
  const [count, setCount] = useState(1);
  const [name, setName] = useState('');
  const [message, setMessage] = useState('');
  const [sent, setSent] = useState(false);

  const g = goalProgress(pledges, showGoal ? goal : null, now);
  const wall = pledges
    .filter((p) => p.state === 'active' || p.state === 'spent')
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const pickedUnit = UNITS.find((u) => u.id === picked)!;

  if (variant === 'button') {
    return (
      <a className="btn primary supportButton" href={`/c/${handle}`} target="_top" rel="noopener">
        <CupMark />
        Buy {displayName.split(' ')[0]} compute
      </a>
    );
  }

  return (
    <div className={`supportWidget${compact ? ' compact' : ''}`}>
      <div className="row" style={{ gap: 9, alignItems: 'flex-start', flexWrap: 'nowrap' }}>
        <CupMark size={26} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <strong style={{ display: 'block', lineHeight: 1.3 }}>Buy {displayName} compute</strong>
          {blurb ? <div className="hint" style={{ marginTop: 2 }}>{blurb}</div> : null}
        </div>
      </div>

      {showGoal && goal ? (
        <div style={{ marginTop: 12 }}>
          <div className="row small" style={{ justifyContent: 'space-between', marginBottom: 4 }}>
            <span className="muted">{goal.label}</span>
            <span className="num">{Math.round(g.fraction * 100)}%</span>
          </div>
          <div className="meterBar">
            <span style={{ width: `${Math.max(2, g.fraction * 100)}%` }} />
          </div>
          <div className="hint" style={{ marginTop: 4 }}>
            {g.reached
              ? `Funded — ${describeTokens(g.pledgedTokens)} given.`
              : `${describeTokens(g.remaining)} to go.`}
          </div>
        </div>
      ) : null}

      {sent ? (
        <div className="notice" style={{ marginTop: 12 }} role="status">
          <strong>Thank you.</strong>{' '}
          {/* It used to say "your gift is on the wall" — but a cash pledge waits
              for the creator to confirm it, and does not appear until they do.
              Unconfirmed pledges stay off the public wall on purpose: otherwise
              anyone could put any name and message on somebody else's page. */}
          {payLink
            ? `Finish up on the payment page that just opened. Your name goes on the wall once ${displayName.split(' ')[0]} confirms it.`
            : `Your pledge is with ${displayName.split(' ')[0]}. It goes on the wall once they confirm it.`}
        </div>
      ) : (
        <>
          <fieldset style={{ marginTop: 12 }}>
            <legend className="sectionLabel" style={{ padding: 0 }}>Give</legend>
            <div className="unitRow">
              {UNITS.map((u) => (
                <button
                  key={u.id}
                  type="button"
                  className={`unitPick${picked === u.id ? ' on' : ''}`}
                  aria-pressed={picked === u.id}
                  onClick={() => setPicked(u.id)}
                >
                  <span className="unitName">{u.label}</span>
                  <span className="unitBuys">{u.buys}</span>
                  <span className="unitCost num">{usd(unitCostUsd(u.id, 'anthropic:workhorse'))}</span>
                </button>
              ))}
            </div>
          </fieldset>

          <div className="row" style={{ gap: 8, marginTop: 10 }}>
            <label htmlFor={`count-${handle}`} className="srOnly">How many</label>
            <select
              id={`count-${handle}`}
              value={count}
              onChange={(e) => setCount(Number(e.target.value))}
              className="countSelect"
            >
              {[1, 2, 3, 5, 10].map((n) => <option key={n} value={n}>×{n}</option>)}
            </select>
            <span className="hint" style={{ margin: 0, flex: 1 }}>
              {describeTokens(pickedUnit.tokens * count)} ·{' '}
              <span className="num">{usd(unitCostUsd(picked, 'anthropic:workhorse') * count)}</span>
            </span>
          </div>

          {!compact ? (
            <>
              <div className="field" style={{ marginTop: 10, marginBottom: 8 }}>
                <label htmlFor={`name-${handle}`}>Your name</label>
                <input
                  id={`name-${handle}`}
                  type="text"
                  value={name}
                  maxLength={40}
                  placeholder="Someone from the talk"
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor={`msg-${handle}`}>A note, if you like</label>
                <input
                  id={`msg-${handle}`}
                  type="text"
                  value={message}
                  maxLength={140}
                  onChange={(e) => setMessage(e.target.value)}
                />
              </div>
            </>
          ) : null}

          <button
            type="button"
            className="primary"
            style={{ width: '100%', marginTop: 4 }}
            onClick={() => {
              onPledge?.(picked, count, name.trim() || 'Anonymous', message.trim());
              if (payLink) window.open(payLink, '_blank', 'noopener,noreferrer');
              setSent(true);
            }}
          >
            {payLink ? 'Give' : 'Pledge'} {describeTokens(pickedUnit.tokens * count)}
          </button>

          {!payLink ? (
            <div className="hint" style={{ marginTop: 7 }}>
              {displayName} has not connected a payment link yet, so this records a pledge on the wall rather
              than taking a payment.
            </div>
          ) : null}
        </>
      )}

      {showSupporters && wall.length > 0 ? (
        <div style={{ marginTop: 14, borderTop: '1px solid var(--line)', paddingTop: 10 }}>
          <div className="sectionLabel">Recent supporters</div>
          <div className="scroller" style={{ maxHeight: variant === 'wall' ? 152 : 104 }}>
            {wall.slice(0, 20).map((p) => (
              <div className="wallRow" key={p.id}>
                <span className="wallAvatar" aria-hidden="true">{p.supporterName[0]?.toUpperCase() ?? '?'}</span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <strong>{p.supporterName}</strong>{' '}
                  <span className="muted small">gave {describeTokens(p.tokens)}</span>
                  {p.message ? <div className="hint wallNote">“{p.message}”</div> : null}
                </span>
                <span className="eventSeq">{relative(p.createdAt, now)}</span>
              </div>
            ))}
          </div>
          <div className="hint" style={{ marginTop: 6 }}>
            {g.supporters} {g.supporters === 1 ? 'supporter' : 'supporters'} ·{' '}
            {fmtTokens(g.pledgedTokens)} given · {fmtTokens(g.remainingTokens)} still in the basin
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** A cup, in the mark's own language: a vessel with a level in it. */
export function CupMark({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false" style={{ flex: 'none' }}>
      <path d="M4 6h13v9a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4V6Z" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M17 8h1.6a2.4 2.4 0 0 1 0 4.8H17" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M4.6 12.6h11.8V15a3.4 3.4 0 0 1-3.4 3.4H8a3.4 3.4 0 0 1-3.4-3.4v-2.4Z" fill="currentColor" opacity="0.85" />
    </svg>
  );
}
