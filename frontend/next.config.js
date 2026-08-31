const path = require('path');

/**
 * The agent/planner code lives in the sibling ../backend directory, which has no
 * node_modules of its own. These aliases pin its imports to the frontend's
 * installed copies — without them a build resolves two React/Supabase instances.
 * Keep in sync with the `paths` block in tsconfig.json.
 */
const SHARED = ['@supabase/supabase-js', '@supabase/ssr', 'pino', 'zod'];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'i.ytimg.com' },
      { protocol: 'https', hostname: 'img.youtube.com' },
      { protocol: 'https', hostname: 'lh3.googleusercontent.com' },
    ],
  },

  // pino ships optional transports that webpack cannot statically resolve.
  serverExternalPackages: ['pino', 'pino-pretty'],

  turbopack: {
    resolveAlias: Object.fromEntries(
      SHARED.map((pkg) => [pkg, path.resolve(__dirname, 'node_modules', pkg)]),
    ),
  },

  webpack: (config) => {
    SHARED.forEach((pkg) => {
      config.resolve.alias[pkg] = path.resolve(__dirname, 'node_modules', pkg);
    });
    return config;
  },

  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
