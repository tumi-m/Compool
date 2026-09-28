/**
 * §15 as an acceptance criterion rather than an aspiration.
 *
 * "Feels fast" is not a specification. This measures gzipped first-load
 * JavaScript from Next's own app-build-manifest — the only thing that actually
 * knows what a route loads — and fails on a budget breach or a regression.
 *
 * It measures two numbers, not one, because a single per-route total cannot tell
 * you who is responsible for it:
 *
 *   shared   what every route in a layout group pays before any page code runs.
 *            Framework, providers, design system. When this grows, every route
 *            grows, and nobody looking at a page diff can see why.
 *   route    the page's own code, on top of shared. This is the number a person
 *            editing that page can actually do something about.
 *
 * An earlier version of this reported one total per route against a flat 120 KB.
 * Once the shared layout reached 116 KB that budget was failing six pages for
 * three kilobytes of their own code, which tells you nothing and trains people to
 * add exceptions. Splitting the two puts the failure where the cause is.
 *
 *   pnpm tsx scripts/check-bundle.ts          # check
 *   pnpm tsx scripts/check-bundle.ts --write  # accept current sizes as baseline
 */
import { gzipSync } from 'node:zlib';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** The plan's budget, applied to the thing every route genuinely loads. */
const SHARED_BUDGET_KB = 120;
/** A single page's own code. Generous, but a page past it is doing too much. */
const ROUTE_BUDGET_KB = 14;
/** A regression larger than this fails the build. */
const SLACK_KB = 3;

const NEXT = join(process.cwd(), '.next');
const BASELINE = join(process.cwd(), 'data', 'bundle-baseline.json');

const manifestPath = join(NEXT, 'app-build-manifest.json');
if (!existsSync(manifestPath)) {
  console.error('No build output. Run `pnpm build` first.');
  process.exit(1);
}

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as { pages: Record<string, string[]> };
const cache = new Map<string, number>();
const gzOf = (chunk: string): number => {
  const hit = cache.get(chunk);
  if (hit !== undefined) return hit;
  const p = join(NEXT, chunk);
  const kb = existsSync(p) ? gzipSync(readFileSync(p)).length / 1024 : 0;
  cache.set(chunk, kb);
  return kb;
};

const routes = Object.entries(manifest.pages).filter(([r]) => !r.startsWith('/api/'));
const chunksOf = (r: string) => [...new Set(manifest.pages[r] ?? [])].filter((c) => c.endsWith('.js'));
const sizeOf = (r: string) => chunksOf(r).reduce((a, c) => a + gzOf(c), 0);

/** A route's layout group, so each page is charged against its own shell. */
const groupOf = (route: string): string => {
  const m = route.match(/^\/\(([^)]+)\)/);
  return m ? `/(${m[1]})/layout` : '/layout';
};

const layouts = new Map<string, number>();
const layoutChunks = new Map<string, Set<string>>();
for (const [route] of routes) {
  if (!route.endsWith('/layout')) continue;
  layouts.set(route, sizeOf(route));
  layoutChunks.set(route, new Set(chunksOf(route)));
}

interface Row { route: string; total: number; shared: number; own: number }
const rows: Row[] = [];
for (const [route] of routes) {
  if (route.endsWith('/layout')) continue;
  // Next's internal not-found sits outside every group and has no shell to
  // charge against; reporting it as 100 KB of "page code" is noise.
  if (route === '/_not-found/page') continue;

  const own = layoutChunks.get(groupOf(route)) ?? new Set<string>();
  // Own code is the chunks this route loads that its shell does not — computed
  // from the sets, never by subtracting totals. A layout can load chunks a page
  // does not, which makes the subtraction negative and the number meaningless.
  const mine = chunksOf(route).filter((c) => !own.has(c));
  const shared = chunksOf(route).filter((c) => own.has(c));
  rows.push({
    route,
    total: +sizeOf(route).toFixed(1),
    shared: +shared.reduce((a, c) => a + gzOf(c), 0).toFixed(1),
    own: +mine.reduce((a, c) => a + gzOf(c), 0).toFixed(1),
  });
}

const current: Record<string, number> = {};
for (const [name, kb] of layouts) current[name] = +kb.toFixed(1);
for (const r of rows) current[r.route] = r.total;

if (process.argv.includes('--write')) {
  writeFileSync(BASELINE, `${JSON.stringify(current, null, 2)}\n`);
  console.log(`Baseline written: ${Object.keys(current).length} entries.`);
  process.exit(0);
}

const baseline: Record<string, number> = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, 'utf8')) : {};
let failed = false;

console.log('shared shells — what every route in the group pays before its own code\n');
for (const [name, kb] of [...layouts].sort()) {
  const over = kb > SHARED_BUDGET_KB;
  if (over) failed = true;
  const head = SHARED_BUDGET_KB - kb;
  console.log(
    `  ${name.padEnd(24)} ${kb.toFixed(1).padStart(6)} KB` +
      (over ? `   OVER SHARED BUDGET (${SHARED_BUDGET_KB} KB)` : `   ${head.toFixed(1)} KB of headroom left`),
  );
}

console.log('\nper route — the page’s own code on top of its shell\n');
for (const r of rows.sort((a, b) => b.own - a.own)) {
  const was = baseline[r.route];
  const delta = was === undefined ? 0 : r.total - was;
  const over = r.own > ROUTE_BUDGET_KB;
  const regressed = delta > SLACK_KB;
  if (over || regressed) failed = true;
  const flags = [
    over ? `OVER ROUTE BUDGET (${ROUTE_BUDGET_KB} KB)` : '',
    regressed ? `REGRESSED +${delta.toFixed(1)} KB` : '',
  ].filter(Boolean);
  console.log(
    `  ${r.route.padEnd(30)} ${r.own.toFixed(1).padStart(5)} KB own` +
      `   ${r.total.toFixed(1).padStart(6)} KB total` +
      (was === undefined ? '   (new)' : `   ${delta >= 0 ? '+' : ''}${delta.toFixed(1)}`) +
      (flags.length ? `   ${flags.join(' · ')}` : ''),
  );
}

if (failed) {
  console.error('\nBundle check failed. Trim the page, or the shell, and say which in the commit.');
  process.exit(1);
}
console.log('\nShells and pages both within budget.');
