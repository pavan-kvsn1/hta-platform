/**
 * Cache Unit Tests
 *
 * Tests for the in-memory cache provider and cache utilities.
 * Migrated from hta-calibration/tests/unit/cache.test.ts
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { MemoryCacheProvider } from '../src/cache/providers/memory'
import { CacheKeys, CacheTTL } from '../src/cache/types'

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

describe('CacheKeys (Multi-tenant)', () => {
  const tenantId = 'tenant-123'

  it('should generate user keys with tenantId', () => {
    expect(CacheKeys.user(tenantId, '123')).toBe('tenant-123:user:123')
    expect(CacheKeys.userSession('token-abc')).toBe('session:token-abc')
    expect(CacheKeys.userStats(tenantId, '456')).toBe('tenant-123:stats:user:456')
  })

  it('should generate certificate keys with tenantId', () => {
    expect(CacheKeys.certificate(tenantId, 'cert-001')).toBe('tenant-123:cert:cert-001')
    expect(CacheKeys.certificateList(tenantId, 'user-1', 2)).toBe('tenant-123:certs:list:user-1:2')
    expect(CacheKeys.certificateStats(tenantId)).toBe('tenant-123:certs:stats')
  })

  it('should generate customer keys with tenantId', () => {
    expect(CacheKeys.customer(tenantId, 'cust-1')).toBe('tenant-123:customer:cust-1')
    expect(CacheKeys.customerList(tenantId, 3)).toBe('tenant-123:customers:list:3')
    expect(CacheKeys.customerDashboard(tenantId, 'test@example.com')).toBe('tenant-123:dashboard:customer:test@example.com')
  })

  it('should generate dropdown keys with tenantId', () => {
    expect(CacheKeys.dropdownAdmins(tenantId)).toBe('tenant-123:dropdown:admins')
    expect(CacheKeys.dropdownCustomers(tenantId)).toBe('tenant-123:dropdown:customers')
    expect(CacheKeys.dropdownInstruments(tenantId)).toBe('tenant-123:dropdown:instruments')
    expect(CacheKeys.dropdownReviewers(tenantId, 'user-1')).toBe('tenant-123:dropdown:reviewers:user-1')
  })

  it('should generate dashboard keys with tenantId', () => {
    expect(CacheKeys.dashboardStats(tenantId, 'user-1', 'ADMIN')).toBe('tenant-123:dashboard:ADMIN:user-1')
    expect(CacheKeys.adminDashboard(tenantId)).toBe('tenant-123:dashboard:admin')
    expect(CacheKeys.engineerDashboard(tenantId, 'eng-1')).toBe('tenant-123:dashboard:engineer:eng-1')
    expect(CacheKeys.engineerCertificates(tenantId, 'eng-1')).toBe('tenant-123:certs:engineer:eng-1')
  })

  it('should generate tenant-level keys', () => {
    expect(CacheKeys.tenantConfig(tenantId)).toBe('tenant:tenant-123:config')
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
