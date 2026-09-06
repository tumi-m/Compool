import anthropic from '../../../policy/providers/anthropic.policy.json';
import openai from '../../../policy/providers/openai.policy.json';
import google from '../../../policy/providers/google.policy.json';
import ollama from '../../../policy/providers/ollama.policy.json';
import type { PolicyRegister, ProviderPolicy } from '../types';

const files = [anthropic, openai, google, ollama] as unknown as ProviderPolicy[];

export const register: PolicyRegister = Object.fromEntries(
  files.map((p) => [p.provider, p]),
);

export const STALE_WARN_DAYS = 90;
export const STALE_BLOCK_DAYS = 180;

export type Freshness = 'fresh' | 'stale' | 'needs_reverification' | 'unverified';

/** §4.3. A file nobody has looked at in six months stops being evidence of anything. */
export function freshness(p: ProviderPolicy, now = Date.now()): Freshness {
  if (p.needs_verification || !p.verified_at) return 'unverified';
  const ageDays = (now - Date.parse(p.verified_at)) / 86_400_000;
  if (ageDays > STALE_BLOCK_DAYS) return 'needs_reverification';
  if (ageDays > STALE_WARN_DAYS) return 'stale';
  return 'fresh';
}

export function credentialPolicy(providerId: string, credentialTypeId: string) {
  return register[providerId]?.credentials.find((c) => c.id === credentialTypeId) ?? null;
}
