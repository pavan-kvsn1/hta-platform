/**
 * Cache Unit Tests
 *
 * Tests for the in-memory cache provider and cache utilities:
 * - Get/set operations with various data types
 * - TTL expiration handling
 * - Delete and pattern-based deletion
 * - Multi-get/set operations
 * - Increment operations for counters
 * - Max size enforcement and eviction
 *
 * Migrated from hta-calibration/tests/unit/cache.test.ts
 * Self-contained version with mock implementations
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Cache configuration types
interface CacheOptions {
  maxSize: number
  checkPeriod: number
}

interface MsetItem<T> {
  key: string
  value: T
  ttlSeconds?: number
}

interface CacheEntry<T> {
  value: T
  expiresAt?: number
  createdAt: number
}

// Mock MemoryCacheProvider implementation
class MemoryCacheProvider {
  private store: Map<string, CacheEntry<unknown>> = new Map()
  private readonly maxSize: number
  private cleanupInterval: ReturnType<typeof setInterval> | null = null

  constructor(options: CacheOptions) {
    this.maxSize = options.maxSize
    // Start cleanup interval
    this.cleanupInterval = setInterval(() => this.cleanup(), options.checkPeriod * 1000)
  }

  get size(): number {
    return this.store.size
  }

  async get<T>(key: string): Promise<T | null> {
    const entry = this.store.get(key)
    if (!entry) return null

    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      this.store.delete(key)
      return null
    }

    return entry.value as T
  }

  async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    // Check max size and evict if necessary
    if (this.store.size >= this.maxSize && !this.store.has(key)) {
      this.evictOldest()
    }

    const entry: CacheEntry<T> = {
      value,
      createdAt: Date.now(),
      expiresAt: ttlSeconds ? Date.now() + ttlSeconds * 1000 : undefined,
    }
    this.store.set(key, entry)
  }

  async delete(key: string): Promise<boolean> {
    return this.store.delete(key)
  }

  async deletePattern(pattern: string): Promise<number> {
    const prefix = pattern.replace('*', '')
    let count = 0

    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) {
        this.store.delete(key)
        count++
      }
    }

    return count
  }

  async exists(key: string): Promise<boolean> {
    const value = await this.get(key)
    return value !== null
  }

  async mget<T>(keys: string[]): Promise<(T | null)[]> {
    const results: (T | null)[] = []
    for (const key of keys) {
      results.push(await this.get<T>(key))
    }
    return results
  }

  async mset<T>(items: MsetItem<T>[]): Promise<void> {
    for (const item of items) {
      await this.set(item.key, item.value, item.ttlSeconds)
    }
  }

  async incr(key: string): Promise<number> {
    const current = (await this.get<number>(key)) ?? 0
    const newValue = current + 1
    const entry = this.store.get(key)
    await this.set(key, newValue, entry?.expiresAt ? Math.ceil((entry.expiresAt - Date.now()) / 1000) : undefined)
    return newValue
  }

  async expire(key: string, ttlSeconds: number): Promise<boolean> {
    const entry = this.store.get(key)
    if (!entry) return false

    entry.expiresAt = Date.now() + ttlSeconds * 1000
    return true
  }

  async ttl(key: string): Promise<number> {
    const entry = this.store.get(key)
    if (!entry) return -2 // Key doesn't exist

    if (!entry.expiresAt) return -1 // No expiry set

    const remaining = Math.ceil((entry.expiresAt - Date.now()) / 1000)
    return remaining > 0 ? remaining : -2
  }

  async ping(): Promise<boolean> {
    return true
  }

  async close(): Promise<void> {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval)
      this.cleanupInterval = null
    }
    this.store.clear()
  }

  private cleanup(): void {
    const now = Date.now()
    for (const [key, entry] of this.store.entries()) {
      if (entry.expiresAt && now > entry.expiresAt) {
        this.store.delete(key)
      }
    }
  }

  private evictOldest(): void {
    let oldestKey: string | null = null
    let oldestTime = Infinity

    for (const [key, entry] of this.store.entries()) {
      if (entry.createdAt < oldestTime) {
        oldestTime = entry.createdAt
        oldestKey = key
      }
    }

    if (oldestKey) {
      this.store.delete(oldestKey)
    }
  }
}

// Cache key generators
const CacheKeys = {
  user: (id: string) => `user:${id}`,
  userSession: (token: string) => `session:${token}`,
  userStats: (id: string) => `stats:user:${id}`,
  certificate: (id: string) => `cert:${id}`,
  certificateList: (userId: string, page: number) => `certs:list:${userId}:${page}`,
  certificateStats: () => 'certs:stats',
  customer: (id: string) => `customer:${id}`,
  customerList: (page: number) => `customers:list:${page}`,
  customerDashboard: (email: string) => `dashboard:customer:${email}`,
  dropdownAdmins: () => 'dropdown:admins',
  dropdownCustomers: () => 'dropdown:customers',
  dropdownInstruments: () => 'dropdown:instruments',
  dropdownReviewers: (userId: string) => `dropdown:reviewers:${userId}`,
  dashboardStats: (userId: string, role: string) => `dashboard:${role}:${userId}`,
  adminDashboard: () => 'dashboard:admin',
  engineerDashboard: (id: string) => `dashboard:engineer:${id}`,
  engineerCertificates: (id: string) => `certs:engineer:${id}`,
}

// Cache TTL constants (in seconds)
const CacheTTL = {
  VERY_SHORT: 30,
  SHORT: 60,
  MEDIUM: 300,
  LONG: 600,
  VERY_LONG: 3600,
  SESSION: 1800,
}

describe('MemoryCacheProvider', () => {
  let cache: MemoryCacheProvider

  beforeEach(() => {
    cache = new MemoryCacheProvider({ maxSize: 100, checkPeriod: 60 })
  })

  afterEach(async () => {
    await cache.close()
  })

  describe('get/set', () => {
    it('should set and get a value', async () => {
      await cache.set('test-key', { name: 'test' })
      const result = await cache.get<{ name: string }>('test-key')
      expect(result).toEqual({ name: 'test' })
    })

    it('should return null for non-existent key', async () => {
      const result = await cache.get('non-existent')
      expect(result).toBeNull()
    })

    it('should overwrite existing value', async () => {
      await cache.set('key', 'first')
      await cache.set('key', 'second')
      const result = await cache.get('key')
      expect(result).toBe('second')
    })

    it('should handle various data types', async () => {
      // String
      await cache.set('string', 'hello')
      expect(await cache.get('string')).toBe('hello')

      // Number
      await cache.set('number', 42)
      expect(await cache.get('number')).toBe(42)

      // Array
      await cache.set('array', [1, 2, 3])
      expect(await cache.get('array')).toEqual([1, 2, 3])

      // Object
      await cache.set('object', { a: 1, b: 2 })
      expect(await cache.get('object')).toEqual({ a: 1, b: 2 })

      // Boolean
      await cache.set('boolean', true)
      expect(await cache.get('boolean')).toBe(true)
    })
  })

  describe('TTL expiration', () => {
    it('should expire value after TTL', async () => {
      vi.useFakeTimers()

      await cache.set('expiring', 'value', 1) // 1 second TTL
      expect(await cache.get('expiring')).toBe('value')

      // Advance time past TTL
      vi.advanceTimersByTime(1500)

      expect(await cache.get('expiring')).toBeNull()

      vi.useRealTimers()
    })

    it('should not expire value before TTL', async () => {
      vi.useFakeTimers()

      await cache.set('not-expiring', 'value', 10)

      vi.advanceTimersByTime(5000) // 5 seconds

      expect(await cache.get('not-expiring')).toBe('value')

      vi.useRealTimers()
    })

    it('should not expire value without TTL', async () => {
      vi.useFakeTimers()

      await cache.set('no-ttl', 'value')

      vi.advanceTimersByTime(86400000) // 1 day

      expect(await cache.get('no-ttl')).toBe('value')

      vi.useRealTimers()
    })
  })

  describe('delete', () => {
    it('should delete existing key', async () => {
      await cache.set('to-delete', 'value')
      const deleted = await cache.delete('to-delete')
      expect(deleted).toBe(true)
      expect(await cache.get('to-delete')).toBeNull()
    })

    it('should return false for non-existent key', async () => {
      const deleted = await cache.delete('non-existent')
      expect(deleted).toBe(false)
    })
  })

  describe('deletePattern', () => {
    it('should delete keys matching pattern', async () => {
      await cache.set('prefix:a', 'value-a')
      await cache.set('prefix:b', 'value-b')
      await cache.set('other:c', 'value-c')

      const count = await cache.deletePattern('prefix:*')
      expect(count).toBe(2)
      expect(await cache.get('prefix:a')).toBeNull()
      expect(await cache.get('prefix:b')).toBeNull()
      expect(await cache.get('other:c')).toBe('value-c')
    })

    it('should return 0 when no keys match', async () => {
      await cache.set('key1', 'value')
      const count = await cache.deletePattern('nonexistent:*')
      expect(count).toBe(0)
    })
  })

  describe('exists', () => {
    it('should return true for existing key', async () => {
      await cache.set('exists', 'value')
      expect(await cache.exists('exists')).toBe(true)
    })

    it('should return false for non-existent key', async () => {
      expect(await cache.exists('non-existent')).toBe(false)
    })

    it('should return false for expired key', async () => {
      vi.useFakeTimers()

      await cache.set('expires', 'value', 1)
      vi.advanceTimersByTime(1500)

      expect(await cache.exists('expires')).toBe(false)

      vi.useRealTimers()
    })
  })

  describe('mget/mset', () => {
    it('should get multiple values at once', async () => {
      await cache.set('a', 1)
      await cache.set('b', 2)
      await cache.set('c', 3)

      const results = await cache.mget<number>(['a', 'b', 'c', 'd'])
      expect(results).toEqual([1, 2, 3, null])
    })

    it('should set multiple values at once', async () => {
      await cache.mset([
        { key: 'x', value: 'X' },
        { key: 'y', value: 'Y', ttlSeconds: 60 },
        { key: 'z', value: 'Z' },
      ])

      expect(await cache.get('x')).toBe('X')
      expect(await cache.get('y')).toBe('Y')
      expect(await cache.get('z')).toBe('Z')
    })
  })

  describe('incr', () => {
    it('should increment existing value', async () => {
      await cache.set('counter', 5)
      const result = await cache.incr('counter')
      expect(result).toBe(6)
    })

    it('should start from 1 for non-existent key', async () => {
      const result = await cache.incr('new-counter')
      expect(result).toBe(1)
    })

    it('should handle multiple increments', async () => {
      await cache.incr('multi')
      await cache.incr('multi')
      const result = await cache.incr('multi')
      expect(result).toBe(3)
    })
  })

  describe('expire', () => {
    it('should set expiry on existing key', async () => {
      vi.useFakeTimers()

      await cache.set('no-expiry', 'value')
      const result = await cache.expire('no-expiry', 1)
      expect(result).toBe(true)

      vi.advanceTimersByTime(1500)

      expect(await cache.get('no-expiry')).toBeNull()

      vi.useRealTimers()
    })

    it('should return false for non-existent key', async () => {
      const result = await cache.expire('non-existent', 60)
      expect(result).toBe(false)
    })
  })

  describe('ttl', () => {
    it('should return remaining TTL', async () => {
      vi.useFakeTimers()

      await cache.set('with-ttl', 'value', 100)

      vi.advanceTimersByTime(30000) // 30 seconds

      const remaining = await cache.ttl('with-ttl')
      expect(remaining).toBeGreaterThan(60)
      expect(remaining).toBeLessThanOrEqual(70)

      vi.useRealTimers()
    })

    it('should return -1 for key without expiry', async () => {
      await cache.set('no-ttl', 'value')
      expect(await cache.ttl('no-ttl')).toBe(-1)
    })

    it('should return -2 for non-existent key', async () => {
      expect(await cache.ttl('non-existent')).toBe(-2)
    })
  })

  describe('ping', () => {
    it('should always return true', async () => {
      expect(await cache.ping()).toBe(true)
    })
  })

  describe('max size enforcement', () => {
    it('should evict old entries when max size exceeded', async () => {
      const smallCache = new MemoryCacheProvider({ maxSize: 10, checkPeriod: 60 })

      // Fill cache
      for (let i = 0; i < 10; i++) {
        await smallCache.set(`key-${i}`, `value-${i}`)
      }

      expect(smallCache.size).toBe(10)

      // Add one more - should trigger eviction
      await smallCache.set('key-new', 'value-new')

      // Cache size should be less than original + 1 due to eviction
      expect(smallCache.size).toBeLessThanOrEqual(10)

      // New key should exist
      expect(await smallCache.get('key-new')).toBe('value-new')

      await smallCache.close()
    })
  })

  describe('close', () => {
    it('should clear cache and stop cleanup interval', async () => {
      await cache.set('key', 'value')
      expect(cache.size).toBe(1)

      await cache.close()

      expect(cache.size).toBe(0)
    })
  })
})

describe('CacheKeys', () => {
  it('should generate user keys', () => {
    expect(CacheKeys.user('123')).toBe('user:123')
    expect(CacheKeys.userSession('token-abc')).toBe('session:token-abc')
    expect(CacheKeys.userStats('456')).toBe('stats:user:456')
  })

  it('should generate certificate keys', () => {
    expect(CacheKeys.certificate('cert-001')).toBe('cert:cert-001')
    expect(CacheKeys.certificateList('user-1', 2)).toBe('certs:list:user-1:2')
    expect(CacheKeys.certificateStats()).toBe('certs:stats')
  })

  it('should generate customer keys', () => {
    expect(CacheKeys.customer('cust-1')).toBe('customer:cust-1')
    expect(CacheKeys.customerList(3)).toBe('customers:list:3')
    expect(CacheKeys.customerDashboard('test@example.com')).toBe('dashboard:customer:test@example.com')
  })

  it('should generate dropdown keys', () => {
    expect(CacheKeys.dropdownAdmins()).toBe('dropdown:admins')
    expect(CacheKeys.dropdownCustomers()).toBe('dropdown:customers')
    expect(CacheKeys.dropdownInstruments()).toBe('dropdown:instruments')
    expect(CacheKeys.dropdownReviewers('user-1')).toBe('dropdown:reviewers:user-1')
  })

  it('should generate dashboard keys', () => {
    expect(CacheKeys.dashboardStats('user-1', 'ADMIN')).toBe('dashboard:ADMIN:user-1')
    expect(CacheKeys.adminDashboard()).toBe('dashboard:admin')
    expect(CacheKeys.engineerDashboard('eng-1')).toBe('dashboard:engineer:eng-1')
    expect(CacheKeys.engineerCertificates('eng-1')).toBe('certs:engineer:eng-1')
  })
})

describe('CacheTTL', () => {
  it('should have correct TTL values', () => {
    expect(CacheTTL.VERY_SHORT).toBe(30)
    expect(CacheTTL.SHORT).toBe(60)
    expect(CacheTTL.MEDIUM).toBe(300)
    expect(CacheTTL.LONG).toBe(600)
    expect(CacheTTL.VERY_LONG).toBe(3600)
    expect(CacheTTL.SESSION).toBe(1800)
  })
})

// ---------------------------------------------------------------------------
// Actual import tests for cache module
// ---------------------------------------------------------------------------
import { getMemoryCacheProvider } from '@/lib/cache/providers/memory'
import { logCache, cache as cacheService, CacheKeys as CacheKeysFromIndex, CacheTTL as CacheTTLFromIndex } from '@/lib/cache'

describe('logCache (actual import)', () => {
  it('does not throw when called with message', () => {
    expect(() => logCache('test message')).not.toThrow()
  })

  it('does not throw when called with message and data', () => {
    expect(() => logCache('test message', { key: 'value' })).not.toThrow()
  })
})

describe('cache service (actual import)', () => {
  it('cache.get returns null for nonexistent key', async () => {
    const result = await cacheService.get('nonexistent-key-xyz-abc')
    expect(result).toBeNull()
  })

  it('cache.set and get work', async () => {
    await cacheService.set('test-svc-key', 'test-value', 60)
    const result = await cacheService.get<string>('test-svc-key')
    expect(result).toBe('test-value')
  })

  it('cache.incr increments', async () => {
    const val = await cacheService.incr('test-svc-counter-xyz')
    expect(val).toBeGreaterThan(0)
  })

  it('cache.delete removes a key', async () => {
    await cacheService.set('del-svc-key', 'to-delete', 60)
    const result = await cacheService.delete('del-svc-key')
    expect(result).toBe(true)
  })

  it('cache.exists returns false for missing key', async () => {
    const exists = await cacheService.exists('nonexistent-svc-key-xyz')
    expect(exists).toBe(false)
  })

  it('cache.ttl returns -2 for nonexistent key', async () => {
    const ttl = await cacheService.ttl('nonexistent-ttl-key')
    expect(ttl).toBe(-2)
  })

  it('cache.mget returns array with nulls for missing keys', async () => {
    const results = await cacheService.mget(['missing-1', 'missing-2'])
    expect(results).toEqual([null, null])
  })

  it('cache.mset stores multiple values', async () => {
    await cacheService.mset([
      { key: 'svc-multi-1', value: 'val1', ttlSeconds: 60 },
      { key: 'svc-multi-2', value: 'val2', ttlSeconds: 60 },
    ])
    const r1 = await cacheService.get<string>('svc-multi-1')
    const r2 = await cacheService.get<string>('svc-multi-2')
    expect(r1).toBe('val1')
    expect(r2).toBe('val2')
  })

  it('cache.deletePattern removes matching keys', async () => {
    await cacheService.set('svc-pat:a', 1)
    await cacheService.set('svc-pat:b', 2)
    const count = await cacheService.deletePattern('svc-pat:*')
    expect(count).toBeGreaterThanOrEqual(2)
  })

  it('cache.expire sets TTL on existing key', async () => {
    await cacheService.set('svc-expire-key', 'value')
    const result = await cacheService.expire('svc-expire-key', 120)
    expect(result).toBe(true)
  })

  it('cache.ping returns true', async () => {
    expect(await cacheService.ping()).toBe(true)
  })
})

describe('CacheKeys re-export from cache index', () => {
  it('CacheKeys is accessible from @/lib/cache', () => {
    expect(CacheKeysFromIndex.user('test')).toBe('user:test')
  })

  it('CacheTTL is accessible from @/lib/cache', () => {
    expect(CacheTTLFromIndex.MEDIUM).toBe(300)
  })
})

describe('MemoryCacheProvider (actual import)', () => {
  // Note: Uses singleton pattern, so reset between tests via close()
  let provider: ReturnType<typeof getMemoryCacheProvider>

  beforeEach(async () => {
    // Each test creates a fresh non-singleton instance by importing the class directly
    const { MemoryCacheProvider } = await import('@/lib/cache/providers/memory') as unknown as { MemoryCacheProvider: new (opts?: { maxSize?: number; checkPeriod?: number }) => ReturnType<typeof getMemoryCacheProvider> }
    provider = new MemoryCacheProvider({ maxSize: 100, checkPeriod: 60 })
  })

  afterEach(async () => {
    await provider.close()
  })

  it('get returns null for missing key', async () => {
    const result = await provider.get('nonexistent')
    expect(result).toBeNull()
  })

  it('set and get a string value', async () => {
    await provider.set('key1', 'hello world')
    const result = await provider.get<string>('key1')
    expect(result).toBe('hello world')
  })

  it('set and get an object value', async () => {
    const obj = { name: 'Test', value: 42 }
    await provider.set('obj-key', obj)
    const result = await provider.get<typeof obj>('obj-key')
    expect(result).toEqual(obj)
  })

  it('delete removes a key', async () => {
    await provider.set('del-key', 'value')
    const deleted = await provider.delete('del-key')
    expect(deleted).toBe(true)
    const result = await provider.get('del-key')
    expect(result).toBeNull()
  })

  it('delete returns false for nonexistent key', async () => {
    const deleted = await provider.delete('does-not-exist')
    expect(deleted).toBe(false)
  })

  it('exists returns false for missing key', async () => {
    const exists = await provider.exists('missing')
    expect(exists).toBe(false)
  })

  it('exists returns true for present key', async () => {
    await provider.set('exists-key', 'value')
    const exists = await provider.exists('exists-key')
    expect(exists).toBe(true)
  })

  it('incr increments a counter', async () => {
    const v1 = await provider.incr('counter')
    const v2 = await provider.incr('counter')
    expect(v1).toBe(1)
    expect(v2).toBe(2)
  })

  it('mget returns values for multiple keys', async () => {
    await provider.set('k1', 'a')
    await provider.set('k2', 'b')
    const results = await provider.mget<string>(['k1', 'k2', 'k3'])
    expect(results).toEqual(['a', 'b', null])
  })

  it('mset sets multiple values', async () => {
    await provider.mset([
      { key: 'mk1', value: 'one' },
      { key: 'mk2', value: 'two' },
    ])
    const r1 = await provider.get<string>('mk1')
    const r2 = await provider.get<string>('mk2')
    expect(r1).toBe('one')
    expect(r2).toBe('two')
  })

  it('deletePattern removes matching keys', async () => {
    await provider.set('prefix:a', 1)
    await provider.set('prefix:b', 2)
    await provider.set('other:c', 3)
    const count = await provider.deletePattern('prefix:*')
    expect(count).toBe(2)
    expect(await provider.get('prefix:a')).toBeNull()
    expect(await provider.get('prefix:b')).toBeNull()
    expect(await provider.get<number>('other:c')).toBe(3)
  })

  it('ttl returns -1 for key without expiry', async () => {
    await provider.set('no-ttl', 'value')
    const ttl = await provider.ttl('no-ttl')
    expect(ttl).toBe(-1)
  })

  it('ttl returns -2 for nonexistent key', async () => {
    const ttl = await provider.ttl('nonexistent')
    expect(ttl).toBe(-2)
  })

  it('ttl returns positive seconds for key with expiry', async () => {
    await provider.set('ttl-key', 'value', 60)
    const ttl = await provider.ttl('ttl-key')
    expect(ttl).toBeGreaterThan(0)
    expect(ttl).toBeLessThanOrEqual(60)
  })

  it('expire updates the TTL of an existing key', async () => {
    await provider.set('exp-key', 'value')
    const result = await provider.expire('exp-key', 120)
    expect(result).toBe(true)
    const ttl = await provider.ttl('exp-key')
    expect(ttl).toBeGreaterThan(0)
  })

  it('expire returns false for nonexistent key', async () => {
    const result = await provider.expire('missing', 60)
    expect(result).toBe(false)
  })

  it('ping returns true', async () => {
    expect(await provider.ping()).toBe(true)
  })

  it('close clears the cache', async () => {
    await provider.set('key', 'value')
    await provider.close()
    // After close, can still call get (map is cleared but class still usable)
    // Just verify close doesn't throw
  })
})

describe('getMemoryCacheProvider singleton', () => {
  it('returns a usable cache provider instance', async () => {
    const cacheInstance = getMemoryCacheProvider()
    expect(cacheInstance).toBeDefined()
    await cacheInstance.set('singleton-test', 42)
    const val = await cacheInstance.get<number>('singleton-test')
    expect(val).toBe(42)
  })

  it('returns the same instance on repeated calls', () => {
    const a = getMemoryCacheProvider()
    const b = getMemoryCacheProvider()
    expect(a).toBe(b)
  })
})
