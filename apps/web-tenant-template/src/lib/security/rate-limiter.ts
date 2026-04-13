/**
 * Rate Limiter Service
 *
 * Provides rate limiting and account lockout functionality using
 * the existing cache infrastructure (Redis or memory).
 *
 * Uses fixed window counter algorithm:
 * 1. For each identifier, maintain counter in cache
 * 2. First request: set counter=1, set TTL=window
 * 3. Subsequent: increment atomically via cache.incr()
 * 4. If counter > limit: reject with 429
 * 5. Counter auto-expires after window
 *
 * Fail-open design: If cache unavailable, requests are allowed through
 */

import { cache } from '@/lib/cache'
import { NextRequest } from 'next/server'

// Rate limit configurations for different endpoints
export const RateLimitConfig = {
  LOGIN: {
    limit: 5,
    windowSeconds: 15 * 60, // 15 minutes
    keyPrefix: 'ratelimit:login:',
  },
  REGISTRATION: {
    limit: 3,
    windowSeconds: 60 * 60, // 1 hour
    keyPrefix: 'ratelimit:register:',
  },
  FORGOT_PASSWORD: {
    limit: 3,
    windowSeconds: 60 * 60, // 1 hour
    keyPrefix: 'ratelimit:forgot:',
  },
  API_GENERAL: {
    limit: 100,
    windowSeconds: 60, // 1 minute
    keyPrefix: 'ratelimit:api:',
  },
} as const

export type RateLimitType = keyof typeof RateLimitConfig

// Account lockout configuration
export const AccountLockoutConfig = {
  maxFailedAttempts: 5,
  lockoutDurationSeconds: 15 * 60, // 15 minutes
  keyPrefix: 'lockout:',
  failedAttemptsKeyPrefix: 'failed:',
}

export interface RateLimitResult {
  allowed: boolean
  limit: number
  remaining: number
  resetAt: number // Unix timestamp when window resets
}

export interface AccountLockoutResult {
  locked: boolean
  remainingAttempts: number
  unlockAt?: number // Unix timestamp when account unlocks
}

/**
 * Check if a request is within rate limits
 *
 * @param identifier - Unique identifier (usually IP address)
 * @param type - Type of rate limit to check
 * @returns Rate limit result with remaining requests
 */
export async function checkRateLimit(
  identifier: string,
  type: RateLimitType
): Promise<RateLimitResult> {
  const config = RateLimitConfig[type]
  const key = `${config.keyPrefix}${identifier}`

  try {
    // Increment counter (creates with value 1 if doesn't exist)
    const count = await cache.incr(key)

    // Set expiration on first request
    if (count === 1) {
      await cache.expire(key, config.windowSeconds)
    }

    // Get TTL to calculate reset time
    const ttl = await cache.ttl(key)
    const resetAt = Math.floor(Date.now() / 1000) + (ttl > 0 ? ttl : config.windowSeconds)

    const allowed = count <= config.limit
    const remaining = Math.max(0, config.limit - count)

    return {
      allowed,
      limit: config.limit,
      remaining,
      resetAt,
    }
  } catch (error) {
    console.error('[RateLimiter] Cache error, failing open:', error)
    // Fail open - allow request if cache is unavailable
    return {
      allowed: true,
      limit: config.limit,
      remaining: config.limit,
      resetAt: Math.floor(Date.now() / 1000) + config.windowSeconds,
    }
  }
}

/**
 * Record a failed login attempt for an account
 *
 * @param accountKey - Unique account identifier (e.g., "staff:email@example.com")
 */
