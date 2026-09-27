'use client';

import { useEffect } from 'react';
import Link from 'next/link';

/**
 * §14.8 state 4. What failed, what happens next, one action — never a raw stack
 * trace and never a blank page. A user who hands you API keys and then sees an
 * unhandled exception has learned something about how carefully this is built.
 */
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // In production this is where the structured log goes, carrying run_id,
    // pool_id and source_id like every other line.
    console.error('[tidepool] unhandled', error);
  }, [error]);

  return (
    <div className="stackv" style={{ gap: 16, maxWidth: 640 }}>
      <div className="pageHead">
        <h1>That screen did not load</h1>
        <p>
          Something in the interface threw. Nothing you were doing has been lost — capacity, the ledger and the
          preload queue are all unaffected by a rendering failure.
        </p>
      </div>
      <div className="notice stop">
        <strong>What happened:</strong> {error.message || 'An unexpected error.'}
        {error.digest ? (
          <div className="hint" style={{ marginTop: 6 }}>
            Reference <code>{error.digest}</code> — quote it if you report this.
          </div>
        ) : null}
      </div>
      <div className="row">
        <button type="button" className="primary" onClick={reset}>Try again</button>
        <Link href="/" className="btn" style={{ textDecoration: 'none' }}>Back to the pool</Link>
      </div>
    </div>
  );
}
