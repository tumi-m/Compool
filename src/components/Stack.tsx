'use client';

import { usd } from '@/lib/format';
import type { Position } from '@/lib/meter/ledger';
import type { User } from '@/lib/types';

const CHIP_USD = 0.25;

/**
 * §14.7. Contribution and consumption per member, as stacked chips — the poker
 * sense and the silicon sense at once. Free-riding becomes visible without anyone
 * having to raise it, which is what makes pooling socially survivable.
 */
export function Stack({ positions, users }: { positions: Position[]; users: User[] }) {
  const name = (id: string) => users.find((u) => u.id === id)?.displayName ?? id;
  const chips = (usdAmount: number) => Math.min(14, Math.round(usdAmount / CHIP_USD));

  return (
    <div className="tableWrap">
      <table>
        <caption className="srOnly">Contribution and consumption per member</caption>
        <thead>
          <tr>
            <th scope="col">Member</th>
            <th scope="col">In</th>
            <th scope="col">Out</th>
            <th scope="col" className="n">Contributed</th>
            <th scope="col" className="n">Consumed</th>
            <th scope="col" className="n">Net</th>
          </tr>
        </thead>
        <tbody>
          {positions.map((p) => (
            <tr key={p.userId}>
              <td>{name(p.userId)}</td>
              <td>
                <div className="chips" aria-hidden="true">
                  <div className="chipCol">
                    {Array.from({ length: chips(p.contributedUsd) }, (_, i) => (
                      <div key={i} className="chipMark" />
                    ))}
                  </div>
                </div>
              </td>
              <td>
                <div className="chips" aria-hidden="true">
                  <div className="chipCol">
                    {Array.from({ length: chips(p.consumedUsd) }, (_, i) => (
                      <div key={i} className="chipMark out" />
                    ))}
                  </div>
                </div>
              </td>
              <td className="n">{usd(p.contributedUsd)}</td>
              <td className="n">{usd(p.consumedUsd)}</td>
              <td className="n" style={{ color: p.netUsd < -0.005 ? 'var(--coral)' : undefined }}>
                {p.netUsd >= 0 ? '+' : ''}{usd(p.netUsd)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
