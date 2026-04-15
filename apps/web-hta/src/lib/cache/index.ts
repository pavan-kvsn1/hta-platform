/**
 * Cache Service
 *
 * Main entry point for the caching system.
 * Automatically selects the appropriate provider based on environment.
 *
 * Usage:
 * ```typescript
 * import { cache, cached } from '@/lib/cache'
 *
 * // Direct cache access
 * await cache.set('key', value, 300)  // 5 min TTL
 * const value = await cache.get('key')
 *
 * // Cached function wrapper
 * const data = await cached('my-key', () => fetchData(), { ttl: 60 })
 * ```
 */

import { CacheProvider, CacheOptions, CacheConfig, CacheKeys as _CacheKeys, CacheTTL as _CacheTTL } from './types'
import { getMemoryCacheProvider } from './providers/memory'

// Re-export types and constants
export { CacheKeys, CacheTTL } from './types'
export type { CacheProvider, CacheOptions, CacheConfig } from './types'

/**
 * Debug logging - only enabled in development
 * This avoids log overhead in production while allowing debugging locally
 *
 * Options for cache logging:
 *
 * 1. Environment-Based (Current Implementation):
 *    - Logs only when NODE_ENV === 'development'
 *    - Zero overhead in production
 *
 * 2. Log Level Configuration (Alternative):
 *    - Set CACHE_LOG_LEVEL=debug|info|error in env
 *    - More granular control
 *
 * 3. Metrics Instead of Logs (Production Best Practice):
 *    - Use Cloud Monitoring custom metrics
 *    - Track hit/miss ratios via observability tools
 */
const DEBUG_CACHE = process.env.NODE_ENV === 'development'

export function logCache(message: string, data?: Record<string, unknown>): void {
  if (DEBUG_CACHE) {
    if (data) {
      console.log(`[Cache] ${message}`, data)
    } else {
      console.log(`[Cache] ${message}`)
    }
  }
}

/**
 * Get cache configuration from environment
 */
function getCacheConfig(): CacheConfig {
  const provider = (process.env.CACHE_PROVIDER || 'memory') as 'memory' | 'redis'

  return {
    provider,
    defaultTtl: parseInt(process.env.CACHE_TTL_DEFAULT || '300'),
    keyPrefix: process.env.CACHE_KEY_PREFIX || 'hta:',
    redis: provider === 'redis' ? {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD,
      tls: process.env.REDIS_TLS === 'true',
      db: parseInt(process.env.REDIS_DB || '0'),
    } : undefined,
    memory: provider === 'memory' ? {
      maxSize: parseInt(process.env.CACHE_MEMORY_MAX_SIZE || '10000'),
      checkPeriod: parseInt(process.env.CACHE_MEMORY_CHECK_PERIOD || '60'),
    } : undefined,
  }
}

// Singleton cache provider
let cacheProvider: CacheProvider | null = null

/**
 * Get the cache provider instance
 */
async function getCacheProvider(): Promise<CacheProvider> {
  if (cacheProvider) {
    return cacheProvider
  }

  const config = getCacheConfig()

  if (config.provider === 'redis' && config.redis) {
    try {
      // Dynamically import Redis provider only when needed
      const { getRedisCacheProvider } = await import('./providers/redis')
      cacheProvider = getRedisCacheProvider(config.redis)

      // Test connection
      const healthy = await cacheProvider.ping()
      if (!healthy) {
        console.warn('[Cache] Redis not healthy, falling back to memory cache')
        cacheProvider = getMemoryCacheProvider(config.memory)
      } else {
        console.log('[Cache] Using Redis provider')
      }
    } catch (error) {
      console.warn('[Cache] Failed to initialize Redis, falling back to memory cache:', error)
      cacheProvider = getMemoryCacheProvider(config.memory)
    }
  } else {
    cacheProvider = getMemoryCacheProvider(config.memory)
    console.log('[Cache] Using memory provider')
  }

  return cacheProvider
}

/**
 * Main cache object with lazy initialization
 */
