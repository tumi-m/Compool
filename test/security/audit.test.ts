import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { GET as cron } from '@/app/api/cron/preload/route';
import { GET as readRoom, POST as publish } from '@/app/api/rooms/[id]/events/route';
import { POST as planQueue } from '@/app/api/preload/plan/route';
import { roomIds } from '@/lib/room/registry';
import { safePayLink } from '@/lib/support/paylink';
import { originOf } from '@/lib/support/embed';

/**
 * Verification for the findings in docs/security-audit.md. Each test was
 * written to fail against the code as it was audited, and passes against the
 * fix — so a finding cannot quietly come back.
 */

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const req = (path: string, init?: RequestInit) => new Request(`https://app.test${path}`, init);

/** A preload item whose window is open right now, in UTC. */
const openItem = () => ({
  id: 'pl_due', title: 'Overnight repo digest — private', prompt: 'p', kind: 'digest', model: '*',
  estimatedTokens: 1000, maxCostUsd: null, repeat: 'daily', tz: 'UTC',
  anchorHour: new Date().getUTCHours(), windowHours: 1, requireHeadroomFraction: 0, enabled: true,
  state: 'queued', lastRunAt: null, lastSkipReason: null, lastCostUsd: null, createdAt: new Date().toISOString(),
});

describe('F1 · the preload cron fails closed', () => {
  let calls: string[];
  beforeEach(() => {
    calls = [];
    vi.stubEnv('TIDEPOOL_QUEUE_URL', 'https://queue.test/items');
    vi.stubEnv('GATEWAY_URL', 'https://gateway.test');
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      calls.push(String(url));
      return new Response(JSON.stringify({ items: [openItem()] }), { status: 200 });
    }));
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('refuses to read or dispatch the queue when no CRON_SECRET is configured', async () => {
    vi.stubEnv('CRON_SECRET', '');
    const res = await cron(req('/api/cron/preload'));
    expect(res.status).toBe(503);
    expect(calls).toEqual([]); // not even the queue was fetched
  });

  it('does not tell an unauthenticated caller what is queued', async () => {
    vi.stubEnv('CRON_SECRET', '');
    vi.stubEnv('GATEWAY_URL', '');
    const body = await (await cron(req('/api/cron/preload'))).text();
    expect(body).not.toContain('Overnight repo digest');
  });

  it('rejects a wrong secret, and a right secret with a different length', async () => {
    vi.stubEnv('CRON_SECRET', 's3cret-value');
    for (const auth of ['Bearer nope', 'Bearer s3cret-valu', 'Bearer s3cret-value-and-more', 's3cret-value', '']) {
      const res = await cron(req('/api/cron/preload', { headers: auth ? { authorization: auth } : {} }));
      expect(res.status, auth).toBe(401);
    }
    expect(calls).toEqual([]);
  });

  it('dispatches with the right secret, carrying a key the gateway can dedupe on', async () => {
    vi.stubEnv('CRON_SECRET', 's3cret-value');
    const headers: Record<string, string>[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).startsWith('https://gateway.test')) headers.push(Object.fromEntries(new Headers(init?.headers)));
      return new Response(JSON.stringify({ items: [openItem()] }), { status: 200 });
    }));
    const auth = { headers: { authorization: 'Bearer s3cret-value' } };
    expect((await cron(req('/api/cron/preload', auth))).status).toBe(200);
    expect((await cron(req('/api/cron/preload', auth))).status).toBe(200);
    // A retried or repeated cron must not run the same window twice.
    expect(headers).toHaveLength(2);
    expect(headers[0]['idempotency-key']).toMatch(/^preload:pl_due:\d{4}-\d{2}-\d{2}T\d{2}/);
    expect(headers[1]['idempotency-key']).toBe(headers[0]['idempotency-key']);
  });
});

