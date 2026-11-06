/**
 * A creator's page colour. Each one is a palette solved for contrast in both
 * themes (see globals.css and the contrast test), not a free colour picker: a
 * hand-picked hex is how a support button ends up with unreadable words on it.
 */
export type TipTheme = 'yellow' | 'coral' | 'sea' | 'violet' | 'ink';

export const TIP_THEMES: { id: TipTheme; label: string }[] = [
  { id: 'yellow', label: 'Yellow' },
  { id: 'coral', label: 'Coral' },
  { id: 'sea', label: 'Sea' },
  { id: 'violet', label: 'Violet' },
  { id: 'ink', label: 'Ink' },
];

export const DEFAULT_TIP_THEME: TipTheme = 'yellow';

export function isTipTheme(v: unknown): v is TipTheme {
  return TIP_THEMES.some((t) => t.id === v);
}
