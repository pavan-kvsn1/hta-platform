/**
 * CORS Unit Tests
 *
 * Tests for CORS configuration utilities.
 * Migrated from hta-calibration/tests/unit/cors.test.ts
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  getCorsConfig,
  isOriginAllowed,
  createCorsHeaders,
  CorsConfig,
} from '../src/security/cors'

describe('CORS', () => {
  const originalEnv = process.env

  beforeEach(() => {
    vi.resetModules()
    process.env = { ...originalEnv }
  })

  afterEach(() => {
    process.env = originalEnv
  })

  describe('getCorsConfig', () => {
    it('should return default config when no env vars set', () => {
      delete process.env.CORS_ALLOWED_ORIGINS
      delete process.env.FRONTEND_URL
      delete process.env.NEXTAUTH_URL

      const config = getCorsConfig()

      expect(config.allowedOrigins).toEqual([])
      expect(config.allowedMethods).toContain('GET')
      expect(config.allowedMethods).toContain('POST')
      expect(config.allowedHeaders).toContain('Content-Type')
      expect(config.allowedHeaders).toContain('Authorization')
      expect(config.credentials).toBe(true)
      expect(config.maxAge).toBe(86400)
    })

    it('should parse CORS_ALLOWED_ORIGINS', () => {
      process.env.CORS_ALLOWED_ORIGINS = 'https://app.example.com, https://admin.example.com'

      const config = getCorsConfig()

      expect(config.allowedOrigins).toContain('https://app.example.com')
      expect(config.allowedOrigins).toContain('https://admin.example.com')
    })

    it('should fallback to FRONTEND_URL and NEXTAUTH_URL', () => {
      delete process.env.CORS_ALLOWED_ORIGINS
      process.env.FRONTEND_URL = 'https://frontend.example.com'
      process.env.NEXTAUTH_URL = 'https://auth.example.com'

      const config = getCorsConfig()

      expect(config.allowedOrigins).toContain('https://frontend.example.com')
      expect(config.allowedOrigins).toContain('https://auth.example.com')
    })

    it('should prefer CORS_ALLOWED_ORIGINS over fallbacks', () => {
      process.env.CORS_ALLOWED_ORIGINS = 'https://explicit.example.com'
      process.env.FRONTEND_URL = 'https://frontend.example.com'

      const config = getCorsConfig()

      expect(config.allowedOrigins).toContain('https://explicit.example.com')
      expect(config.allowedOrigins).not.toContain('https://frontend.example.com')
    })

    it('should include X-Tenant-ID in allowed headers for multi-tenant support', () => {
      const config = getCorsConfig()
      expect(config.allowedHeaders).toContain('X-Tenant-ID')
    })
  })

  describe('isOriginAllowed', () => {
    const config: CorsConfig = {
      allowedOrigins: ['https://example.com', '*.example.org'],
      allowedMethods: ['GET'],
      allowedHeaders: [],
      exposedHeaders: [],
      credentials: true,
      maxAge: 3600,
    }

    it('should return false for null origin', () => {
      expect(isOriginAllowed(null, config)).toBe(false)
    })

    it('should allow exact match', () => {
      expect(isOriginAllowed('https://example.com', config)).toBe(true)
    })

    it('should reject non-matching origin', () => {
      expect(isOriginAllowed('https://other.com', config)).toBe(false)
    })

    it('should support wildcard subdomains', () => {
      expect(isOriginAllowed('https://app.example.org', config)).toBe(true)
      expect(isOriginAllowed('https://admin.example.org', config)).toBe(true)
    })

    it('should allow localhost in development', () => {
      const originalNodeEnv = process.env.NODE_ENV
      process.env.NODE_ENV = 'development'

      expect(isOriginAllowed('http://localhost:3000', config)).toBe(true)
      expect(isOriginAllowed('http://127.0.0.1:3000', config)).toBe(true)

      process.env.NODE_ENV = originalNodeEnv
    })

    it('should not allow localhost in production', () => {
      const originalNodeEnv = process.env.NODE_ENV
      process.env.NODE_ENV = 'production'

      expect(isOriginAllowed('http://localhost:3000', config)).toBe(false)

      process.env.NODE_ENV = originalNodeEnv
    })
  })

  describe('createCorsHeaders', () => {
    const config: CorsConfig = {
      allowedOrigins: ['https://example.com'],
      allowedMethods: ['GET', 'POST'],
      allowedHeaders: ['Content-Type', 'Authorization'],
      exposedHeaders: ['X-RateLimit-Limit'],
      credentials: true,
      maxAge: 3600,
    }

    it('should create headers for allowed origin', () => {
      const headers = createCorsHeaders('https://example.com', config)

      expect(headers['Access-Control-Allow-Origin']).toBe('https://example.com')
      expect(headers['Access-Control-Allow-Credentials']).toBe('true')
      expect(headers['Access-Control-Allow-Methods']).toBe('GET, POST')
      expect(headers['Access-Control-Allow-Headers']).toBe('Content-Type, Authorization')
      expect(headers['Access-Control-Expose-Headers']).toBe('X-RateLimit-Limit')
      expect(headers['Access-Control-Max-Age']).toBe('3600')
    })

    it('should return empty object for disallowed origin', () => {
      const headers = createCorsHeaders('https://malicious.com', config)
      expect(Object.keys(headers).length).toBe(0)
    })

    it('should return empty object when no origin provided', () => {
      const headers = createCorsHeaders(null, config)
      expect(Object.keys(headers).length).toBe(0)
    })
  })
})
