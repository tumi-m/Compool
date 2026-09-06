import type { CapacitySource, PolicyRegister, WorkUnit } from '../types';

export type PolicyErrorCode =
  | 'NO_POLICY_ENTRY'
  | 'CLASS_C_CROSS_USER'
  | 'CLASS_C_OFF_DEVICE'
  | 'CLASS_C_POOLED'
  | 'NOT_POOLABLE';

export class PolicyError extends Error {
  constructor(readonly code: PolicyErrorCode, readonly subject: string) {
    super(`${code}: ${subject}`);
    this.name = 'PolicyError';
  }
}

/**
 * The §3 invariant, in code. Called in exactly one place — immediately before
 * execution — and mirrored by check constraints in the database so a script that
 * bypasses this path still cannot write an illegal row.
 */
export function assertDispatchAllowed(
  source: CapacitySource,
  work: WorkUnit,
  policies: PolicyRegister,
): void {
  const cred = policies[source.provider]?.credentials.find(
    (c) => c.id === source.credentialTypeId,
  );
  // A source with no policy entry is undispatchable. Not a warning — a refusal.
  if (!cred) throw new PolicyError('NO_POLICY_ENTRY', source.credentialTypeId);

  if (cred.class === 'C') {
    if (work.attributedUserId !== source.ownerUserId) {
      throw new PolicyError('CLASS_C_CROSS_USER', source.id);
    }
    if (source.storageLocation !== 'device') {
      throw new PolicyError('CLASS_C_OFF_DEVICE', source.id);
    }
    if (source.contributedToPool !== null) {
      throw new PolicyError('CLASS_C_POOLED', source.id);
    }
  }

  if (
    work.poolId &&
    !cred.poolable_across_people &&
    work.attributedUserId !== source.ownerUserId
  ) {
    throw new PolicyError('NOT_POOLABLE', source.id);
  }
}

/** Pure predicate form, for use inside select()'s filter chain. */
export function policyAllows(
  source: CapacitySource,
  work: WorkUnit,
  policies: PolicyRegister,
): boolean {
  try {
    assertDispatchAllowed(source, work, policies);
    return true;
  } catch {
    return false;
  }
}
