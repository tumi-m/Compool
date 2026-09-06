'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Mark } from './Mark';

const NAV = [
  { href: '/', label: 'Pool' },
  { href: '/connect', label: 'Connect' },
  { href: '/preload', label: 'Preload' },
  { href: '/open-source', label: 'Open source' },
  { href: '/ledger', label: 'Ledger' },
  { href: '/docs', label: 'Docs' },
] as const;

export function Masthead() {
  const path = usePathname();
  const [theme, setTheme] = useState<'light' | 'dark'>('light');

  useEffect(() => {
    setTheme((document.documentElement.getAttribute('data-theme') as 'light' | 'dark') ?? 'light');
  }, []);

  const toggle = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    document.documentElement.setAttribute('data-theme', next);
    try {
      localStorage.setItem('tidepool.theme', next);
    } catch {
      /* blocked site data is not a reason to break the page */
    }
  };

  return (
    <header className="masthead">
      <Link href="/" className="wordmark">
        <Mark size={24} />
        Tidepool
      </Link>
      <nav className="nav" aria-label="Main">
        {NAV.map((n) => (
          <Link key={n.href} href={n.href} aria-current={path === n.href ? 'page' : undefined}>
            {n.label}
          </Link>
        ))}
      </nav>
      <button type="button" className="themeToggle" onClick={toggle} aria-label={`Switch to ${theme === 'dark' ? 'shallows' : 'deep water'} theme`}>
        {theme === 'dark' ? 'shallows' : 'deep water'}
      </button>
    </header>
  );
}
