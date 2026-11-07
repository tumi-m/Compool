import { NextResponse } from 'next/server';
import { getRoom, isRoomId, openRoom } from '@/lib/room/registry';
import { EVENT_TYPES } from '@/lib/room/events';
import { readJson } from '@/lib/http';

/** 200 events at a realistic size, with room to spare — and no more. */
const MAX_BODY_BYTES = 256 * 1024;
const notFound = () => NextResponse.json({ error: 'no such room' }, { status: 404 });

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** Publish into a room. Validated at the boundary; anything that does not parse
 *  is refused rather than coerced into a shape the client will mis-render. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isRoomId(id)) return notFound();
  const read = await readJson(req, MAX_BODY_BYTES);
  if (!read.ok) return NextResponse.json({ error: read.error }, { status: read.status });
  const body = read.value;

  const log = openRoom(id);
  if (!log) return NextResponse.json({ error: 'too many open rooms on this instance' }, { status: 503 });
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
      ...(rejected.length
        ? { hint: `type must be one of: ${EVENT_TYPES.join(', ')}; identity fields at most 128 characters; payload at most 16 KB` }
        : {}),
    },
    { status: rejected.length && !accepted.length ? 400 : 200 },
  );
}

/** Current state of the log, for a client that would rather poll than stream. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isRoomId(id)) return notFound();
  // Reading a room that does not exist yet is an empty room, not a new one.
  const log = getRoom(id);
  const after = Number(new URL(req.url).searchParams.get('after') ?? 0);
  return NextResponse.json({
    lastSeq: log?.lastSeq ?? 0,
    retained: log?.size ?? 0,
    subscribers: log?.subscriberCount ?? 0,
    events: log ? log.since(Number.isFinite(after) ? after : 0) : [],
  });
}
