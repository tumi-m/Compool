import { NextResponse } from 'next/server';
import { register } from '@/lib/policy/register';
import { plan, type PreloadItem } from '@/lib/preload/schedule';
import type { Candidate, NodeRecord } from '@/lib/types';

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
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 });
  }
  if (!Array.isArray(body.items)) {
    return NextResponse.json({ error: 'items must be an array' }, { status: 400 });
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
