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
import type { Rung } from '../ladder/rungs';
import { entriesFor } from '../meter/ledger';
import type { Idea } from '../orchestrate/triage';
import type { Goal, Pledge } from '../support/pledge';

export const ME = 'user_me';

/** The creator-facing half of "buy me compute". */
export interface SupportProfile {
  enabled: boolean;
  handle: string;
  displayName: string;
  /** One line, in the creator's own words, about what the compute is for. */
  blurb: string;
  goal: Goal | null;
  /**
   * The creator's own payment link — Stripe, Ko-fi, GitHub Sponsors, anything.
   * TIDEPOOL links out to it and never handles the money.
   */
  payLink: string | null;
  pledges: Pledge[];
}

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
  rungs: Rung[];
  ideas: Idea[];
  support: SupportProfile;
  /** 24 hourly buckets of tokens spent, local time. Feeds the trough finder. */
  hourlyLoad: number[];
  preset: string;
  seededAt: string;
}

const iso = (ms: number) => new Date(ms).toISOString();

/**
 * The ladder, as supplied by the operator.
 *
 * Every name here came from the person configuring the deployment, not from a
 * provider catalogue — so every rung is `verified: false` and the catalogue says
 * so. Rule 1 forbids inventing model ids, and the ladder mechanism does not care
 * what the rungs are called; it only cares which provider serves each one and
 * how much of that provider's window is left.
 */
export const LADDER: Rung[] = [
  { id: 'rung_astra_opus', name: 'Astra Opus', tier: 'frontier', provider: 'anthropic', openWeight: false, canPlan: false, verified: false },
  { id: 'rung_kimi_k3', name: 'Kimi K3', tier: 'frontier', provider: 'openai', openWeight: true, canPlan: false, verified: false, note: 'Open weights, hosted.' },
  { id: 'rung_deepseek_v4_pro', name: 'DeepSeek V4 Pro', tier: 'frontier', provider: 'google', openWeight: true, canPlan: false, verified: false, note: 'Open weights, hosted.' },
  { id: 'rung_glm_53', name: 'GLM 5.3', tier: 'strong', provider: 'anthropic', openWeight: true, canPlan: true, verified: false, note: 'Open weights, hosted.' },
  { id: 'rung_gpt_terra', name: 'GPT Terra', tier: 'light', provider: 'openai', openWeight: false, canPlan: true, verified: false },
  { id: 'rung_glm_53_flash', name: 'GLM 5.3 Flash', tier: 'light', provider: 'anthropic', openWeight: true, canPlan: true, verified: false, note: 'Open weights, hosted.' },
  { id: 'rung_deepseek_muse', name: 'DeepSeek V4 Muse', tier: 'light', provider: 'google', openWeight: true, canPlan: true, verified: false, note: 'Open weights, hosted.' },
  { id: 'rung_spark_contrib', name: 'Spark 1.3 Contributor', tier: 'free', provider: 'openai', openWeight: true, canPlan: true, verified: false, note: 'Free tier.' },
  { id: 'rung_local_70b', name: 'Local 70B (open weight)', tier: 'free', provider: 'ollama', openWeight: true, canPlan: true, verified: true, note: 'Your own hardware. Never runs out; only gets slower. This rung is the floor that makes always-on true.' },
];

/**
 * Built inline rather than through newPledge, because importing it here would
 * drag the whole support module into the chunk that every route loads — the
 * seed is reachable from the provider, and the provider is in the shared layout.
 */
const seedPledge = (p: Omit<Pledge, 'tokens' | 'redeemedTokens'> & { unitTokens: number }): Pledge => ({
  ...p,
  tokens: p.unitTokens * p.count,
  redeemedTokens: 0,
});

const SEED_SUPPORT = (now: number): SupportProfile => ({
  enabled: true,
  handle: 'harbour',
  displayName: 'Harbour build',
  blurb: 'I build open tools for pooled AI capacity, and publish everything I learn doing it.',
  goal: { label: 'a month of overnight digests', tokens: 7_500_000 },
  payLink: null,
  pledges: [
    seedPledge({
      id: 'pl_seed_1', creatorHandle: 'harbour', kind: 'capacity', supporterName: 'Ada',
      message: 'The stall-breaker saved my weekend. Here is a night of my box.',
      unitId: 'spring', unitTokens: 1_000_000, count: 1, sourceId: 'src_ollama_b',
      supporterUserId: 'user_ada', expiresAt: iso(now + 86_400_000 * 6), state: 'active',
      createdAt: iso(now - 86_400_000 * 2),
    }),
    seedPledge({
      id: 'pl_seed_2', creatorHandle: 'harbour', kind: 'capacity', supporterName: 'Kwame',
      message: null, unitId: 'tide', unitTokens: 250_000, count: 2, sourceId: 'src_openai_a',
      supporterUserId: 'user_kwame', expiresAt: iso(now + 86_400_000 * 3), state: 'active',
      createdAt: iso(now - 86_400_000),
    }),
    seedPledge({
      id: 'pl_seed_3', creatorHandle: 'harbour', kind: 'cash', supporterName: 'Someone from the talk',
      message: 'Great session — go build the thing.', unitId: 'tide', unitTokens: 250_000, count: 1,
      sourceId: null, supporterUserId: null, expiresAt: null, state: 'pending',
      createdAt: iso(now - 3_600_000),
    }),
  ],
});

