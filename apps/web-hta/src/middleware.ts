/**
 * Next.js Middleware
 *
 * Handles:
 * - Content Security Policy (CSP)
 * - Security headers
 * - Request logging
 *
 * CSP Strategy:
 * Uses 'unsafe-inline' instead of nonces because Next.js App Router
 * doesn't inject nonces into auto-generated script tags.
 *
 * Compensating Security Controls:
 * - 'self' restricts scripts to same origin (blocks external scripts)
 * - Audit logging for all sensitive changes (tamper-evident external logs)
 * - Approval workflows for certificate revisions
 * - Admin alerts for master instrument changes (notifications + emails)
 *
 * @see docs/security/security-architecture.md for full security documentation
 */

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

/**
 * Build CSP header
 *
 * CSP Violation Reporting:
 * In production, violations are reported to /api/csp-report for security monitoring.
 * These reports help identify XSS attempts and CSP misconfigurations.
 */
function buildCSP(): string {
  const isProduction = process.env.NODE_ENV === 'production'

  const directives: Record<string, string[]> = {
    'default-src': ["'self'"],
    'script-src': [
      "'self'",
      "'unsafe-inline'",  // Required: Next.js App Router doesn't support nonces
      "'wasm-unsafe-eval'",  // Required: PDF generation uses WebAssembly
      ...(!isProduction ? ["'unsafe-eval'"] : []),  // Required: Next.js dev mode (React Refresh/HMR)
    ],
    'style-src': [
      "'self'",
      "'unsafe-inline'",  // Required for Tailwind and UI libraries
    ],
    'img-src': [
      "'self'",
      'data:',
      'blob:',
      'https://storage.googleapis.com',
      'https://*.googleusercontent.com',
    ],
    'font-src': ["'self'", 'data:', 'https://unpkg.com'],
    'connect-src': [
      "'self'",
      'blob:',
      'https://unpkg.com',  // @react-pdf/renderer fetches fonts from unpkg
      'https://*.sentry.io',
      'wss://*.pusher.com',
      ...(isProduction ? [] : ['ws://localhost:*', 'http://localhost:*']),
    ],
    'worker-src': ["'self'", 'blob:'],
    'frame-src': ["'self'", 'blob:', 'https://storage.googleapis.com'],
    'frame-ancestors': ["'none'"],
    'object-src': ["'none'"],
    'base-uri': ["'self'"],
    'form-action': ["'self'"],
    'upgrade-insecure-requests': [],
    // CSP violation reporting for security monitoring
    ...(isProduction ? { 'report-uri': ['/api/csp-report'] } : {}),
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
function getSecurityHeaders(): Record<string, string> {
  return {
    'Content-Security-Policy': buildCSP(),
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
  // Create response with security headers
  const response = NextResponse.next()

  // Apply security headers
  const securityHeaders = getSecurityHeaders()
  for (const [key, value] of Object.entries(securityHeaders)) {
    response.headers.set(key, value)
  }

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
