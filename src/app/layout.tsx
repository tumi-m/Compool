import type { Metadata, Viewport } from 'next';
import { Masthead } from '@/components/Masthead';
import { WorkspaceProvider } from '@/components/WorkspaceProvider';
import './globals.css';

export const metadata: Metadata = {
  title: 'TIDEPOOL — pooled AI capacity',
  description:
    'Every source of AI capacity you own, in one place, with the level visible. Route around the stall, meter it honestly, and spend the quiet hours.',
  icons: {
    icon: [
      {
        url:
          "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Cpath fill='%230e8c99' d='M2 12H54V24Q28 21.1 2 24Z'/%3E%3Cpath fill='%230e8c99' d='M2 30H40V42Q21 39.1 2 42Z'/%3E%3Cpath fill='%230e8c99' d='M2 48H26V60Q14 57.1 2 60Z'/%3E%3C/svg%3E",
        type: 'image/svg+xml',
      },
    ],
  },
};

export const viewport: Viewport = { themeColor: '#0a5a66' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Archivo:wght@600;700&family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@400;500;600&display=swap"
        />
        <script
          // Set the theme before first paint so the masthead never flashes.
          dangerouslySetInnerHTML={{
            __html:
              "try{var t=localStorage.getItem('tidepool.theme');if(t)document.documentElement.setAttribute('data-theme',t);else if(matchMedia('(prefers-color-scheme: dark)').matches)document.documentElement.setAttribute('data-theme','dark');}catch(e){}",
          }}
        />
      </head>
      <body>
        <WorkspaceProvider>
          <Masthead />
          <main className="shell">{children}</main>
        </WorkspaceProvider>
      </body>
    </html>
  );
}
