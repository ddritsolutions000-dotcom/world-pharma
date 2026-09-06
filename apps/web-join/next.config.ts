import path from 'node:path';
import type { NextConfig } from 'next';

const sharedSrc = path.join(__dirname, '../../packages/shared/src');

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@world-pharma/ui-kit', '@world-pharma/shell-web', '@world-pharma/shell-core', '@world-pharma/shared'],
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      '@world-pharma/shared/site-page-blocks': path.join(sharedSrc, 'site-page-blocks.ts'),
      '@world-pharma/shared/join-page-blocks': path.join(sharedSrc, 'join-page-blocks.ts'),
      '@world-pharma/shared/partner-fields': path.join(sharedSrc, 'partner-fields.ts'),
    };
    return config;
  },
};

export default nextConfig;