export async function recordFailedLoginAttempt(accountKey: string): Promise<AccountLockoutResult> {
  const failedKey = `${AccountLockoutConfig.failedAttemptsKeyPrefix}${accountKey}`
  const lockoutKey = `${AccountLockoutConfig.keyPrefix}${accountKey}`

  try {
    // Increment failed attempts
    const attempts = await cache.incr(failedKey)

    // Set/refresh expiration on failed attempts counter
    await cache.expire(failedKey, AccountLockoutConfig.lockoutDurationSeconds)

    // Check if account should be locked
    if (attempts >= AccountLockoutConfig.maxFailedAttempts) {
      // Lock the account
      await cache.set(lockoutKey, true, AccountLockoutConfig.lockoutDurationSeconds)

      // Clear failed attempts counter (it served its purpose)
      await cache.delete(failedKey)

      const unlockAt = Math.floor(Date.now() / 1000) + AccountLockoutConfig.lockoutDurationSeconds

      return {
        locked: true,
        remainingAttempts: 0,
        unlockAt,
      }
    }

    return {
      locked: false,
      remainingAttempts: AccountLockoutConfig.maxFailedAttempts - attempts,
    }
  } catch (error) {
    console.error('[RateLimiter] Failed to record login attempt:', error)
    // Fail open
    return {
      locked: false,
      remainingAttempts: AccountLockoutConfig.maxFailedAttempts,
    }
  }
}

/**
 * Check if an account is currently locked
 *
 * @param accountKey - Unique account identifier
 */
export async function isAccountLocked(accountKey: string): Promise<AccountLockoutResult> {
  const lockoutKey = `${AccountLockoutConfig.keyPrefix}${accountKey}`
  const failedKey = `${AccountLockoutConfig.failedAttemptsKeyPrefix}${accountKey}`

  try {
    const locked = await cache.get<boolean>(lockoutKey)

    if (locked) {
      const ttl = await cache.ttl(lockoutKey)
      const unlockAt = Math.floor(Date.now() / 1000) + (ttl > 0 ? ttl : 0)

      return {
        locked: true,
        remainingAttempts: 0,
        unlockAt,
      }
    }

    // Get current failed attempts to return remaining
    const failedAttempts = await cache.get<number>(failedKey)
    const attempts = typeof failedAttempts === 'number' ? failedAttempts : 0

    return {
      locked: false,
      remainingAttempts: AccountLockoutConfig.maxFailedAttempts - attempts,
    }
  } catch (error) {
    console.error('[RateLimiter] Failed to check lockout status:', error)
    // Fail open
    return {
      locked: false,
      remainingAttempts: AccountLockoutConfig.maxFailedAttempts,
    }
  }
}

/**
 * Clear failed login attempts after successful login
 *
 * @param accountKey - Unique account identifier
 */
export async function clearFailedLoginAttempts(accountKey: string): Promise<void> {
  const failedKey = `${AccountLockoutConfig.failedAttemptsKeyPrefix}${accountKey}`
  const lockoutKey = `${AccountLockoutConfig.keyPrefix}${accountKey}`

  try {
    await Promise.all([
      cache.delete(failedKey),
      cache.delete(lockoutKey),
    ])
  } catch (error) {
    console.error('[RateLimiter] Failed to clear login attempts:', error)
    // Non-critical, don't throw
  }
}

/**
 * Extract client IP address from request headers
 *
 * Checks common proxy headers in order of reliability:
 * 1. CF-Connecting-IP (Cloudflare)
 * 2. X-Real-IP (nginx)
 * 3. X-Forwarded-For (standard proxy header, first IP)
 * 4. Request IP (direct connection)
 */
export function getClientIP(request: NextRequest): string {
  // Cloudflare
  const cfIP = request.headers.get('cf-connecting-ip')
  if (cfIP) return cfIP

  // nginx/other proxies
  const realIP = request.headers.get('x-real-ip')
  if (realIP) return realIP

  // Standard forwarded header (take first IP)
  const forwardedFor = request.headers.get('x-forwarded-for')
  if (forwardedFor) {
    const firstIP = forwardedFor.split(',')[0]?.trim()
    if (firstIP) return firstIP
  }

  // GCP Cloud Run / App Engine
  const gaeIP = request.headers.get('x-appengine-user-ip')
  if (gaeIP) return gaeIP

  // Fallback - use a hash of headers as identifier
  // This shouldn't happen in production but prevents errors
  return 'unknown-ip'
}

/**
 * Create rate limit response headers
 */
export function createRateLimitHeaders(result: RateLimitResult): Record<string, string> {
  return {
    'X-RateLimit-Limit': String(result.limit),
    'X-RateLimit-Remaining': String(result.remaining),
    'X-RateLimit-Reset': String(result.resetAt),
  }
}
