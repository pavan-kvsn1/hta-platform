/**
 * @hta/shared - Cache Strategies
 *
 * Predefined caching strategies for different data types.
 * Use these with Prisma Accelerate or the cache wrapper.
 */

export interface CacheStrategy {
  /** Time-to-live in seconds */
  ttl: number
  /** Stale-while-revalidate window in seconds */
  swr: number
  /** Tags for cache invalidation */
  tags?: string[]
  /** Description for documentation */
  description: string
}

/**
 * Predefined cache strategies for common data patterns
 */
export const CacheStrategies = {
  /**
   * Static reference data - rarely changes
   * Examples: Equipment types, units, constants
   */
  STATIC_REFERENCE: {
    ttl: 3600, // 1 hour
    swr: 86400, // Serve stale for 24h while revalidating
    tags: ['static'],
    description: 'Frequently accessed, rarely changing reference data',
  },

  /**
   * User-specific data - changes moderately
   * Examples: User profile, preferences, assigned certificates
   */
  USER_DATA: {
    ttl: 300, // 5 minutes
    swr: 600, // Serve stale for 10m
    description: 'User-specific data that changes moderately',
  },

  /**
   * List data - changes frequently but can tolerate slight staleness
   * Examples: Certificate lists, search results
   */
  LIST_DATA: {
    ttl: 60, // 1 minute
    swr: 120, // Serve stale for 2m
    description: 'List data with acceptable staleness',
  },

  /**
   * Dashboard/aggregate data - expensive to compute
   * Examples: Stats, charts, summaries
   */
  DASHBOARD: {
    ttl: 60, // 1 minute
    swr: 300, // Serve stale for 5m
    tags: ['dashboard'],
    description: 'Expensive aggregate queries',
  },

  /**
   * Session data - short-lived
   * Examples: Active session, temporary tokens
   */
  SESSION: {
    ttl: 30, // 30 seconds
    swr: 60, // Serve stale for 1m
    description: 'Session-related data',
  },

  /**
   * Real-time data - no caching
   * Examples: Live status, active operations
   */
  REALTIME: {
    ttl: 0,
    swr: 0,
    description: 'Data that must always be fresh',
  },

  /**
   * Configuration data - changes rarely, loaded frequently
   * Examples: Tenant settings, feature flags
   */
  CONFIG: {
    ttl: 600, // 10 minutes
    swr: 1800, // Serve stale for 30m
    tags: ['config'],
    description: 'System configuration that changes rarely',
  },

  /**
   * External API responses - avoid hitting rate limits
   * Examples: Third-party API responses
   */
  EXTERNAL_API: {
    ttl: 300, // 5 minutes
    swr: 900, // Serve stale for 15m
    description: 'Cached external API responses',
  },
} as const satisfies Record<string, CacheStrategy>

export type CacheStrategyName = keyof typeof CacheStrategies

/**
 * Get cache strategy with dynamic tags
 */
export function getCacheStrategy(
  name: CacheStrategyName,
  additionalTags?: string[]
): CacheStrategy {
  const strategy = { ...CacheStrategies[name] }

  if (additionalTags?.length) {
    strategy.tags = [...(strategy.tags || []), ...additionalTags]
  }

  return strategy
}

/**
 * Build cache key with tenant and resource info
 */
export function buildCacheKey(parts: {
  resource: string
  tenantId?: string
  id?: string
  params?: Record<string, string | number | boolean>
}): string {
  const { resource, tenantId, id, params } = parts

  const keyParts = ['hta']

  if (tenantId) {
    keyParts.push(`t:${tenantId}`)
  }

  keyParts.push(resource)

  if (id) {
    keyParts.push(id)
  }

  if (params && Object.keys(params).length > 0) {
    const sortedParams = Object.entries(params)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join('&')
    keyParts.push(sortedParams)
  }

  return keyParts.join(':')
}

/**
 * Cache key builders for common resources
 */
export const CacheKeys = {
  // User-related
  user: (tenantId: string, userId: string) =>
    buildCacheKey({ resource: 'user', tenantId, id: userId }),

  userProfile: (tenantId: string, userId: string) =>
    buildCacheKey({ resource: 'user:profile', tenantId, id: userId }),

  // Certificate-related
  certificate: (tenantId: string, certId: string) =>
    buildCacheKey({ resource: 'cert', tenantId, id: certId }),

  certificateList: (tenantId: string, params?: { status?: string; page?: number }) =>
    buildCacheKey({ resource: 'cert:list', tenantId, params: params as Record<string, string | number> }),

  // Dashboard
  dashboardStats: (tenantId: string) =>
    buildCacheKey({ resource: 'dashboard:stats', tenantId }),

  userWorkload: (tenantId: string) =>
    buildCacheKey({ resource: 'dashboard:workload', tenantId }),

  // Tenant config
  tenantConfig: (tenantId: string) =>
    buildCacheKey({ resource: 'tenant:config', tenantId }),

  tenantFeatures: (tenantId: string) =>
    buildCacheKey({ resource: 'tenant:features', tenantId }),

  // Reference data (global)
  equipmentTypes: () =>
    buildCacheKey({ resource: 'ref:equipment-types' }),

  masterInstruments: (tenantId: string) =>
    buildCacheKey({ resource: 'ref:instruments', tenantId }),
}

/**
 * Cache invalidation patterns
 */
export const InvalidationPatterns = {
  // Invalidate all user-related caches for a tenant
  userCaches: (tenantId: string, userId?: string) =>
    userId
      ? `hta:t:${tenantId}:user:${userId}*`
      : `hta:t:${tenantId}:user:*`,

  // Invalidate all certificate caches for a tenant
  certificateCaches: (tenantId: string, certId?: string) =>
    certId
      ? `hta:t:${tenantId}:cert:${certId}*`
      : `hta:t:${tenantId}:cert:*`,

  // Invalidate dashboard caches for a tenant
  dashboardCaches: (tenantId: string) =>
    `hta:t:${tenantId}:dashboard:*`,

  // Invalidate all tenant caches
  allTenantCaches: (tenantId: string) =>
    `hta:t:${tenantId}:*`,

  // Invalidate reference data
  referenceCaches: () =>
    `hta:ref:*`,
}
