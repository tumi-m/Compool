/**
 * Re-verification pass over policy/providers/*.policy.json (§4.3).
 *
 * It does not scrape. Scraping vendor terms is brittle, and getting it wrong is
 * worse than a stale file — so this reports what needs a human to look at it, and
 * exits non-zero in CI when something has gone past the block threshold.
 *
 *   pnpm tsx scripts/verify-policy.ts
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const DIR = join(process.cwd(), 'policy', 'providers');
const WARN_DAYS = 90;
const BLOCK_DAYS = 180;

let worst = 0;
for (const file of readdirSync(DIR).filter((f) => f.endsWith('.policy.json'))) {
  const p = JSON.parse(readFileSync(join(DIR, file), 'utf8'));
  const label = `${p.provider.padEnd(16)}`;

  if (p.needs_verification || !p.verified_at) {
    console.log(`${label} UNVERIFIED   ${p.source_urls?.[0] ?? '(no source url)'}`);
    for (const n of p.verification_notes ?? []) console.log(`${' '.repeat(18)}${n}`);
    worst = Math.max(worst, 1);
    continue;
  }

  const ageDays = Math.floor((Date.now() - Date.parse(p.verified_at)) / 86_400_000);
  if (ageDays > BLOCK_DAYS) {
    console.log(`${label} BLOCKED      verified ${ageDays}d ago — sources deprioritised until re-read`);
    worst = 2;
  } else if (ageDays > WARN_DAYS) {
    console.log(`${label} STALE        verified ${ageDays}d ago`);
    worst = Math.max(worst, 1);
  } else {
    console.log(`${label} fresh        verified ${ageDays}d ago by ${p.verified_by}`);
  }
}

console.log(
  '\nTo verify one: open its source_urls, copy the header names and limits verbatim,\n' +
    'set verified_at to today and verified_by to who read it. Do not fill these in from memory.',
);
process.exit(worst === 2 ? 1 : 0);
