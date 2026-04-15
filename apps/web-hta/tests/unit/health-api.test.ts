/**
 * Health API Unit Tests
 *
 * Tests for the health check API endpoint:
 * - Response structure
 * - Status reporting
 * - Version and uptime information
 *
 * Migrated from hta-calibration/src/app/api/__tests__/health.test.ts
 * Self-contained version with mock implementations
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Types
interface HealthResponse {
  status: 'healthy' | 'unhealthy' | 'degraded'
  timestamp: string
  environment: string
  version: string
  uptime: number
  checks?: {
    database?: { status: string; latency?: number }
    cache?: { status: string; latency?: number }
    storage?: { status: string }
  }
}

// Mock process.uptime
const mockUptime = 3600 // 1 hour in seconds

// Health check logic
function createHealthResponse(
  overrides: Partial<HealthResponse> = {}
): HealthResponse {
  return {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    version: process.env.npm_package_version || '1.0.0',
    uptime: mockUptime,
    ...overrides,
  }
}

function getHealthStatus(checks: HealthResponse['checks']): 'healthy' | 'unhealthy' | 'degraded' {
  if (!checks) return 'healthy'

  const checkResults = Object.values(checks)

  // If any check is unhealthy, return unhealthy
  if (checkResults.some((c) => c?.status === 'unhealthy')) {
    return 'unhealthy'
  }

  // If any check is degraded, return degraded
  if (checkResults.some((c) => c?.status === 'degraded')) {
    return 'degraded'
  }

  return 'healthy'
}

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)

  if (days > 0) {
    return `${days}d ${hours}h ${minutes}m`
  }
  if (hours > 0) {
    return `${hours}h ${minutes}m`
  }
  return `${minutes}m`
}

// Mock API response handler
async function GET(): Promise<{ status: number; body: HealthResponse }> {
  const response = createHealthResponse()
  return {
    status: 200,
    body: response,
  }
}

async function GETWithChecks(
  checks: HealthResponse['checks']
): Promise<{ status: number; body: HealthResponse }> {
  const status = getHealthStatus(checks)
  const httpStatus = status === 'unhealthy' ? 503 : 200

  const response = createHealthResponse({ status, checks })
  return {
    status: httpStatus,
    body: response,
  }
}

describe('GET /api/health', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2024-01-15T10:00:00.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('should return healthy status', async () => {
    const { status, body } = await GET()

    expect(status).toBe(200)
    expect(body.status).toBe('healthy')
    expect(body.timestamp).toBe('2024-01-15T10:00:00.000Z')
    expect(body.environment).toBeDefined()
    expect(typeof body.uptime).toBe('number')
  })

  it('should include version information', async () => {
    const { body } = await GET()

    expect(body.version).toBeDefined()
    expect(typeof body.version).toBe('string')
  })

  it('should include uptime information', async () => {
    const { body } = await GET()

    expect(body.uptime).toBe(3600)
  })
})

describe('Health Status Calculation', () => {
  it('should return healthy when no checks provided', () => {
    expect(getHealthStatus(undefined)).toBe('healthy')
  })

  it('should return healthy when all checks pass', () => {
    const checks = {
      database: { status: 'healthy', latency: 5 },
      cache: { status: 'healthy', latency: 1 },
      storage: { status: 'healthy' },
    }
    expect(getHealthStatus(checks)).toBe('healthy')
  })

  it('should return degraded when any check is degraded', () => {
    const checks = {
      database: { status: 'healthy', latency: 5 },
      cache: { status: 'degraded', latency: 100 },
    }
    expect(getHealthStatus(checks)).toBe('degraded')
  })

  it('should return unhealthy when any check is unhealthy', () => {
    const checks = {
      database: { status: 'unhealthy' },
      cache: { status: 'healthy' },
    }
    expect(getHealthStatus(checks)).toBe('unhealthy')
  })

  it('should prioritize unhealthy over degraded', () => {
    const checks = {
      database: { status: 'unhealthy' },
      cache: { status: 'degraded' },
    }
    expect(getHealthStatus(checks)).toBe('unhealthy')
  })
})

describe('Health API with Checks', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2024-01-15T10:00:00.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('should return 200 for healthy checks', async () => {
    const checks = {
      database: { status: 'healthy', latency: 5 },
    }
    const { status, body } = await GETWithChecks(checks)

    expect(status).toBe(200)
    expect(body.status).toBe('healthy')
    expect(body.checks).toEqual(checks)
  })

  it('should return 200 for degraded checks', async () => {
    const checks = {
      cache: { status: 'degraded', latency: 500 },
    }
    const { status, body } = await GETWithChecks(checks)

    expect(status).toBe(200)
    expect(body.status).toBe('degraded')
  })

  it('should return 503 for unhealthy checks', async () => {
    const checks = {
      database: { status: 'unhealthy' },
    }
    const { status, body } = await GETWithChecks(checks)

    expect(status).toBe(503)
    expect(body.status).toBe('unhealthy')
  })
})

describe('Uptime Formatting', () => {
  it('should format minutes only', () => {
    expect(formatUptime(300)).toBe('5m')
    expect(formatUptime(59 * 60)).toBe('59m')
  })

  it('should format hours and minutes', () => {
    expect(formatUptime(3600)).toBe('1h 0m')
    expect(formatUptime(3660)).toBe('1h 1m')
    expect(formatUptime(7200)).toBe('2h 0m')
  })

  it('should format days, hours and minutes', () => {
    expect(formatUptime(86400)).toBe('1d 0h 0m')
    expect(formatUptime(90000)).toBe('1d 1h 0m')
    expect(formatUptime(172800)).toBe('2d 0h 0m')
  })

  it('should handle zero uptime', () => {
    expect(formatUptime(0)).toBe('0m')
  })
})

describe('Health Response Structure', () => {
  it('should have all required fields', () => {
    const response = createHealthResponse()

    expect(response).toHaveProperty('status')
    expect(response).toHaveProperty('timestamp')
    expect(response).toHaveProperty('environment')
    expect(response).toHaveProperty('version')
    expect(response).toHaveProperty('uptime')
  })

  it('should allow overrides', () => {
    const response = createHealthResponse({
      status: 'degraded',
      version: '2.0.0',
    })

    expect(response.status).toBe('degraded')
    expect(response.version).toBe('2.0.0')
  })
})
