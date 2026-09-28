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

export function Masthead() {
  const path = usePathname() ?? '/';
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setTheme((document.documentElement.getAttribute('data-theme') as 'light' | 'dark') ?? 'light');
  }, []);

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

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    document.documentElement.setAttribute('data-theme', next);
    try {
      localStorage.setItem('tidepool.theme', next);
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
        {ALL.map((n) => (
          <Link key={n.href} href={n.href} aria-current={isCurrent(path, n.href) ? 'page' : undefined}>
            {n.label}
          </Link>
        ))}
      </nav>

      {/* Anything narrower: where you are, and a menu for the rest. */}
      <span className="navHere" aria-hidden="true">{current?.label ?? ''}</span>

      <button type="button" className="themeToggle" onClick={toggleTheme} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}>
        {theme === 'dark' ? 'shallows' : 'deep water'}
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
