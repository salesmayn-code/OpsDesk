import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Same-origin API: the browser only talks to this app, so auth cookies are
  // first-party (visible to middleware.ts, unaffected by third-party cookie blocking).
  async rewrites() {
    const apiOrigin = process.env.API_ORIGIN ?? 'http://localhost:4000';
    return [{ source: '/api/v1/:path*', destination: `${apiOrigin}/api/v1/:path*` }];
  },
};

export default nextConfig;
