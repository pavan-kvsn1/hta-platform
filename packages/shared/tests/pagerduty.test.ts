/**
 * PagerDuty Integration Unit Tests
 *
 * Tests for the PagerDuty alerting utilities:
 * - Alert triggering
 * - Alert acknowledgment
 * - Alert resolution
 * - Health check alerts
 * - Error rate alerts
 * - Latency alerts
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock fetch globally
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

// Mock logger
vi.mock('../src/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}))

import {
  isPagerDutyConfigured,
  triggerPagerDutyAlert,
  acknowledgePagerDutyAlert,
  resolvePagerDutyAlert,
  alertOnHealthFailure,
  alertOnHighErrorRate,
  alertOnHighLatency,
} from '../src/alerting/pagerduty'

describe('PagerDuty Integration', () => {
  const originalEnv = process.env

  beforeEach(() => {
    vi.clearAllMocks()
    process.env = { ...originalEnv }
  })

  afterEach(() => {
    process.env = originalEnv
  })

  describe('isPagerDutyConfigured', () => {
    it('returns false when routing key is not set', () => {
      delete process.env.PAGERDUTY_ROUTING_KEY
      expect(isPagerDutyConfigured()).toBe(false)
    })

    it('returns true when routing key is set', () => {
      process.env.PAGERDUTY_ROUTING_KEY = 'test-routing-key'
      expect(isPagerDutyConfigured()).toBe(true)
    })
  })

  describe('triggerPagerDutyAlert', () => {
    it('returns null when routing key is not configured', async () => {
      delete process.env.PAGERDUTY_ROUTING_KEY
      const result = await triggerPagerDutyAlert('Test alert', 'error')
      expect(result).toBeNull()
      expect(mockFetch).not.toHaveBeenCalled()
    })

    it('sends alert to PagerDuty API', async () => {
      process.env.PAGERDUTY_ROUTING_KEY = 'test-key'
      process.env.SERVICE_NAME = 'api'
      process.env.NODE_ENV = 'production'

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ status: 'success', dedup_key: 'abc123', message: 'OK' }),
      })

      const result = await triggerPagerDutyAlert('Test alert', 'critical', { userId: '123' })

      expect(mockFetch).toHaveBeenCalledWith(
        'https://events.pagerduty.com/v2/enqueue',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        })
      )

      const body = JSON.parse(mockFetch.mock.calls[0][1].body)
      expect(body.routing_key).toBe('test-key')
      expect(body.event_action).toBe('trigger')
      expect(body.payload.summary).toBe('Test alert')
      expect(body.payload.severity).toBe('critical')
      expect(body.payload.source).toBe('hta-calibr8s-api-production')
      expect(body.payload.custom_details).toEqual({ userId: '123' })

      expect(result).toEqual({ status: 'success', dedup_key: 'abc123', message: 'OK' })
    })

    it('includes dedup key when provided', async () => {
      process.env.PAGERDUTY_ROUTING_KEY = 'test-key'
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ status: 'success', dedup_key: 'custom-key', message: 'OK' }),
      })

      await triggerPagerDutyAlert('Test', 'warning', undefined, { dedupKey: 'custom-key' })

      const body = JSON.parse(mockFetch.mock.calls[0][1].body)
      expect(body.dedup_key).toBe('custom-key')
    })

    it('throws on API error', async () => {
      process.env.PAGERDUTY_ROUTING_KEY = 'test-key'
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        text: () => Promise.resolve('Internal Server Error'),
      })

      await expect(triggerPagerDutyAlert('Test', 'error')).rejects.toThrow('PagerDuty API error')
    })
  })

  describe('acknowledgePagerDutyAlert', () => {
    it('returns null when routing key is not configured', async () => {
      delete process.env.PAGERDUTY_ROUTING_KEY
      const result = await acknowledgePagerDutyAlert('dedup-key')
      expect(result).toBeNull()
    })

    it('sends acknowledge event', async () => {
      process.env.PAGERDUTY_ROUTING_KEY = 'test-key'
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ status: 'success', dedup_key: 'abc', message: 'OK' }),
      })

      await acknowledgePagerDutyAlert('test-dedup')

      const body = JSON.parse(mockFetch.mock.calls[0][1].body)
      expect(body.event_action).toBe('acknowledge')
      expect(body.dedup_key).toBe('test-dedup')
    })
  })

  describe('resolvePagerDutyAlert', () => {
    it('returns null when routing key is not configured', async () => {
      delete process.env.PAGERDUTY_ROUTING_KEY
      const result = await resolvePagerDutyAlert('dedup-key')
      expect(result).toBeNull()
    })

    it('sends resolve event', async () => {
      process.env.PAGERDUTY_ROUTING_KEY = 'test-key'
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ status: 'success', dedup_key: 'abc', message: 'OK' }),
      })

      await resolvePagerDutyAlert('test-dedup')

      const body = JSON.parse(mockFetch.mock.calls[0][1].body)
      expect(body.event_action).toBe('resolve')
      expect(body.dedup_key).toBe('test-dedup')
    })
  })

  describe('alertOnHealthFailure', () => {
    it('does nothing when all checks pass', async () => {
      process.env.PAGERDUTY_ROUTING_KEY = 'test-key'

      await alertOnHealthFailure('api', {
        database: { status: 'ok' },
        cache: { status: 'ok' },
      })

      expect(mockFetch).not.toHaveBeenCalled()
    })

    it('triggers alert when checks fail', async () => {
      process.env.PAGERDUTY_ROUTING_KEY = 'test-key'
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ status: 'success', dedup_key: 'abc', message: 'OK' }),
      })

      await alertOnHealthFailure('api', {
        database: { status: 'error', error: 'Connection refused' },
        cache: { status: 'ok' },
      })

      expect(mockFetch).toHaveBeenCalled()
      const body = JSON.parse(mockFetch.mock.calls[0][1].body)
      expect(body.payload.summary).toContain('api: Health check failed')
      expect(body.payload.summary).toContain('database')
      expect(body.dedup_key).toBe('health-api-database')
    })

    it('includes multiple failed checks in alert', async () => {
      process.env.PAGERDUTY_ROUTING_KEY = 'test-key'
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ status: 'success', dedup_key: 'abc', message: 'OK' }),
      })

      await alertOnHealthFailure('worker', {
        database: { status: 'error', error: 'Timeout' },
        cache: { status: 'error', error: 'Disconnected' },
        memory: { status: 'ok' },
      })

      const body = JSON.parse(mockFetch.mock.calls[0][1].body)
      expect(body.payload.summary).toContain('database')
      expect(body.payload.summary).toContain('cache')
      expect(body.dedup_key).toBe('health-worker-cache-database')
    })
  })

  describe('alertOnHighErrorRate', () => {
    it('does nothing when error rate is below threshold', async () => {
      process.env.PAGERDUTY_ROUTING_KEY = 'test-key'

      await alertOnHighErrorRate('api', 0.02, 0.05, '5m')

      expect(mockFetch).not.toHaveBeenCalled()
    })

    it('triggers alert when error rate exceeds threshold', async () => {
      process.env.PAGERDUTY_ROUTING_KEY = 'test-key'
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ status: 'success', dedup_key: 'abc', message: 'OK' }),
      })

      await alertOnHighErrorRate('api', 0.08, 0.05, '5m')

      const body = JSON.parse(mockFetch.mock.calls[0][1].body)
      expect(body.payload.summary).toContain('8.0%')
      expect(body.payload.severity).toBe('error')
    })

    it('uses critical severity for very high error rates', async () => {
      process.env.PAGERDUTY_ROUTING_KEY = 'test-key'
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ status: 'success', dedup_key: 'abc', message: 'OK' }),
      })

      await alertOnHighErrorRate('api', 0.15, 0.05, '5m')

      const body = JSON.parse(mockFetch.mock.calls[0][1].body)
      expect(body.payload.severity).toBe('critical')
    })
  })

  describe('alertOnHighLatency', () => {
    it('does nothing when latency is below threshold', async () => {
      process.env.PAGERDUTY_ROUTING_KEY = 'test-key'

      await alertOnHighLatency('api', 100, 200, 'p95')

      expect(mockFetch).not.toHaveBeenCalled()
    })

    it('triggers warning for moderate latency', async () => {
      process.env.PAGERDUTY_ROUTING_KEY = 'test-key'
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ status: 'success', dedup_key: 'abc', message: 'OK' }),
      })

      await alertOnHighLatency('api', 300, 200, 'p95')

      const body = JSON.parse(mockFetch.mock.calls[0][1].body)
      expect(body.payload.summary).toContain('300ms')
      expect(body.payload.severity).toBe('warning')
    })

    it('triggers critical for very high latency', async () => {
      process.env.PAGERDUTY_ROUTING_KEY = 'test-key'
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ status: 'success', dedup_key: 'abc', message: 'OK' }),
      })

      await alertOnHighLatency('api', 500, 200, 'p95')

      const body = JSON.parse(mockFetch.mock.calls[0][1].body)
      expect(body.payload.severity).toBe('critical')
    })
  })
})
