import { NextResponse } from 'next/server';
import { freshness, register } from '@/lib/policy/register';

/** The register, as served data. Read-only, and safe to cache. */
export function GET() {
  const providers = Object.values(register).map((p) => ({
    provider: p.provider,
    display_name: p.display_name,
    verified_at: p.verified_at,
    verified_by: p.verified_by,
    freshness: freshness(p),
    source_urls: p.source_urls,
    credentials: p.credentials.map((c) => ({
      id: c.id,
      class: c.class,
      poolable_across_people: c.poolable_across_people,
      may_store_credential: c.may_store_credential,
      resellable: c.resellable,
    })),
  }));
  return NextResponse.json({ providers }, { headers: { 'cache-control': 'public, max-age=300' } });
}
