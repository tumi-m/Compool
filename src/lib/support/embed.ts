/**
 * The embed.
 *
 * This is the part that has to work on somebody else's website, which means it
 * has to be boring: one line to paste, no dependencies, no build step, and no
 * way for it to break the page it is sitting on.
 */

export type EmbedVariant = 'button' | 'card' | 'wall';
export type EmbedTheme = 'auto' | 'light' | 'dark';

export interface EmbedOptions {
  variant: EmbedVariant;
  theme: EmbedTheme;
  /** Show the supporter wall's most recent names. */
  showSupporters: boolean;
  /** Show progress toward the creator's stated goal. */
  showGoal: boolean;
}

export const DEFAULT_EMBED: EmbedOptions = {
  variant: 'card',
  theme: 'auto',
  showSupporters: true,
  showGoal: true,
};

export const EMBED_WIDTH: Record<EmbedVariant, number> = { button: 236, card: 340, wall: 340 };

/**
 * The frame's height has to be right in the snippet, because it cannot be right
 * later: a sandboxed cross-origin frame cannot resize itself, and the only way to
 * let it would be a script on the creator's page — which is exactly what this
 * widget refuses to be. So the height is computed from the options the creator
 * actually chose, and the numbers below are measured against the rendered widget
 * rather than guessed. A guessed height clips the Give button, which makes the
 * whole widget decorative.
 */
const H_BASE = 372;        // header, units, count row, button
const H_GOAL = 64;         // goal label, bar, remaining line
const H_SUPPORTERS = 186;  // heading, scroller, totals line
const H_WALL_EXTRA = 48;   // the wall variant's taller scroller

export function embedHeight(o: EmbedOptions): number {
  if (o.variant === 'button') return 48;
  return (
    H_BASE +
    (o.showGoal ? H_GOAL : 0) +
    (o.showSupporters ? H_SUPPORTERS + (o.variant === 'wall' ? H_WALL_EXTRA : 0) : 0)
  );
}

export function embedSize(o: EmbedOptions): { w: number; h: number } {
  return { w: EMBED_WIDTH[o.variant], h: embedHeight(o) };
}

/**
 * A handle goes straight into a URL and into the page's own text, so it is
 * restricted to something that cannot be mistaken for anything else — no dots,
 * no slashes, no percent-encoding games, and nothing that reads as a path.
 */
// 1 to 32 characters, alphanumeric at both ends. The {0,30} matters: {1,30}
// would quietly reject every two-character handle.
export const HANDLE_RE = /^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$/;

export function isValidHandle(h: string): boolean {
  return HANDLE_RE.test(h) && !h.includes('--');
}

export function normaliseHandle(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 32);
}

export function embedUrl(origin: string, handle: string, o: EmbedOptions): string {
  const base = origin.replace(/\/+$/, '');
  const q = new URLSearchParams({
    variant: o.variant,
    theme: o.theme,
    supporters: o.showSupporters ? '1' : '0',
    goal: o.showGoal ? '1' : '0',
  });
  return `${base}/embed/${handle}?${q}`;
}

export function parseEmbedOptions(params: URLSearchParams): EmbedOptions {
  const variant = params.get('variant');
  const theme = params.get('theme');
  return {
    variant: variant === 'button' || variant === 'wall' ? variant : 'card',
    theme: theme === 'light' || theme === 'dark' ? theme : 'auto',
    showSupporters: params.get('supporters') !== '0',
    showGoal: params.get('goal') !== '0',
  };
}

/**
 * An iframe, not a script.
 *
 * A script tag on a creator's site is code we can change under them at any time,
 * on a page we do not own, with access to everything on it. An iframe can only
 * ever draw inside its own box. For a widget that shows a number and links to a
 * payment page, the script buys nothing and costs the creator their site's
 * integrity — so there is no script version to offer.
 */
export function embedSnippet(origin: string, handle: string, o: EmbedOptions): string {
  const { w, h } = embedSize(o);
  return `<iframe
  src="${embedUrl(origin, handle, o)}"
  title="Buy ${handle} compute"
  width="${w}" height="${h}"
  style="border:0;max-width:100%;color-scheme:normal"
  loading="lazy"
  referrerpolicy="no-referrer-when-downgrade"
  sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox allow-top-navigation-by-user-activation"
></iframe>`;
}

/** The no-JavaScript option: a plain link, for a README or a static site. */
export function linkSnippet(origin: string, handle: string): string {
  const base = origin.replace(/\/+$/, '');
  return `[Buy me compute](${base}/c/${handle})`;
}
