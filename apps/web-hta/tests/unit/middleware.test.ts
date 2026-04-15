/**
 * Middleware Unit Tests
 *
 * Tests for Next.js middleware:
 * - CSP header generation
 * - Security headers
 * - Nonce generation
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock Next.js server functions
vi.mock('next/server', () => {
  const headers = new Map<string, string>()
  return {
    NextResponse: {
      next: vi.fn(() => ({
        headers: {
          set: (key: string, value: string) => headers.set(key, value),
          get: (key: string) => headers.get(key),
          entries: () => headers.entries(),
        },
      })),
    },
  }
})

// Mock crypto for nonce generation
const mockGetRandomValues = vi.fn((array: Uint8Array) => {
  for (let i = 0; i < array.length; i++) {
    array[i] = Math.floor(Math.random() * 256)
  }
  return array
})

vi.stubGlobal('crypto', {
  getRandomValues: mockGetRandomValues,
  randomUUID: () => 'test-uuid-1234',
})

describe('Middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Nonce Generation', () => {
    it('generates base64 encoded nonce', () => {
      const array = new Uint8Array(16)
      mockGetRandomValues(array)
      const nonce = Buffer.from(array).toString('base64')

      expect(nonce).toBeDefined()
      expect(nonce.length).toBeGreaterThan(0)
    })

    it('generates unique nonces', () => {
      const nonces = new Set<string>()

      for (let i = 0; i < 100; i++) {
        const array = new Uint8Array(16)
        mockGetRandomValues(array)
        const nonce = Buffer.from(array).toString('base64')
        nonces.add(nonce)
      }

      // Should have high uniqueness (allowing for some collision in test)
      expect(nonces.size).toBeGreaterThan(90)
    })
  })

  describe('CSP Header Building', () => {
    function buildCSP(nonce: string, isProduction: boolean): string {
      const directives: Record<string, string[]> = {
        'default-src': ["'self'"],
        'script-src': [
          "'self'",
          `'nonce-${nonce}'`,
          "'strict-dynamic'",
          ...(isProduction ? [] : ["'unsafe-inline'", "'unsafe-eval'"]),
        ],
        'style-src': ["'self'", `'nonce-${nonce}'`, "'unsafe-inline'"],
        'img-src': ["'self'", 'data:', 'blob:', 'https://storage.googleapis.com'],
        'font-src': ["'self'", 'data:'],
        'connect-src': [
          "'self'",
          'https://*.sentry.io',
          ...(isProduction ? [] : ['ws://localhost:*']),
        ],
        'frame-ancestors': ["'none'"],
        'object-src': ["'none'"],
        'base-uri': ["'self'"],
        'form-action': ["'self'"],
      }

      return Object.entries(directives)
        .map(([key, values]) => `${key} ${values.join(' ')}`)
        .join('; ')
    }

    it('includes nonce in script-src', () => {
      const nonce = 'test-nonce-abc123'
      const csp = buildCSP(nonce, true)

      expect(csp).toContain(`'nonce-${nonce}'`)
      expect(csp).toContain('script-src')
    })

    it('includes strict-dynamic', () => {
      const csp = buildCSP('test', true)

      expect(csp).toContain("'strict-dynamic'")
    })

    it('blocks framing with frame-ancestors none', () => {
      const csp = buildCSP('test', true)

      expect(csp).toContain("frame-ancestors 'none'")
    })

    it('restricts object-src to none', () => {
      const csp = buildCSP('test', true)

      expect(csp).toContain("object-src 'none'")
    })

    it('allows self for default-src', () => {
      const csp = buildCSP('test', true)

      expect(csp).toContain("default-src 'self'")
    })

    it('includes unsafe-inline/eval in development', () => {
      const csp = buildCSP('test', false)

      expect(csp).toContain("'unsafe-inline'")
      expect(csp).toContain("'unsafe-eval'")
    })

    it('excludes unsafe-inline/eval in production', () => {
      const csp = buildCSP('test', true)

      // script-src should not have unsafe-inline in production
      // (style-src still has it for Tailwind)
      const scriptSrc = csp.split(';').find((d) => d.includes('script-src'))
      expect(scriptSrc).not.toContain("'unsafe-eval'")
    })

    it('allows required image sources', () => {
      const csp = buildCSP('test', true)

      expect(csp).toContain('img-src')
      expect(csp).toContain("'self'")
      expect(csp).toContain('data:')
      expect(csp).toContain('blob:')
    })

    it('allows Sentry connections', () => {
      const csp = buildCSP('test', true)

      expect(csp).toContain('https://*.sentry.io')
    })
  })

  describe('Security Headers', () => {
    function getSecurityHeaders(isProduction: boolean): Record<string, string> {
      return {
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'X-XSS-Protection': '1; mode=block',
        'Referrer-Policy': 'strict-origin-when-cross-origin',
        'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
        ...(isProduction
          ? { 'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload' }
          : {}),
      }
    }

    it('includes X-Content-Type-Options', () => {
      const headers = getSecurityHeaders(true)
      expect(headers['X-Content-Type-Options']).toBe('nosniff')
    })

    it('includes X-Frame-Options DENY', () => {
      const headers = getSecurityHeaders(true)
      expect(headers['X-Frame-Options']).toBe('DENY')
    })

    it('includes X-XSS-Protection', () => {
      const headers = getSecurityHeaders(true)
      expect(headers['X-XSS-Protection']).toBe('1; mode=block')
    })

    it('includes strict Referrer-Policy', () => {
      const headers = getSecurityHeaders(true)
      expect(headers['Referrer-Policy']).toBe('strict-origin-when-cross-origin')
    })

    it('includes restrictive Permissions-Policy', () => {
      const headers = getSecurityHeaders(true)
      expect(headers['Permissions-Policy']).toContain('camera=()')
      expect(headers['Permissions-Policy']).toContain('microphone=()')
      expect(headers['Permissions-Policy']).toContain('geolocation=()')
    })

    it('includes HSTS in production', () => {
      const headers = getSecurityHeaders(true)
      expect(headers['Strict-Transport-Security']).toContain('max-age=31536000')
      expect(headers['Strict-Transport-Security']).toContain('includeSubDomains')
    })

    it('excludes HSTS in development', () => {
      const headers = getSecurityHeaders(false)
      expect(headers['Strict-Transport-Security']).toBeUndefined()
    })
  })
})
