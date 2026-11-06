import Link from 'next/link';
import { nextStop } from '@/lib/journey';

/**
 * The foot of every page: where to go from here. Without it each page was a
 * dead end that sent people back to the masthead to guess.
 */
export function NextStep({ from }: { from: string }) {
  const s = nextStop(from);
  return (
    <Link href={s.href} className="nextStep">
      <span className="nextStepLabel">Next</span>
      <span className="nextStepTitle">{s.label}</span>
      <span className="nextStepPitch">{s.pitch}</span>
      <span className="nextStepArrow" aria-hidden="true">→</span>
    </Link>
  );
}
