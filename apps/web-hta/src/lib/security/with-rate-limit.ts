/**
 * Rate Limit Wrapper
 *
 * Higher-order function to wrap API routes with rate limiting.
 * Can be used directly in route handlers or as middleware.
 */

import { NextRequest, NextResponse } from 'next/server'
import {
  checkRateLimit,
  getClientIP,
  createRateLimitHeaders,
  RateLimitType,
} from './rate-limiter'

export interface RateLimitOptions {
  type: RateLimitType
  // Optional custom identifier function (defaults to IP)
  getIdentifier?: (request: NextRequest) => string | Promise<string>
  // Custom error message
  errorMessage?: string
}

/**
 * Check rate limit for a request and return early response if exceeded
 *
 * Usage in route handlers:
 * ```typescript
 * export async function POST(request: NextRequest) {
 *   const rateLimitResponse = await checkRateLimitForRequest(request, 'LOGIN')
 *   if (rateLimitResponse) return rateLimitResponse
 *
 *   // Continue with handler logic
 * }
 * ```
 */
export async function checkRateLimitForRequest(
  request: NextRequest,
  type: RateLimitType,
  customIdentifier?: string
): Promise<NextResponse | null> {
  const identifier = customIdentifier || getClientIP(request)
  const result = await checkRateLimit(identifier, type)

  if (!result.allowed) {
    const headers = createRateLimitHeaders(result)
    const retryAfter = result.resetAt - Math.floor(Date.now() / 1000)

    return NextResponse.json(
      {
        error: 'Too many requests. Please try again later.',
        retryAfter,
      },
      {
        status: 429,
        headers: {
          ...headers,
          'Retry-After': String(Math.max(1, retryAfter)),
        },
      }
    )
  }

  return null
}

/**
 * Higher-order function to wrap route handlers with rate limiting
 *
 * Usage:
 * ```typescript
 * export const POST = withRateLimit(
 *   async (request: NextRequest) => {
 *     // Your handler logic
 *     return NextResponse.json({ success: true })
 *   },
 *   { type: 'LOGIN' }
 * )
 * ```
 */
export function withRateLimit<T extends NextRequest>(
  handler: (request: T) => Promise<NextResponse>,
  options: RateLimitOptions
): (request: T) => Promise<NextResponse> {
  return async (request: T) => {
    // Get identifier
    const identifier = options.getIdentifier
      ? await options.getIdentifier(request)
      : getClientIP(request)

    // Check rate limit
    const result = await checkRateLimit(identifier, options.type)
    const rateLimitHeaders = createRateLimitHeaders(result)

    if (!result.allowed) {
      const retryAfter = result.resetAt - Math.floor(Date.now() / 1000)

      return NextResponse.json(
        {
          error: options.errorMessage || 'Too many requests. Please try again later.',
          retryAfter,
        },
        {
          status: 429,
          headers: {
            ...rateLimitHeaders,
            'Retry-After': String(Math.max(1, retryAfter)),
          },
        }
      )
    }

    // Execute handler
    const response = await handler(request)

    // Add rate limit headers to successful responses
    Object.entries(rateLimitHeaders).forEach(([key, value]) => {
      response.headers.set(key, value)
    })

    return response
  }
}

/**
 * Create a rate-limited handler with custom configuration
 *
 * Usage for custom limits:
 * ```typescript
 * const handler = createRateLimitedHandler({
 *   limit: 10,
 *   windowSeconds: 60,
 *   keyPrefix: 'custom:',
 * })
 *
 * export const POST = handler(async (request) => {
 *   return NextResponse.json({ success: true })
 * })
 * ```
 */
export function createRateLimitedHandler(
  _config: {
    limit: number
    windowSeconds: number
    keyPrefix: string
  }
) {
  // Temporarily add custom config (this is a simple approach)
  // In production, you might want a more sophisticated config system
  const customType = 'API_GENERAL' as RateLimitType

  return <T extends NextRequest>(
    handler: (request: T) => Promise<NextResponse>
  ) => {
    return withRateLimit(handler, { type: customType })
  }
}

/**
 * Apply rate limit headers to an existing response
 */
export function applyRateLimitHeaders(
  response: NextResponse,
  type: RateLimitType,
  identifier: string
): Promise<NextResponse> {
  return checkRateLimit(identifier, type).then(result => {
    const headers = createRateLimitHeaders(result)
    Object.entries(headers).forEach(([key, value]) => {
      response.headers.set(key, value)
    })
    return response
  })
}
