/**
 * Rate Limit Wrapper Unit Tests
 *
 * Tests for the rate limiting middleware and higher-order functions:
 * - Rate limit checking for requests
 * - Handler wrapping with rate limiting
 * - Rate limit header application
 * - Custom identifier functions
 *
 * Migrated from hta-calibration/tests/unit/with-rate-limit.test.ts
 * Self-contained version with mock implementations
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Types
interface MockRequest {
  method: string
  headers: {
    get: (name: string) => string | null
  }
}

interface MockResponse {
  status: number
  headers: Map<string, string>
  body: unknown
  json: () => Promise<unknown>
}

interface RateLimitResult {
  allowed: boolean
  remaining: number
  limit: number
  resetAt: number
}

type RateLimitType = 'LOGIN' | 'REGISTRATION' | 'FORGOT_PASSWORD' | 'API_GENERAL'

// Rate limit configuration
const RateLimitConfig = {
  LOGIN: { limit: 5, windowSeconds: 900, keyPrefix: 'ratelimit:login:' },
  REGISTRATION: { limit: 3, windowSeconds: 3600, keyPrefix: 'ratelimit:register:' },
  FORGOT_PASSWORD: { limit: 3, windowSeconds: 3600, keyPrefix: 'ratelimit:forgot:' },
  API_GENERAL: { limit: 100, windowSeconds: 60, keyPrefix: 'ratelimit:api:' },
}

// Mock functions
const mockCheckRateLimit = vi.fn<[string, RateLimitType], Promise<RateLimitResult>>()
const mockGetClientIP = vi.fn<[MockRequest], string>()

// Helper to create mock request
function createMockRequest(
  method: string = 'POST',
  headers: Record<string, string> = {}
): MockRequest {
  return {
    method,
    headers: {
      get: (name: string) => headers[name.toLowerCase()] || null,
    },
  }
}

// Helper to create mock response
function createMockResponse(status: number, body: unknown): MockResponse {
  const headers = new Map<string, string>()
  return {
    status,
    headers,
    body,
    json: async () => body,
  }
}

// Rate limit wrapper functions
async function checkRateLimitForRequest(
  request: MockRequest,
  type: RateLimitType,
  customIdentifier?: string
): Promise<MockResponse | null> {
  const identifier = customIdentifier || mockGetClientIP(request)
  const result = await mockCheckRateLimit(identifier, type)

  if (!result.allowed) {
    const retryAfter = result.resetAt - Math.floor(Date.now() / 1000)
    const response = createMockResponse(429, {
      error: 'Too many requests. Please try again later.',
      retryAfter,
    })
    response.headers.set('X-RateLimit-Limit', String(result.limit))
    response.headers.set('X-RateLimit-Remaining', String(result.remaining))
    response.headers.set('X-RateLimit-Reset', String(result.resetAt))
    response.headers.set('Retry-After', String(retryAfter))
    return response
  }

  return null
}

interface WithRateLimitOptions {
  type: RateLimitType
  getIdentifier?: (request: MockRequest) => string | Promise<string>
  errorMessage?: string
}

function withRateLimit(
  handler: (request: MockRequest) => Promise<MockResponse>,
  options: WithRateLimitOptions
): (request: MockRequest) => Promise<MockResponse> {
  return async (request: MockRequest): Promise<MockResponse> => {
    let identifier: string
    if (options.getIdentifier) {
      identifier = await options.getIdentifier(request)
    } else {
      identifier = mockGetClientIP(request)
    }

    const result = await mockCheckRateLimit(identifier, options.type)

    if (!result.allowed) {
      const retryAfter = result.resetAt - Math.floor(Date.now() / 1000)
      const response = createMockResponse(429, {
        error: options.errorMessage || 'Too many requests. Please try again later.',
        retryAfter,
      })
      response.headers.set('X-RateLimit-Limit', String(result.limit))
      response.headers.set('X-RateLimit-Remaining', String(result.remaining))
      response.headers.set('X-RateLimit-Reset', String(result.resetAt))
      response.headers.set('Retry-After', String(retryAfter))
      return response
    }

    const response = await handler(request)
    // Add rate limit headers to successful response
    response.headers.set('X-RateLimit-Limit', String(result.limit))
    response.headers.set('X-RateLimit-Remaining', String(result.remaining))
    response.headers.set('X-RateLimit-Reset', String(result.resetAt))
    return response
  }
}

async function applyRateLimitHeaders(
  response: MockResponse,
  type: RateLimitType,
  identifier: string
): Promise<MockResponse> {
  const result = await mockCheckRateLimit(identifier, type)
  response.headers.set('X-RateLimit-Limit', String(result.limit))
  response.headers.set('X-RateLimit-Remaining', String(result.remaining))
  response.headers.set('X-RateLimit-Reset', String(result.resetAt))
  return response
}

describe('Rate Limit Wrapper', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetClientIP.mockReturnValue('192.168.1.1')
  })

  describe('checkRateLimitForRequest', () => {
    it('should return null when request is within limits', async () => {
      mockCheckRateLimit.mockResolvedValue({
        allowed: true,
        remaining: 4,
        limit: 5,
        resetAt: 1700000000,
      })

      const request = createMockRequest()
      const result = await checkRateLimitForRequest(request, 'LOGIN')

      expect(result).toBeNull()
      expect(mockGetClientIP).toHaveBeenCalledWith(request)
      expect(mockCheckRateLimit).toHaveBeenCalledWith('192.168.1.1', 'LOGIN')
    })

    it('should return 429 response when rate limited', async () => {
      mockCheckRateLimit.mockResolvedValue({
        allowed: false,
        remaining: 0,
        limit: 5,
        resetAt: Math.floor(Date.now() / 1000) + 300,
      })

      const request = createMockRequest()
      const result = await checkRateLimitForRequest(request, 'LOGIN')

      expect(result).not.toBeNull()
      expect(result?.status).toBe(429)

      const body = (await result?.json()) as { error: string; retryAfter: number }
      expect(body.error).toBe('Too many requests. Please try again later.')
      expect(body.retryAfter).toBeGreaterThan(0)
    })

    it('should use custom identifier when provided', async () => {
      mockCheckRateLimit.mockResolvedValue({
        allowed: true,
        remaining: 4,
        limit: 5,
        resetAt: 1700000000,
      })

      const request = createMockRequest()
      await checkRateLimitForRequest(request, 'LOGIN', 'custom-id')

      expect(mockCheckRateLimit).toHaveBeenCalledWith('custom-id', 'LOGIN')
      expect(mockGetClientIP).not.toHaveBeenCalled()
    })

    it('should include rate limit headers in 429 response', async () => {
      mockCheckRateLimit.mockResolvedValue({
        allowed: false,
        remaining: 0,
        limit: 5,
        resetAt: Math.floor(Date.now() / 1000) + 300,
      })

      const request = createMockRequest()
      const result = await checkRateLimitForRequest(request, 'LOGIN')

      expect(result?.headers.get('X-RateLimit-Limit')).toBe('5')
      expect(result?.headers.get('X-RateLimit-Remaining')).toBe('0')
      expect(result?.headers.get('Retry-After')).toBeDefined()
    })
  })

  describe('withRateLimit', () => {
    it('should execute handler when within limits', async () => {
      mockCheckRateLimit.mockResolvedValue({
        allowed: true,
        remaining: 4,
        limit: 5,
        resetAt: 1700000000,
      })

      const mockHandler = vi.fn().mockResolvedValue(createMockResponse(200, { success: true }))

      const wrappedHandler = withRateLimit(mockHandler, { type: 'LOGIN' })
      const request = createMockRequest()
      const response = await wrappedHandler(request)

      expect(mockHandler).toHaveBeenCalledWith(request)
      expect(response.status).toBe(200)
    })

    it('should add rate limit headers to successful response', async () => {
      mockCheckRateLimit.mockResolvedValue({
        allowed: true,
        remaining: 4,
        limit: 5,
        resetAt: 1700000000,
      })

      const mockHandler = vi.fn().mockResolvedValue(createMockResponse(200, { success: true }))

      const wrappedHandler = withRateLimit(mockHandler, { type: 'LOGIN' })
      const request = createMockRequest()
      const response = await wrappedHandler(request)

      expect(response.headers.get('X-RateLimit-Limit')).toBe('5')
      expect(response.headers.get('X-RateLimit-Remaining')).toBe('4')
    })

    it('should return 429 without calling handler when rate limited', async () => {
      mockCheckRateLimit.mockResolvedValue({
        allowed: false,
        remaining: 0,
        limit: 5,
        resetAt: Math.floor(Date.now() / 1000) + 300,
      })

      const mockHandler = vi.fn()
      const wrappedHandler = withRateLimit(mockHandler, { type: 'LOGIN' })
      const request = createMockRequest()
      const response = await wrappedHandler(request)

      expect(mockHandler).not.toHaveBeenCalled()
      expect(response.status).toBe(429)
    })

    it('should use custom identifier function', async () => {
      mockCheckRateLimit.mockResolvedValue({
        allowed: true,
        remaining: 4,
        limit: 5,
        resetAt: 1700000000,
      })

      const customGetIdentifier = vi.fn().mockReturnValue('user:123')
      const mockHandler = vi.fn().mockResolvedValue(createMockResponse(200, { success: true }))

      const wrappedHandler = withRateLimit(mockHandler, {
        type: 'LOGIN',
        getIdentifier: customGetIdentifier,
      })

      const request = createMockRequest()
      await wrappedHandler(request)

      expect(customGetIdentifier).toHaveBeenCalledWith(request)
      expect(mockCheckRateLimit).toHaveBeenCalledWith('user:123', 'LOGIN')
    })

    it('should use custom error message', async () => {
      mockCheckRateLimit.mockResolvedValue({
        allowed: false,
        remaining: 0,
        limit: 5,
        resetAt: Math.floor(Date.now() / 1000) + 300,
      })

      const wrappedHandler = withRateLimit(
        vi.fn().mockResolvedValue(createMockResponse(200, {})),
        {
          type: 'LOGIN',
          errorMessage: 'Custom rate limit message',
        }
      )

      const request = createMockRequest()
      const response = await wrappedHandler(request)
      const body = (await response.json()) as { error: string }

      expect(body.error).toBe('Custom rate limit message')
    })

    it('should support async identifier function', async () => {
      mockCheckRateLimit.mockResolvedValue({
        allowed: true,
        remaining: 4,
        limit: 5,
        resetAt: 1700000000,
      })

      const asyncGetIdentifier = vi.fn().mockResolvedValue('async-user:456')
      const mockHandler = vi.fn().mockResolvedValue(createMockResponse(200, { success: true }))

      const wrappedHandler = withRateLimit(mockHandler, {
        type: 'API_GENERAL',
        getIdentifier: asyncGetIdentifier,
      })

      const request = createMockRequest()
      await wrappedHandler(request)

      expect(asyncGetIdentifier).toHaveBeenCalled()
      expect(mockCheckRateLimit).toHaveBeenCalledWith('async-user:456', 'API_GENERAL')
    })
  })

  describe('applyRateLimitHeaders', () => {
    it('should add rate limit headers to response', async () => {
      mockCheckRateLimit.mockResolvedValue({
        allowed: true,
        remaining: 50,
        limit: 100,
        resetAt: 1700000000,
      })

      const response = createMockResponse(200, { data: 'test' })
      const result = await applyRateLimitHeaders(response, 'API_GENERAL', '192.168.1.1')

      expect(mockCheckRateLimit).toHaveBeenCalledWith('192.168.1.1', 'API_GENERAL')
      expect(result.headers.get('X-RateLimit-Limit')).toBe('100')
      expect(result.headers.get('X-RateLimit-Remaining')).toBe('50')
    })
  })

  describe('RateLimitConfig', () => {
    it('should have correct LOGIN config', () => {
      expect(RateLimitConfig.LOGIN.limit).toBe(5)
      expect(RateLimitConfig.LOGIN.windowSeconds).toBe(900)
    })

    it('should have correct API_GENERAL config', () => {
      expect(RateLimitConfig.API_GENERAL.limit).toBe(100)
      expect(RateLimitConfig.API_GENERAL.windowSeconds).toBe(60)
    })
  })
})
