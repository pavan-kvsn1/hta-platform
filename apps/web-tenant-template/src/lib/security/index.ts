/**
 * Security Module
 *
 * Centralized security utilities including:
 * - Rate limiting
 * - Account lockout
 * - CORS configuration
 *
 * Usage:
 * ```typescript
 * import {
 *   checkRateLimitForRequest,
 *   isAccountLocked,
 *   recordFailedLoginAttempt,
 *   clearFailedLoginAttempts,
 *   getCorsConfig,
 *   withCors,
 * } from '@/lib/security'
 * ```
 */

// Rate limiting
export {
  RateLimitConfig,
  AccountLockoutConfig,
  checkRateLimit,
  recordFailedLoginAttempt,
  isAccountLocked,
  clearFailedLoginAttempts,
  getClientIP,
  createRateLimitHeaders,
  type RateLimitType,
  type RateLimitResult,
  type AccountLockoutResult,
} from './rate-limiter'

// Rate limit wrapper
export {
  checkRateLimitForRequest,
  withRateLimit,
  createRateLimitedHandler,
  applyRateLimitHeaders,
  type RateLimitOptions,
} from './with-rate-limit'

// CORS
export {
  getCorsConfig,
  isOriginAllowed,
  createCorsHeaders,
  handleCorsPreflightRequest,
  applyCorsHeaders,
  withCors,
  type CorsConfig,
} from './cors'
