import type { Metadata, Viewport } from 'next';
import { Masthead } from '@/components/Masthead';
import { WorkspaceProvider } from '@/components/WorkspaceProvider';
import { Toaster } from '@/components/Toaster';
import '../globals.css';

export const metadata: Metadata = {
  // Every route used to share one title, so a screen reader announced the same
  // words on every navigation and eleven open tabs were indistinguishable.
  title: { default: 'TIDEPOOL — pooled AI capacity', template: '%s · TIDEPOOL' },
  description:
    'Every source of AI capacity you own, in one place, with the level visible. Route around the stall, meter it honestly, and spend the quiet hours.',
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
        <Toaster>
          <WorkspaceProvider>
            <a href="#main" className="skipLink">Skip to content</a>
            <Masthead />
            <main className="shell" id="main" tabIndex={-1}>{children}</main>
          </WorkspaceProvider>
        </Toaster>
      </body>
    </html>
  );
}
