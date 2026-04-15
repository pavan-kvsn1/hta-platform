/**
 * Next.js Middleware
 *
 * Handles:
 * - Content Security Policy (CSP) with nonces
 * - Security headers
 * - Request logging
 */

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

/**
 * Generate a cryptographically secure nonce
 */
function generateNonce(): string {
  const array = new Uint8Array(16)
  crypto.getRandomValues(array)
  return Buffer.from(array).toString('base64')
}

/**
 * Build CSP header with nonce
 */
function buildCSP(nonce: string): string {
  const isProduction = process.env.NODE_ENV === 'production'

  const directives: Record<string, string[]> = {
    'default-src': ["'self'"],
    'script-src': [
      "'self'",
      `'nonce-${nonce}'`,
      "'strict-dynamic'",
      // Allow inline scripts in development for hot reload
      ...(isProduction ? [] : ["'unsafe-inline'", "'unsafe-eval'"]),
    ],
    'style-src': [
      "'self'",
      `'nonce-${nonce}'`,
      // Tailwind and some UI libraries need unsafe-inline for styles
      "'unsafe-inline'",
    ],
    'img-src': [
      "'self'",
      'data:',
      'blob:',
      'https://storage.googleapis.com',
      'https://*.googleusercontent.com',
    ],
    'font-src': ["'self'", 'data:'],
    'connect-src': [
      "'self'",
      'https://*.sentry.io',
      'wss://*.pusher.com',
      'https://api.htacalibr8s.com',
      ...(isProduction ? [] : ['ws://localhost:*', 'http://localhost:*']),
    ],
    'frame-src': ["'self'"],
    'frame-ancestors': ["'none'"],
    'object-src': ["'none'"],
    'base-uri': ["'self'"],
    'form-action': ["'self'"],
    'upgrade-insecure-requests': [],
  }

  return Object.entries(directives)
    .map(([key, values]) => {
      if (values.length === 0) return key
      return `${key} ${values.join(' ')}`
    })
    .join('; ')
}

/**
 * Security headers applied to all responses
 */
function getSecurityHeaders(nonce: string): Record<string, string> {
  return {
    'Content-Security-Policy': buildCSP(nonce),
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    ...(process.env.NODE_ENV === 'production'
      ? {
          'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
        }
      : {}),
  }
}

export function middleware(request: NextRequest) {
  // Generate nonce for this request
  const nonce = generateNonce()

  // Create response with security headers
  const response = NextResponse.next()

  // Apply security headers
  const securityHeaders = getSecurityHeaders(nonce)
  for (const [key, value] of Object.entries(securityHeaders)) {
    response.headers.set(key, value)
  }

  // Pass nonce to the application via header (can be read in layout.tsx)
  response.headers.set('X-Nonce', nonce)

  // Add request ID for tracing
  const requestId = request.headers.get('x-request-id') || crypto.randomUUID()
  response.headers.set('X-Request-Id', requestId)

  return response
}

/**
 * Middleware configuration
 * Skip API routes, static files, and images
 */
export const config = {
  matcher: [
    /*
     * Match all request paths except for:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico (favicon)
     * - public folder
     */
    '/((?!api|_next/static|_next/image|favicon.ico|public).*)',
  ],
}
