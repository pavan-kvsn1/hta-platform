/**
 * Rate Limiter Service
 *
 * Provides rate limiting and account lockout functionality using
 * the cache infrastructure (Redis or memory).
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

import { cache } from '../cache/index.js'

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
  resetAt: number
}

export interface AccountLockoutResult {
  locked: boolean
  remainingAttempts: number
  unlockAt?: number
}

/**
 * Check if a request is within rate limits
 */
export async function checkRateLimit(
  identifier: string,
  type: RateLimitType
): Promise<RateLimitResult> {
  const config = RateLimitConfig[type]
  const key = `${config.keyPrefix}${identifier}`

  try {
    const count = await cache.incr(key)

    if (count === 1) {
      await cache.expire(key, config.windowSeconds)
    }

    const ttl = await cache.ttl(key)
    const resetAt = Math.floor(Date.now() / 1000) + (ttl > 0 ? ttl : config.windowSeconds)

    const allowed = count <= config.limit
    const remaining = Math.max(0, config.limit - count)

    return { allowed, limit: config.limit, remaining, resetAt }
  } catch (error) {
    console.error('[RateLimiter] Cache error, failing open:', error)
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
 */
export async function recordFailedLoginAttempt(accountKey: string): Promise<AccountLockoutResult> {
  const failedKey = `${AccountLockoutConfig.failedAttemptsKeyPrefix}${accountKey}`
  const lockoutKey = `${AccountLockoutConfig.keyPrefix}${accountKey}`

  try {
    const attempts = await cache.incr(failedKey)
    await cache.expire(failedKey, AccountLockoutConfig.lockoutDurationSeconds)

    if (attempts >= AccountLockoutConfig.maxFailedAttempts) {
      await cache.set(lockoutKey, true, AccountLockoutConfig.lockoutDurationSeconds)
      await cache.delete(failedKey)

      const unlockAt = Math.floor(Date.now() / 1000) + AccountLockoutConfig.lockoutDurationSeconds

      return { locked: true, remainingAttempts: 0, unlockAt }
    }

    return {
      locked: false,
      remainingAttempts: AccountLockoutConfig.maxFailedAttempts - attempts,
    }
  } catch (error) {
    console.error('[RateLimiter] Failed to record login attempt:', error)
    return { locked: false, remainingAttempts: AccountLockoutConfig.maxFailedAttempts }
  }
}

/**
 * Check if an account is currently locked
 */
export async function isAccountLocked(accountKey: string): Promise<AccountLockoutResult> {
  const lockoutKey = `${AccountLockoutConfig.keyPrefix}${accountKey}`
  const failedKey = `${AccountLockoutConfig.failedAttemptsKeyPrefix}${accountKey}`

  try {
    const locked = await cache.get<boolean>(lockoutKey)

    if (locked) {
      const ttl = await cache.ttl(lockoutKey)
      const unlockAt = Math.floor(Date.now() / 1000) + (ttl > 0 ? ttl : 0)

      return { locked: true, remainingAttempts: 0, unlockAt }
    }

    const failedAttempts = await cache.get<number>(failedKey)
    const attempts = typeof failedAttempts === 'number' ? failedAttempts : 0

    return {
      locked: false,
      remainingAttempts: AccountLockoutConfig.maxFailedAttempts - attempts,
    }
  } catch (error) {
    console.error('[RateLimiter] Failed to check lockout status:', error)
    return { locked: false, remainingAttempts: AccountLockoutConfig.maxFailedAttempts }
  }
}

/**
 * Clear failed login attempts after successful login
 */
export async function clearFailedLoginAttempts(accountKey: string): Promise<void> {
  const failedKey = `${AccountLockoutConfig.failedAttemptsKeyPrefix}${accountKey}`
  const lockoutKey = `${AccountLockoutConfig.keyPrefix}${accountKey}`

  try {
    await Promise.all([cache.delete(failedKey), cache.delete(lockoutKey)])
  } catch (error) {
    console.error('[RateLimiter] Failed to clear login attempts:', error)
  }
}

/**
 * Extract client IP from common proxy headers
 */
export function getClientIPFromHeaders(headers: {
  get: (name: string) => string | null
}): string {
  // Cloudflare
  const cfIP = headers.get('cf-connecting-ip')
  if (cfIP) return cfIP

  // nginx/other proxies
  const realIP = headers.get('x-real-ip')
  if (realIP) return realIP

  // Standard forwarded header (take first IP)
  const forwardedFor = headers.get('x-forwarded-for')
  if (forwardedFor) {
    const firstIP = forwardedFor.split(',')[0]?.trim()
    if (firstIP) return firstIP
  }

  // GCP Cloud Run / App Engine
  const gaeIP = headers.get('x-appengine-user-ip')
  if (gaeIP) return gaeIP

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
