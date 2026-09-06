import { describe, expect, it } from 'vitest';
import { PolicyError, assertDispatchAllowed, policyAllows } from '@/lib/policy/guard';
import { register } from '@/lib/policy/register';
import type { CapacitySource, WorkUnit } from '@/lib/types';

const seat: CapacitySource = {
  id: 'src_c', ownerUserId: 'user_a', provider: 'anthropic',
  credentialTypeId: 'anthropic.subscription_oauth', cls: 'C', label: 'seat',
  storageLocation: 'device', last4: null, nodeId: 'node_1', status: 'active',
  contributedToPool: null, priority: 100, monthlyCapUsd: null,
  createdAt: '2026-01-01T00:00:00Z', preview: true,
};

const key: CapacitySource = { ...seat, id: 'src_a', credentialTypeId: 'anthropic.api_key', cls: 'A', storageLocation: 'vault', nodeId: null };

const work = (over: Partial<WorkUnit> = {}): WorkUnit => ({
  id: 'w', model: '*', kind: 'interactive', estimatedTokens: 1000,
  attributedUserId: 'user_a', poolId: null, ...over,
});

describe('the Class C invariant', () => {
  it('lets the owner run their own work on their own seat', () => {
    expect(() => assertDispatchAllowed(seat, work(), register)).not.toThrow();
  });

  it('refuses work attributed to anyone else', () => {
    expect(() => assertDispatchAllowed(seat, work({ attributedUserId: 'user_b' }), register))
      .toThrowError(/CLASS_C_CROSS_USER/);
  });

  it('refuses a seat that claims to live in the vault', () => {
    expect(() => assertDispatchAllowed({ ...seat, storageLocation: 'vault' }, work(), register))
      .toThrowError(/CLASS_C_OFF_DEVICE/);
  });

  it('refuses a seat that has somehow been contributed to a pool', () => {
    expect(() => assertDispatchAllowed({ ...seat, contributedToPool: 'pool_1' }, work(), register))
      .toThrowError(/CLASS_C_POOLED/);
  });

  it('refuses pooled work on a seat even when the owner requested it', () => {
    // The owner may run their own pooled work on their own seat, but never
    // another member's — this covers the cross-user case inside a pool.
    expect(() => assertDispatchAllowed(seat, work({ poolId: 'pool_1', attributedUserId: 'user_b' }), register))
      .toThrowError(/CLASS_C_CROSS_USER/);
  });
});

describe('the register gates dispatch', () => {
  it('refuses a credential type with no policy entry', () => {
    const rogue = { ...key, credentialTypeId: 'anthropic.invented_type' };
    try {
      assertDispatchAllowed(rogue, work(), register);
      throw new Error('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(PolicyError);
      expect((e as PolicyError).code).toBe('NO_POLICY_ENTRY');
    }
  });

  it('lets a metered key serve another member of the pool', () => {
    expect(policyAllows(key, work({ poolId: 'pool_1', attributedUserId: 'user_b' }), register)).toBe(true);
  });
});

describe('the shipped register itself', () => {
  it('never marks a Class C credential storable, proxyable or poolable', () => {
    for (const p of Object.values(register)) {
      for (const c of p.credentials) {
        if (c.class !== 'C') continue;
        expect(c.may_store_credential, `${c.id}.may_store_credential`).toBe(false);
        expect(c.may_proxy_credential, `${c.id}.may_proxy_credential`).toBe(false);
        expect(c.poolable_across_people, `${c.id}.poolable_across_people`).toBe(false);
        expect(c.resellable, `${c.id}.resellable`).toBe(false);
      }
    }
  });

  it('never marks a Class C credential resellable in a listing', () => {
    const listable = Object.values(register).flatMap((p) => p.credentials).filter((c) => c.resellable);
    expect(listable.every((c) => c.class !== 'C')).toBe(true);
  });
});
