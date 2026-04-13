/**
 * @hta/shared - Security Module
 *
 * Rate limiting, account lockout, and CORS utilities.
 */

export {
  RateLimitConfig,
  AccountLockoutConfig,
  checkRateLimit,
  recordFailedLoginAttempt,
  isAccountLocked,
  clearFailedLoginAttempts,
  getClientIPFromHeaders,
  createRateLimitHeaders,
  type RateLimitType,
  type RateLimitResult,
  type AccountLockoutResult,
} from './rate-limiter'

export {
  getCorsConfig,
  isOriginAllowed,
  createCorsHeaders,
  type CorsConfig,
} from './cors'
