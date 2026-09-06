import type { NextConfig } from 'next';

const apiOrigin = process.env.WP_API_ORIGIN ?? 'http://127.0.0.1:4000';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@world-pharma/ui-kit', '@world-pharma/shell-web', '@world-pharma/shell-core'],
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${apiOrigin}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
