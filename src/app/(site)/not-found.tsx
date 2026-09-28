import Link from 'next/link';
import { Mark } from '@/components/Mark';

export default function NotFound() {
  return (
    <div className="stackv" style={{ gap: 16, maxWidth: 560 }}>
      <Mark size={40} color="var(--water)" />
      <div className="pageHead">
        <h1>Nothing here</h1>
        <p>
          That address does not point at anything. The pool, the room and the preload queue are all where you
          left them.
        </p>
      </div>
      <div className="row">
        <Link href="/" className="btn" style={{ textDecoration: 'none' }}>The pool</Link>
        <Link href="/room" className="btn" style={{ textDecoration: 'none' }}>The room</Link>
        <Link href="/docs" className="btn" style={{ textDecoration: 'none' }}>Docs</Link>
      </div>
    </div>
  );
}
