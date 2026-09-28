import type { Metadata } from 'next';

export async function generateMetadata({ params }: { params: Promise<{ handle: string }> }): Promise<Metadata> {
  const { handle } = await params;
  const safe = /^[a-z0-9-]{1,32}$/.test(handle) ? handle : 'support';
  return {
    title: `Buy ${safe} compute`,
    description: `Give ${safe} an overnight run, a night of batch work, or a long conversation.`,
    openGraph: { title: `Buy ${safe} compute`, type: 'website' },
  };
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
