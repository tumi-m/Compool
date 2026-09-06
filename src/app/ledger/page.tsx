'use client';

import { useMemo } from 'react';
import { useWorkspace } from '@/components/WorkspaceProvider';
import { Stack } from '@/components/Stack';
import { findImbalances, positions, settle } from '@/lib/meter/ledger';
import { priceBook } from '@/lib/meter/price-book';
import { relative, usd } from '@/lib/format';

export default function LedgerPage() {
  const { ws, now } = useWorkspace();
  const pos = useMemo(() => positions(ws.ledger, ws.users.map((u) => u.id)), [ws.ledger, ws.users]);
  const transfers = useMemo(() => settle(pos), [pos]);
  const imbalances = useMemo(() => findImbalances(ws.ledger), [ws.ledger]);
  const name = (id: string) => ws.users.find((u) => u.id === id)?.displayName ?? id;

  return (
    <div className="stackv" style={{ gap: 18 }}>
      <div className="pageHead">
        <h1>Ledger</h1>
        <p>
          Routing is commodity. The ledger is the part with no free substitute, so it is the part that has to be
          right: every run writes one usage event and exactly two entries that sum to zero.
        </p>
      </div>

      <div className={`notice ${imbalances.length ? 'stop' : ''}`}>
        <strong>Double-entry invariant: {imbalances.length === 0 ? 'holding' : `${imbalances.length} broken`}.</strong>{' '}
        {ws.ledger.length / 2} events · {ws.ledger.length} entries. A drifting ledger is a product-ending bug,
        so this check runs after every metering test and on a schedule in production, not only here.
      </div>

      {priceBook.synthetic ? (
        <div className="notice warn">
          <strong>Price book is <span className="num">{priceBook.version}</span>.</strong> These are stand-in
          numbers so the preview has something to meter — they are not provider pricing and must never be shown
          as such. Run <code>scripts/seed-prices.ts</code> to fetch real pricing pages, review the diff, and
          publish a dated version. Every usage event records the version that priced it, so seeding it later
          never rewrites history.
        </div>
      ) : null}

      <section className="panel">
        <h2>The stack</h2>
        {ws.ledger.length === 0 ? (
          <p className="hint">Nothing spent yet.</p>
        ) : (
          <div style={{ marginTop: 10 }}><Stack positions={pos} users={ws.users} /></div>
        )}
      </section>

      <div className="grid cols2">
        <section className="panel">
          <h2>Settle up</h2>
          <p className="hint">
            Policy is <strong>{ws.pool.settlePolicy.replace('_', ' ')}</strong>. Friends do not invoice each
            other, but they do want to see the numbers.
          </p>
          {transfers.length === 0 ? (
            <p className="hint">Nothing to settle — everyone is square.</p>
          ) : (
            <table>
              <thead><tr><th scope="col">From</th><th scope="col">To</th><th scope="col" className="n">Amount</th></tr></thead>
              <tbody>
                {transfers.map((t, i) => (
                  <tr key={i}>
                    <td>{name(t.from)}</td>
                    <td>{name(t.to)}</td>
                    <td className="n">{usd(t.amountUsd)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="panel">
          <h2>Usage events</h2>
          {ws.usage.length === 0 ? (
            <p className="hint">No runs metered in this session.</p>
          ) : (
            <div className="tableWrap">
              <table>
                <thead>
                  <tr>
                    <th scope="col">When</th>
                    <th scope="col">Model</th>
                    <th scope="col" className="n">In</th>
                    <th scope="col" className="n">Out</th>
                    <th scope="col" className="n">Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {ws.usage.slice(0, 12).map((u) => (
                    <tr key={u.id}>
                      <td className="small">{relative(u.createdAt, now)}</td>
                      <td className="small">{u.model}{u.estimated ? <span className="badge shallow" style={{ marginLeft: 5 }}>est</span> : null}</td>
                      <td className="n">{u.inputTokens.toLocaleString()}</td>
                      <td className="n">{u.outputTokens.toLocaleString()}</td>
                      <td className="n">{usd(u.costUsd, 4)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
