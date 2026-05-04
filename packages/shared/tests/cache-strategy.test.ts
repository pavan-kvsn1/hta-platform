/**
 * Cache Strategy Unit Tests
 *
 * Tests for:
 * - getCacheStrategy() — correct TTL/SWR per strategy; STATIC_REFERENCE longest TTL; USER_DATA shortest
 * - buildCacheKey() — joins with delimiter; handles special chars; handles empty parts
 * - CacheKeys — each template produces unique keys
 * - InvalidationPatterns — patterns match expected formats
 */

import { describe, it, expect } from 'vitest'
import {
  CacheStrategies,
  getCacheStrategy,
  buildCacheKey,
  InvalidationPatterns,
} from '../src/cache/strategy'

// CacheKeys from strategy.ts (not types.ts)
import { CacheKeys as StrategyCacheKeys } from '../src/cache/strategy'

describe('CacheStrategies', () => {
  it('STATIC_REFERENCE has the longest TTL', () => {
    const allTTLs = Object.values(CacheStrategies).map(s => s.ttl)
    expect(CacheStrategies.STATIC_REFERENCE.ttl).toBe(Math.max(...allTTLs))
    expect(CacheStrategies.STATIC_REFERENCE.ttl).toBe(3600)
  })

  it('USER_DATA has a moderate TTL (5 min)', () => {
    expect(CacheStrategies.USER_DATA.ttl).toBe(300)
  })

  it('REALTIME has zero TTL and SWR', () => {
    expect(CacheStrategies.REALTIME.ttl).toBe(0)
    expect(CacheStrategies.REALTIME.swr).toBe(0)
  })

  it('SESSION has shortest non-zero TTL (30 seconds)', () => {
    const nonZeroTTLs = Object.values(CacheStrategies)
      .filter(s => s.ttl > 0)
      .map(s => s.ttl)
    expect(CacheStrategies.SESSION.ttl).toBe(Math.min(...nonZeroTTLs))
    expect(CacheStrategies.SESSION.ttl).toBe(30)
  })

  it('SWR is always >= TTL for each strategy', () => {
    for (const [name, strategy] of Object.entries(CacheStrategies)) {
      expect(strategy.swr).toBeGreaterThanOrEqual(strategy.ttl)
    }
  })

  it('all strategies have a description', () => {
    for (const [name, strategy] of Object.entries(CacheStrategies)) {
      expect(strategy.description).toBeDefined()
      expect(typeof strategy.description).toBe('string')
      expect(strategy.description.length).toBeGreaterThan(0)
    }
  })

  it('STATIC_REFERENCE has static tag', () => {
    expect(CacheStrategies.STATIC_REFERENCE.tags).toContain('static')
  })

  it('DASHBOARD has dashboard tag', () => {
    expect(CacheStrategies.DASHBOARD.tags).toContain('dashboard')
  })

  it('CONFIG has config tag', () => {
    expect(CacheStrategies.CONFIG.tags).toContain('config')
  })
})

describe('getCacheStrategy', () => {
  it('returns correct TTL for STATIC_REFERENCE', () => {
    const strategy = getCacheStrategy('STATIC_REFERENCE')
    expect(strategy.ttl).toBe(3600)
    expect(strategy.swr).toBe(86400)
  })

  it('returns correct TTL for USER_DATA', () => {
    const strategy = getCacheStrategy('USER_DATA')
    expect(strategy.ttl).toBe(300)
    expect(strategy.swr).toBe(600)
  })

  it('returns correct TTL for LIST_DATA', () => {
    const strategy = getCacheStrategy('LIST_DATA')
    expect(strategy.ttl).toBe(60)
    expect(strategy.swr).toBe(120)
  })

  it('returns correct TTL for DASHBOARD', () => {
    const strategy = getCacheStrategy('DASHBOARD')
    expect(strategy.ttl).toBe(60)
    expect(strategy.swr).toBe(300)
  })

  it('preserves base tags', () => {
    const strategy = getCacheStrategy('STATIC_REFERENCE')
    expect(strategy.tags).toContain('static')
  })

  it('appends additional tags to base tags', () => {
    const strategy = getCacheStrategy('STATIC_REFERENCE', ['tenant:abc'])
    expect(strategy.tags).toContain('static')
    expect(strategy.tags).toContain('tenant:abc')
  })

  it('handles strategy with no base tags', () => {
    const strategy = getCacheStrategy('USER_DATA', ['extra-tag'])
    expect(strategy.tags).toContain('extra-tag')
  })

  it('returns empty tags array when no tags in base and none added', () => {
    const strategy = getCacheStrategy('SESSION')
    expect(strategy.tags).toEqual([])
  })

  it('includes description from base strategy', () => {
    const strategy = getCacheStrategy('EXTERNAL_API')
    expect(strategy.description).toBe('Cached external API responses')
  })
})

