import path from 'node:path';
import type { NextConfig } from 'next';

const sharedSrc = path.join(__dirname, '../../packages/shared/src');

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@world-pharma/ui-kit', '@world-pharma/shell-web', '@world-pharma/shell-core', '@world-pharma/shared'],
  webpack: (config, { dev }) => {
    if (dev) {
      config.watchOptions = {
        ...(config.watchOptions ?? {}),
        poll: 1000,
        aggregateTimeout: 300,
      };
    }
    config.resolve.alias = {
      ...config.resolve.alias,
      '@world-pharma/shared/site-chrome': path.join(sharedSrc, 'site-chrome.ts'),
      '@world-pharma/shared/site-page-blocks': path.join(sharedSrc, 'site-page-blocks.ts'),
      '@world-pharma/shared/partner-fields': path.join(sharedSrc, 'partner-fields.ts'),
    };
    return config;
  },
  async rewrites() {
    const api = (process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://127.0.0.1:4000').replace(/\/$/, '');
    // Do not proxy `/health/*` — customer health dashboard and artifact pages live under app/health/.
    return [{ source: '/api/:path*', destination: `${api}/api/:path*` }];
  },
  async redirects() {
    return [
      { source: '/imaging', destination: '/radiology', permanent: false },
      { source: '/imaging/:path*', destination: '/radiology/:path*', permanent: false },
    ];
  },
};

export default nextConfig;
