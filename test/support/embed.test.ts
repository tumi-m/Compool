import { describe, expect, it } from 'vitest';
import {
  DEFAULT_EMBED, embedHeight, embedSnippet, embedUrl, isValidHandle, linkSnippet, normaliseHandle,
  parseEmbedOptions,
} from '@/lib/support/embed';

describe('handles', () => {
  it('accepts an ordinary one', () => {
    for (const h of ['ada', 'kwame-m', 'a1', 'x'.repeat(32)]) expect(isValidHandle(h), h).toBe(true);
  });

  it('rejects anything that could be mistaken for a path or an escape', () => {
    for (const h of ['', '.', '..', 'a/b', 'a.b', 'A', 'a b', '-a', 'a-', 'a--b', '%2e%2e', 'x'.repeat(33)]) {
      expect(isValidHandle(h), h).toBe(false);
    }
  });

  it('normalises whatever someone types into something safe', () => {
    expect(normaliseHandle('  Ada Lovelace ')).toBe('ada-lovelace');
    expect(normaliseHandle('../../etc/passwd')).toBe('etc-passwd');
    expect(normaliseHandle('Zoë!!')).toBe('zo');
    expect(isValidHandle(normaliseHandle('Ada Lovelace'))).toBe(true);
  });
});

describe('the embed URL', () => {
  it('round-trips its options', () => {
    const o = { variant: 'wall' as const, theme: 'dark' as const, showSupporters: false, showGoal: true };
    const url = new URL(embedUrl('https://x.test', 'ada', o));
    expect(parseEmbedOptions(url.searchParams)).toEqual(o);
  });

  it('falls back to safe defaults for anything unrecognised', () => {
    const o = parseEmbedOptions(new URLSearchParams('variant=../evil&theme=neon'));
    expect(o.variant).toBe('card');
    expect(o.theme).toBe('auto');
  });

  it('does not double a trailing slash on the origin', () => {
    expect(embedUrl('https://x.test/', 'ada', DEFAULT_EMBED)).toContain('https://x.test/embed/ada?');
  });
});

describe('the snippet a creator pastes', () => {
  const snip = embedSnippet('https://x.test', 'ada', DEFAULT_EMBED);

  it('is an iframe and never a script', () => {
    expect(snip).toContain('<iframe');
    expect(snip.toLowerCase()).not.toContain('<script');
  });

  it('is sandboxed, so it can draw in its box and nothing else', () => {
    expect(snip).toContain('sandbox=');
    expect(snip).not.toContain('allow-same-origin'); // with allow-scripts that would undo the sandbox
  });

  it('can still open the creator’s payment page when someone clicks', () => {
    expect(snip).toContain('allow-popups');
    expect(snip).toContain('allow-top-navigation-by-user-activation');
  });

  it('carries a title, so it is not an unlabelled frame in a screen reader', () => {
    expect(snip).toContain('title="Buy ada compute"');
  });

  it('never overflows the column it is dropped into', () => {
    expect(snip).toContain('max-width:100%');
  });

  it('offers a plain link for a README or a static page', () => {
    expect(linkSnippet('https://x.test/', 'ada')).toBe('[Buy me compute](https://x.test/c/ada)');
  });
});

describe('the frame height', () => {
  it('grows with each thing the creator turns on', () => {
    const bare = embedHeight({ ...DEFAULT_EMBED, showGoal: false, showSupporters: false });
    const withGoal = embedHeight({ ...DEFAULT_EMBED, showGoal: true, showSupporters: false });
    const both = embedHeight({ ...DEFAULT_EMBED, showGoal: true, showSupporters: true });
    expect(withGoal).toBeGreaterThan(bare);
    expect(both).toBeGreaterThan(withGoal);
  });

  it('gives the wall more room than the card for the same options', () => {
    const card = embedHeight({ ...DEFAULT_EMBED, variant: 'card' });
    const wall = embedHeight({ ...DEFAULT_EMBED, variant: 'wall' });
    expect(wall).toBeGreaterThan(card);
  });

  it('keeps the button a button', () => {
    expect(embedHeight({ ...DEFAULT_EMBED, variant: 'button' })).toBeLessThan(80);
  });

  it('puts that height into the snippet, so the two cannot disagree', () => {
    const o = { ...DEFAULT_EMBED, variant: 'wall' as const };
    expect(embedSnippet('https://x.test', 'ada', o)).toContain(`height="${embedHeight(o)}"`);
  });
});
