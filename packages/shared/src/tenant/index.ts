/**
 * @hta/shared - Tenant Utilities
 *
 * Multi-tenancy utilities for identifying and scoping tenants.
 */

export interface TenantConfig {
  id: string
  slug: string
  name: string
  domain?: string
  settings?: Record<string, unknown>
}

/**
 * Extract tenant slug from hostname
 *
 * Uses the main domain name (not subdomain) as the tenant identifier.
 * Each tenant has their own domain, with 'app' as a standard subdomain.
 *
 * Examples:
 * - app.hta-calibration.com -> hta-calibration
 * - app.newclient.com -> newclient
 * - localhost:3000 -> default (or from env)
 */
export function getTenantFromHost(host: string): string {
  // Remove port if present
  const hostname = host.split(':')[0]

  // Local development
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return process.env.DEFAULT_TENANT || 'hta-calibration'
  }

  // Extract main domain name (second part)
  // e.g., app.hta-calibration.com -> ['app', 'hta-calibration', 'com'] -> 'hta-calibration'
  const parts = hostname.split('.')
  if (parts.length >= 3) {
    return parts[1]
  }

  // Two-part domain (e.g., hta-calibration.com)
  if (parts.length === 2) {
    return parts[0]
  }

  // Fallback to default
  return process.env.DEFAULT_TENANT || 'hta-calibration'
}

/**
 * Build tenant-scoped URL
 */
export function buildTenantUrl(
  tenantSlug: string,
  path: string,
  baseDomain: string = process.env.BASE_DOMAIN || 'calibr8s.com'
): string {
  const protocol = process.env.NODE_ENV === 'production' ? 'https' : 'http'
  return `${protocol}://${tenantSlug}.${baseDomain}${path}`
}

/**
 * Validate tenant slug format
 */
export function isValidTenantSlug(slug: string): boolean {
  // Lowercase alphanumeric with hyphens, 3-30 chars
  return /^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$/.test(slug)
}

/**
 * Tenant header name for API requests
 */
export const TENANT_HEADER = 'X-Tenant-ID'

/**
 * Extract tenant ID from request headers
 */
export function getTenantFromHeaders(headers: {
  get: (name: string) => string | null
}): string | null {
  return headers.get(TENANT_HEADER)
}
