import type { NextConfig } from 'next'

const securityHeaders = [
  { key: 'X-DNS-Prefetch-Control', value: 'on' },
  { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains; preload' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-XSS-Protection', value: '1; mode=block' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'", // Next.js requires unsafe-inline/eval
      "style-src 'self' 'unsafe-inline'", // For CSS-in-JS and inline styles
      "img-src 'self' data: blob: https:", // Allow images from self, data URIs, blobs, HTTPS
      "font-src 'self' data:", // Fonts from self and data URIs
      "connect-src 'self' https:", // API calls to self and HTTPS endpoints
      "frame-ancestors 'none'", // Prevent framing (clickjacking protection)
      "base-uri 'self'", // Restrict base tag
      "form-action 'self'", // Restrict form submissions
    ].join('; '),
  },
]

const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  transpilePackages: ['@hta/ui', '@hta/shared', '@hta/database'],

  // Performance optimizations
  images: {
    formats: ['image/avif', 'image/webp'],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920],
    imageSizes: [16, 32, 48, 64, 96, 128, 256],
    minimumCacheTTL: 60,
  },

  // Experimental features for performance
  experimental: {
    optimizePackageImports: ['lucide-react', '@radix-ui/react-icons'],
  },

  // Compression
  compress: true,

  // Reduce bundle size with modular imports
  modularizeImports: {
    'lucide-react': {
      transform: 'lucide-react/dist/esm/icons/{{ kebabCase member }}',
    },
  },

  webpack: (config, { isServer }) => {
    // Handle .js extension resolution for TypeScript files in monorepo packages
    // This is needed because @hta/shared uses .js extensions for ESM compatibility
    // but the actual files are .ts
    config.resolve.extensionAlias = {
      '.js': ['.ts', '.tsx', '.js', '.jsx'],
      '.mjs': ['.mts', '.mjs'],
      '.cjs': ['.cts', '.cjs'],
    }

    // Bundle analyzer (development only)
    if (process.env.ANALYZE === 'true' && !isServer) {
      const { BundleAnalyzerPlugin } = require('webpack-bundle-analyzer')
      config.plugins.push(
        new BundleAnalyzerPlugin({
          analyzerMode: 'static',
          reportFilename: '../bundle-report.html',
          openAnalyzer: false,
        })
      )
    }

    return config
  },

  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
    ]
  },

  // Proxy API requests to the standalone API service
  // Exclude /api/auth/* which are handled by Next.js (NextAuth)
  async rewrites() {
    const apiUrl = process.env.API_URL || 'http://localhost:4000'
    return {
      beforeFiles: [],
      afterFiles: [
        {
          // Proxy all /api/* EXCEPT /api/auth/* to the API server
          source: '/api/:path((?!auth).*)',
          destination: `${apiUrl}/api/:path*`,
        },
      ],
      fallback: [],
    }
  },
}

export default nextConfig
