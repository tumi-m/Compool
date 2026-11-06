'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useId, useRef, useState } from 'react';
import { Mark } from './Mark';

/**
 * Grouped, because eleven peers in a row is a list nobody reads — and because the
 * groups are what the menu shows when the bar runs out of room.
 */
interface NavItem { href: string; label: string }
interface NavGroup { label: string; items: NavItem[] }

const GROUPS: NavGroup[] = [
  {
    label: 'Work',
    items: [
      { href: '/', label: 'Pool' },
      { href: '/room', label: 'Room' },
      { href: '/orchestrate', label: 'Orchestrate' },
      { href: '/preload', label: 'Preload' },
    ],
  },
  {
    label: 'Capacity',
    items: [
      { href: '/connect', label: 'Connect' },
      { href: '/models', label: 'Models' },
      { href: '/nodes', label: 'Nodes' },
      { href: '/open-source', label: 'Open source' },
    ],
  },
  {
    label: 'Money',
    items: [
      { href: '/ledger', label: 'Ledger' },
      { href: '/support', label: 'Support' },
    ],
  },
  { label: 'Reference', items: [{ href: '/docs', label: 'Docs' }] },
];

const ALL: NavItem[] = GROUPS.flatMap((g) => g.items);

function isCurrent(path: string, href: string): boolean {
  if (href === '/') return path === '/';
  return path === href || path.startsWith(`${href}/`);
}

type ThemePref = 'light' | 'dark' | 'auto';
const NEXT_PREF: Record<ThemePref, ThemePref> = { light: 'dark', dark: 'auto', auto: 'light' };
const PREF_LABEL: Record<ThemePref, string> = { light: 'Light', dark: 'Dark', auto: 'Auto' };

export function Masthead() {
  const path = usePathname() ?? '/';
  // null until the saved choice has been read. Starting at 'auto' let the
  // follow-the-system effect run first and repaint a stored Dark as light on
  // every reload, while the button still said Dark.
  const [saved, setPref] = useState<ThemePref | null>(null);
  const pref: ThemePref = saved ?? 'auto';
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const stored = localStorage.getItem('tidepool.theme');
      setPref(stored === 'light' || stored === 'dark' ? stored : 'auto');
    } catch {
      setPref('auto');
    }
  }, []);

  // Auto follows the system as it changes — at dusk, or when the OS flips — not
  // only at first paint, which is all the pre-paint script can do.
  useEffect(() => {
    if (saved !== 'auto') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => document.documentElement.setAttribute('data-theme', mq.matches ? 'dark' : 'light');
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [saved]);

  // A menu that stays open across a navigation is a menu covering the page you
  // just asked for.
  useEffect(() => setOpen(false), [path]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    const onClick = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!panelRef.current?.contains(t) && !buttonRef.current?.contains(t)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClick);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onClick);
    };
  }, [open]);

  const cycleTheme = () => {
    const next = NEXT_PREF[pref];
    setPref(next);
    if (next !== 'auto') document.documentElement.setAttribute('data-theme', next);
    try {
      if (next === 'auto') localStorage.removeItem('tidepool.theme');
      else localStorage.setItem('tidepool.theme', next);
    } catch {
      /* blocked site data is not a reason to break the page */
    }
  };

  const current = ALL.find((i) => isCurrent(path, i.href));

  return (
    <header className="masthead">
      <Link href="/" className="wordmark" aria-label="TIDEPOOL — the pool">
        <Mark size={24} />
        <span>Tidepool</span>
      </Link>

      {/* Wide screens: the whole bar. */}
      <nav className="nav navFull" aria-label="Main">
        {GROUPS.map((g) => (
          <span key={g.label} className="navGroup">
            {g.items.map((n) => (
              <Link key={n.href} href={n.href} aria-current={isCurrent(path, n.href) ? 'page' : undefined}>
                {n.label}
              </Link>
            ))}
          </span>
        ))}
      </nav>

      {/* Anything narrower: where you are, and a menu for the rest. */}
      <span className="navHere" aria-hidden="true">{current?.label ?? ''}</span>

      <button
        type="button"
        className="themeToggle"
        onClick={cycleTheme}
        data-pref={pref}
        aria-label={`Theme: ${PREF_LABEL[pref]}. Switch to ${PREF_LABEL[NEXT_PREF[pref]]}.`}
      >
        <span className="themeGlyph" aria-hidden="true" />
        {PREF_LABEL[pref]}
      </button>

      <button
        ref={buttonRef}
        type="button"
        className="menuButton"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="menuGlyph" aria-hidden="true" data-open={open}>
          <i />
          <i />
          <i />
        </span>
        Menu
      </button>

      <div ref={panelRef} id={panelId} className="menuPanel" hidden={!open}>
        <nav aria-label="Main">
          {GROUPS.map((g) => (
            <div key={g.label} className="menuGroup">
              <div className="menuGroupLabel">{g.label}</div>
              {g.items.map((n) => (
                <Link key={n.href} href={n.href} aria-current={isCurrent(path, n.href) ? 'page' : undefined}>
                  {n.label}
                </Link>
              ))}
            </div>
          ))}
        </nav>
      </div>
    </header>
  );
}
