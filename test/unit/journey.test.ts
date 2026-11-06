import { describe, expect, it } from 'vitest';
import { GUIDE, PATH, guideProgress, nextStop } from '@/lib/journey';
import { seedWorkspace } from '@/lib/demo/seed';

const NOW = Date.parse('2026-09-06T09:00:00Z');

describe('the path through the pages', () => {
  it('visits every page once and comes back to the pool', () => {
    const seen: string[] = [];
    let at = '/';
    for (let i = 0; i < PATH.length; i++) {
      seen.push(at);
      at = nextStop(at).href;
    }
    expect(at).toBe('/');
    expect(new Set(seen).size).toBe(PATH.length);
  });

  it('never sends a page to itself', () => {
    for (const s of PATH) expect(nextStop(s.href).href).not.toBe(s.href);
  });

  it('starts from the pool for a page it does not know', () => {
    expect(nextStop('/nowhere').href).toBe('/');
  });
});

describe('getting started', () => {
  it('reads progress from the workspace, not from clicks', () => {
    const w = seedWorkspace(NOW);
    const before = guideProgress(w);
    expect(before.steps.find((s) => s.id === 'run')!.isDone).toBe(false);
    const ran = { ...w, runs: [{ ...(w.runs[0] ?? {}), id: 'r1', state: 'done' } as (typeof w.runs)[number]] };
    expect(guideProgress(ran).steps.find((s) => s.id === 'run')!.isDone).toBe(true);
    expect(guideProgress(ran).done).toBe(before.done + 1);
  });

  it('points at the first step not yet done', () => {
    const w = seedWorkspace(NOW);
    const p = guideProgress(w);
    expect(p.next).toBe(p.steps.find((s) => !s.isDone) ?? null);
  });

  it('undoes a step when its evidence goes away', () => {
    const w = seedWorkspace(NOW);
    const bare = { ...w, sources: w.sources.map((s) => ({ ...s, status: 'revoked' as const })) };
    expect(guideProgress(bare).steps.find((s) => s.id === 'connect')!.isDone).toBe(false);
  });

  it('only links to pages that exist on the path', () => {
    const pages = new Set(PATH.map((s) => s.href));
    for (const s of GUIDE) expect(pages.has(s.href.split('#')[0] || '/')).toBe(true);
  });
});