export const cache = {
  async get<T>(key: string): Promise<T | null> {
    const provider = await getCacheProvider()
    return provider.get<T>(key)
  },

  async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    const provider = await getCacheProvider()
    const config = getCacheConfig()
    return provider.set(key, value, ttlSeconds ?? config.defaultTtl)
  },

  async delete(key: string): Promise<boolean> {
    const provider = await getCacheProvider()
    return provider.delete(key)
  },

  async deletePattern(pattern: string): Promise<number> {
    const provider = await getCacheProvider()
    return provider.deletePattern(pattern)
  },

  async exists(key: string): Promise<boolean> {
    const provider = await getCacheProvider()
    return provider.exists(key)
  },

  async mget<T>(keys: string[]): Promise<(T | null)[]> {
    const provider = await getCacheProvider()
    return provider.mget<T>(keys)
  },

  async mset<T>(entries: Array<{ key: string; value: T; ttlSeconds?: number }>): Promise<void> {
    const provider = await getCacheProvider()
    return provider.mset(entries)
  },

  async incr(key: string): Promise<number> {
    const provider = await getCacheProvider()
    return provider.incr(key)
  },

  async expire(key: string, ttlSeconds: number): Promise<boolean> {
    const provider = await getCacheProvider()
    return provider.expire(key, ttlSeconds)
  },

  async ttl(key: string): Promise<number> {
    const provider = await getCacheProvider()
    return provider.ttl(key)
  },

  async ping(): Promise<boolean> {
    const provider = await getCacheProvider()
    return provider.ping()
  },

  async close(): Promise<void> {
    if (cacheProvider) {
      await cacheProvider.close()
      cacheProvider = null
    }
  },
}

/**
 * Cached function wrapper
 *
 * Wraps an async function with caching. If the value exists in cache,
 * it returns the cached value. Otherwise, it executes the function
 * and caches the result.
 *
 * @example
 * ```typescript
 * const user = await cached(
 *   CacheKeys.user(userId),
 *   () => prisma.user.findUnique({ where: { id: userId } }),
 *   { ttl: CacheTTL.MEDIUM }
 * )
 * ```
 */
export async function cached<T>(
  key: string,
  fn: () => Promise<T>,
  options: CacheOptions = {}
): Promise<T> {
  const { ttl, forceRefresh } = options
  const config = getCacheConfig()

  // Skip cache read if force refresh
  if (!forceRefresh) {
    const cachedValue = await cache.get<T>(key)
    if (cachedValue !== null) {
      logCache(`HIT: ${key}`)
      return cachedValue
    }
  }

  logCache(`MISS: ${key}`)

  // Execute function
  const result = await fn()

  // Cache the result (don't cache null/undefined)
  if (result !== null && result !== undefined) {
    const effectiveTtl = ttl ?? config.defaultTtl
    await cache.set(key, result, effectiveTtl)
    logCache(`SET: ${key}`, { ttl: effectiveTtl })
  }

  return result
}

/**
 * Cached function wrapper with stale-while-revalidate
 *
 * Returns cached value immediately (even if stale) and refreshes in background.
 */
export async function cachedSWR<T>(
  key: string,
  fn: () => Promise<T>,
  options: CacheOptions & { swr: number }
): Promise<T> {
  const { ttl, swr } = options
  const config = getCacheConfig()

  // Check cache with metadata
  const metaKey = `${key}:meta`
  const [cachedValue, meta] = await Promise.all([
    cache.get<T>(key),
    cache.get<{ updatedAt: number }>(metaKey),
  ])

  const now = Date.now()
  const effectiveTtl = ttl ?? config.defaultTtl
  const isStale = meta ? (now - meta.updatedAt) > (effectiveTtl * 1000) : true
  const isExpired = meta ? (now - meta.updatedAt) > ((effectiveTtl + swr) * 1000) : true

  // If we have a cached value and it's not fully expired, return it
  if (cachedValue !== null && !isExpired) {
    // If stale, trigger background refresh
    if (isStale) {
      logCache(`SWR STALE: ${key} (refreshing in background)`)
      // Fire and forget - don't await
      fn().then(async (result) => {
        if (result !== null && result !== undefined) {
          await Promise.all([
            cache.set(key, result, effectiveTtl + swr),
            cache.set(metaKey, { updatedAt: Date.now() }, effectiveTtl + swr),
          ])
          logCache(`SWR REFRESHED: ${key}`)
        }
      }).catch(console.error)
    } else {
      logCache(`SWR HIT: ${key}`)
    }

    return cachedValue
  }

  logCache(`SWR MISS: ${key}`)

  // No cache or fully expired - fetch fresh
  const result = await fn()

  if (result !== null && result !== undefined) {
    await Promise.all([
      cache.set(key, result, effectiveTtl + swr),
      cache.set(metaKey, { updatedAt: Date.now() }, effectiveTtl + swr),
    ])
    logCache(`SWR SET: ${key}`, { ttl: effectiveTtl, swr })
  }

  return result
}
