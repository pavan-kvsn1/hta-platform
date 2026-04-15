/**
 * @hta/shared - Health Check Utilities
 *
 * Provides health, readiness, and liveness checks for Kubernetes deployments.
 *
 * Usage:
 *   import { createHealthChecker, HealthStatus } from '@hta/shared/health'
 *
 *   const health = createHealthChecker('api')
 *   health.addCheck('database', checkDatabase)
 *   health.addCheck('cache', checkCache)
 *
 *   // In route handler
 *   const status = await health.check()
 *
 * Endpoints:
 *   /health  - Full health status with dependency checks
 *   /ready   - Readiness (can accept traffic)
 *   /live    - Liveness (process is running)
 */

export type HealthState = 'healthy' | 'degraded' | 'unhealthy'

export interface CheckResult {
  status: 'ok' | 'error' | 'degraded'
  latency?: number
  message?: string
  error?: string
}

export interface HealthStatus {
  status: HealthState
  service: string
  version: string
  uptime: number
  timestamp: string
  checks: Record<string, CheckResult>
}

export type HealthCheck = () => Promise<CheckResult>

/**
 * Create a health checker instance for a service
 */
export function createHealthChecker(serviceName: string) {
  const checks = new Map<string, HealthCheck>()
  const startTime = Date.now()

  return {
    /**
     * Add a health check
     */
    addCheck(name: string, check: HealthCheck): void {
      checks.set(name, check)
    },

    /**
     * Remove a health check
     */
    removeCheck(name: string): void {
      checks.delete(name)
    },

    /**
     * Run all health checks and return status
     */
    async check(): Promise<HealthStatus> {
      const results: Record<string, CheckResult> = {}
      let overallStatus: HealthState = 'healthy'

      // Run all checks in parallel
      const checkPromises = Array.from(checks.entries()).map(async ([name, check]) => {
        const start = Date.now()
        try {
          const result = await check()
          results[name] = {
            ...result,
            latency: Date.now() - start,
          }

          if (result.status === 'error') {
            overallStatus = 'unhealthy'
          } else if (result.status === 'degraded' && overallStatus !== 'unhealthy') {
            overallStatus = 'degraded'
          }
        } catch (error) {
          results[name] = {
            status: 'error',
            latency: Date.now() - start,
            error: error instanceof Error ? error.message : String(error),
          }
          overallStatus = 'unhealthy'
        }
      })

      await Promise.all(checkPromises)

      return {
        status: overallStatus,
        service: serviceName,
        version: process.env.npm_package_version || '1.0.0',
        uptime: Math.floor((Date.now() - startTime) / 1000),
        timestamp: new Date().toISOString(),
        checks: results,
      }
    },

    /**
     * Simple readiness check (all critical checks pass)
     */
    async isReady(): Promise<boolean> {
      const status = await this.check()
      return status.status !== 'unhealthy'
    },

    /**
     * Simple liveness check (process is responsive)
     */
    isLive(): boolean {
      return true
    },

    /**
     * Get uptime in seconds
     */
    getUptime(): number {
      return Math.floor((Date.now() - startTime) / 1000)
    },
  }
}

// Common health check implementations

/**
 * Create a database health check using Prisma
 */
export function createDatabaseCheck(prisma: { $queryRaw: (query: unknown) => Promise<unknown> }): HealthCheck {
  return async () => {
    try {
      await prisma.$queryRaw`SELECT 1`
      return { status: 'ok' }
    } catch (error) {
      return {
        status: 'error',
        error: error instanceof Error ? error.message : 'Database connection failed',
      }
    }
  }
}

/**
 * Create a cache health check
 */
export function createCacheCheck(cache: {
  ping: () => Promise<boolean>
}): HealthCheck {
  return async () => {
    try {
      const pong = await cache.ping()
      return pong ? { status: 'ok' } : { status: 'error', error: 'Cache ping failed' }
    } catch (error) {
      // Cache failures are degraded, not unhealthy (can operate without cache)
      return {
        status: 'degraded',
        error: error instanceof Error ? error.message : 'Cache connection failed',
      }
    }
  }
}

/**
 * Create a Redis health check
 */
export function createRedisCheck(redis: {
  ping: () => Promise<string>
}): HealthCheck {
  return async () => {
    try {
      const response = await redis.ping()
      return response === 'PONG' ? { status: 'ok' } : { status: 'error', error: 'Unexpected response' }
    } catch (error) {
      return {
        status: 'degraded',
        error: error instanceof Error ? error.message : 'Redis connection failed',
      }
    }
  }
}

/**
 * Create a custom HTTP endpoint health check
 */
export function createHttpCheck(url: string, options?: {
  timeout?: number
  expectedStatus?: number
}): HealthCheck {
  const { timeout = 5000, expectedStatus = 200 } = options || {}

  return async () => {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeout)

    try {
      const response = await fetch(url, {
        method: 'GET',
        signal: controller.signal,
      })
      clearTimeout(timeoutId)

      if (response.status === expectedStatus) {
        return { status: 'ok' }
      }
      return {
        status: 'error',
        error: `Unexpected status: ${response.status}`,
      }
    } catch (error) {
      clearTimeout(timeoutId)
      return {
        status: 'error',
        error: error instanceof Error ? error.message : 'HTTP check failed',
      }
    }
  }
}

/**
 * Create a memory usage check
 */
export function createMemoryCheck(thresholdPercent = 90): HealthCheck {
  return async () => {
    const used = process.memoryUsage()
    const heapUsedPercent = (used.heapUsed / used.heapTotal) * 100

    if (heapUsedPercent > thresholdPercent) {
      return {
        status: 'degraded',
        message: `High memory usage: ${heapUsedPercent.toFixed(1)}%`,
      }
    }

    return {
      status: 'ok',
      message: `Memory usage: ${heapUsedPercent.toFixed(1)}%`,
    }
  }
}

export type HealthChecker = ReturnType<typeof createHealthChecker>
