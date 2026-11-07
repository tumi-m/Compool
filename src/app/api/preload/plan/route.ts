import { NextResponse } from 'next/server';
import { register } from '@/lib/policy/register';
import { plan, type PreloadItem } from '@/lib/preload/schedule';
import type { Candidate, NodeRecord } from '@/lib/types';
import { readJson } from '@/lib/http';

/**
 * Anyone can call this, and planning is items × candidates work, so the input
 * is bounded: a request used to be read whole, at any size, and planned however
 * long it took. These limits are far past any real queue.
 */
const MAX_BODY_BYTES = 256 * 1024;
const MAX_ITEMS = 500;
const MAX_CANDIDATES = 200;
const MAX_NODES = 200;

export const dynamic = 'force-dynamic';

interface Body {
  items: PreloadItem[];
  candidates: Candidate[];
  nodes: NodeRecord[];
  ownerUserId: string;
  poolId: string | null;
  budgetRemainingUsd: number | null;
  now?: number;
}

/**
 * Server-side evaluation of the queue. The same pure scheduler the UI runs, so a
 * client and the cron can never disagree about whether an item is due.
 */
export async function POST(req: Request) {
  const read = await readJson(req, MAX_BODY_BYTES);
  if (!read.ok) return NextResponse.json({ error: read.error }, { status: read.status });
  const body = read.value as Body;
  if (typeof body !== 'object' || body === null || !Array.isArray(body.items)) {
    return NextResponse.json({ error: 'items must be an array' }, { status: 400 });
  }
  const tooMany =
    body.items.length > MAX_ITEMS ||
    (Array.isArray(body.candidates) && body.candidates.length > MAX_CANDIDATES) ||
    (Array.isArray(body.nodes) && body.nodes.length > MAX_NODES);
  if (tooMany) {
    return NextResponse.json(
      { error: `at most ${MAX_ITEMS} items, ${MAX_CANDIDATES} candidates and ${MAX_NODES} nodes per plan` },
      { status: 413 },
    );
  }

  const result = plan(body.items, {
    now: body.now ?? Date.now(),
    policies: register,
    candidates: body.candidates ?? [],
    nodes: body.nodes ?? [],
    ownerUserId: body.ownerUserId,
    poolId: body.poolId ?? null,
    budgetRemainingUsd: body.budgetRemainingUsd ?? null,
  });

  return NextResponse.json(result);
}
