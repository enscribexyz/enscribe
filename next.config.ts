import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  /* config options here */
  reactStrictMode: true,
  transpilePackages: ['ethereum-identity-kit'],
  webpack: (config) => {
    // This is necessary for the ethereum-identity-kit package to be handled correctly
    config.resolve.extensionAlias = {
      '.js': ['.js', '.ts', '.tsx'],
      '.jsx': ['.jsx', '.tsx']
    };
    return config;
  },
}

export default nextConfig