describe('buildCacheKey', () => {
  it('builds basic key with resource', () => {
    const key = buildCacheKey({ resource: 'user' })
    expect(key).toBe('hta:user')
  })

  it('includes tenantId when provided', () => {
    const key = buildCacheKey({ resource: 'cert', tenantId: 'tenant-1' })
    expect(key).toBe('hta:t:tenant-1:cert')
  })

  it('includes id when provided', () => {
    const key = buildCacheKey({ resource: 'cert', tenantId: 't1', id: 'abc' })
    expect(key).toBe('hta:t:t1:cert:abc')
  })

  it('includes sorted params', () => {
    const key = buildCacheKey({
      resource: 'list',
      tenantId: 't1',
      params: { page: 2, status: 'active' },
    })
    expect(key).toBe('hta:t:t1:list:page=2&status=active')
  })

  it('sorts params alphabetically', () => {
    const key = buildCacheKey({
      resource: 'list',
      params: { z: 'last', a: 'first' },
    })
    expect(key).toBe('hta:list:a=first&z=last')
  })

  it('omits tenantId when not provided', () => {
    const key = buildCacheKey({ resource: 'ref:data' })
    expect(key).toBe('hta:ref:data')
    expect(key).not.toContain('t:')
  })

  it('omits params section when params is empty object', () => {
    const key = buildCacheKey({ resource: 'test', params: {} })
    expect(key).toBe('hta:test')
  })

  it('handles special characters in values', () => {
    const key = buildCacheKey({
      resource: 'user',
      id: 'user@example.com',
    })
    expect(key).toBe('hta:user:user@example.com')
  })

  it('uses colon as delimiter', () => {
    const key = buildCacheKey({ resource: 'a', tenantId: 'b', id: 'c' })
    const parts = key.split(':')
    expect(parts[0]).toBe('hta')
    expect(parts[1]).toBe('t')
    expect(parts[2]).toBe('b')
    expect(parts[3]).toBe('a')
    expect(parts[4]).toBe('c')
  })
})

