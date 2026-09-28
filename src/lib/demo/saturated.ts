import type { CapacitySource, LedgerEntry, Run, UsageEvent, User } from '../types';
import { entriesFor } from '../meter/ledger';
import { headroomAt, iso, seedWorkspace, type Workspace } from './seed';

/**
 * §14.8 state 5, made reachable.
 *
 * Its own module, loaded on demand: it generates three hundred runs for one demo
 * button, and it was riding in the chunk every route downloads.
 *
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


