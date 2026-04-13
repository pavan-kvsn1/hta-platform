/**
 * CORS Configuration
 *
 * Environment-driven CORS configuration for API server.
 *
 * Configure via environment variables:
 * - CORS_ALLOWED_ORIGINS: Comma-separated list of allowed origins
 * - FRONTEND_URL: Primary frontend URL (fallback)
 */

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
  const envOrigins = process.env.CORS_ALLOWED_ORIGINS?.split(',').map(o => o.trim()).filter(Boolean)

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
      'X-Service-Token',
      'X-CSRF-Token',
      'X-Tenant-ID',
    ],
    exposedHeaders: [
      'X-RateLimit-Limit',
      'X-RateLimit-Remaining',
      'X-RateLimit-Reset',
    ],
    credentials: true,
    maxAge: 86400,
  }
}

/**
 * Check if origin is allowed
 */
export function isOriginAllowed(origin: string | null, config: CorsConfig): boolean {
  if (!origin) return false

  if (process.env.NODE_ENV === 'development') {
    if (origin.includes('localhost') || origin.includes('127.0.0.1')) {
      return true
    }
  }

  return config.allowedOrigins.some(allowed => {
    if (allowed === origin) return true
    if (allowed.startsWith('*.')) {
      const domain = allowed.slice(2)
      return origin.endsWith(domain) && origin.includes('://')
    }
    return false
  })
}

/**
 * Create CORS headers object
 */
export function createCorsHeaders(
  origin: string | null,
  config: CorsConfig = getCorsConfig()
): Record<string, string> {
  if (!origin || !isOriginAllowed(origin, config)) {
    return {}
  }

  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Credentials': String(config.credentials),
    'Access-Control-Allow-Methods': config.allowedMethods.join(', '),
    'Access-Control-Allow-Headers': config.allowedHeaders.join(', '),
    'Access-Control-Expose-Headers': config.exposedHeaders.join(', '),
    'Access-Control-Max-Age': String(config.maxAge),
  }
}
