/**
 * Cache Types and Interfaces
 *
 * Defines the contract for cache providers and utilities.
 */

/**
 * Cache provider interface - all providers must implement this
 */
export interface CacheProvider {
  get<T>(key: string): Promise<T | null>
  set<T>(key: string, value: T, ttlSeconds?: number): Promise<void>
  delete(key: string): Promise<boolean>
  deletePattern(pattern: string): Promise<number>
  exists(key: string): Promise<boolean>
  mget<T>(keys: string[]): Promise<(T | null)[]>
  mset<T>(entries: Array<{ key: string; value: T; ttlSeconds?: number }>): Promise<void>
  incr(key: string): Promise<number>
  expire(key: string, ttlSeconds: number): Promise<boolean>
  ttl(key: string): Promise<number>
  ping(): Promise<boolean>
  close(): Promise<void>
}

/**
 * Cache options for the cached() utility
 */
export interface CacheOptions {
  ttl?: number
  tags?: string[]
  forceRefresh?: boolean
  swr?: number
}

/**
 * Cache configuration
 */
export interface CacheConfig {
  provider: 'memory' | 'redis'
  defaultTtl: number
  keyPrefix: string
  redis?: {
    host: string
    port: number
    password?: string
    tls?: boolean
    db?: number
  }
  memory?: {
    maxSize: number
    checkPeriod: number
  }
}

/**
 * Cache statistics
 */
export interface CacheStats {
  hits: number
  misses: number
  sets: number
  deletes: number
  hitRate: number
}

/**
 * Cached entry with metadata
 */
export interface CachedEntry<T> {
  value: T
  createdAt: number
  expiresAt: number
  tags?: string[]
}

/**
 * Cache key patterns for different entity types
 * Note: These include tenantId for multi-tenant support
 */
export const CacheKeys = {
  // User-related
  user: (tenantId: string, id: string) => `${tenantId}:user:${id}`,
  userSession: (token: string) => `session:${token}`,
  userStats: (tenantId: string, id: string) => `${tenantId}:stats:user:${id}`,

  // Certificate-related
  certificate: (tenantId: string, id: string) => `${tenantId}:cert:${id}`,
  certificateList: (tenantId: string, userId: string, page: number) => `${tenantId}:certs:list:${userId}:${page}`,
  certificateStats: (tenantId: string) => `${tenantId}:certs:stats`,

  // Customer-related
  customer: (tenantId: string, id: string) => `${tenantId}:customer:${id}`,
  customerList: (tenantId: string, page: number) => `${tenantId}:customers:list:${page}`,
  customerDashboard: (tenantId: string, email: string) => `${tenantId}:dashboard:customer:${email}`,

  // Dropdown/reference data
  dropdownAdmins: (tenantId: string) => `${tenantId}:dropdown:admins`,
  dropdownCustomers: (tenantId: string) => `${tenantId}:dropdown:customers`,
  dropdownInstruments: (tenantId: string) => `${tenantId}:dropdown:instruments`,
  dropdownReviewers: (tenantId: string, userId: string) => `${tenantId}:dropdown:reviewers:${userId}`,

  // Dashboard
  dashboardStats: (tenantId: string, userId: string, role: string) => `${tenantId}:dashboard:${role}:${userId}`,
  adminDashboard: (tenantId: string) => `${tenantId}:dashboard:admin`,
  engineerDashboard: (tenantId: string, userId: string) => `${tenantId}:dashboard:engineer:${userId}`,
  engineerCertificates: (tenantId: string, userId: string) => `${tenantId}:certs:engineer:${userId}`,

  // Tenant-level
  tenantConfig: (tenantId: string) => `tenant:${tenantId}:config`,
} as const

/**
 * Cache TTL presets (in seconds)
 */
export const CacheTTL = {
  VERY_SHORT: 30,
  SHORT: 60,
  MEDIUM: 300,
  LONG: 600,
  VERY_LONG: 3600,
  SESSION: 1800,
} as const
