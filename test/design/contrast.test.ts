import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The palette, held to WCAG AA by a test rather than by memory.
 *
 * Every text token was solved against every ground it sits on. This reads the
 * shipped stylesheet — not a copy of it — so changing a token in globals.css
 * without re-solving it fails here instead of in somebody's eyes.
 */
const css = readFileSync(join(process.cwd(), 'src/app/globals.css'), 'utf8');

function block(selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`);
  if (start < 0) throw new Error(`no block for ${selector}`);
  const body = css.slice(start, css.indexOf('}', start));
  const out: Record<string, string> = {};
  for (const m of body.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-fA-F]{6})/g)) out[m[1]] = m[2].toLowerCase();
  return out;
}

const light = block(':root');
const dark = { ...light, ...block(":root[data-theme='dark']") };

const lin = (c: number) => ((c /= 255) <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const lum = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
};
const ratio = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};

const GROUNDS = ['paper', 'panel', 'foam'] as const;
const TEXT = ['ink-0', 'ink-1', 'ink-2', 'link', 'shallow-ink', 'coral-ink', 'chip-ink'] as const;

describe.each([
  ['light', light],
  ['dark', dark],
] as const)('%s theme', (_name, t) => {
  it.each(TEXT)('--%s reads at 4.5:1 on every ground', (token) => {
    for (const g of GROUNDS) {
      expect(ratio(t[token], t[g]), `--${token} on --${g}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('puts button text at 4.5:1 on the accent fill', () => {
    expect(ratio(t['on-accent'], t['accent-fill'])).toBeGreaterThanOrEqual(4.5);
  });

  it('keeps graphical fills at 3:1 against the page (WCAG 1.4.11)', () => {
    for (const fill of ['water', 'shallow', 'coral']) {
      for (const g of ['paper', 'panel']) {
        expect(ratio(t[fill], t[g]), `--${fill} on --${g}`).toBeGreaterThanOrEqual(3);
      }
    }
  });
});