const SEED_IDEAS = (now: number): Idea[] => [
  { id: 'idea_1', text: 'Replace the hand-rolled SSE parser with the adapter interface', impact: 5, effort: 4, urgency: 4, blockedBy: [], status: 'inbox', createdAt: iso(now - 7_200_000) },
  { id: 'idea_2', text: 'Record the abort-midstream fixture for every provider', impact: 4, effort: 2, urgency: 5, blockedBy: [], status: 'inbox', createdAt: iso(now - 6_600_000) },
  { id: 'idea_3', text: 'Ledger reconciliation job against the provider usage endpoint', impact: 5, effort: 5, urgency: 3, blockedBy: ['idea_2'], status: 'inbox', createdAt: iso(now - 6_000_000) },
  { id: 'idea_4', text: 'Rename coolingUntil to something a human would say out loud', impact: 1, effort: 1, urgency: 1, blockedBy: [], status: 'inbox', createdAt: iso(now - 5_400_000) },
  { id: 'idea_5', text: 'Virtualise the runs list past fifty rows', impact: 3, effort: 2, urgency: 2, blockedBy: [], status: 'inbox', createdAt: iso(now - 4_800_000) },
  { id: 'idea_6', text: 'Node pairing flow end to end on a fresh machine', impact: 5, effort: 4, urgency: 2, blockedBy: [], status: 'inbox', createdAt: iso(now - 4_200_000) },
];

