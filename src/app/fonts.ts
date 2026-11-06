import { Cookie, Figtree } from 'next/font/google';

/**
 * The two faces the support pages use, self-hosted at build time. That matters
 * most for the embed: it renders on a creator's own site, and a font CDN request
 * from inside it would hand every one of their visitors' addresses to a third
 * party. Not preloaded — only the support surfaces use them, and a browser only
 * fetches a face once some text actually needs it.
 */
const friendly = Figtree({
  subsets: ['latin'],
  weight: ['700', '800'],
  variable: '--font-friendly',
  display: 'swap',
  preload: false,
});

/** The handwritten face on the embed's tip-jar button. */
const script = Cookie({
  subsets: ['latin'],
  weight: '400',
  variable: '--font-script',
  display: 'swap',
  preload: false,
});

export const fontVariables = `${friendly.variable} ${script.variable}`;
