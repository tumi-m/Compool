import { NextResponse } from 'next/server';
import { roomLog } from '@/lib/room/registry';
import { EVENT_TYPES } from '@/lib/room/events';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** Publish into a room. Validated at the boundary; anything that does not parse
 *  is refused rather than coerced into a shape the client will mis-render. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  const log = roomLog(id);
  const batch = Array.isArray(body) ? body : [body];
  if (batch.length > 200) {
    return NextResponse.json({ error: 'at most 200 events per request' }, { status: 413 });
  }

  const accepted = [];
  const rejected = [];
  for (const item of batch) {
    const e = log.append(item);
    if (e) accepted.push(e.seq);
    else rejected.push(item);
  }

  return NextResponse.json(
    {
      accepted: accepted.length,
      rejected: rejected.length,
      lastSeq: log.lastSeq,
      ...(rejected.length ? { hint: `type must be one of: ${EVENT_TYPES.join(', ')}` } : {}),
    },
    { status: rejected.length && !accepted.length ? 400 : 200 },
  );
}

/** Current state of the log, for a client that would rather poll than stream. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const log = roomLog(id);
  const after = Number(new URL(req.url).searchParams.get('after') ?? 0);
  return NextResponse.json({
    lastSeq: log.lastSeq,
    retained: log.size,
    subscribers: log.subscriberCount,
    events: log.since(Number.isFinite(after) ? after : 0),
  });
}
