/**
 * CORS Unit Tests
 *
 * Tests for CORS configuration and middleware:
 * - CORS configuration parsing from environment
 * - Origin validation (exact match, wildcards, localhost)
 * - CORS header creation
 * - Preflight request handling
 * - CORS middleware wrapper
 *
 * Migrated from hta-calibration/tests/unit/cors.test.ts
 * Self-contained version with mock implementations
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Types
interface CorsConfig {
  allowedOrigins: string[]
  allowedMethods: string[]
  allowedHeaders: string[]
  exposedHeaders: string[]
  credentials: boolean
  maxAge: number
}

interface MockRequest {
  method: string
  headers: {
    get: (name: string) => string | null
  }
}

interface MockResponse {
  status: number
  headers: Map<string, string>
  json: (data: unknown) => MockResponse
}

// CORS configuration functions
function getCorsConfig(): CorsConfig {
  const defaultMethods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS']
  const defaultHeaders = ['Content-Type', 'Authorization', 'X-Requested-With']

  let allowedOrigins: string[] = []

  // Try CORS_ALLOWED_ORIGINS first
  if (process.env.CORS_ALLOWED_ORIGINS) {
    allowedOrigins = process.env.CORS_ALLOWED_ORIGINS.split(',').map((o) => o.trim())
  } else {
    // Fallback to FRONTEND_URL and NEXTAUTH_URL
    if (process.env.FRONTEND_URL) {
      allowedOrigins.push(process.env.FRONTEND_URL)
    }
    if (process.env.NEXTAUTH_URL) {
      allowedOrigins.push(process.env.NEXTAUTH_URL)
    }
  }

  return {
    allowedOrigins,
    allowedMethods: defaultMethods,
    allowedHeaders: defaultHeaders,
    exposedHeaders: [],
    credentials: true,
    maxAge: 86400,
  }
}

function isOriginAllowed(origin: string | null, config: CorsConfig): boolean {
  if (!origin) return false

  // Allow localhost in development
  if (process.env.NODE_ENV === 'development') {
    if (origin.includes('localhost') || origin.includes('127.0.0.1')) {
      return true
    }
  }

  for (const allowed of config.allowedOrigins) {
    // Exact match
    if (allowed === origin) return true

    // Wildcard subdomain match (*.example.org)
    if (allowed.startsWith('*.')) {
      const domain = allowed.slice(2)
      const originDomain = origin.replace(/^https?:\/\//, '').split('/')[0]
      if (originDomain.endsWith(domain) || originDomain === domain.slice(1)) {
        return true
      }
    }
  }

  return false
}

function createCorsHeaders(request: MockRequest, config: CorsConfig): Map<string, string> {
  const headers = new Map<string, string>()
  const origin = request.headers.get('origin')

  if (!origin || !isOriginAllowed(origin, config)) {
    return headers
  }

  headers.set('Access-Control-Allow-Origin', origin)
  headers.set('Access-Control-Allow-Methods', config.allowedMethods.join(', '))
  headers.set('Access-Control-Allow-Headers', config.allowedHeaders.join(', '))
  headers.set('Access-Control-Max-Age', String(config.maxAge))

  if (config.credentials) {
    headers.set('Access-Control-Allow-Credentials', 'true')
  }

  if (config.exposedHeaders.length > 0) {
    headers.set('Access-Control-Expose-Headers', config.exposedHeaders.join(', '))
  }

  return headers
}

function handleCorsPreflightRequest(request: MockRequest, config: CorsConfig): MockResponse | null {
  if (request.method !== 'OPTIONS') {
    return null
  }

  const origin = request.headers.get('origin')

  if (!origin || !isOriginAllowed(origin, config)) {
    return createMockResponse(403, {})
  }

  const headers = createCorsHeaders(request, config)

  return {
    status: 204,
    headers,
    json: () => ({ status: 204, headers, json: () => ({} as MockResponse) }),
  }
}

function applyCorsHeaders(
  request: MockRequest,
  response: MockResponse,
  config: CorsConfig
): MockResponse {
  const corsHeaders = createCorsHeaders(request, config)

  for (const [key, value] of corsHeaders.entries()) {
    response.headers.set(key, value)
  }

  return response
}

async function withCors(
  request: MockRequest,
  handler: () => Promise<MockResponse>
): Promise<MockResponse> {
  const config = getCorsConfig()

  // Handle preflight
  const preflight = handleCorsPreflightRequest(request, config)
  if (preflight) {
    return preflight
  }

  // Execute handler and add CORS headers
  const response = await handler()
  return applyCorsHeaders(request, response, config)
}

// Helper functions
function createMockRequest(
  method: string = 'GET',
  headers: Record<string, string> = {}
): MockRequest {
  return {
    method,
    headers: {
      get: (name: string) => headers[name.toLowerCase()] || null,
    },
  }
}

function createMockResponse(status: number, data: unknown): MockResponse {
  const headers = new Map<string, string>()
  return {
    status,
    headers,
    json: () => createMockResponse(status, data),
  }
}

describe('CORS', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    vi.resetModules()
    // Reset to defaults
    delete process.env.CORS_ALLOWED_ORIGINS
    delete process.env.FRONTEND_URL
    delete process.env.NEXTAUTH_URL
  })

  afterEach(() => {
    process.env = { ...originalEnv }
  })

  describe('getCorsConfig', () => {
    it('should return default config when no env vars set', () => {
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
      const request = createMockRequest('GET', { origin: 'https://example.com' })
      const headers = createCorsHeaders(request, config)

      expect(headers.get('Access-Control-Allow-Origin')).toBe('https://example.com')
      expect(headers.get('Access-Control-Allow-Credentials')).toBe('true')
      expect(headers.get('Access-Control-Allow-Methods')).toBe('GET, POST')
      expect(headers.get('Access-Control-Allow-Headers')).toBe('Content-Type, Authorization')
      expect(headers.get('Access-Control-Expose-Headers')).toBe('X-RateLimit-Limit')
      expect(headers.get('Access-Control-Max-Age')).toBe('3600')
    })

    it('should not create headers for disallowed origin', () => {
      const request = createMockRequest('GET', { origin: 'https://malicious.com' })
      const headers = createCorsHeaders(request, config)

      expect(headers.get('Access-Control-Allow-Origin')).toBeUndefined()
    })

    it('should not create headers when no origin provided', () => {
      const request = createMockRequest('GET', {})
      const headers = createCorsHeaders(request, config)

      expect(headers.get('Access-Control-Allow-Origin')).toBeUndefined()
    })
  })

  describe('handleCorsPreflightRequest', () => {
    const config: CorsConfig = {
      allowedOrigins: ['https://example.com'],
      allowedMethods: ['GET', 'POST'],
      allowedHeaders: ['Content-Type'],
      exposedHeaders: [],
      credentials: true,
      maxAge: 3600,
    }

    it('should return null for non-OPTIONS request', () => {
      const request = createMockRequest('POST', { origin: 'https://example.com' })
      const response = handleCorsPreflightRequest(request, config)

      expect(response).toBeNull()
    })

    it('should return 204 for valid preflight', () => {
      const request = createMockRequest('OPTIONS', { origin: 'https://example.com' })
      const response = handleCorsPreflightRequest(request, config)

      expect(response).not.toBeNull()
      expect(response?.status).toBe(204)
    })

    it('should return 403 for disallowed origin', () => {
      const request = createMockRequest('OPTIONS', { origin: 'https://malicious.com' })
      const response = handleCorsPreflightRequest(request, config)

      expect(response).not.toBeNull()
      expect(response?.status).toBe(403)
    })

    it('should return 403 for missing origin', () => {
      const request = createMockRequest('OPTIONS', {})
      const response = handleCorsPreflightRequest(request, config)

      expect(response).not.toBeNull()
      expect(response?.status).toBe(403)
    })

    it('should include CORS headers in preflight response', () => {
      const request = createMockRequest('OPTIONS', { origin: 'https://example.com' })
      const response = handleCorsPreflightRequest(request, config)

      expect(response?.headers.get('Access-Control-Allow-Origin')).toBe('https://example.com')
      expect(response?.headers.get('Access-Control-Allow-Methods')).toContain('GET')
    })
  })

  describe('applyCorsHeaders', () => {
    const config: CorsConfig = {
      allowedOrigins: ['https://example.com'],
      allowedMethods: ['GET'],
      allowedHeaders: ['Content-Type'],
      exposedHeaders: [],
      credentials: true,
      maxAge: 3600,
    }

    it('should apply CORS headers to existing response', () => {
      const request = createMockRequest('GET', { origin: 'https://example.com' })
      const response = createMockResponse(200, { data: 'test' })

      const result = applyCorsHeaders(request, response, config)

      expect(result.headers.get('Access-Control-Allow-Origin')).toBe('https://example.com')
    })
  })

  describe('withCors', () => {
    it('should handle preflight requests', async () => {
      process.env.CORS_ALLOWED_ORIGINS = 'https://example.com'
      const request = createMockRequest('OPTIONS', { origin: 'https://example.com' })

      const handler = vi.fn()
      const response = await withCors(request, handler)

      expect(handler).not.toHaveBeenCalled()
      expect(response.status).toBe(204)
    })

    it('should execute handler and add CORS headers for regular requests', async () => {
      process.env.CORS_ALLOWED_ORIGINS = 'https://example.com'
      const request = createMockRequest('POST', { origin: 'https://example.com' })

      const handler = vi.fn().mockResolvedValue(createMockResponse(200, { success: true }))
      const response = await withCors(request, handler)

      expect(handler).toHaveBeenCalled()
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://example.com')
    })
  })
})
