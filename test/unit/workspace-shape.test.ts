import { describe, expect, it } from 'vitest';
import { isWorkspace, seedWorkspace } from '@/lib/demo/seed';
import { seedSaturated } from '@/lib/demo/saturated';

describe('restoring a stored workspace', () => {
  it('accepts what this build itself writes', () => {
    expect(isWorkspace(seedWorkspace())).toBe(true);
    expect(isWorkspace(seedSaturated())).toBe(true);
  });

  it('survives a round trip through JSON, which is how it is actually stored', () => {
    expect(isWorkspace(JSON.parse(JSON.stringify(seedWorkspace())))).toBe(true);
  });

  it('rejects anything that is not an object', () => {
    for (const v of [null, undefined, 'workspace', 42, []]) expect(isWorkspace(v)).toBe(false);
  });

  it('rejects a workspace missing a collection this build reads', () => {
    for (const key of ['users', 'sources', 'runs', 'usage', 'ledger', 'preload', 'rungs', 'ideas', 'nodes'] as const) {
      const w = { ...seedWorkspace() } as Record<string, unknown>;
      delete w[key];
      expect(isWorkspace(w), `missing ${key} should be rejected`).toBe(false);
    }
  });

  it('rejects an older shape where a collection is the wrong type', () => {
    expect(isWorkspace({ ...seedWorkspace(), sources: {} })).toBe(false);
    expect(isWorkspace({ ...seedWorkspace(), headroom: [] as unknown })).toBe(true); // arrays are objects; headroom is indexed either way
    expect(isWorkspace({ ...seedWorkspace(), headroom: null })).toBe(false);
  });

  it('rejects a truncated hourly histogram, which every trough calculation assumes is 24 long', () => {
    expect(isWorkspace({ ...seedWorkspace(), hourlyLoad: [1, 2, 3] })).toBe(false);
  });

  it('rejects a workspace with no pool to render', () => {
    expect(isWorkspace({ ...seedWorkspace(), pool: null })).toBe(false);
    expect(isWorkspace({ ...seedWorkspace(), pool: { name: 'no id' } })).toBe(false);
  });
});