describe('CacheKeys (strategy)', () => {
  const tenantId = 'tenant-abc'

  it('user() produces unique key', () => {
    const key = StrategyCacheKeys.user(tenantId, 'u1')
    expect(key).toContain('user')
    expect(key).toContain(tenantId)
    expect(key).toContain('u1')
  })

  it('userProfile() produces unique key', () => {
    const key = StrategyCacheKeys.userProfile(tenantId, 'u1')
    expect(key).toContain('user:profile')
    expect(key).toContain(tenantId)
  })

  it('certificate() produces unique key', () => {
    const key = StrategyCacheKeys.certificate(tenantId, 'cert-1')
    expect(key).toContain('cert')
    expect(key).toContain('cert-1')
  })

  it('certificateList() includes params', () => {
    const key = StrategyCacheKeys.certificateList(tenantId, { status: 'DRAFT', page: 1 })
    expect(key).toContain('cert:list')
    expect(key).toContain('status=DRAFT')
    expect(key).toContain('page=1')
  })

  it('certificateList() works without params', () => {
    const key = StrategyCacheKeys.certificateList(tenantId)
    expect(key).toContain('cert:list')
    expect(key).toContain(tenantId)
  })

  it('dashboardStats() produces unique key', () => {
    const key = StrategyCacheKeys.dashboardStats(tenantId)
    expect(key).toContain('dashboard:stats')
    expect(key).toContain(tenantId)
  })

  it('userWorkload() produces unique key', () => {
    const key = StrategyCacheKeys.userWorkload(tenantId)
    expect(key).toContain('dashboard:workload')
  })

  it('tenantConfig() produces unique key', () => {
    const key = StrategyCacheKeys.tenantConfig(tenantId)
    expect(key).toContain('tenant:config')
    expect(key).toContain(tenantId)
  })

  it('tenantFeatures() produces unique key', () => {
    const key = StrategyCacheKeys.tenantFeatures(tenantId)
    expect(key).toContain('tenant:features')
  })

  it('equipmentTypes() is global (no tenantId)', () => {
    const key = StrategyCacheKeys.equipmentTypes()
    expect(key).toContain('ref:equipment-types')
    expect(key).not.toContain('t:')
  })

  it('masterInstruments() is per-tenant', () => {
    const key = StrategyCacheKeys.masterInstruments(tenantId)
    expect(key).toContain('ref:instruments')
    expect(key).toContain(tenantId)
  })

  it('different resources produce different keys', () => {
    const userKey = StrategyCacheKeys.user(tenantId, 'u1')
    const certKey = StrategyCacheKeys.certificate(tenantId, 'u1')
    expect(userKey).not.toBe(certKey)
  })

  it('different tenants produce different keys', () => {
    const key1 = StrategyCacheKeys.user('tenant-1', 'u1')
    const key2 = StrategyCacheKeys.user('tenant-2', 'u1')
    expect(key1).not.toBe(key2)
  })
})

describe('InvalidationPatterns', () => {
  const tenantId = 'tenant-xyz'

  it('userCaches() returns wildcard pattern for all user caches', () => {
    const pattern = InvalidationPatterns.userCaches(tenantId)
    expect(pattern).toBe(`hta:t:${tenantId}:user:*`)
  })

  it('userCaches() with userId returns specific pattern', () => {
    const pattern = InvalidationPatterns.userCaches(tenantId, 'u1')
    expect(pattern).toBe(`hta:t:${tenantId}:user:u1*`)
  })

  it('certificateCaches() returns wildcard pattern', () => {
    const pattern = InvalidationPatterns.certificateCaches(tenantId)
    expect(pattern).toBe(`hta:t:${tenantId}:cert:*`)
  })

  it('certificateCaches() with certId returns specific pattern', () => {
    const pattern = InvalidationPatterns.certificateCaches(tenantId, 'cert-1')
    expect(pattern).toBe(`hta:t:${tenantId}:cert:cert-1*`)
  })

  it('dashboardCaches() returns wildcard pattern', () => {
    const pattern = InvalidationPatterns.dashboardCaches(tenantId)
    expect(pattern).toBe(`hta:t:${tenantId}:dashboard:*`)
  })

  it('allTenantCaches() returns wildcard for entire tenant', () => {
    const pattern = InvalidationPatterns.allTenantCaches(tenantId)
    expect(pattern).toBe(`hta:t:${tenantId}:*`)
  })

  it('referenceCaches() returns global reference pattern', () => {
    const pattern = InvalidationPatterns.referenceCaches()
    expect(pattern).toBe('hta:ref:*')
  })

  it('patterns end with wildcard *', () => {
    expect(InvalidationPatterns.userCaches(tenantId)).toMatch(/\*$/)
    expect(InvalidationPatterns.certificateCaches(tenantId)).toMatch(/\*$/)
    expect(InvalidationPatterns.dashboardCaches(tenantId)).toMatch(/\*$/)
    expect(InvalidationPatterns.allTenantCaches(tenantId)).toMatch(/\*$/)
    expect(InvalidationPatterns.referenceCaches()).toMatch(/\*$/)
  })
})
