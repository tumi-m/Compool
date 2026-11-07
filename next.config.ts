import type { NextConfig } from 'next';

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Nothing here uses next/image, so the optimiser endpoint only ever served as
  // attack surface — it was the target of GHSA-2464-fhr4-w9xw. Off.
  images: { unoptimized: true },
  async headers() {
    return [
      {
        // The embed exists to be framed on other people's sites, so it is the
        // one route that permits it.
        source: '/embed/:handle',
        headers: [{ key: 'content-security-policy', value: 'frame-ancestors *' }],
      },
      {
        // Everything else refuses framing outright. The app has real controls on
        // it — revoke, connect, spend — and a clickjacked click on any of them
        // is somebody's capacity gone.
        source: '/:path((?!embed/).*)',
        headers: [
          { key: 'content-security-policy', value: "frame-ancestors 'none'" },
          { key: 'x-frame-options', value: 'DENY' },
          { key: 'referrer-policy', value: 'strict-origin-when-cross-origin' },
          { key: 'x-content-type-options', value: 'nosniff' },
        ],
      },
    ];
  },
};

export default config;
