/**
 * Publish a dated price book from provider pricing pages (§7.7).
 *
 * Prices are versioned and immutable: never edit one in place, publish a new
 * version. Every usage event records the version that priced it, so seeding this
 * later never rewrites history.
 *
 * This script deliberately does NOT invent numbers. It fetches each provider's
 * pricing page, writes the raw capture to data/captures/, and prints a diff for a
 * human to confirm before anything is published. A silently wrong price is a
 * ledger that lies, which is worse than no ledger at all.
 *
 *   pnpm tsx scripts/seed-prices.ts
 */
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const SOURCES: Record<string, string> = {
  // Fill these from each provider's own pricing page. They are intentionally
  // empty rather than guessed.
};

async function main() {
  const current = JSON.parse(readFileSync(join(process.cwd(), 'data', 'price-book.json'), 'utf8'));
  if (Object.keys(SOURCES).length === 0) {
    console.log('No pricing sources configured.');
    console.log(`Current price book: ${current.version} (synthetic: ${current.synthetic})`);
    console.log(
      '\nAdd each provider’s pricing page URL to SOURCES, run this again, review the\n' +
        'captured diff, then publish a version named for the fetch date. Cache reads and\n' +
        'cache writes are priced separately from base input on several providers — get\n' +
        'those columns right or every long-context estimate is wrong.',
    );
    return;
  }

  const dir = join(process.cwd(), 'data', 'captures');
  mkdirSync(dir, { recursive: true });
  for (const [provider, url] of Object.entries(SOURCES)) {
    const res = await fetch(url);
    const body = await res.text();
    writeFileSync(join(dir, `${provider}.html`), body);
    console.log(`captured ${provider} (${body.length} bytes) from ${url}`);
  }
  console.log('\nReview the captures, then hand-write the new dated version into data/price-book.json.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
