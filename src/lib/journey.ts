import type { Workspace } from './demo/seed';

/**
 * The user journey, in one place: the order the pages are best met in, and
 * the handful of first steps that turn a preview into something understood.
 * Kept pure so the order and the "done" rules are tested rather than hoped.
 */

export interface Stop {
  href: string;
  label: string;
  /** Why you would go there next, in one line. */
  pitch: string;
}

/** Each page leads to the next; the last leads back to the pool. */
export const PATH: Stop[] = [
  { href: '/', label: 'The pool', pitch: 'Everything you can spend, and how fast it comes back.' },
  { href: '/connect', label: 'Connect capacity', pitch: 'Add a key, a box you own, or your own seat.' },
  { href: '/models', label: 'Models', pitch: 'Every rung, and how much is left on each.' },
  { href: '/orchestrate', label: 'Orchestrate', pitch: 'Dump a burst of ideas and get back an order.' },
  { href: '/preload', label: 'Tide preload', pitch: 'Queue the work for the quiet hours.' },
  { href: '/room', label: 'The room', pitch: 'Watch runs live with the people you build with.' },
  { href: '/ledger', label: 'Ledger', pitch: 'Who paid for what, to the cent.' },
  { href: '/support', label: 'Buy me compute', pitch: 'Let the people who like your work fund the runs.' },
  { href: '/open-source', label: 'Open source', pitch: 'Point the tools you already use at the pool.' },
  { href: '/nodes', label: 'Nodes', pitch: 'Serve from machines you own.' },
  { href: '/docs', label: 'Docs', pitch: 'How all of it works, and why it is built this way.' },
];

export function nextStop(href: string): Stop {
  const i = PATH.findIndex((s) => s.href === href);
  return PATH[(i + 1) % PATH.length];
}

export interface GuideStep {
  id: string;
  href: string;
  title: string;
  line: string;
  done: (w: Workspace) => boolean;
}

/**
 * Getting started. Each step is done when the workspace says so — not when it
 * was clicked — so the list cannot claim progress that did not happen.
 */
export const GUIDE: GuideStep[] = [
  {
    id: 'connect',
    href: '/connect',
    title: 'Connect your capacity',
    line: 'A key, a GPU box or your own seat — each becomes a basin.',
    done: (w) => w.sources.some((s) => s.status !== 'revoked'),
  },
  {
    id: 'run',
    href: '/#run',
    title: 'Run something',
    line: 'It routes to the cheapest capable rung and is metered to the cent.',
    done: (w) => w.runs.some((r) => r.state === 'done'),
  },
  {
    id: 'plan',
    href: '/orchestrate',
    title: 'Plan a burst of ideas',
    line: 'Get back an order, a rung and a slot for each one.',
    done: (w) => w.ideas.some((i) => i.status === 'running' || i.status === 'done'),
  },
  {
    id: 'preload',
    href: '/preload',
    title: 'Queue work for the quiet hours',
    line: 'Spend the window that refills while you sleep.',
    done: (w) => w.preload.some((i) => i.enabled),
  },
  {
    id: 'support',
    href: '/support',
    title: 'Open your support page',
    line: 'Let people buy you compute instead of coffee.',
    done: (w) => w.support.enabled,
  },
];

export function guideProgress(w: Workspace) {
  const steps = GUIDE.map((s) => ({ ...s, isDone: s.done(w) }));
  const done = steps.filter((s) => s.isDone).length;
  return { steps, done, total: steps.length, next: steps.find((s) => !s.isDone) ?? null };
}
