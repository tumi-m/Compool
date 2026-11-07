import { NextResponse } from 'next/server';
import { register } from '@/lib/policy/register';
import { isWindowOpen, localParts, windowStartAt, type PreloadItem } from '@/lib/preload/schedule';
import { bearerMatches } from '@/lib/http';

export const dynamic = 'force-dynamic';

/**
 * The 3am dispatcher.
 *
 * Vercel Cron fires in UTC, and 3am is only ever meaningful locally, so each run
 * dispatches only the items whose own zone says their window is open right now.
 *
 * How often it runs decides who that covers. vercel.json schedules it once a
 * day at 01:00 UTC, because Vercel's Hobby plan refuses anything more frequent —
 * that is 03:00 in UTC+2 and inside the three-hour window for UTC+0 to UTC+2.
 * Called hourly (Vercel Pro, or the GitHub Actions workflow in
 * .github/workflows/preload-cron.yml), every zone gets its own 3am.
 *
 * Dispatch itself belongs to the gateway (§6.2): a preload run is long, and a run
 * that dies at a serverless ceiling loses its metering tail. This endpoint decides
 * *what* is due and hands the list over; when no gateway is configured it says so
 * plainly rather than pretending to have run anything.
 */
export async function GET(req: Request) {
  // Fail closed. This used to check the secret only when one was set, so a
  // deployment without CRON_SECRET let anyone read the queue's titles and, once
  // a queue and gateway were configured, dispatch it as often as they liked.
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      {
        error: 'CRON_SECRET is not set',
        note: 'Set CRON_SECRET in the project’s environment variables. Vercel Cron and the GitHub workflow both send it as a bearer token; without it this endpoint will not run.',
      },
      { status: 503 },
    );
  }
  if (!(await bearerMatches(req.headers.get('authorization'), secret))) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const store = await loadQueue();
  const now = Date.now();

  if (!store.configured) {
    return NextResponse.json({
      ok: true,
      dispatched: 0,
      due: 0,
      note:
        'No server-side queue is configured, so nothing was dispatched. Set TIDEPOOL_QUEUE_URL (or run the gateway) to persist the preload queue beyond the browser. Until then the queue lives in your browser and runs when a tab is open.',
      checkedAt: new Date(now).toISOString(),
    });
  }

  const due = store.items.filter((i) => i.enabled && isWindowOpen(i, now));
  const gateway = process.env.GATEWAY_URL;

  if (!gateway) {
    return NextResponse.json({
      ok: true,
      due: due.length,
      dispatched: 0,
      items: due.map((i) => ({ id: i.id, title: i.title, localHour: localParts(now, i.tz).hour })),
      note: 'GATEWAY_URL is not set, so the due items were identified but not executed. Long runs are the gateway’s job; a run that dies at a function ceiling loses its usage record.',
      checkedAt: new Date(now).toISOString(),
    });
  }

  const results = await Promise.allSettled(
    due.map((item) =>
      fetch(`${gateway}/v1/preload/dispatch`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${process.env.GATEWAY_SHARED_SECRET ?? ''}`,
          // One key per item per window, so a retried cron, or the daily Vercel
          // cron and the hourly workflow landing in the same window, cannot run
          // the same work twice.
          'idempotency-key': `preload:${item.id}:${new Date(windowStartAt(item, now)).toISOString().slice(0, 13)}`,
          // The gateway re-runs the guard against this register before executing.
          'x-tidepool-policy-version': String(Object.keys(register).length),
        },
        body: JSON.stringify({ item, kind: 'bulk', reason: 'tide_preload' }),
      }),
    ),
  );

  const dispatched = results.filter((r) => r.status === 'fulfilled' && r.value.ok).length;
  return NextResponse.json({
    ok: true,
    due: due.length,
    dispatched,
    failed: results.length - dispatched,
    checkedAt: new Date(now).toISOString(),
  });
}

async function loadQueue(): Promise<{ configured: boolean; items: PreloadItem[] }> {
  const url = process.env.TIDEPOOL_QUEUE_URL;
  const token = process.env.TIDEPOOL_QUEUE_TOKEN;
  if (!url) return { configured: false, items: [] };
  try {
    const res = await fetch(url, {
      headers: token ? { authorization: `Bearer ${token}` } : {},
      cache: 'no-store',
    });
    if (!res.ok) return { configured: false, items: [] };
    const data = (await res.json()) as { items?: PreloadItem[] };
    return { configured: true, items: data.items ?? [] };
  } catch {
    return { configured: false, items: [] };
  }
}