function headroomAt(now: number, limit: number, fraction: number, resetInMin: number): Headroom {
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
/**
 * §14.8 state 5, made reachable.
 *
 * Forty sources, twelve members and three hundred runs — what a real hackathon
 * produces within the hour. Grouped basins and the windowed run list are only
 * worth anything if someone can actually get the app into this state, so this
 * builds it on demand rather than leaving the code untested until a user finds it.
 */
export function seedSaturated(now = Date.now()): Workspace {
  const base = seedWorkspace(now);
  const providers = ['anthropic', 'openai', 'google', 'ollama'];

  const users: User[] = [
    ...base.users,
    ...Array.from({ length: 9 }, (_, i) => ({
      id: `user_h${i}`,
      handle: `hack${i}`,
      displayName: `Builder ${i + 1}`,
    })),
  ];

  const sources: CapacitySource[] = [
    ...base.sources,
    ...Array.from({ length: 35 }, (_, i) => {
      const provider = providers[i % providers.length];
      const owner = users[i % users.length].id;
      return {
        id: `src_bulk_${i}`,
        ownerUserId: owner,
        provider,
        credentialTypeId: provider === 'ollama' ? 'ollama.local_server' : `${provider}.api_key`,
        cls: (provider === 'ollama' ? 'B' : 'A') as CapacitySource['cls'],
        label: `${provider} · key ${i + 1}`,
        storageLocation: (provider === 'ollama' ? 'device' : 'vault') as CapacitySource['storageLocation'],
        last4: provider === 'ollama' ? null : (1000 + i).toString(16),
        nodeId: provider === 'ollama' ? 'node_studio' : null,
        status: (i % 11 === 0 ? 'exhausted' : 'active') as CapacitySource['status'],
        contributedToPool: 'pool_demo',
        priority: 100,
        monthlyCapUsd: 25,
        createdAt: iso(now - 86_400_000 * (i % 20)),
        preview: true,
      };
    }),
  ];

  const headroom = { ...base.headroom };
  sources.slice(base.sources.length).forEach((s, i) => {
    headroom[s.id] =
      s.cls === 'B'
        ? null
        : headroomAt(now, 1_000_000, ((i * 37) % 100) / 100, 20 + (i % 90));
  });

  const runs: Run[] = Array.from({ length: 300 }, (_, i) => {
    const src = sources[i % sources.length];
    return {
      id: `run_bulk_${i}`,
      poolId: base.pool.id,
      title: `${['Refactor', 'Triage', 'Digest', 'Review', 'Port', 'Bench'][i % 6]} ${['router', 'meter', 'vault', 'adapters', 'ledger'][i % 5]} #${i}`,
      requestedBy: users[i % users.length].id,
      attributedTo: users[i % users.length].id,
      state: (i % 23 === 0 ? 'failed' : 'done') as Run['state'],
      sourceId: src.id,
      kind: (i % 3 === 0 ? 'bulk' : 'interactive') as Run['kind'],
      attempt: 1,
      maxAttempts: 3,
      errorCode: i % 23 === 0 ? 'Every eligible source was at low tide.' : null,
      costUsd: Number((((i * 13) % 40) / 100).toFixed(4)),
      outputTokens: 400 + ((i * 97) % 6000),
      estimatedTokens: 20_000 + ((i * 311) % 90_000),
      createdAt: iso(now - i * 47_000),
      finishedAt: iso(now - i * 47_000 + 12_000),
      rungName: ['Astra Opus', 'GLM 5.3', 'GPT Terra', 'Local 70B (open weight)'][i % 4],
      targetTier: 'frontier',
      needsRework: i % 4 === 2,
    };
  });

  // Runs that cost money must also appear in the ledger, or the Stack says
  // nobody has spent anything while three hundred runs sit next to it.
  const usage: UsageEvent[] = runs
    .filter((r) => r.state === 'done')
    .map((r) => {
      const src = sources.find((x) => x.id === r.sourceId)!;
      return {
        id: `ue_${r.id}`,
        runId: r.id,
        sourceId: src.id,
        poolId: base.pool.id,
        consumerUserId: r.attributedTo,
        contributorUserId: src.ownerUserId,
        provider: src.provider,
        model: src.cls === 'B' ? 'ollama:local' : `${src.provider}:workhorse`,
        inputTokens: Math.round(r.estimatedTokens * 0.6),
        outputTokens: r.outputTokens,
        cacheWriteTokens: 0,
        cacheReadTokens: 0,
        reasoningTokens: 0,
        gpuSeconds: 0,
        priceBookVersion: 'unseeded-synthetic',
        costUsd: r.costUsd,
        estimated: false,
        createdAt: r.createdAt,
      };
    });

  const ledger: LedgerEntry[] = usage.flatMap((e) => entriesFor(e, (suffix) => `${e.id}_${suffix}`));

  return {
    ...base,
    users,
    sources,
    headroom,
    runs,
    usage,
    ledger,
    members: users.map((u, i) => ({
      userId: u.id,
      role: (i === 0 ? 'owner' : 'builder') as Workspace['members'][number]['role'],
      spendCapUsd: i === 0 ? null : 12,
    })),
  };
}

/**
 * The shape the app currently understands.
 *
 * Restoring a workspace saved by an older build and trusting its shape is how a
 * user ends up looking at a white screen after a deploy — every field this code
 * reads has to actually be there. Anything that does not match is discarded for
 * a fresh seed, which costs a preview workspace and saves the session.
 */
export function isWorkspace(v: unknown): v is Workspace {
  if (typeof v !== 'object' || v === null) return false;
  const w = v as Partial<Workspace>;
  const arrays: (keyof Workspace)[] = [
    'users', 'members', 'sources', 'nodes', 'runs', 'usage', 'ledger', 'preload', 'rungs', 'ideas', 'hourlyLoad',
  ];
  if (!arrays.every((k) => Array.isArray(w[k]))) return false;
  if (w.hourlyLoad!.length !== 24) return false;
  if (typeof w.headroom !== 'object' || w.headroom === null) return false;
  if (typeof w.pool !== 'object' || w.pool === null || typeof w.pool.id !== 'string') return false;
  if (typeof w.seededAt !== 'string' || !Number.isFinite(Date.parse(w.seededAt))) return false;
  if (typeof w.support !== 'object' || w.support === null || !Array.isArray(w.support.pledges)) return false;
  return true;
}

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
    src_anthropic_a: headroomAt(now, 2_000_000, 0.82, 55),
    src_openai_a: headroomAt(now, 1_000_000, 0.34, 40),
    src_google_a: headroomAt(now, 1_000_000, 0.0, 210),
    src_ollama_b: null, // owned compute reports no window; survival falls back to 0.75
    src_anthropic_c: headroomAt(now, 900_000, 0.19, 165),
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
    rungs: LADDER,
    ideas: SEED_IDEAS(now),
    support: SEED_SUPPORT(now),
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
