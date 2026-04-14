/**
 * Rate Limiter Unit Tests
 *
 * Tests for the rate limiting and account lockout functionality.
 * Migrated from hta-calibration/tests/unit/rate-limiter.test.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  RateLimitConfig,
  AccountLockoutConfig,
  checkRateLimit,
  recordFailedLoginAttempt,
  isAccountLocked,
  clearFailedLoginAttempts,
  getClientIPFromHeaders,
  createRateLimitHeaders,
} from '../src/security/rate-limiter'

// Mock the cache module
vi.mock('../src/cache', () => ({
  cache: {
    incr: vi.fn(),
    expire: vi.fn(),
    ttl: vi.fn(),
    get: vi.fn(),
    set: vi.fn(),
    delete: vi.fn(),
  },
}))

import { cache } from '../src/cache'

describe('Rate Limiter', () => {
  beforeEach(() => {
    vi.clearAllMocks()
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
      vi.mocked(cache.incr).mockResolvedValue(1)
      vi.mocked(cache.expire).mockResolvedValue(true)
      vi.mocked(cache.ttl).mockResolvedValue(900)

      const result = await checkRateLimit('192.168.1.1', 'LOGIN')

      expect(result.allowed).toBe(true)
      expect(result.remaining).toBe(4)
      expect(result.limit).toBe(5)
      expect(cache.incr).toHaveBeenCalledWith('ratelimit:login:192.168.1.1')
      expect(cache.expire).toHaveBeenCalledWith('ratelimit:login:192.168.1.1', 900)
    })

    it('should allow requests within limit', async () => {
      vi.mocked(cache.incr).mockResolvedValue(3)
      vi.mocked(cache.ttl).mockResolvedValue(600)

      const result = await checkRateLimit('192.168.1.1', 'LOGIN')

      expect(result.allowed).toBe(true)
      expect(result.remaining).toBe(2)
      expect(cache.expire).not.toHaveBeenCalled() // Not first request
    })

    it('should block requests exceeding limit', async () => {
      vi.mocked(cache.incr).mockResolvedValue(6)
      vi.mocked(cache.ttl).mockResolvedValue(300)

      const result = await checkRateLimit('192.168.1.1', 'LOGIN')

      expect(result.allowed).toBe(false)
      expect(result.remaining).toBe(0)
    })

    it('should fail open on cache error', async () => {
      vi.mocked(cache.incr).mockRejectedValue(new Error('Cache unavailable'))

      const result = await checkRateLimit('192.168.1.1', 'LOGIN')

      expect(result.allowed).toBe(true)
      expect(result.remaining).toBe(5)
    })

    it('should use correct key prefix for different rate limit types', async () => {
      vi.mocked(cache.incr).mockResolvedValue(1)
      vi.mocked(cache.expire).mockResolvedValue(true)
      vi.mocked(cache.ttl).mockResolvedValue(3600)

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
      vi.mocked(cache.incr).mockResolvedValue(1)
      vi.mocked(cache.expire).mockResolvedValue(true)

      const result = await recordFailedLoginAttempt('staff:test@example.com')

      expect(result.locked).toBe(false)
      expect(result.remainingAttempts).toBe(4)
      expect(cache.incr).toHaveBeenCalledWith('failed:staff:test@example.com')
    })

    it('should lock account after max failed attempts', async () => {
      vi.mocked(cache.incr).mockResolvedValue(5)
      vi.mocked(cache.expire).mockResolvedValue(true)
      vi.mocked(cache.set).mockResolvedValue(undefined)
      vi.mocked(cache.delete).mockResolvedValue(true)

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
      vi.mocked(cache.incr).mockRejectedValue(new Error('Cache error'))

      const result = await recordFailedLoginAttempt('staff:test@example.com')

      expect(result.locked).toBe(false)
      expect(result.remainingAttempts).toBe(5)
    })
  })

  describe('isAccountLocked', () => {
    it('should return locked status when account is locked', async () => {
      vi.mocked(cache.get).mockResolvedValueOnce(true) // lockout key
      vi.mocked(cache.ttl).mockResolvedValue(600)

      const result = await isAccountLocked('staff:test@example.com')

      expect(result.locked).toBe(true)
      expect(result.remainingAttempts).toBe(0)
      expect(result.unlockAt).toBeDefined()
    })

    it('should return unlocked status with remaining attempts', async () => {
      vi.mocked(cache.get)
        .mockResolvedValueOnce(null) // lockout key - not locked
        .mockResolvedValueOnce(2) // failed attempts

      const result = await isAccountLocked('staff:test@example.com')

      expect(result.locked).toBe(false)
      expect(result.remainingAttempts).toBe(3)
    })

    it('should return full attempts when no failures recorded', async () => {
      vi.mocked(cache.get)
        .mockResolvedValueOnce(null) // lockout key
        .mockResolvedValueOnce(null) // failed attempts

      const result = await isAccountLocked('staff:test@example.com')

      expect(result.locked).toBe(false)
      expect(result.remainingAttempts).toBe(5)
    })

    it('should fail open on cache error', async () => {
      vi.mocked(cache.get).mockRejectedValue(new Error('Cache error'))

      const result = await isAccountLocked('staff:test@example.com')

      expect(result.locked).toBe(false)
      expect(result.remainingAttempts).toBe(5)
    })
  })

  describe('clearFailedLoginAttempts', () => {
    it('should clear both failed attempts and lockout keys', async () => {
      vi.mocked(cache.delete).mockResolvedValue(true)

      await clearFailedLoginAttempts('staff:test@example.com')

      expect(cache.delete).toHaveBeenCalledWith('failed:staff:test@example.com')
      expect(cache.delete).toHaveBeenCalledWith('lockout:staff:test@example.com')
    })

    it('should not throw on cache error', async () => {
      vi.mocked(cache.delete).mockRejectedValue(new Error('Cache error'))

      await expect(clearFailedLoginAttempts('staff:test@example.com')).resolves.not.toThrow()
    })
  })

  describe('getClientIPFromHeaders', () => {
    function createMockHeaders(headers: Record<string, string>): { get: (name: string) => string | null } {
      return {
        get: (name: string) => headers[name.toLowerCase()] || null,
      }
    }

    it('should extract IP from cf-connecting-ip (Cloudflare)', () => {
      const headers = createMockHeaders({ 'cf-connecting-ip': '203.0.113.1' })
      expect(getClientIPFromHeaders(headers)).toBe('203.0.113.1')
    })

    it('should extract IP from x-real-ip (nginx)', () => {
      const headers = createMockHeaders({ 'x-real-ip': '203.0.113.2' })
      expect(getClientIPFromHeaders(headers)).toBe('203.0.113.2')
    })

    it('should extract first IP from x-forwarded-for', () => {
      const headers = createMockHeaders({ 'x-forwarded-for': '203.0.113.3, 10.0.0.1, 172.16.0.1' })
      expect(getClientIPFromHeaders(headers)).toBe('203.0.113.3')
    })

    it('should extract IP from x-appengine-user-ip (GCP)', () => {
      const headers = createMockHeaders({ 'x-appengine-user-ip': '203.0.113.4' })
      expect(getClientIPFromHeaders(headers)).toBe('203.0.113.4')
    })

    it('should prioritize headers correctly', () => {
      const headers = createMockHeaders({
        'cf-connecting-ip': '1.1.1.1',
        'x-real-ip': '2.2.2.2',
        'x-forwarded-for': '3.3.3.3',
      })
      expect(getClientIPFromHeaders(headers)).toBe('1.1.1.1')
    })

    it('should return unknown-ip when no headers present', () => {
      const headers = createMockHeaders({})
      expect(getClientIPFromHeaders(headers)).toBe('unknown-ip')
    })
  })

  describe('createRateLimitHeaders', () => {
    it('should create correct rate limit headers', () => {
      const result = {
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
