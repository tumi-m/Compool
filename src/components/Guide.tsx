'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { guideProgress } from '@/lib/journey';
import type { Workspace } from '@/lib/demo/seed';

const KEY = 'tidepool.guide.v1';

/**
 * Getting started, on the pool page. The first thing a newcomer sees is a
 * dashboard full of numbers about a team they have never met; this is the
 * part that says what to do with it. Steps tick from real workspace state, the
 * next one is the only one with a button, and the whole card can be put away.
 */
export function Guide({ ws, onRun }: { ws: Workspace; onRun: () => void }) {
  const [hidden, setHidden] = useState(true);
  useEffect(() => {
    try {
      setHidden(localStorage.getItem(KEY) === 'dismissed');
    } catch {
      setHidden(false);
    }
  }, []);

  const p = guideProgress(ws);
  if (hidden || p.done === p.total) return null;

  const dismiss = () => {
    setHidden(true);
    try {
      localStorage.setItem(KEY, 'dismissed');
    } catch {
      // Private mode: it stays hidden for this visit, which is what was asked.
    }
  };

  return (
    <section className="guide" aria-labelledby="guide-title">
      <div className="guideHead">
        <div>
          <span className="tipEyebrow">Get started</span>
          <h2 id="guide-title">Five steps from preview to pooled</h2>
        </div>
        <div className="guideMeter" role="img" aria-label={`${p.done} of ${p.total} done`}>
          <span className="num">{p.done}/{p.total}</span>
          <span className="guideBar"><span style={{ width: `${(p.done / p.total) * 100}%` }} /></span>
        </div>
        <button type="button" className="guideClose" onClick={dismiss} aria-label="Hide the getting-started steps">
          ×
        </button>
      </div>
      <ol className="guideSteps">
        {p.steps.map((s, i) => {
          const isNext = p.next?.id === s.id;
          return (
            <li key={s.id} className="guideStep" data-done={s.isDone} data-next={isNext}>
              <span className="guideTick" aria-hidden="true">
                {s.isDone ? (
                  <svg className="checkDraw" width="14" height="14" viewBox="0 0 16 16">
                    <path d="M3 8.5 6.5 12 13 4.5" pathLength={1} />
                  </svg>
                ) : (
                  i + 1
                )}
              </span>
              <span className="guideText">
                <strong>{s.title}</strong>
                <span>{s.line}</span>
              </span>
              <span className="srOnly">{s.isDone ? '(done)' : ''}</span>
              {isNext ? (
                s.id === 'run' ? (
                  <button type="button" className="primary tiny" onClick={onRun}>Run it</button>
                ) : (
                  <Link href={s.href} className="btn primary tiny">Go</Link>
                )
              ) : null}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
