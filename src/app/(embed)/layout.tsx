import '../globals.css';

/**
 * The embed's own root layout.
 *
 * This has to be a *root* layout in its own route group, not a nested one — a
 * nested layout still renders inside the app's, and the widget shipped with the
 * whole masthead stapled to it. Two root layouts is the only way to have a route
 * that is genuinely not part of the app shell.
 */
export const metadata = { title: 'Buy me compute', robots: { index: false, follow: false } };

export default function EmbedLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          // The host page's theme is not readable from inside a frame, so `auto`
          // follows the viewer's own system setting instead of guessing.
          dangerouslySetInnerHTML={{
            __html:
              "try{var p=new URLSearchParams(location.search),t=p.get('theme');if(t==='dark'||t==='light')document.documentElement.setAttribute('data-theme',t);else if(matchMedia('(prefers-color-scheme: dark)').matches)document.documentElement.setAttribute('data-theme','dark');}catch(e){}",
          }}
        />
      </head>
      <body className="embedBody">{children}</body>
    </html>
  );
}
