import type { NextConfig } from 'next';
import createBundleAnalyzer from '@next/bundle-analyzer';

const withBundleAnalyzer = createBundleAnalyzer({
  enabled: process.env.ANALYZE === 'true',
});

const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "font-src 'self' https: data:",
  "form-action 'self' https:",
  "frame-ancestors 'self'",
  "img-src 'self' data: blob: https:",
  "object-src 'none'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https: blob:",
  "style-src 'self' 'unsafe-inline' https:",
  "connect-src 'self' https: wss:",
  "frame-src 'self' https:",
  "worker-src 'self' blob:",
].join('; ');

const nextConfig: NextConfig = {
  reactStrictMode: true,

  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'img.clerk.com',
      },
      {
        protocol: 'https',
        hostname: 'images.clerk.dev',
      },
    ],
    minimumCacheTTL: 86400,
  },
  serverExternalPackages: ['xlsx', '@prisma/client', 'prisma'],
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: contentSecurityPolicy },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(self)' },
        ],
      },
    ];
  },
};

export default withBundleAnalyzer(nextConfig);
