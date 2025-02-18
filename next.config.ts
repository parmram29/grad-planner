// next.config.ts
import type { NextConfig } from 'next';
import { Configuration } from 'webpack';

const nextConfig: NextConfig = {
  webpack: (config: Configuration, { isServer }: { isServer: boolean }) => {
    if (!isServer) {
      config.resolve = config.resolve || {};
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: require.resolve('path-browserify'),
        stream: false,
        crypto: false,
      };
    }
    return config;
  },
};

export default nextConfig;