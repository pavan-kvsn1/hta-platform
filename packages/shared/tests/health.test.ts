/**
 * Health Check Unit Tests
 *
 * Tests for the health check utilities:
 * - Health checker creation and management
 * - Running health checks
 * - Readiness and liveness checks
 * - Common check implementations
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  createHealthChecker,
  createDatabaseCheck,
  createCacheCheck,
  createMemoryCheck,
  createHttpCheck,
  type HealthCheck,
} from '../src/health'

describe('createHealthChecker', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('basic functionality', () => {
    it('creates a health checker with service name', async () => {
      const health = createHealthChecker('test-service')
      const status = await health.check()

      expect(status.service).toBe('test-service')
      expect(status.status).toBe('healthy')
      expect(status.version).toBeDefined()
      expect(status.timestamp).toBeDefined()
    })

    it('returns healthy status with no checks', async () => {
      const health = createHealthChecker('test')
      const status = await health.check()

      expect(status.status).toBe('healthy')
      expect(status.checks).toEqual({})
    })

    it('tracks uptime correctly', async () => {
      const health = createHealthChecker('test')
      const uptime = health.getUptime()

      expect(uptime).toBeGreaterThanOrEqual(0)
    })

    it('isLive always returns true', () => {
      const health = createHealthChecker('test')
      expect(health.isLive()).toBe(true)
    })
  })

  describe('adding and removing checks', () => {
    it('adds a health check', async () => {
      const health = createHealthChecker('test')
      const mockCheck: HealthCheck = vi.fn().mockResolvedValue({ status: 'ok' })

      health.addCheck('database', mockCheck)
      const status = await health.check()

      expect(mockCheck).toHaveBeenCalled()
      expect(status.checks.database).toBeDefined()
      expect(status.checks.database.status).toBe('ok')
    })

    it('removes a health check', async () => {
      const health = createHealthChecker('test')
      const mockCheck: HealthCheck = vi.fn().mockResolvedValue({ status: 'ok' })

      health.addCheck('database', mockCheck)
      health.removeCheck('database')
      const status = await health.check()

      expect(mockCheck).not.toHaveBeenCalled()
      expect(status.checks.database).toBeUndefined()
    })
  })

  describe('check execution', () => {
    it('runs multiple checks in parallel', async () => {
      const health = createHealthChecker('test')
      const order: string[] = []

      const check1: HealthCheck = vi.fn().mockImplementation(async () => {
        order.push('check1-start')
        await new Promise((r) => setTimeout(r, 10))
        order.push('check1-end')
        return { status: 'ok' }
      })

      const check2: HealthCheck = vi.fn().mockImplementation(async () => {
        order.push('check2-start')
        await new Promise((r) => setTimeout(r, 5))
        order.push('check2-end')
        return { status: 'ok' }
      })

      health.addCheck('check1', check1)
      health.addCheck('check2', check2)
      await health.check()

      // Both should start before either ends (parallel execution)
      expect(order.indexOf('check1-start')).toBeLessThan(order.indexOf('check1-end'))
      expect(order.indexOf('check2-start')).toBeLessThan(order.indexOf('check2-end'))
    })

    it('includes latency in check results', async () => {
      const health = createHealthChecker('test')
      const mockCheck: HealthCheck = vi.fn().mockImplementation(async () => {
        await new Promise((r) => setTimeout(r, 10))
        return { status: 'ok' }
      })

      health.addCheck('slow-check', mockCheck)
      const status = await health.check()

      expect(status.checks['slow-check'].latency).toBeGreaterThanOrEqual(10)
    })
  })

  describe('status determination', () => {
    it('returns healthy when all checks pass', async () => {
      const health = createHealthChecker('test')
      health.addCheck('db', async () => ({ status: 'ok' }))
      health.addCheck('cache', async () => ({ status: 'ok' }))

      const status = await health.check()
      expect(status.status).toBe('healthy')
    })

    it('returns degraded when a check is degraded', async () => {
      const health = createHealthChecker('test')
      health.addCheck('db', async () => ({ status: 'ok' }))
      health.addCheck('cache', async () => ({ status: 'degraded', message: 'Slow' }))

      const status = await health.check()
      expect(status.status).toBe('degraded')
    })

    it('returns unhealthy when a check fails', async () => {
      const health = createHealthChecker('test')
      health.addCheck('db', async () => ({ status: 'error', error: 'Connection failed' }))
      health.addCheck('cache', async () => ({ status: 'ok' }))

      const status = await health.check()
      expect(status.status).toBe('unhealthy')
    })

    it('returns unhealthy when a check throws', async () => {
      const health = createHealthChecker('test')
      health.addCheck('db', async () => {
        throw new Error('Connection failed')
      })

      const status = await health.check()
      expect(status.status).toBe('unhealthy')
      expect(status.checks.db.error).toContain('Connection failed')
    })

    it('unhealthy takes precedence over degraded', async () => {
      const health = createHealthChecker('test')
      health.addCheck('degraded', async () => ({ status: 'degraded' }))
      health.addCheck('error', async () => ({ status: 'error' }))

      const status = await health.check()
      expect(status.status).toBe('unhealthy')
    })
  })

  describe('isReady', () => {
    it('returns true when healthy', async () => {
      const health = createHealthChecker('test')
      health.addCheck('db', async () => ({ status: 'ok' }))

      expect(await health.isReady()).toBe(true)
    })

    it('returns true when degraded', async () => {
      const health = createHealthChecker('test')
      health.addCheck('cache', async () => ({ status: 'degraded' }))

      expect(await health.isReady()).toBe(true)
    })

    it('returns false when unhealthy', async () => {
      const health = createHealthChecker('test')
      health.addCheck('db', async () => ({ status: 'error' }))

      expect(await health.isReady()).toBe(false)
    })
  })
})

describe('createDatabaseCheck', () => {
  it('returns ok when query succeeds', async () => {
    const mockPrisma = {
      $queryRaw: vi.fn().mockResolvedValue([{ '?column?': 1 }]),
    }

    const check = createDatabaseCheck(mockPrisma)
    const result = await check()

    expect(result.status).toBe('ok')
    expect(mockPrisma.$queryRaw).toHaveBeenCalled()
  })

  it('returns error when query fails', async () => {
    const mockPrisma = {
      $queryRaw: vi.fn().mockRejectedValue(new Error('Connection refused')),
    }

    const check = createDatabaseCheck(mockPrisma)
    const result = await check()

    expect(result.status).toBe('error')
    expect(result.error).toContain('Connection refused')
  })
})

describe('createCacheCheck', () => {
  it('returns ok when ping succeeds', async () => {
    const mockCache = {
      ping: vi.fn().mockResolvedValue(true),
    }

    const check = createCacheCheck(mockCache)
    const result = await check()

    expect(result.status).toBe('ok')
  })

  it('returns degraded when ping fails (cache is optional)', async () => {
    const mockCache = {
      ping: vi.fn().mockRejectedValue(new Error('Cache unavailable')),
    }

    const check = createCacheCheck(mockCache)
    const result = await check()

    expect(result.status).toBe('degraded')
    expect(result.error).toContain('Cache')
  })
})

describe('createMemoryCheck', () => {
  it('returns ok when memory usage is below threshold', async () => {
    const check = createMemoryCheck(99) // 99% threshold
    const result = await check()

    expect(result.status).toBe('ok')
    expect(result.message).toContain('Memory usage')
  })

  it('returns degraded when memory usage exceeds threshold', async () => {
    const check = createMemoryCheck(0) // 0% threshold (always exceeds)
    const result = await check()

    expect(result.status).toBe('degraded')
    expect(result.message).toContain('High memory')
  })
})

describe('createHttpCheck', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  it('returns ok when endpoint returns expected status', async () => {
    vi.mocked(fetch).mockResolvedValue({ status: 200 } as Response)

    const check = createHttpCheck('http://example.com/health')
    const result = await check()

    expect(result.status).toBe('ok')
  })

  it('returns error when endpoint returns unexpected status', async () => {
    vi.mocked(fetch).mockResolvedValue({ status: 503 } as Response)

    const check = createHttpCheck('http://example.com/health')
    const result = await check()

    expect(result.status).toBe('error')
    expect(result.error).toContain('503')
  })

  it('returns error when request fails', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('Network error'))

    const check = createHttpCheck('http://example.com/health')
    const result = await check()

    expect(result.status).toBe('error')
    expect(result.error).toContain('Network error')
  })

  it('supports custom expected status', async () => {
    vi.mocked(fetch).mockResolvedValue({ status: 204 } as Response)

    const check = createHttpCheck('http://example.com/health', { expectedStatus: 204 })
    const result = await check()

    expect(result.status).toBe('ok')
  })
})
