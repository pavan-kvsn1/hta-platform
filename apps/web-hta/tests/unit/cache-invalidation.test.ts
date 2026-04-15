/**
 * Cache Invalidation Unit Tests
 *
 * Tests for the cache invalidation functions:
 * - Event-based invalidation
 * - Entity-specific invalidation (certificates, customers, users)
 * - Session invalidation
 * - Pattern-based cache clearing
 *
 * Migrated from hta-calibration/tests/unit/cache-invalidation.test.ts
 * Self-contained version with mock implementations
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Types
type InvalidationEvent =
  | 'certificate:created'
  | 'certificate:updated'
  | 'certificate:deleted'
  | 'certificate:status_changed'
  | 'customer:created'
  | 'customer:updated'
  | 'customer:deleted'
  | 'user:created'
  | 'user:updated'
  | 'user:deleted'
  | 'session:invalidated'
  | 'session:all_invalidated'
  | 'instrument:created'
  | 'instrument:updated'
  | string

interface EventContext {
  userId?: string
  customerId?: string
}

// Mock cache
const cache = {
  deletePattern: vi.fn<[string], Promise<number>>(),
}

// Event pattern mappings
const EVENT_PATTERNS: Record<string, (id?: string, ctx?: EventContext) => string[]> = {
  'certificate:created': (_, ctx) => [
    'certs:list:*',
    'certs:stats',
    ctx?.userId ? `certs:engineer:${ctx.userId}` : null,
    'dashboard:*',
    'dropdown:reviewers:*',
  ].filter(Boolean) as string[],

  'certificate:updated': (id, ctx) => [
    id ? `cert:${id}` : null,
    'certs:list:*',
    ctx?.userId ? `certs:engineer:${ctx.userId}` : null,
    'dashboard:*',
  ].filter(Boolean) as string[],

  'certificate:deleted': (id, ctx) => [
    id ? `cert:${id}` : null,
    'certs:list:*',
    'certs:stats',
    ctx?.userId ? `certs:engineer:${ctx.userId}` : null,
    'dashboard:*',
  ].filter(Boolean) as string[],

  'certificate:status_changed': (id, ctx) => [
    id ? `cert:${id}` : null,
    'certs:list:*',
    'certs:stats',
    ctx?.userId ? `certs:engineer:${ctx.userId}` : null,
    'dashboard:*',
    'dropdown:reviewers:*',
  ].filter(Boolean) as string[],

  'customer:created': () => ['customers:list:*', 'dropdown:customers'],

  'customer:updated': (id) => [
    id ? `customer:${id}` : null,
    'customers:list:*',
    id ? `dashboard:customer:*` : null,
    'dropdown:customers',
  ].filter(Boolean) as string[],

  'customer:deleted': (id) => [
    id ? `customer:${id}` : null,
    'customers:list:*',
    id ? `dashboard:customer:*` : null,
    'dropdown:customers',
  ].filter(Boolean) as string[],

  'user:created': () => ['dropdown:admins', 'dropdown:reviewers:*'],

  'user:updated': (id) => [
    id ? `user:${id}` : null,
    'dropdown:admins',
    'dropdown:reviewers:*',
    id ? `stats:user:${id}` : null,
  ].filter(Boolean) as string[],

  'user:deleted': (id) => [
    id ? `user:${id}` : null,
    'session:*',
    'dropdown:admins',
    'dropdown:reviewers:*',
  ].filter(Boolean) as string[],

  'session:invalidated': (token) => [token ? `session:${token}` : null].filter(Boolean) as string[],

  'session:all_invalidated': (_, ctx) => [
    ctx?.userId ? `session:*` : null,
    ctx?.userId ? `user:${ctx.userId}` : null,
  ].filter(Boolean) as string[],

  'instrument:created': () => ['dropdown:instruments'],

  'instrument:updated': (id) => [
    id ? `instrument:${id}` : null,
    'dropdown:instruments',
  ].filter(Boolean) as string[],
}

// Invalidation functions
async function invalidateOnEvent(
  event: InvalidationEvent,
  id?: string,
  context?: EventContext
): Promise<number> {
  const patternFn = EVENT_PATTERNS[event]
  if (!patternFn) return 0

  const patterns = patternFn(id, context)
  let total = 0

  for (const pattern of patterns) {
    total += await cache.deletePattern(pattern)
  }

  return total
}

async function invalidateOnCertificateCreate(userId: string): Promise<number> {
  return invalidateOnEvent('certificate:created', undefined, { userId })
}

async function invalidateOnCertificateUpdate(certId: string, userId: string): Promise<number> {
  return invalidateOnEvent('certificate:updated', certId, { userId })
}

async function invalidateOnCertificateStatusChange(certId: string, userId: string): Promise<number> {
  return invalidateOnEvent('certificate:status_changed', certId, { userId })
}

async function invalidateOnCertificateDelete(certId: string, userId: string): Promise<number> {
  return invalidateOnEvent('certificate:deleted', certId, { userId })
}

async function invalidateOnCustomerCreate(): Promise<number> {
  return invalidateOnEvent('customer:created')
}

async function invalidateOnCustomerUpdate(customerId: string): Promise<number> {
  return invalidateOnEvent('customer:updated', customerId)
}

async function invalidateOnUserCreate(): Promise<number> {
  return invalidateOnEvent('user:created')
}

async function invalidateOnUserUpdate(userId: string): Promise<number> {
  return invalidateOnEvent('user:updated', userId)
}

async function invalidateSession(token: string): Promise<number> {
  return invalidateOnEvent('session:invalidated', token)
}

async function invalidateAllUserSessions(userId: string): Promise<number> {
  return invalidateOnEvent('session:all_invalidated', undefined, { userId })
}

async function invalidateOnInstrumentChange(instrumentId?: string): Promise<number> {
  if (instrumentId) {
    return invalidateOnEvent('instrument:updated', instrumentId)
  }
  return invalidateOnEvent('instrument:created')
}

async function clearAllCache(): Promise<number> {
  return cache.deletePattern('*')
}

describe('Cache Invalidation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    cache.deletePattern.mockResolvedValue(1)
  })

  describe('invalidateOnEvent', () => {
    it('should return 0 for unknown event', async () => {
      const result = await invalidateOnEvent('unknown:event')

      expect(result).toBe(0)
      expect(cache.deletePattern).not.toHaveBeenCalled()
    })

    it('should delete patterns for certificate:created event', async () => {
      cache.deletePattern.mockResolvedValue(2)

      const result = await invalidateOnEvent('certificate:created', undefined, { userId: 'user-1' })

      expect(result).toBeGreaterThan(0)
      expect(cache.deletePattern).toHaveBeenCalled()
    })

    it('should delete patterns for certificate:updated event', async () => {
      cache.deletePattern.mockResolvedValue(1)

      const result = await invalidateOnEvent('certificate:updated', 'cert-123', { userId: 'user-1' })

      expect(result).toBeGreaterThan(0)
      const calls = cache.deletePattern.mock.calls.map((c) => c[0])
      expect(calls).toContain('cert:cert-123')
    })

    it('should delete patterns for certificate:deleted event', async () => {
      const result = await invalidateOnEvent('certificate:deleted', 'cert-456', { userId: 'user-2' })

      expect(result).toBeGreaterThan(0)
      const calls = cache.deletePattern.mock.calls.map((c) => c[0])
      expect(calls).toContain('cert:cert-456')
    })

    it('should delete patterns for certificate:status_changed event', async () => {
      const result = await invalidateOnEvent('certificate:status_changed', 'cert-789', {
        userId: 'user-3',
      })

      expect(result).toBeGreaterThan(0)
      const calls = cache.deletePattern.mock.calls.map((c) => c[0])
      expect(calls).toContain('cert:cert-789')
      expect(calls).toContain('dropdown:reviewers:*')
    })

    it('should delete patterns for customer:created event', async () => {
      const result = await invalidateOnEvent('customer:created')

      expect(result).toBeGreaterThan(0)
      const calls = cache.deletePattern.mock.calls.map((c) => c[0])
      expect(calls).toContain('customers:list:*')
      expect(calls).toContain('dropdown:customers')
    })

    it('should delete patterns for customer:updated event', async () => {
      const result = await invalidateOnEvent('customer:updated', 'cust-123')

      expect(result).toBeGreaterThan(0)
      const calls = cache.deletePattern.mock.calls.map((c) => c[0])
      expect(calls).toContain('customer:cust-123')
    })

    it('should delete patterns for customer:deleted event', async () => {
      const result = await invalidateOnEvent('customer:deleted', 'cust-456')

      expect(result).toBeGreaterThan(0)
    })

    it('should delete patterns for user:created event', async () => {
      const result = await invalidateOnEvent('user:created')

      expect(result).toBeGreaterThan(0)
      const calls = cache.deletePattern.mock.calls.map((c) => c[0])
      expect(calls).toContain('dropdown:admins')
      expect(calls).toContain('dropdown:reviewers:*')
    })

    it('should delete patterns for user:updated event', async () => {
      const result = await invalidateOnEvent('user:updated', 'user-123')

      expect(result).toBeGreaterThan(0)
      const calls = cache.deletePattern.mock.calls.map((c) => c[0])
      expect(calls).toContain('user:user-123')
    })

    it('should delete patterns for user:deleted event', async () => {
      const result = await invalidateOnEvent('user:deleted', 'user-456')

      expect(result).toBeGreaterThan(0)
      const calls = cache.deletePattern.mock.calls.map((c) => c[0])
      expect(calls).toContain('user:user-456')
      expect(calls).toContain('session:*')
    })

    it('should delete patterns for session:invalidated event', async () => {
      const result = await invalidateOnEvent('session:invalidated', 'token-abc')

      expect(result).toBeGreaterThan(0)
      const calls = cache.deletePattern.mock.calls.map((c) => c[0])
      expect(calls).toContain('session:token-abc')
    })

    it('should delete patterns for session:all_invalidated event', async () => {
      const result = await invalidateOnEvent('session:all_invalidated', undefined, {
        userId: 'user-789',
      })

      expect(result).toBeGreaterThan(0)
    })

    it('should delete patterns for instrument:created event', async () => {
      const result = await invalidateOnEvent('instrument:created')

      expect(result).toBeGreaterThan(0)
      const calls = cache.deletePattern.mock.calls.map((c) => c[0])
      expect(calls).toContain('dropdown:instruments')
    })

    it('should delete patterns for instrument:updated event', async () => {
      const result = await invalidateOnEvent('instrument:updated', 'inst-123')

      expect(result).toBeGreaterThan(0)
      const calls = cache.deletePattern.mock.calls.map((c) => c[0])
      expect(calls).toContain('instrument:inst-123')
    })

    it('should sum up total deleted entries', async () => {
      cache.deletePattern
        .mockResolvedValueOnce(5)
        .mockResolvedValueOnce(3)
        .mockResolvedValueOnce(2)
        .mockResolvedValueOnce(1)
        .mockResolvedValueOnce(4)

      const result = await invalidateOnEvent('certificate:created', undefined, { userId: 'user-1' })

      expect(result).toBe(15) // 5 + 3 + 2 + 1 + 4
    })

    it('should return 0 when no patterns match anything', async () => {
      cache.deletePattern.mockResolvedValue(0)

      const result = await invalidateOnEvent('customer:created')

      expect(result).toBe(0)
    })
  })

  describe('convenience functions', () => {
    describe('invalidateOnCertificateCreate', () => {
      it('should invalidate certificate creation cache', async () => {
        await invalidateOnCertificateCreate('user-123')

        expect(cache.deletePattern).toHaveBeenCalled()
      })
    })

    describe('invalidateOnCertificateUpdate', () => {
      it('should invalidate specific certificate cache', async () => {
        await invalidateOnCertificateUpdate('cert-123', 'user-456')

        const calls = cache.deletePattern.mock.calls.map((c) => c[0])
        expect(calls).toContain('cert:cert-123')
      })
    })

    describe('invalidateOnCertificateStatusChange', () => {
      it('should invalidate cache on status change', async () => {
        await invalidateOnCertificateStatusChange('cert-789', 'user-123')

        const calls = cache.deletePattern.mock.calls.map((c) => c[0])
        expect(calls).toContain('cert:cert-789')
        expect(calls).toContain('dropdown:reviewers:*')
      })
    })

    describe('invalidateOnCertificateDelete', () => {
      it('should invalidate deleted certificate cache', async () => {
        await invalidateOnCertificateDelete('cert-999', 'user-111')

        const calls = cache.deletePattern.mock.calls.map((c) => c[0])
        expect(calls).toContain('cert:cert-999')
      })
    })

    describe('invalidateOnCustomerCreate', () => {
      it('should invalidate customer list cache', async () => {
        await invalidateOnCustomerCreate()

        const calls = cache.deletePattern.mock.calls.map((c) => c[0])
        expect(calls).toContain('customers:list:*')
        expect(calls).toContain('dropdown:customers')
      })
    })

    describe('invalidateOnCustomerUpdate', () => {
      it('should invalidate specific customer cache', async () => {
        await invalidateOnCustomerUpdate('cust-123')

        const calls = cache.deletePattern.mock.calls.map((c) => c[0])
        expect(calls).toContain('customer:cust-123')
      })
    })

    describe('invalidateOnUserCreate', () => {
      it('should invalidate user-related cache', async () => {
        await invalidateOnUserCreate()

        const calls = cache.deletePattern.mock.calls.map((c) => c[0])
        expect(calls).toContain('dropdown:admins')
        expect(calls).toContain('dropdown:reviewers:*')
      })
    })

    describe('invalidateOnUserUpdate', () => {
      it('should invalidate specific user cache', async () => {
        await invalidateOnUserUpdate('user-555')

        const calls = cache.deletePattern.mock.calls.map((c) => c[0])
        expect(calls).toContain('user:user-555')
      })
    })

    describe('invalidateSession', () => {
      it('should invalidate specific session', async () => {
        await invalidateSession('token-xyz')

        const calls = cache.deletePattern.mock.calls.map((c) => c[0])
        expect(calls).toContain('session:token-xyz')
      })
    })

    describe('invalidateAllUserSessions', () => {
      it('should invalidate all sessions for a user', async () => {
        await invalidateAllUserSessions('user-999')

        expect(cache.deletePattern).toHaveBeenCalled()
      })
    })

    describe('invalidateOnInstrumentChange', () => {
      it('should invalidate instrument update cache when id provided', async () => {
        await invalidateOnInstrumentChange('inst-456')

        const calls = cache.deletePattern.mock.calls.map((c) => c[0])
        expect(calls).toContain('instrument:inst-456')
      })

      it('should invalidate instrument creation cache when no id', async () => {
        await invalidateOnInstrumentChange()

        const calls = cache.deletePattern.mock.calls.map((c) => c[0])
        expect(calls).toContain('dropdown:instruments')
      })
    })

    describe('clearAllCache', () => {
      it('should clear all cache entries', async () => {
        cache.deletePattern.mockResolvedValue(100)

        const result = await clearAllCache()

        expect(result).toBe(100)
        expect(cache.deletePattern).toHaveBeenCalledWith('*')
      })
    })
  })
})
