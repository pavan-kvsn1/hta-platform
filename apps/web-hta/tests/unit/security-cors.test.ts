/**
 * CORS & Rate Limiter Config Unit Tests (actual imports)
 *
 * Tests importing the actual modules for real coverage:
 * - src/lib/security/cors.ts — getCorsConfig, isOriginAllowed, createCorsHeaders
 * - src/lib/security/rate-limiter.ts — RateLimitConfig, AccountLockoutConfig (pure config)
 * - src/lib/refresh-token.ts — REFRESH_TOKEN_CONFIG constants
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'

// ---------------------------------------------------------------------------
// Mock the cache module used by rate-limiter (avoids Redis connection)
// ---------------------------------------------------------------------------
vi.mock('@/lib/cache', () => ({
  cache: {
    get: vi.fn(),
    set: vi.fn(),
    incr: vi.fn().mockResolvedValue(1),
    expire: vi.fn().mockResolvedValue(true),
    ttl: vi.fn().mockResolvedValue(60),
    del: vi.fn().mockResolvedValue(true),
  },
}))

// Mock prisma to prevent DB connection
vi.mock('@/lib/prisma', () => ({
  prisma: {
    refreshToken: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}))

// ---------------------------------------------------------------------------
// 1. CORS configuration
// ---------------------------------------------------------------------------
import { getCorsConfig, isOriginAllowed, type CorsConfig } from '@/lib/security/cors'

describe('getCorsConfig', () => {
  const originalEnv = { ...process.env }

  afterEach(() => {
    process.env = { ...originalEnv }
  })

  it('returns a config with allowed methods', () => {
    const config = getCorsConfig()
    expect(config.allowedMethods).toContain('GET')
    expect(config.allowedMethods).toContain('POST')
    expect(config.allowedMethods).toContain('OPTIONS')
  })

  it('returns a config with allowed headers', () => {
    const config = getCorsConfig()
    expect(config.allowedHeaders).toContain('Content-Type')
    expect(config.allowedHeaders).toContain('Authorization')
  })

  it('has credentials=true', () => {
    const config = getCorsConfig()
    expect(config.credentials).toBe(true)
  })

  it('has maxAge set to 86400 (24 hours)', () => {
    const config = getCorsConfig()
    expect(config.maxAge).toBe(86400)
  })

  it('parses CORS_ALLOWED_ORIGINS from environment', () => {
    process.env.CORS_ALLOWED_ORIGINS = 'https://example.com,https://app.example.com'
    const config = getCorsConfig()
    expect(config.allowedOrigins).toContain('https://example.com')
    expect(config.allowedOrigins).toContain('https://app.example.com')
  })

  it('falls back to FRONTEND_URL when CORS_ALLOWED_ORIGINS not set', () => {
    delete process.env.CORS_ALLOWED_ORIGINS
    process.env.FRONTEND_URL = 'https://frontend.example.com'
    delete process.env.NEXTAUTH_URL
    const config = getCorsConfig()
    expect(config.allowedOrigins).toContain('https://frontend.example.com')
  })

  it('exposes rate limit headers', () => {
    const config = getCorsConfig()
    expect(config.exposedHeaders).toContain('X-RateLimit-Limit')
    expect(config.exposedHeaders).toContain('X-RateLimit-Remaining')
  })
})

describe('isOriginAllowed', () => {
  const config: CorsConfig = {
    allowedOrigins: ['https://app.example.com', '*.trusted.com'],
    allowedMethods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type'],
    exposedHeaders: [],
    credentials: true,
    maxAge: 3600,
  }

  it('returns false for null origin', () => {
    expect(isOriginAllowed(null, config)).toBe(false)
  })

  it('returns true for exact match', () => {
    expect(isOriginAllowed('https://app.example.com', config)).toBe(true)
  })

  it('returns false for non-matching origin', () => {
    expect(isOriginAllowed('https://evil.com', config)).toBe(false)
  })

  it('returns true for wildcard subdomain match', () => {
    expect(isOriginAllowed('https://sub.trusted.com', config)).toBe(true)
  })

  it('returns true for root domain when wildcard pattern matches endsWith', () => {
    // Implementation uses endsWith('trusted.com') which matches the root domain too
    expect(isOriginAllowed('https://trusted.com', config)).toBe(true)
  })

  it('allows localhost in development mode', () => {
    const originalEnv = process.env.NODE_ENV
    Object.defineProperty(process.env, 'NODE_ENV', { value: 'development', writable: true, configurable: true })
    expect(isOriginAllowed('http://localhost:3000', config)).toBe(true)
    Object.defineProperty(process.env, 'NODE_ENV', { value: originalEnv, writable: true, configurable: true })
  })
})

// ---------------------------------------------------------------------------
// 2. Rate limiter config constants (pure exports, no cache calls)
// ---------------------------------------------------------------------------
import { RateLimitConfig, AccountLockoutConfig } from '@/lib/security/rate-limiter'

describe('RateLimitConfig', () => {
  it('LOGIN config has limit of 5', () => {
    expect(RateLimitConfig.LOGIN.limit).toBe(5)
  })

  it('LOGIN config has 15-minute window', () => {
    expect(RateLimitConfig.LOGIN.windowSeconds).toBe(15 * 60)
  })

  it('REGISTRATION config has limit of 3', () => {
    expect(RateLimitConfig.REGISTRATION.limit).toBe(3)
  })

  it('FORGOT_PASSWORD config has 1-hour window', () => {
    expect(RateLimitConfig.FORGOT_PASSWORD.windowSeconds).toBe(60 * 60)
  })

  it('API_GENERAL config has limit of 100', () => {
    expect(RateLimitConfig.API_GENERAL.limit).toBe(100)
  })

  it('API_GENERAL config has 60-second window', () => {
    expect(RateLimitConfig.API_GENERAL.windowSeconds).toBe(60)
  })

  it('all configs have a keyPrefix', () => {
    for (const key of Object.keys(RateLimitConfig) as Array<keyof typeof RateLimitConfig>) {
      expect(RateLimitConfig[key].keyPrefix).toBeTruthy()
      expect(typeof RateLimitConfig[key].keyPrefix).toBe('string')
    }
  })
})

describe('AccountLockoutConfig', () => {
  it('maxFailedAttempts is 5', () => {
    expect(AccountLockoutConfig.maxFailedAttempts).toBe(5)
  })

  it('lockout duration is 15 minutes', () => {
    expect(AccountLockoutConfig.lockoutDurationSeconds).toBe(15 * 60)
  })

  it('has lockout key prefix', () => {
    expect(AccountLockoutConfig.keyPrefix).toBeTruthy()
  })

  it('has failed attempts key prefix', () => {
    expect(AccountLockoutConfig.failedAttemptsKeyPrefix).toBeTruthy()
  })
})

// ---------------------------------------------------------------------------
// 3. Refresh token config constants
// ---------------------------------------------------------------------------
import { REFRESH_TOKEN_CONFIG } from '@/lib/refresh-token'

describe('REFRESH_TOKEN_CONFIG', () => {
  it('refresh token expires in 7 days', () => {
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000
    expect(REFRESH_TOKEN_CONFIG.expiresInMs).toBe(sevenDaysMs)
  })

  it('access token expires in 15 minutes', () => {
    const fifteenMinMs = 15 * 60 * 1000
    expect(REFRESH_TOKEN_CONFIG.accessTokenExpiresInMs).toBe(fifteenMinMs)
  })

  it('token uses 32 bytes of entropy', () => {
    expect(REFRESH_TOKEN_CONFIG.tokenBytes).toBe(32)
  })

  it('refresh token TTL is longer than access token TTL', () => {
    expect(REFRESH_TOKEN_CONFIG.expiresInMs).toBeGreaterThan(REFRESH_TOKEN_CONFIG.accessTokenExpiresInMs)
  })
})

// ---------------------------------------------------------------------------
// 4. CORS header creation
// ---------------------------------------------------------------------------
import { createCorsHeaders } from '@/lib/security/cors'

describe('createCorsHeaders', () => {
  it('sets Access-Control-Allow-Origin for allowed origin', () => {
    const config: CorsConfig = {
      allowedOrigins: ['https://app.example.com'],
      allowedMethods: ['GET', 'POST'],
      allowedHeaders: ['Content-Type'],
      exposedHeaders: ['X-RateLimit-Limit'],
      credentials: true,
      maxAge: 3600,
    }

    const request = new NextRequest('http://localhost:3000/api/test', {
      headers: { origin: 'https://app.example.com' },
    })

    const headers = createCorsHeaders(request, config)
    expect(headers.get('Access-Control-Allow-Origin')).toBe('https://app.example.com')
    expect(headers.get('Access-Control-Allow-Credentials')).toBe('true')
  })

  it('does not set CORS headers for disallowed origin', () => {
    const config: CorsConfig = {
      allowedOrigins: ['https://app.example.com'],
      allowedMethods: ['GET'],
      allowedHeaders: ['Content-Type'],
      exposedHeaders: [],
      credentials: true,
      maxAge: 3600,
    }

    const request = new NextRequest('http://localhost:3000/api/test', {
      headers: { origin: 'https://evil.com' },
    })

    const headers = createCorsHeaders(request, config)
    expect(headers.get('Access-Control-Allow-Origin')).toBeNull()
  })

  it('sets correct allowed methods header', () => {
    const config: CorsConfig = {
      allowedOrigins: ['https://app.example.com'],
      allowedMethods: ['GET', 'POST', 'DELETE'],
      allowedHeaders: ['Content-Type'],
      exposedHeaders: [],
      credentials: true,
      maxAge: 3600,
    }

    const request = new NextRequest('http://localhost:3000/api/test', {
      headers: { origin: 'https://app.example.com' },
    })

    const headers = createCorsHeaders(request, config)
    const methodsHeader = headers.get('Access-Control-Allow-Methods')
    expect(methodsHeader).toContain('GET')
    expect(methodsHeader).toContain('POST')
    expect(methodsHeader).toContain('DELETE')
  })
})

// ---------------------------------------------------------------------------
// 5. handleCorsPreflightRequest
// ---------------------------------------------------------------------------
import { handleCorsPreflightRequest } from '@/lib/security/cors'

describe('handleCorsPreflightRequest', () => {
  const config: CorsConfig = {
    allowedOrigins: ['https://app.example.com'],
    allowedMethods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type'],
    exposedHeaders: [],
    credentials: true,
    maxAge: 3600,
  }

  it('returns null for non-OPTIONS requests', () => {
    const request = new NextRequest('http://localhost:3000/api/test', {
      method: 'GET',
      headers: { origin: 'https://app.example.com' },
    })
    const result = handleCorsPreflightRequest(request, config)
    expect(result).toBeNull()
  })

  it('returns 204 for allowed OPTIONS preflight', () => {
    const request = new NextRequest('http://localhost:3000/api/test', {
      method: 'OPTIONS',
      headers: { origin: 'https://app.example.com' },
    })
    const result = handleCorsPreflightRequest(request, config)
    expect(result).not.toBeNull()
    expect(result!.status).toBe(204)
  })

  it('returns 403 for disallowed OPTIONS preflight', () => {
    const request = new NextRequest('http://localhost:3000/api/test', {
      method: 'OPTIONS',
      headers: { origin: 'https://evil.com' },
    })
    const result = handleCorsPreflightRequest(request, config)
    expect(result).not.toBeNull()
    expect(result!.status).toBe(403)
  })
})
