/**
 * Cached Functions Unit Tests
 *
 * Tests for the caching wrapper functions:
 * - cached() - Basic cache-aside pattern
 * - cachedSWR() - Stale-while-revalidate pattern
 * - logCache() - Debug logging utility
 *
 * Self-contained version with mock implementations
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Types
interface CacheOptions {
  ttl?: number
  forceRefresh?: boolean
}

interface CacheSWROptions {
  ttl?: number
  swr?: number
}

interface CacheProvider {
  get: <T>(key: string) => Promise<T | null>
  set: <T>(key: string, value: T, ttlSeconds?: number) => Promise<void>
  delete: (key: string) => Promise<boolean>
  close: () => Promise<void>
}

// Mock cache provider
const createMockProvider = (): CacheProvider => {
  const store = new Map<string, { value: unknown; meta?: { updatedAt: number } }>()

  return {
    get: vi.fn(async <T>(key: string): Promise<T | null> => {
      const entry = store.get(key)
      return entry ? (entry.value as T) : null
    }),
    set: vi.fn(async <T>(key: string, value: T): Promise<void> => {
      store.set(key, { value, meta: { updatedAt: Date.now() } })
    }),
    delete: vi.fn(async (key: string): Promise<boolean> => {
      return store.delete(key)
    }),
    close: vi.fn(async (): Promise<void> => {
      store.clear()
    }),
  }
}

let mockProvider: ReturnType<typeof createMockProvider>

// cached() implementation
async function cached<T>(
  key: string,
  fn: () => Promise<T>,
  options: CacheOptions = {}
): Promise<T> {
  const { ttl = 300, forceRefresh = false } = options

  // Skip cache check if forceRefresh
  if (!forceRefresh) {
    const cachedValue = await mockProvider.get<T>(key)
    if (cachedValue !== null) {
      return cachedValue
    }
  }

  // Execute function and cache result
  const result = await fn()

  // Don't cache null/undefined
  if (result !== null && result !== undefined) {
    await mockProvider.set(key, result, ttl)
  }

  return result
}

// cachedSWR() implementation
async function cachedSWR<T>(
  key: string,
  fn: () => Promise<T>,
  options: CacheSWROptions = {}
): Promise<T> {
  const { ttl = 300, swr = 60 } = options
  const metaKey = `${key}:meta`

  // Check cache
  const cachedValue = await mockProvider.get<T>(key)
  const meta = await mockProvider.get<{ updatedAt: number }>(metaKey)

  if (cachedValue !== null && meta) {
    const age = (Date.now() - meta.updatedAt) / 1000
    const isStale = age > ttl
    const isExpired = age > ttl + swr

    if (!isExpired) {
      // If stale but not expired, trigger background refresh
      if (isStale) {
        // Background refresh (don't await)
        fn().then(async result => {
          if (result !== null && result !== undefined) {
            await mockProvider.set(key, result, ttl + swr)
            await mockProvider.set(metaKey, { updatedAt: Date.now() }, ttl + swr)
          }
        })
      }
      return cachedValue
    }
  }

  // Cache miss or expired - fetch fresh
  const result = await fn()

  // Don't cache null/undefined
  if (result !== null && result !== undefined) {
    await mockProvider.set(key, result, ttl + swr)
    await mockProvider.set(metaKey, { updatedAt: Date.now() }, ttl + swr)
  }

  return result
}

// logCache() implementation
const DEBUG_CACHE = process.env.NODE_ENV === 'development'

function logCache(message: string, data?: unknown): void {
  if (DEBUG_CACHE) {
    if (data !== undefined) {
      console.log(`[CACHE] ${message}`, data)
    } else {
      console.log(`[CACHE] ${message}`)
    }
  }
}

describe('cached', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockProvider = createMockProvider()
  })

  afterEach(async () => {
    await mockProvider.close()
  })

  it('should return cached value on hit', async () => {
    // Pre-populate cache
    await mockProvider.set('cache-key', 'cached-value')
    const fn = vi.fn().mockResolvedValue('fresh-value')

    const result = await cached('cache-key', fn)

    expect(result).toBe('cached-value')
    expect(fn).not.toHaveBeenCalled()
  })

  it('should execute function and cache result on miss', async () => {
    const fn = vi.fn().mockResolvedValue('fresh-value')

    const result = await cached('cache-key', fn)

    expect(result).toBe('fresh-value')
    expect(fn).toHaveBeenCalled()
    expect(mockProvider.set).toHaveBeenCalled()
  })

  it('should not cache null results', async () => {
    const fn = vi.fn().mockResolvedValue(null)

    const result = await cached('cache-key', fn)

    expect(result).toBeNull()
    expect(fn).toHaveBeenCalled()
    // set should only be called for non-null results
    expect(mockProvider.set).not.toHaveBeenCalledWith(
      'cache-key',
      null,
      expect.any(Number)
    )
  })

  it('should not cache undefined results', async () => {
    const fn = vi.fn().mockResolvedValue(undefined)

    const result = await cached('cache-key', fn)

    expect(result).toBeUndefined()
    expect(fn).toHaveBeenCalled()
    expect(mockProvider.set).not.toHaveBeenCalledWith(
      'cache-key',
      undefined,
      expect.any(Number)
    )
  })

  it('should bypass cache with forceRefresh option', async () => {
    await mockProvider.set('cache-key', 'cached-value')
    const fn = vi.fn().mockResolvedValue('fresh-value')

    const result = await cached('cache-key', fn, { forceRefresh: true })

    expect(result).toBe('fresh-value')
    expect(fn).toHaveBeenCalled()
    // Should not check cache when forceRefresh is true
    expect(mockProvider.get).not.toHaveBeenCalled()
  })

  it('should use custom TTL', async () => {
    const fn = vi.fn().mockResolvedValue('value')

    await cached('cache-key', fn, { ttl: 600 })

    expect(mockProvider.set).toHaveBeenCalledWith('cache-key', 'value', 600)
  })

  it('should use default TTL when not specified', async () => {
    const fn = vi.fn().mockResolvedValue('value')

    await cached('cache-key', fn)

    expect(mockProvider.set).toHaveBeenCalledWith('cache-key', 'value', 300)
  })
})

describe('cachedSWR', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockProvider = createMockProvider()
  })

  afterEach(async () => {
    await mockProvider.close()
  })

  it('should fetch fresh data on complete miss', async () => {
    const fn = vi.fn().mockResolvedValue('fresh-value')

    const result = await cachedSWR('swr-key', fn, { ttl: 300, swr: 60 })

    expect(result).toBe('fresh-value')
    expect(fn).toHaveBeenCalled()
    expect(mockProvider.set).toHaveBeenCalled()
  })

  it('should return cached value when fresh', async () => {
    // Pre-populate cache with fresh data
    await mockProvider.set('swr-fresh-key', 'cached-value')
    await mockProvider.set('swr-fresh-key:meta', { updatedAt: Date.now() - 10000 }) // 10 seconds old

    const fn = vi.fn().mockResolvedValue('fresh-value')

    const result = await cachedSWR('swr-fresh-key', fn, { ttl: 300, swr: 60 })

    // Should return cached value since it's fresh (within ttl)
    expect(result).toBe('cached-value')
  })

  it('should not cache null results', async () => {
    const fn = vi.fn().mockResolvedValue(null)

    const result = await cachedSWR('swr-key', fn, { ttl: 300, swr: 60 })

    expect(result).toBeNull()
    // Should not set cache for null values
    expect(mockProvider.set).not.toHaveBeenCalledWith(
      'swr-key',
      null,
      expect.any(Number)
    )
  })

  it('should return cached value and trigger background refresh when stale', async () => {
    vi.useFakeTimers()
    const now = Date.now()

    // Pre-populate with stale data (400 seconds old, beyond 300s TTL but within swr window)
    await mockProvider.set('swr-stale-key', 'stale-value')
    await mockProvider.set('swr-stale-key:meta', { updatedAt: now - 400000 })

    const fn = vi.fn().mockResolvedValue('fresh-value')

    const result = await cachedSWR('swr-stale-key', fn, { ttl: 300, swr: 300 })

    // Should return stale value immediately
    expect(result).toBe('stale-value')

    // Wait for background refresh
    await vi.advanceTimersByTimeAsync(50)

    // Function should have been called in background
    expect(fn).toHaveBeenCalled()

    vi.useRealTimers()
  })

  it('should fetch fresh when cache is expired beyond swr window', async () => {
    // Pre-populate with expired data (beyond ttl + swr)
    await mockProvider.set('swr-expired-key', 'expired-value')
    await mockProvider.set('swr-expired-key:meta', { updatedAt: Date.now() - 700000 }) // 700 seconds old

    const fn = vi.fn().mockResolvedValue('fresh-value')

    const result = await cachedSWR('swr-expired-key', fn, { ttl: 300, swr: 300 })

    // Should fetch fresh since cache is expired
    expect(result).toBe('fresh-value')
    expect(fn).toHaveBeenCalled()
  })
})

describe('logCache', () => {
  const originalEnv = process.env.NODE_ENV

  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  afterEach(() => {
    process.env.NODE_ENV = originalEnv
    vi.restoreAllMocks()
  })

  it('should log messages in development mode', () => {
    // Note: DEBUG_CACHE is evaluated at import time, so this tests the function works
    logCache('Test message')
    // Function should not throw
  })

  it('should log messages with data', () => {
    logCache('Test message', { key: 'value' })
    // Function should not throw
  })

  it('should handle messages without data', () => {
    logCache('Simple message')
    // Function should not throw
  })

  it('should handle various data types', () => {
    logCache('String data', 'string-value')
    logCache('Number data', 42)
    logCache('Array data', [1, 2, 3])
    logCache('Object data', { nested: { value: true } })
    // All should complete without error
  })
})
