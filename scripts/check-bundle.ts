/**
 * §15 as an acceptance criterion rather than an aspiration.
 *
 * "Feels fast" is not a specification. This measures gzipped first-load
 * JavaScript per route and fails when a route crosses its budget or regresses
 * against the committed baseline by more than the allowed slack.
 *
 * The chunk set per route comes from Next's own app-build-manifest, which is the
 * only thing that actually knows what a route loads — deriving it by walking the
 * chunks directory counts every route's code against every other route and
 * produces a number three times too large.
 *
 *   pnpm tsx scripts/check-bundle.ts          # check
 *   pnpm tsx scripts/check-bundle.ts --write  # accept current sizes as baseline
 */
import { gzipSync } from 'node:zlib';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const BUDGET_KB = 120; // the plan's room-route budget, applied to every route
const SLACK_KB = 5;    // a regression larger than this fails the build

/**
 * Documented exceptions, not a raised budget.
 *
 * The framework floor is about 100 KB gzip — an empty route costs that before a
 * line of ours runs — so the budget leaves roughly 20 KB per route. Two routes
 * exceed it, and both are the ones the product is actually about. Raising
 * BUDGET_KB to hide that would make the check worthless; recording the overage
 * here keeps it visible in review, and any *other* route crossing 120 KB still
 * fails the build.
 *
 * Splitting these with next/dynamic was tried and reverted: both diagrams render
 * above the fold, so deferring them buys a skeleton flash rather than a faster
 * first paint.
 */
const EXCEPTIONS: Record<string, { kb: number; why: string }> = {
  '/page': {
    kb: 126,
    why: 'Basins, tide, ladder, pipeline, capacity field and the windowed run list on one screen. The field added 2.7 KB in Sep 2026; the gap to the 120 KB spec budget is now 5.4 KB.',
  },
  '/room/page': {
    kb: 125,
    why: 'Live stream, pipeline, task graph, capacity field and the event log on one screen. The field added 2.4 KB in Sep 2026; the gap to the 120 KB spec budget is now 3.5 KB.',
  },
};
const NEXT = join(process.cwd(), '.next');
const BASELINE = join(process.cwd(), 'data', 'bundle-baseline.json');

const manifestPath = join(NEXT, 'app-build-manifest.json');
if (!existsSync(manifestPath)) {
  console.error('No build output. Run `pnpm build` first.');
  process.exit(1);
}

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as { pages: Record<string, string[]> };
const sizes = new Map<string, number>();
const gzOf = (chunk: string): number => {
  const cached = sizes.get(chunk);
  if (cached !== undefined) return cached;
  const p = join(NEXT, chunk);
  const kb = existsSync(p) ? gzipSync(readFileSync(p)).length / 1024 : 0;
  sizes.set(chunk, kb);
  return kb;
};

const current: Record<string, number> = {};
for (const [route, chunks] of Object.entries(manifest.pages)) {
  // API routes ship no client JavaScript; measuring them is noise.
  if (route.startsWith('/api/')) continue;
  const unique = [...new Set(chunks)].filter((c) => c.endsWith('.js'));
  current[route] = Number(unique.reduce((a, c) => a + gzOf(c), 0).toFixed(1));
}

if (process.argv.includes('--write')) {
  writeFileSync(BASELINE, `${JSON.stringify(current, null, 2)}\n`);
  console.log(`Baseline written: ${Object.keys(current).length} routes.`);
  process.exit(0);
}

const baseline: Record<string, number> = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, 'utf8')) : {};
let failed = false;

for (const [route, kb] of Object.entries(current).sort()) {
  const was = baseline[route];
  const delta = was === undefined ? 0 : kb - was;
  const exception = EXCEPTIONS[route];
  const limit = exception?.kb ?? BUDGET_KB;
  const over = kb > limit;
  const regressed = delta > SLACK_KB;
  if (over || regressed) failed = true;
  const flags = [
    over ? `OVER BUDGET (${limit} KB)` : '',
    regressed ? `REGRESSED +${delta.toFixed(1)} KB` : '',
    !over && exception ? `over the ${BUDGET_KB} KB budget by design — ${exception.why}` : '',
  ].filter(Boolean);
  console.log(
    `${route.padEnd(26)} ${kb.toFixed(1).padStart(7)} KB gzip` +
      (was === undefined ? '   (new)' : `   ${delta >= 0 ? '+' : ''}${delta.toFixed(1)}`) +
      (flags.length ? `   ${flags.join(' · ')}` : ''),
  );
}

if (failed) {
  console.error('\nBundle check failed. Trim the route, or accept the new size with --write and say why in the commit.');
  process.exit(1);
}
console.log('\nEvery route within budget.');
