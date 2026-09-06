import type { NextConfig } from 'next';

const api = (process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://127.0.0.1:4000').replace(/\/$/, '');

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@world-pharma/ui-kit', '@world-pharma/shell-web', '@world-pharma/shell-core'],
  async rewrites() {
    return [
      { source: '/health', destination: `${api}/health` },
      { source: '/health/:path*', destination: `${api}/health/:path*` },
      { source: '/api/:path*', destination: `${api}/api/:path*` },
    ];
  },
};

export default nextConfig;
