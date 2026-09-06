import { NextResponse } from 'next/server';
import { register } from '@/lib/policy/register';
import { isWindowOpen, localParts, type PreloadItem } from '@/lib/preload/schedule';

export const dynamic = 'force-dynamic';

/**
 * The 3am dispatcher.
 *
 * Vercel Cron fires in UTC, and 3am is only ever meaningful locally, so this runs
 * hourly and dispatches only the items whose own zone says their window is open.
 * One person in Johannesburg and one in Lisbon both get their own 3am.
 *
 * Dispatch itself belongs to the gateway (§6.2): a preload run is long, and a run
 * that dies at a serverless ceiling loses its metering tail. This endpoint decides
 * *what* is due and hands the list over; when no gateway is configured it says so
 * plainly rather than pretending to have run anything.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get('authorization');
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
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
