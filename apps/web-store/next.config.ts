import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@world-pharma/ui-kit', '@world-pharma/shell-web', '@world-pharma/shell-core'],
};

export default nextConfig;
