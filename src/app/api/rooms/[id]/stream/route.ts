import { roomLog } from '@/lib/room/registry';
import { toFrame } from '@/lib/room/events';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** §12.3. Long-lived HTTP/1.1 connections get closed by intermediaries when they
 *  go quiet, so the stream emits a comment frame on a fixed interval regardless
 *  of whether the model is producing anything. This is what keeps a slow run
 *  alive, and it is not optional. */
const HEARTBEAT_MS = 15_000;

/**
 * SSE, not WebSockets. The room is one-directional — every action the client
 * sends is an ordinary POST — and SSE survives proxies and reconnects natively.
 * Adding a second protocol would buy nothing.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const log = roomLog(id);

  // A reconnecting client tells us the last event it actually saw, either in the
  // standard header or as a query param for clients that cannot set headers.
  const url = new URL(req.url);
  const headerId = req.headers.get('last-event-id');
  const queryId = url.searchParams.get('lastEventId');
  const after = Number(headerId ?? queryId ?? 0);
  const from = Number.isFinite(after) && after > 0 ? after : 0;

  const encoder = new TextEncoder();
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let unsubscribe: (() => void) | undefined;

  const stream = new ReadableStream({
    start(controller) {
      const send = (chunk: string) => {
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          // Client vanished between the check and the write; the abort handler
          // below does the cleanup.
        }
      };

      // Tell the client how long to wait before retrying, then replay the gap.
      send(`retry: 2000\n\n`);
      const missed = log.since(from);
      send(`: replaying ${missed.length} event${missed.length === 1 ? '' : 's'} from seq ${from}\n\n`);
      for (const e of missed) send(toFrame(e));

      unsubscribe = log.subscribe((e) => send(toFrame(e)));
      heartbeat = setInterval(() => send(`: heartbeat ${Date.now()}\n\n`), HEARTBEAT_MS);

      req.signal.addEventListener('abort', () => {
        if (heartbeat) clearInterval(heartbeat);
        unsubscribe?.();
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      });
    },
    cancel() {
      if (heartbeat) clearInterval(heartbeat);
      unsubscribe?.();
    },
  });

  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      // Proxies that buffer would defeat the whole point of a stream.
      'x-accel-buffering': 'no',
    },
  });
}
