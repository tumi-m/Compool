import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Open source' };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
