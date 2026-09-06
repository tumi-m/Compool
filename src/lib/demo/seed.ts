import type {
  CapacitySource,
  Headroom,
  LedgerEntry,
  NodeRecord,
  Pool,
  PoolMember,
  Run,
  UsageEvent,
  User,
} from '../types';
import type { PreloadItem } from '../preload/schedule';
import { PRELOAD_DEFAULTS } from '../preload/schedule';

export const ME = 'user_me';

export interface Workspace {
  users: User[];
  pool: Pool;
  members: PoolMember[];
  sources: CapacitySource[];
  headroom: Record<string, Headroom | null>;
  nodes: NodeRecord[];
  runs: Run[];
  usage: UsageEvent[];
  ledger: LedgerEntry[];
  preload: PreloadItem[];
  /** 24 hourly buckets of tokens spent, local time. Feeds the trough finder. */
  hourlyLoad: number[];
  preset: string;
  seededAt: string;
}

const iso = (ms: number) => new Date(ms).toISOString();

function headroom(now: number, limit: number, fraction: number, resetInMin: number): Headroom {
  return {
    tokens: Math.round((limit * fraction) / 1000) * 1000, // providers round to the nearest thousand
    limitTokens: limit,
    resetAt: iso(now + resetInMin * 60_000),
    observedAt: iso(now - 30_000),
    requestsRemaining: Math.round(1000 * fraction),
    consecutive429: 0,
    coolingUntil: null,
  };
}

/**
 * A workspace with enough shape to exercise every state: a full basin, a draining
 * one, an exhausted one, owned compute with no headroom signal at all, and a
 * personal seat that can never be pooled.
 */
