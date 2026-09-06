// Domain types. Mirrors the schema in §7 of the plan; the fields the UI needs are
// carried in full, the ones only the gateway needs are omitted rather than faked.

export type CapacityClass = 'A' | 'B' | 'C';

export type SourceStatus =
  | 'pending'
  | 'active'
  | 'cooling'
  | 'exhausted'
  | 'invalid'
  | 'revoked';

export interface CapacitySource {
  id: string;
  ownerUserId: string;
  provider: string;
  credentialTypeId: string;
  cls: CapacityClass;
  label: string;
  /** Class C is always 'device'. Enforced by the guard and by a DB check constraint. */
  storageLocation: 'vault' | 'device';
  last4: string | null;
  nodeId: string | null;
  status: SourceStatus;
  contributedToPool: string | null;
  priority: number;
  monthlyCapUsd: number | null;
  createdAt: string;
  /** True when this source is a preview stand-in rather than a vaulted credential. */
  preview: boolean;
}

export interface Headroom {
  /** Tokens remaining at observedAt. Provider-reported, rounded to the nearest 1000. */
  tokens: number;
  /** The ceiling the remaining count is measured against. */
  limitTokens: number;
  /** RFC3339. The moment the bucket is *fully* replenished, not a step reset. */
  resetAt: string;
  observedAt: string;
  requestsRemaining: number | null;
  consecutive429: number;
  coolingUntil: string | null;
}

export interface Candidate {
  source: CapacitySource;
  headroom: Headroom | null;
  estCostUsd: number;
  observedLatencyMs: number;
  recentErrorRate: number;
}

export type WorkKind = 'interactive' | 'bulk';

export interface WorkUnit {
  id: string;
  model: string;
  kind: WorkKind;
  estimatedTokens: number;
  attributedUserId: string;
  poolId: string | null;
}

export interface Weights {
  survival: number;
  reliability: number;
  latency: number;
  cost: number;
  fairness: number;
  affinity: number;
}

export interface SelectionContext {
  now: number;
  poolId: string | null;
  consumerUserId: string;
  excludedSourceIds: Set<string>;
  headroomMarginTokens: number;
  costSensitivity: number;
  stickySourceId: string | null;
  contributionUsd: Map<string, number>;
  consumptionUsd: Map<string, number>;
  poolNetSpreadUsd: number;
  w: Weights;
  policies: PolicyRegister;
  budgetRemainingUsd: number | null;
  memberCapRemainingUsd: number | null;
}

export type Selection =
  | { kind: 'selected'; source: CapacitySource; alternatives: CapacitySource[]; scores: ScoreBreakdown[] }
  | { kind: 'no_capacity'; reason: string };

export interface ScoreBreakdown {
  sourceId: string;
  score: number;
  survival: number;
  reliability: number;
  latency: number;
  cost: number;
  fairness: number;
  affinity: number;
}

// ---- policy register -------------------------------------------------------

export interface CredentialPolicy {
  id: string;
  class: CapacityClass;
  poolable_across_people: boolean;
  resellable: boolean;
  may_store_credential: boolean;
  may_proxy_credential: boolean;
  execution?: string;
  official_cli?: { binary: string; noninteractive_flag: string };
  notes?: string;
}

export interface ProviderPolicy {
  provider: string;
  display_name: string;
  base_url: string;
  credential_headers: string[];
  credentials: CredentialPolicy[];
  headroom_headers: Record<string, string>;
  reset_format: string;
  replenishment: string;
  spend_cap_429_has_retry_after: boolean | null;
  source_urls: string[];
  verified_at: string | null;
  verified_by: string;
  needs_verification: boolean;
  verification_notes: string[];
}

export type PolicyRegister = Record<string, ProviderPolicy>;

// ---- metering --------------------------------------------------------------

export interface Usage {
  inputTokens: number;
  outputTokens: number;
  cacheWriteTokens: number;
  cacheReadTokens: number;
  reasoningTokens: number;
  gpuSeconds: number;
}

export interface UsageEvent extends Usage {
  id: string;
  runId: string;
  sourceId: string;
  poolId: string;
  consumerUserId: string;
  contributorUserId: string;
  provider: string;
  model: string;
  priceBookVersion: string;
  costUsd: number;
  estimated: boolean;
  createdAt: string;
}

export interface LedgerEntry {
  id: string;
  poolId: string;
  usageEventId: string;
  userId: string;
  direction: 'debit' | 'credit';
  amountUsd: number;
  createdAt: string;
}

export interface ModelPrice {
  modelId: string;
  inputUsd: number;
  outputUsd: number;
  cacheWriteUsd: number | null;
  cacheReadUsd: number | null;
  reasoningUsd: number | null;
}

export interface PriceBook {
  version: string;
  sourceUrl: string | null;
  fetchedAt: string | null;
  /** True when the numbers are stand-ins, not fetched from a provider price page. */
  synthetic: boolean;
  prices: Record<string, ModelPrice>;
}

// ---- people, pools, runs ---------------------------------------------------

export interface User {
  id: string;
  handle: string;
  displayName: string;
}

export interface Pool {
  id: string;
  slug: string;
  name: string;
  kind: 'solo' | 'team' | 'hackathon';
  ownerUserId: string;
  budgetCapUsd: number | null;
  budgetPeriod: 'session' | 'day' | 'week' | 'month';
  settlePolicy: 'per_use' | 'even_split' | 'contributor_weighted' | 'none';
}

export interface PoolMember {
  userId: string;
  role: 'owner' | 'admin' | 'builder' | 'viewer';
  spendCapUsd: number | null;
}

export type RunState =
  | 'queued'
  | 'routing'
  | 'reserved'
  | 'streaming'
  | 'tool_wait'
  | 'metering'
  | 'done'
  | 'failed'
  | 'cancelled';

export interface Run {
  id: string;
  poolId: string;
  title: string;
  requestedBy: string;
  attributedTo: string;
  state: RunState;
  sourceId: string | null;
  kind: WorkKind;
  attempt: number;
  maxAttempts: number;
  errorCode: string | null;
  costUsd: number;
  outputTokens: number;
  estimatedTokens: number;
  createdAt: string;
  finishedAt: string | null;
  /** Set when the run was dispatched by the preload scheduler rather than a human. */
  preloadItemId?: string;
}

export interface NodeRecord {
  id: string;
  ownerUserId: string;
  name: string;
  platform: string;
  status: 'online' | 'offline' | 'draining' | 'blocked';
  /** §11.5 consent gate. Never defaults to 'auto'. */
  poolMode: 'off' | 'offer' | 'auto';
  lastSeenAt: string;
}
