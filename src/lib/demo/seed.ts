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
import type { Idea } from '../orchestrate/triage';

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
  rungs: Rung[];
  ideas: Idea[];
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

const SEED_IDEAS = (now: number): Idea[] => [
  { id: 'idea_1', text: 'Replace the hand-rolled SSE parser with the adapter interface', impact: 5, effort: 4, urgency: 4, blockedBy: [], status: 'inbox', createdAt: iso(now - 7_200_000) },
  { id: 'idea_2', text: 'Record the abort-midstream fixture for every provider', impact: 4, effort: 2, urgency: 5, blockedBy: [], status: 'inbox', createdAt: iso(now - 6_600_000) },
  { id: 'idea_3', text: 'Ledger reconciliation job against the provider usage endpoint', impact: 5, effort: 5, urgency: 3, blockedBy: ['idea_2'], status: 'inbox', createdAt: iso(now - 6_000_000) },
  { id: 'idea_4', text: 'Rename coolingUntil to something a human would say out loud', impact: 1, effort: 1, urgency: 1, blockedBy: [], status: 'inbox', createdAt: iso(now - 5_400_000) },
  { id: 'idea_5', text: 'Virtualise the runs list past fifty rows', impact: 3, effort: 2, urgency: 2, blockedBy: [], status: 'inbox', createdAt: iso(now - 4_800_000) },
  { id: 'idea_6', text: 'Node pairing flow end to end on a fresh machine', impact: 5, effort: 4, urgency: 2, blockedBy: [], status: 'inbox', createdAt: iso(now - 4_200_000) },
];

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
    rungs: LADDER,
    ideas: SEED_IDEAS(now),
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