describe('F2 · rooms cannot be used to exhaust server memory', () => {
  it('does not create a room just because someone read it', async () => {
    const id = `probe-${Math.random().toString(36).slice(2, 8)}`;
    const res = await readRoom(req(`/api/rooms/${id}/events`), ctx(id));
    expect(res.status).toBe(200);
    expect(roomIds()).not.toContain(id);
  });

  it('refuses room ids that are not short, plain names', async () => {
    for (const id of ['', 'a'.repeat(65), 'has space', '../etc', 'UPPER', 'x\u0000y']) {
      const res = await publish(req('/api/rooms/x/events', { method: 'POST', body: JSON.stringify({ type: 'member.join' }) }), ctx(id));
      expect(res.status, JSON.stringify(id)).toBe(404);
    }
  });

  it('caps how many rooms one instance will hold', async () => {
    for (let i = 0; i < 400; i++) {
      await publish(req('/api/rooms/x/events', { method: 'POST', body: JSON.stringify({ type: 'member.join' }) }), ctx(`flood-${i}`));
    }
    expect(roomIds().length).toBeLessThanOrEqual(200);
  });

  it('refuses an event whose payload is larger than any real event', async () => {
    const big = { type: 'text.delta', payload: { text: 'x'.repeat(64 * 1024) } };
    const res = await publish(req('/api/rooms/harbour/events', { method: 'POST', body: JSON.stringify(big) }), ctx('harbour'));
    expect(res.status).toBe(400);
  });

  it('refuses a request body larger than the batch limit allows', async () => {
    const res = await publish(
      req('/api/rooms/harbour/events', { method: 'POST', body: 'x'.repeat(2 * 1024 * 1024) }),
      ctx('harbour'),
    );
    expect(res.status).toBe(413);
  });

  it('caps the identity fields an event can carry', async () => {
    const res = await publish(
      req('/api/rooms/harbour/events', {
        method: 'POST',
        body: JSON.stringify({ type: 'member.join', actor: 'a'.repeat(5000), runId: 'r'.repeat(5000) }),
      }),
      ctx('harbour'),
    );
    expect(res.status).toBe(400);
  });
});

describe('F3 · the plan endpoint has limits', () => {
  it('refuses a queue far larger than any real one', async () => {
    const items = Array.from({ length: 5000 }, (_, i) => ({ ...openItem(), id: `i${i}` }));
    const res = await planQueue(req('/api/preload/plan', { method: 'POST', body: JSON.stringify({ items, candidates: [], nodes: [] }) }));
    expect(res.status).toBe(413);
  });

  it('refuses a body larger than the limit before parsing it', async () => {
    const res = await planQueue(req('/api/preload/plan', { method: 'POST', body: `{"items":[],"pad":"${'x'.repeat(1024 * 1024)}"}` }));
    expect(res.status).toBe(413);
  });

  it('still plans an ordinary queue', async () => {
    const res = await planQueue(req('/api/preload/plan', { method: 'POST', body: JSON.stringify({ items: [openItem()], candidates: [], nodes: [], ownerUserId: 'u' }) }));
    expect(res.status).toBe(200);
  });
});

describe('F4 · payment links are https or nothing', () => {
  it('accepts an ordinary https payment page', () => {
    expect(safePayLink('https://ko-fi.com/someone')).toBe('https://ko-fi.com/someone');
    expect(safePayLink('  https://buy.stripe.com/abc  ')).toBe('https://buy.stripe.com/abc');
  });

  it('refuses anything a browser would run or send in the clear', () => {
    for (const bad of [
      'javascript:alert(1)', 'JAVASCRIPT:alert(1)', ' javascript:alert(1)', 'data:text/html,<script>1</script>',
      'vbscript:x', 'http://ko-fi.com/someone', '//evil.test', 'ko-fi.com/someone', '', 'https://', 'https://user:pw@evil.test',
    ]) {
      expect(safePayLink(bad), bad).toBeNull();
    }
  });
});

describe('F5 · the embed snippet is built from a parsed origin', () => {
  it('keeps only the origin, so a pasted value cannot break out of the attribute', () => {
    expect(originOf('https://tidepool.example/some/path?q=1')).toBe('https://tidepool.example');
    expect(originOf('https://x.test" onload="alert(1)')).toBeNull();
    expect(originOf('javascript:alert(1)')).toBeNull();
    expect(originOf('not a url')).toBeNull();
  });
});

describe('F6 · the framework is past the critical advisory', () => {
  it('runs a Next.js with the image-optimiser RCE patched (GHSA-2464-fhr4-w9xw, fixed in 15.5.28)', () => {
    const v = JSON.parse(readFileSync(join(process.cwd(), 'node_modules/next/package.json'), 'utf8')).version as string;
    const [maj, min, pat] = v.split('.').map(Number);
    expect(maj > 15 || (maj === 15 && (min > 5 || (min === 5 && pat >= 28))), v).toBe(true);
  });

  it('turns the image optimiser off, since nothing here uses it', async () => {
    const config = (await import('../../next.config')).default;
    expect(config.images?.unoptimized).toBe(true);
  });
});
