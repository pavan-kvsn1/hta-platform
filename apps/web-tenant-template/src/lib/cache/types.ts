/**
 * Cache Types and Interfaces
 *
 * Defines the contract for cache providers and utilities.
 */

/**
 * Cache provider interface - all providers must implement this
 */
export interface CacheProvider {
  /**
   * Get a value from cache
   */
  get<T>(key: string): Promise<T | null>

  /**
   * Set a value in cache with optional TTL
   */
  set<T>(key: string, value: T, ttlSeconds?: number): Promise<void>

  /**
   * Delete a key from cache
   */
  delete(key: string): Promise<boolean>

  /**
   * Delete multiple keys matching a pattern
   */
  deletePattern(pattern: string): Promise<number>

  /**
   * Check if a key exists
   */
  exists(key: string): Promise<boolean>

  /**
   * Get multiple keys at once
   */
  mget<T>(keys: string[]): Promise<(T | null)[]>

  /**
   * Set multiple keys at once
   */
  mset<T>(entries: Array<{ key: string; value: T; ttlSeconds?: number }>): Promise<void>

  /**
   * Increment a numeric value
   */
  incr(key: string): Promise<number>

  /**
   * Set expiry on an existing key
   */
  expire(key: string, ttlSeconds: number): Promise<boolean>

  /**
   * Get remaining TTL for a key
   */
  ttl(key: string): Promise<number>

  /**
   * Check if provider is connected/healthy
   */
  ping(): Promise<boolean>

  /**
   * Close the connection
   */
  close(): Promise<void>
}

/**
 * Cache options for the cached() utility
 */
export interface CacheOptions {
  /** TTL in seconds (default: 300 = 5 minutes) */
  ttl?: number
  /** Tags for invalidation grouping */
  tags?: string[]
  /** Skip cache read (force refresh) */
  forceRefresh?: boolean
  /** Stale-while-revalidate window in seconds */
  swr?: number
}

/**
 * Cache configuration
 */
export interface CacheConfig {
  /** Cache provider type */
  provider: 'memory' | 'redis'
  /** Default TTL in seconds */
  defaultTtl: number
  /** Key prefix for namespacing */
  keyPrefix: string
  /** Redis configuration (if using Redis) */
  redis?: {
    host: string
    port: number
    password?: string
    tls?: boolean
    db?: number
  }
  /** Memory cache configuration */
  memory?: {
    maxSize: number  // Maximum number of entries
    checkPeriod: number  // Cleanup interval in seconds
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
 */
export const CacheKeys = {
  // User-related
  user: (id: string) => `user:${id}`,
  userSession: (token: string) => `session:${token}`,
  userStats: (id: string) => `stats:user:${id}`,

  // Certificate-related
  certificate: (id: string) => `cert:${id}`,
  certificateList: (userId: string, page: number) => `certs:list:${userId}:${page}`,
  certificateStats: () => `certs:stats`,

  // Customer-related
  customer: (id: string) => `customer:${id}`,
  customerList: (page: number) => `customers:list:${page}`,
  customerDashboard: (email: string) => `dashboard:customer:${email}`,

  // Dropdown/reference data
  dropdownAdmins: () => `dropdown:admins`,
  dropdownCustomers: () => `dropdown:customers`,
  dropdownInstruments: () => `dropdown:instruments`,
  dropdownReviewers: (userId: string) => `dropdown:reviewers:${userId}`,

  // Dashboard
  dashboardStats: (userId: string, role: string) => `dashboard:${role}:${userId}`,
  adminDashboard: () => `dashboard:admin`,
  engineerDashboard: (userId: string) => `dashboard:engineer:${userId}`,
  engineerCertificates: (userId: string) => `certs:engineer:${userId}`,
} as const

/**
 * Cache TTL presets (in seconds)
 */
export const CacheTTL = {
  /** Very short - 30 seconds (for frequently changing data) */
  VERY_SHORT: 30,
  /** Short - 1 minute */
  SHORT: 60,
  /** Medium - 5 minutes (default) */
  MEDIUM: 300,
  /** Long - 10 minutes */
  LONG: 600,
  /** Very long - 1 hour (for rarely changing data) */
  VERY_LONG: 3600,
  /** Session - 30 minutes */
  SESSION: 1800,
} as const