export function seedWorkspace(now = Date.now()): Workspace {
  const users: User[] = [
    { id: ME, handle: 'you', displayName: 'You' },
    { id: 'user_ada', handle: 'ada', displayName: 'Ada' },
    { id: 'user_kwame', handle: 'kwame', displayName: 'Kwame' },
  ];

  const sources: CapacitySource[] = [
    {
      id: 'src_anthropic_a', ownerUserId: ME, provider: 'anthropic', credentialTypeId: 'anthropic.api_key',
      cls: 'A', label: 'Anthropic · build key', storageLocation: 'vault', last4: '7f2a', nodeId: null,
      status: 'active', contributedToPool: 'pool_demo', priority: 100, monthlyCapUsd: 200,
      createdAt: iso(now - 86_400_000 * 12), preview: true,
    },
    {
      id: 'src_openai_a', ownerUserId: 'user_ada', provider: 'openai', credentialTypeId: 'openai.api_key',
      cls: 'A', label: 'OpenAI · scoped $50', storageLocation: 'vault', last4: 'c410', nodeId: null,
      status: 'active', contributedToPool: 'pool_demo', priority: 100, monthlyCapUsd: 50,
      createdAt: iso(now - 86_400_000 * 5), preview: true,
    },
    {
      id: 'src_google_a', ownerUserId: 'user_kwame', provider: 'google', credentialTypeId: 'google.api_key',
      cls: 'A', label: 'Google AI · prepaid', storageLocation: 'vault', last4: '9b31', nodeId: null,
      status: 'exhausted', contributedToPool: 'pool_demo', priority: 90, monthlyCapUsd: null,
      createdAt: iso(now - 86_400_000 * 30), preview: true,
    },
    {
      id: 'src_ollama_b', ownerUserId: ME, provider: 'ollama', credentialTypeId: 'ollama.local_server',
      cls: 'B', label: 'Studio box · 70B local', storageLocation: 'device', last4: null, nodeId: 'node_studio',
      status: 'active', contributedToPool: 'pool_demo', priority: 60, monthlyCapUsd: null,
      createdAt: iso(now - 86_400_000 * 3), preview: true,
    },
    {
      id: 'src_anthropic_c', ownerUserId: ME, provider: 'anthropic', credentialTypeId: 'anthropic.subscription_oauth',
      cls: 'C', label: 'Your Claude seat', storageLocation: 'device', last4: null, nodeId: 'node_laptop',
      status: 'active', contributedToPool: null, priority: 120, monthlyCapUsd: null,
      createdAt: iso(now - 86_400_000 * 40), preview: true,
    },
  ];

  const hr: Record<string, Headroom | null> = {
    src_anthropic_a: headroom(now, 2_000_000, 0.82, 55),
    src_openai_a: headroom(now, 1_000_000, 0.34, 40),
    src_google_a: headroom(now, 1_000_000, 0.0, 210),
    src_ollama_b: null, // owned compute reports no window; survival falls back to 0.75
    src_anthropic_c: headroom(now, 900_000, 0.19, 165),
  };

  // A day that looks like a person: quiet overnight, a morning ramp, an evening peak.
  const shape = [4, 2, 1, 0, 0, 1, 6, 22, 61, 88, 96, 74, 52, 70, 85, 91, 78, 64, 47, 58, 72, 66, 41, 17];
  const hourlyLoad = shape.map((v) => v * 1000);

  const preload: PreloadItem[] = [
    {
      id: 'pl_digest', title: 'Overnight repo digest',
      prompt: 'Summarise every commit merged to main since the last digest. Flag anything that changes a public interface, and list the three files most likely to need a follow-up.',
      kind: 'digest', model: '*', estimatedTokens: 180_000, maxCostUsd: 0.75,
      repeat: 'daily', tz: 'Africa/Johannesburg', anchorHour: PRELOAD_DEFAULTS.anchorHour,
      windowHours: PRELOAD_DEFAULTS.windowHours, requireHeadroomFraction: 0.7,
      enabled: true, state: 'queued', lastRunAt: null, lastSkipReason: null, lastCostUsd: null,
      createdAt: iso(now - 86_400_000 * 2),
    },
    {
      id: 'pl_warm', title: 'Warm the gateway context',
      prompt: 'Load packages/gateway and packages/router into context and hold them. No output beyond an acknowledgement.',
      kind: 'warm_cache', model: 'anthropic:workhorse', estimatedTokens: 240_000, maxCostUsd: 1.2,
      repeat: 'weekdays', tz: 'Africa/Johannesburg', anchorHour: 3, windowHours: 3, requireHeadroomFraction: 0.75,
      enabled: true, state: 'queued', lastRunAt: null, lastSkipReason: null, lastCostUsd: null,
      createdAt: iso(now - 86_400_000 * 2),
    },
    {
      id: 'pl_triage', title: 'Triage the failing suite',
      prompt: 'Run through last night’s CI log. Group failures by root cause, and propose the smallest patch for each group.',
      kind: 'bulk', model: '*', estimatedTokens: 90_000, maxCostUsd: 0.4,
      repeat: 'daily', tz: 'Africa/Johannesburg', anchorHour: 3, windowHours: 3, requireHeadroomFraction: 0.6,
      enabled: false, state: 'queued', lastRunAt: null, lastSkipReason: null, lastCostUsd: null,
      createdAt: iso(now - 86_400_000),
    },
  ];

  return {
    users,
    pool: {
      id: 'pool_demo', slug: 'tidepool-demo', name: 'Harbour build', kind: 'hackathon',
      ownerUserId: ME, budgetCapUsd: 40, budgetPeriod: 'day', settlePolicy: 'none',
    },
    members: [
      { userId: ME, role: 'owner', spendCapUsd: null },
      { userId: 'user_ada', role: 'builder', spendCapUsd: 12 },
      { userId: 'user_kwame', role: 'builder', spendCapUsd: 12 },
    ],
    sources,
    headroom: hr,
    nodes: [
      { id: 'node_laptop', ownerUserId: ME, name: 'laptop', platform: 'darwin-arm64', status: 'online', poolMode: 'offer', lastSeenAt: iso(now - 20_000) },
      { id: 'node_studio', ownerUserId: ME, name: 'studio-box', platform: 'linux-x64', status: 'online', poolMode: 'offer', lastSeenAt: iso(now - 45_000) },
    ],
    runs: [],
    usage: [],
    ledger: [],
    preload,
    hourlyLoad,
    preset: 'Balanced',
    seededAt: iso(now),
  };
}
