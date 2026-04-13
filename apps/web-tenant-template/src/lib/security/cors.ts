/**
 * CORS Configuration
 *
 * Environment-driven CORS configuration for current monolith and future
 * API server separation architecture.
 *
 * Current (monolith): Same-origin requests, CORS effectively no-op
 * Future (separated): Frontend/API/Worker on different origins
 *
 * Configure via environment variables:
 * - CORS_ALLOWED_ORIGINS: Comma-separated list of allowed origins
 * - FRONTEND_URL: Primary frontend URL (fallback)
 * - NEXTAUTH_URL: Auth URL (fallback)
 */

import { NextRequest, NextResponse } from 'next/server'

export interface CorsConfig {
  allowedOrigins: string[]
  allowedMethods: string[]
  allowedHeaders: string[]
  exposedHeaders: string[]
  credentials: boolean
  maxAge: number
}

/**
 * Get CORS configuration from environment
 */
export function getCorsConfig(): CorsConfig {
  // Parse allowed origins from environment
  const envOrigins = process.env.CORS_ALLOWED_ORIGINS?.split(',').map(o => o.trim()).filter(Boolean)

  // Fallback to FRONTEND_URL and NEXTAUTH_URL if no explicit CORS origins
  const fallbackOrigins = [
    process.env.FRONTEND_URL,
    process.env.NEXTAUTH_URL,
  ].filter(Boolean) as string[]

  const allowedOrigins = envOrigins?.length ? envOrigins : fallbackOrigins

  return {
    allowedOrigins,
    allowedMethods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Requested-With',
      'X-Service-Token',  // For service-to-service auth in separated architecture
      'X-CSRF-Token',
    ],
    exposedHeaders: [
      'X-RateLimit-Limit',
      'X-RateLimit-Remaining',
      'X-RateLimit-Reset',
    ],
    credentials: true,
    maxAge: 86400, // 24 hours preflight cache
  }
}

/**
 * Check if origin is allowed
 */
export function isOriginAllowed(origin: string | null, config: CorsConfig): boolean {
  if (!origin) return false

  // In development, allow localhost variants
  if (process.env.NODE_ENV === 'development') {
    if (origin.includes('localhost') || origin.includes('127.0.0.1')) {
      return true
    }
  }

  return config.allowedOrigins.some(allowed => {
    // Exact match
    if (allowed === origin) return true
    // Wildcard subdomain match (e.g., *.example.com)
    if (allowed.startsWith('*.')) {
      const domain = allowed.slice(2)
      return origin.endsWith(domain) && origin.includes('://')
    }
    return false
  })
}

/**
 * Create CORS headers for response
 */
export function createCorsHeaders(
  request: NextRequest,
  config: CorsConfig = getCorsConfig()
): Headers {
  const headers = new Headers()
  const origin = request.headers.get('origin')

  if (origin && isOriginAllowed(origin, config)) {
    headers.set('Access-Control-Allow-Origin', origin)
    headers.set('Access-Control-Allow-Credentials', String(config.credentials))
    headers.set('Access-Control-Allow-Methods', config.allowedMethods.join(', '))
    headers.set('Access-Control-Allow-Headers', config.allowedHeaders.join(', '))
    headers.set('Access-Control-Expose-Headers', config.exposedHeaders.join(', '))
    headers.set('Access-Control-Max-Age', String(config.maxAge))
  }

  return headers
}

/**
 * Handle CORS preflight (OPTIONS) request
 */
export function handleCorsPreflightRequest(
  request: NextRequest,
  config: CorsConfig = getCorsConfig()
): NextResponse | null {
  if (request.method !== 'OPTIONS') {
    return null
  }

  const origin = request.headers.get('origin')

  if (!origin || !isOriginAllowed(origin, config)) {
    return new NextResponse(null, { status: 403 })
  }

  const headers = createCorsHeaders(request, config)
  return new NextResponse(null, { status: 204, headers })
}

/**
 * Apply CORS headers to an existing response
 */
export function applyCorsHeaders(
  request: NextRequest,
  response: NextResponse,
  config: CorsConfig = getCorsConfig()
): NextResponse {
  const corsHeaders = createCorsHeaders(request, config)

  corsHeaders.forEach((value, key) => {
    response.headers.set(key, value)
  })

  return response
}

/**
 * CORS middleware wrapper for API routes
 *
 * Usage:
 * ```typescript
 * export async function POST(request: NextRequest) {
 *   return withCors(request, async () => {
 *     // Your handler logic
 *     return NextResponse.json({ data: 'result' })
 *   })
 * }
 *
 * export async function OPTIONS(request: NextRequest) {
 *   return handleCorsPreflightRequest(request) || new NextResponse(null, { status: 405 })
 * }
 * ```
 */
export async function withCors(
  request: NextRequest,
  handler: () => Promise<NextResponse>
): Promise<NextResponse> {
  // Handle preflight
  const preflightResponse = handleCorsPreflightRequest(request)
  if (preflightResponse) {
    return preflightResponse
  }

  // Execute handler and apply CORS headers
  const response = await handler()
  return applyCorsHeaders(request, response)
}
