/**
 * Rate Limiter Unit Tests
 *
 * Tests for the rate limiting and account lockout functionality:
 * - Rate limit configuration
 * - Request counting and blocking
 * - Failed login attempt tracking
 * - Account lockout mechanism
 * - IP extraction from headers
 * - Rate limit response headers
 *
 * Migrated from hta-calibration/tests/unit/rate-limiter.test.ts
 * Self-contained version with mock implementations
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Configuration
const RateLimitConfig = {
  LOGIN: { limit: 5, windowSeconds: 15 * 60, keyPrefix: 'ratelimit:login:' },
  REGISTRATION: { limit: 3, windowSeconds: 60 * 60, keyPrefix: 'ratelimit:register:' },
  FORGOT_PASSWORD: { limit: 3, windowSeconds: 60 * 60, keyPrefix: 'ratelimit:forgot:' },
  API_GENERAL: { limit: 100, windowSeconds: 60, keyPrefix: 'ratelimit:api:' },
}

const AccountLockoutConfig = {
  maxFailedAttempts: 5,
  lockoutDurationSeconds: 15 * 60,
}

// Types
interface RateLimitResult {
  allowed: boolean
  limit: number
  remaining: number
  resetAt: number
}

interface LockoutStatus {
  locked: boolean
  remainingAttempts: number
  unlockAt?: Date
}

// Mock cache store
let mockCache: Map<string, { value: unknown; ttl: number; createdAt: number }>

// Mock cache functions
const cache = {
  incr: vi.fn(),
  expire: vi.fn(),
  ttl: vi.fn(),
  get: vi.fn(),
  set: vi.fn(),
  delete: vi.fn(),
}

// Rate limiter functions
async function checkRateLimit(
  identifier: string,
  configKey: keyof typeof RateLimitConfig
): Promise<RateLimitResult> {
  const config = RateLimitConfig[configKey]
  const key = `${config.keyPrefix}${identifier}`

  try {
    const count = await cache.incr(key)

    // Set expiry on first request
    if (count === 1) {
      await cache.expire(key, config.windowSeconds)
    }

    const ttl = await cache.ttl(key)
    const resetAt = Math.floor(Date.now() / 1000) + (ttl > 0 ? ttl : config.windowSeconds)

    return {
      allowed: count <= config.limit,
      limit: config.limit,
      remaining: Math.max(0, config.limit - count),
      resetAt,
    }
  } catch {
    // Fail open on cache errors
    return {
      allowed: true,
      limit: config.limit,
      remaining: config.limit,
      resetAt: Math.floor(Date.now() / 1000) + config.windowSeconds,
    }
  }
}

async function recordFailedLoginAttempt(identifier: string): Promise<LockoutStatus> {
  const failedKey = `failed:${identifier}`
  const lockoutKey = `lockout:${identifier}`

  try {
    const attempts = await cache.incr(failedKey)

    // Set expiry on first attempt
    if (attempts === 1) {
      await cache.expire(failedKey, AccountLockoutConfig.lockoutDurationSeconds)
    }

    if (attempts >= AccountLockoutConfig.maxFailedAttempts) {
      // Lock the account
      await cache.set(lockoutKey, true, AccountLockoutConfig.lockoutDurationSeconds)
      await cache.delete(failedKey)

      return {
        locked: true,
        remainingAttempts: 0,
        unlockAt: new Date(Date.now() + AccountLockoutConfig.lockoutDurationSeconds * 1000),
      }
    }

    return {
      locked: false,
      remainingAttempts: AccountLockoutConfig.maxFailedAttempts - attempts,
    }
  } catch {
    // Fail open on cache errors
    return {
      locked: false,
      remainingAttempts: AccountLockoutConfig.maxFailedAttempts,
    }
  }
}

async function isAccountLocked(identifier: string): Promise<LockoutStatus> {
  const lockoutKey = `lockout:${identifier}`
  const failedKey = `failed:${identifier}`

  try {
    const isLocked = await cache.get(lockoutKey)

    if (isLocked) {
      const ttl = await cache.ttl(lockoutKey)
      return {
        locked: true,
        remainingAttempts: 0,
        unlockAt: new Date(Date.now() + ttl * 1000),
      }
    }

    const failedAttempts = (await cache.get(failedKey)) as number | null
    const remaining = AccountLockoutConfig.maxFailedAttempts - (failedAttempts ?? 0)

    return {
      locked: false,
      remainingAttempts: remaining,
    }
  } catch {
    // Fail open on cache errors
    return {
      locked: false,
      remainingAttempts: AccountLockoutConfig.maxFailedAttempts,
    }
  }
}

async function clearFailedLoginAttempts(identifier: string): Promise<void> {
  const failedKey = `failed:${identifier}`
  const lockoutKey = `lockout:${identifier}`

  try {
    await cache.delete(failedKey)
    await cache.delete(lockoutKey)
  } catch {
    // Ignore cache errors
  }
}

// Mock request type
interface MockRequest {
  headers: {
    get: (name: string) => string | null
  }
}

function getClientIP(request: MockRequest): string {
  // Check various headers in priority order
  const headers = [
    'cf-connecting-ip', // Cloudflare
    'x-real-ip', // Nginx
    'x-forwarded-for', // General proxy
    'x-appengine-user-ip', // GCP
  ]

  for (const header of headers) {
    const value = request.headers.get(header)
    if (value) {
      // x-forwarded-for may contain multiple IPs
      return value.split(',')[0].trim()
    }
  }

  return 'unknown-ip'
}

function createRateLimitHeaders(result: RateLimitResult): Record<string, string> {
  return {
    'X-RateLimit-Limit': String(result.limit),
    'X-RateLimit-Remaining': String(result.remaining),
    'X-RateLimit-Reset': String(result.resetAt),
  }
}

// Helper to create mock request
function createMockRequest(headers: Record<string, string>): MockRequest {
  return {
    headers: {
      get: (name: string) => headers[name.toLowerCase()] || null,
    },
  }
}

describe('Rate Limiter', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCache = new Map()
  })

  describe('RateLimitConfig', () => {
    it('should have correct LOGIN config', () => {
      expect(RateLimitConfig.LOGIN.limit).toBe(5)
      expect(RateLimitConfig.LOGIN.windowSeconds).toBe(15 * 60)
      expect(RateLimitConfig.LOGIN.keyPrefix).toBe('ratelimit:login:')
    })

    it('should have correct REGISTRATION config', () => {
      expect(RateLimitConfig.REGISTRATION.limit).toBe(3)
      expect(RateLimitConfig.REGISTRATION.windowSeconds).toBe(60 * 60)
    })

    it('should have correct FORGOT_PASSWORD config', () => {
      expect(RateLimitConfig.FORGOT_PASSWORD.limit).toBe(3)
      expect(RateLimitConfig.FORGOT_PASSWORD.windowSeconds).toBe(60 * 60)
    })

    it('should have correct API_GENERAL config', () => {
      expect(RateLimitConfig.API_GENERAL.limit).toBe(100)
      expect(RateLimitConfig.API_GENERAL.windowSeconds).toBe(60)
    })
  })

  describe('AccountLockoutConfig', () => {
    it('should have correct lockout settings', () => {
      expect(AccountLockoutConfig.maxFailedAttempts).toBe(5)
      expect(AccountLockoutConfig.lockoutDurationSeconds).toBe(15 * 60)
    })
  })

  describe('checkRateLimit', () => {
    it('should allow first request', async () => {
      cache.incr.mockResolvedValue(1)
      cache.expire.mockResolvedValue(true)
      cache.ttl.mockResolvedValue(900)

      const result = await checkRateLimit('192.168.1.1', 'LOGIN')

      expect(result.allowed).toBe(true)
      expect(result.remaining).toBe(4)
      expect(result.limit).toBe(5)
      expect(cache.incr).toHaveBeenCalledWith('ratelimit:login:192.168.1.1')
      expect(cache.expire).toHaveBeenCalledWith('ratelimit:login:192.168.1.1', 900)
    })

    it('should allow requests within limit', async () => {
      cache.incr.mockResolvedValue(3)
      cache.ttl.mockResolvedValue(600)

      const result = await checkRateLimit('192.168.1.1', 'LOGIN')

      expect(result.allowed).toBe(true)
      expect(result.remaining).toBe(2)
      expect(cache.expire).not.toHaveBeenCalled() // Not first request
    })

    it('should block requests exceeding limit', async () => {
      cache.incr.mockResolvedValue(6)
      cache.ttl.mockResolvedValue(300)

      const result = await checkRateLimit('192.168.1.1', 'LOGIN')

      expect(result.allowed).toBe(false)
      expect(result.remaining).toBe(0)
    })

    it('should fail open on cache error', async () => {
      cache.incr.mockRejectedValue(new Error('Cache unavailable'))

      const result = await checkRateLimit('192.168.1.1', 'LOGIN')

      expect(result.allowed).toBe(true)
      expect(result.remaining).toBe(5)
    })

    it('should use correct key prefix for different rate limit types', async () => {
      cache.incr.mockResolvedValue(1)
      cache.expire.mockResolvedValue(true)
      cache.ttl.mockResolvedValue(3600)

      await checkRateLimit('192.168.1.1', 'REGISTRATION')
      expect(cache.incr).toHaveBeenCalledWith('ratelimit:register:192.168.1.1')

      await checkRateLimit('192.168.1.1', 'FORGOT_PASSWORD')
      expect(cache.incr).toHaveBeenCalledWith('ratelimit:forgot:192.168.1.1')

      await checkRateLimit('192.168.1.1', 'API_GENERAL')
      expect(cache.incr).toHaveBeenCalledWith('ratelimit:api:192.168.1.1')
    })
  })

  describe('recordFailedLoginAttempt', () => {
    it('should record first failed attempt', async () => {
      cache.incr.mockResolvedValue(1)
      cache.expire.mockResolvedValue(true)

      const result = await recordFailedLoginAttempt('staff:test@example.com')

      expect(result.locked).toBe(false)
      expect(result.remainingAttempts).toBe(4)
      expect(cache.incr).toHaveBeenCalledWith('failed:staff:test@example.com')
    })

    it('should lock account after max failed attempts', async () => {
      cache.incr.mockResolvedValue(5)
      cache.expire.mockResolvedValue(true)
      cache.set.mockResolvedValue(undefined)
      cache.delete.mockResolvedValue(true)

      const result = await recordFailedLoginAttempt('staff:test@example.com')

      expect(result.locked).toBe(true)
      expect(result.remainingAttempts).toBe(0)
      expect(result.unlockAt).toBeDefined()
      expect(cache.set).toHaveBeenCalledWith(
        'lockout:staff:test@example.com',
        true,
        AccountLockoutConfig.lockoutDurationSeconds
      )
      expect(cache.delete).toHaveBeenCalledWith('failed:staff:test@example.com')
    })

    it('should fail open on cache error', async () => {
      cache.incr.mockRejectedValue(new Error('Cache error'))

      const result = await recordFailedLoginAttempt('staff:test@example.com')

      expect(result.locked).toBe(false)
      expect(result.remainingAttempts).toBe(5)
    })
  })

  describe('isAccountLocked', () => {
    it('should return locked status when account is locked', async () => {
      cache.get.mockResolvedValueOnce(true) // lockout key
      cache.ttl.mockResolvedValue(600)

      const result = await isAccountLocked('staff:test@example.com')

      expect(result.locked).toBe(true)
      expect(result.remainingAttempts).toBe(0)
      expect(result.unlockAt).toBeDefined()
    })

    it('should return unlocked status with remaining attempts', async () => {
      cache.get
        .mockResolvedValueOnce(null) // lockout key - not locked
        .mockResolvedValueOnce(2) // failed attempts

      const result = await isAccountLocked('staff:test@example.com')

      expect(result.locked).toBe(false)
      expect(result.remainingAttempts).toBe(3)
    })

    it('should return full attempts when no failures recorded', async () => {
      cache.get
        .mockResolvedValueOnce(null) // lockout key
        .mockResolvedValueOnce(null) // failed attempts

      const result = await isAccountLocked('staff:test@example.com')

      expect(result.locked).toBe(false)
      expect(result.remainingAttempts).toBe(5)
    })

    it('should fail open on cache error', async () => {
      cache.get.mockRejectedValue(new Error('Cache error'))

      const result = await isAccountLocked('staff:test@example.com')

      expect(result.locked).toBe(false)
      expect(result.remainingAttempts).toBe(5)
    })
  })

  describe('clearFailedLoginAttempts', () => {
    it('should clear both failed attempts and lockout keys', async () => {
      cache.delete.mockResolvedValue(true)

      await clearFailedLoginAttempts('staff:test@example.com')

      expect(cache.delete).toHaveBeenCalledWith('failed:staff:test@example.com')
      expect(cache.delete).toHaveBeenCalledWith('lockout:staff:test@example.com')
    })

    it('should not throw on cache error', async () => {
      cache.delete.mockRejectedValue(new Error('Cache error'))

      await expect(clearFailedLoginAttempts('staff:test@example.com')).resolves.not.toThrow()
    })
  })

  describe('getClientIP', () => {
    it('should extract IP from cf-connecting-ip (Cloudflare)', () => {
      const request = createMockRequest({ 'cf-connecting-ip': '203.0.113.1' })
      expect(getClientIP(request)).toBe('203.0.113.1')
    })

    it('should extract IP from x-real-ip (nginx)', () => {
      const request = createMockRequest({ 'x-real-ip': '203.0.113.2' })
      expect(getClientIP(request)).toBe('203.0.113.2')
    })

    it('should extract first IP from x-forwarded-for', () => {
      const request = createMockRequest({ 'x-forwarded-for': '203.0.113.3, 10.0.0.1, 172.16.0.1' })
      expect(getClientIP(request)).toBe('203.0.113.3')
    })

    it('should extract IP from x-appengine-user-ip (GCP)', () => {
      const request = createMockRequest({ 'x-appengine-user-ip': '203.0.113.4' })
      expect(getClientIP(request)).toBe('203.0.113.4')
    })

    it('should prioritize headers correctly', () => {
      const request = createMockRequest({
        'cf-connecting-ip': '1.1.1.1',
        'x-real-ip': '2.2.2.2',
        'x-forwarded-for': '3.3.3.3',
      })
      expect(getClientIP(request)).toBe('1.1.1.1')
    })

    it('should return unknown-ip when no headers present', () => {
      const request = createMockRequest({})
      expect(getClientIP(request)).toBe('unknown-ip')
    })
  })

  describe('createRateLimitHeaders', () => {
    it('should create correct rate limit headers', () => {
      const result: RateLimitResult = {
        allowed: true,
        limit: 100,
        remaining: 95,
        resetAt: 1700000000,
      }

      const headers = createRateLimitHeaders(result)

      expect(headers['X-RateLimit-Limit']).toBe('100')
      expect(headers['X-RateLimit-Remaining']).toBe('95')
      expect(headers['X-RateLimit-Reset']).toBe('1700000000')
    })
  })
})
