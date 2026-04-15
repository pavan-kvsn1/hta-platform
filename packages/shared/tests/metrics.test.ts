/**
 * Metrics Unit Tests
 *
 * Tests for the metrics collection utilities:
 * - API request tracking
 * - Database query tracking
 * - Cache operation tracking
 * - Worker job tracking
 * - Authentication event tracking
 * - Custom metric functions
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock Sentry with inline functions to avoid hoisting issues
vi.mock('@sentry/node', () => ({
  metrics: {
    increment: vi.fn(),
    distribution: vi.fn(),
    gauge: vi.fn(),
    set: vi.fn(),
  },
}))

import * as Sentry from '@sentry/node'
const mockMetrics = Sentry.metrics as {
  increment: ReturnType<typeof vi.fn>
  distribution: ReturnType<typeof vi.fn>
  gauge: ReturnType<typeof vi.fn>
  set: ReturnType<typeof vi.fn>
}

import {
  trackApiRequest,
  trackApiError,
  trackDbQuery,
  trackCacheOperation,
  trackJobProcessed,
  trackJobFailed,
  trackQueueDepth,
  trackAuthEvent,
  trackCertificateEvent,
  trackEmailSent,
  trackNotificationSent,
  increment,
  distribution,
  gauge,
  set,
  metrics,
} from '../src/metrics/index.js'

describe('Metrics', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('trackApiRequest', () => {
    it('tracks API request with duration and status', () => {
      trackApiRequest('/api/users', 150, 200, 'GET')

      expect(mockMetrics.distribution).toHaveBeenCalledWith(
        'api.request.duration',
        150,
        expect.objectContaining({
          unit: 'millisecond',
          tags: expect.objectContaining({
            route: '/api/users',
            method: 'GET',
            status: '200',
            status_class: '2xx',
          }),
        })
      )

      expect(mockMetrics.increment).toHaveBeenCalledWith(
        'api.request.count',
        1,
        expect.objectContaining({
          tags: expect.objectContaining({
            route: '/api/users',
            status_class: '2xx',
          }),
        })
      )
    })

    it('categorizes status codes correctly', () => {
      trackApiRequest('/api/error', 50, 500)

      expect(mockMetrics.distribution).toHaveBeenCalledWith(
        'api.request.duration',
        50,
        expect.objectContaining({
          tags: expect.objectContaining({
            status: '500',
            status_class: '5xx',
          }),
        })
      )
    })

    it('defaults method to GET', () => {
      trackApiRequest('/api/test', 100, 200)

      expect(mockMetrics.distribution).toHaveBeenCalledWith(
        'api.request.duration',
        100,
        expect.objectContaining({
          tags: expect.objectContaining({
            method: 'GET',
          }),
        })
      )
    })
  })

  describe('trackApiError', () => {
    it('tracks API errors with type', () => {
      trackApiError('/api/users', 'ValidationError', 'POST')

      expect(mockMetrics.increment).toHaveBeenCalledWith(
        'api.error.count',
        1,
        expect.objectContaining({
          tags: {
            route: '/api/users',
            method: 'POST',
            error_type: 'ValidationError',
          },
        })
      )
    })
  })

  describe('trackDbQuery', () => {
    it('tracks database query with duration', () => {
      trackDbQuery('findMany', 45, 'User', true)

      expect(mockMetrics.distribution).toHaveBeenCalledWith(
        'db.query.duration',
        45,
        expect.objectContaining({
          unit: 'millisecond',
          tags: {
            operation: 'findMany',
            model: 'User',
            success: 'true',
          },
        })
      )

      expect(mockMetrics.increment).toHaveBeenCalledWith(
        'db.query.count',
        1,
        expect.objectContaining({
          tags: {
            operation: 'findMany',
            model: 'User',
            success: 'true',
          },
        })
      )
    })

    it('defaults model to unknown', () => {
      trackDbQuery('count', 10)

      expect(mockMetrics.distribution).toHaveBeenCalledWith(
        'db.query.duration',
        10,
        expect.objectContaining({
          tags: expect.objectContaining({
            model: 'unknown',
          }),
        })
      )
    })

    it('tracks failed queries', () => {
      trackDbQuery('create', 100, 'Certificate', false)

      expect(mockMetrics.increment).toHaveBeenCalledWith(
        'db.query.count',
        1,
        expect.objectContaining({
          tags: expect.objectContaining({
            success: 'false',
          }),
        })
      )
    })
  })

  describe('trackCacheOperation', () => {
    it('tracks cache hit/miss', () => {
      trackCacheOperation('hit', undefined, 'user:123')

      expect(mockMetrics.increment).toHaveBeenCalledWith(
        'cache.operation.count',
        1,
        expect.objectContaining({
          tags: {
            operation: 'hit',
            key_prefix: 'user',
          },
        })
      )
    })

    it('tracks cache operation with duration', () => {
      trackCacheOperation('get', 5, 'session:abc')

      expect(mockMetrics.distribution).toHaveBeenCalledWith(
        'cache.operation.duration',
        5,
        expect.objectContaining({
          unit: 'millisecond',
          tags: {
            operation: 'get',
            key_prefix: 'session',
          },
        })
      )
    })

    it('handles missing key prefix', () => {
      trackCacheOperation('set')

      expect(mockMetrics.increment).toHaveBeenCalledWith(
        'cache.operation.count',
        1,
        expect.objectContaining({
          tags: {
            operation: 'set',
            key_prefix: 'unknown',
          },
        })
      )
    })
  })

  describe('trackJobProcessed', () => {
    it('tracks job processing with duration', () => {
      trackJobProcessed('email:send', 1200, true, 1)

      expect(mockMetrics.distribution).toHaveBeenCalledWith(
        'worker.job.duration',
        1200,
        expect.objectContaining({
          unit: 'millisecond',
          tags: {
            job_type: 'email:send',
            success: 'true',
          },
        })
      )

      expect(mockMetrics.increment).toHaveBeenCalledWith(
        'worker.job.count',
        1,
        expect.objectContaining({
          tags: {
            job_type: 'email:send',
            success: 'true',
            attempts: '1',
          },
        })
      )
    })

    it('tracks failed jobs', () => {
      trackJobProcessed('certificate:process', 500, false, 3)

      expect(mockMetrics.increment).toHaveBeenCalledWith(
        'worker.job.count',
        1,
        expect.objectContaining({
          tags: expect.objectContaining({
            success: 'false',
            attempts: '3',
          }),
        })
      )
    })
  })

  describe('trackJobFailed', () => {
    it('tracks job failure with error type', () => {
      trackJobFailed('email:send', 'SmtpError')

      expect(mockMetrics.increment).toHaveBeenCalledWith(
        'worker.job.failed',
        1,
        expect.objectContaining({
          tags: {
            job_type: 'email:send',
            error_type: 'SmtpError',
          },
        })
      )
    })
  })

  describe('trackQueueDepth', () => {
    it('tracks queue depth gauge', () => {
      trackQueueDepth(42, 'emails')

      expect(mockMetrics.gauge).toHaveBeenCalledWith('worker.queue.depth', 42, {
        tags: { queue: 'emails' },
      })
    })

    it('defaults to default queue', () => {
      trackQueueDepth(10)

      expect(mockMetrics.gauge).toHaveBeenCalledWith('worker.queue.depth', 10, {
        tags: { queue: 'default' },
      })
    })
  })

  describe('trackAuthEvent', () => {
    it('tracks authentication events', () => {
      trackAuthEvent('login', 'credentials', 'admin')

      expect(mockMetrics.increment).toHaveBeenCalledWith(
        'auth.event.count',
        1,
        expect.objectContaining({
          tags: {
            event: 'login',
            provider: 'credentials',
            role: 'admin',
          },
        })
      )
    })

    it('tracks failed login attempts', () => {
      trackAuthEvent('login_failed', 'oauth', undefined)

      expect(mockMetrics.increment).toHaveBeenCalledWith(
        'auth.event.count',
        1,
        expect.objectContaining({
          tags: {
            event: 'login_failed',
            provider: 'oauth',
            role: 'unknown',
          },
        })
      )
    })
  })

  describe('trackCertificateEvent', () => {
    it('tracks certificate workflow events', () => {
      trackCertificateEvent('approved', 'APPROVED')

      expect(mockMetrics.increment).toHaveBeenCalledWith(
        'certificate.event.count',
        1,
        expect.objectContaining({
          tags: {
            event: 'approved',
            status: 'APPROVED',
          },
        })
      )
    })
  })

  describe('trackEmailSent', () => {
    it('tracks email sending with duration', () => {
      trackEmailSent('welcome', true, 250)

      expect(mockMetrics.increment).toHaveBeenCalledWith(
        'email.sent.count',
        1,
        expect.objectContaining({
          tags: {
            template: 'welcome',
            success: 'true',
          },
        })
      )

      expect(mockMetrics.distribution).toHaveBeenCalledWith(
        'email.send.duration',
        250,
        expect.objectContaining({
          unit: 'millisecond',
          tags: { template: 'welcome' },
        })
      )
    })

    it('tracks failed emails', () => {
      trackEmailSent('password-reset', false)

      expect(mockMetrics.increment).toHaveBeenCalledWith(
        'email.sent.count',
        1,
        expect.objectContaining({
          tags: {
            template: 'password-reset',
            success: 'false',
          },
        })
      )
    })
  })

  describe('trackNotificationSent', () => {
    it('tracks notification sending', () => {
      trackNotificationSent('certificate_approved', 'email', true)

      expect(mockMetrics.increment).toHaveBeenCalledWith(
        'notification.sent.count',
        1,
        expect.objectContaining({
          tags: {
            type: 'certificate_approved',
            channel: 'email',
            success: 'true',
          },
        })
      )
    })
  })

  describe('custom metrics', () => {
    it('increment() calls Sentry metrics', () => {
      increment('custom.counter', 5, { env: 'test' })

      expect(mockMetrics.increment).toHaveBeenCalledWith('custom.counter', 5, {
        tags: { env: 'test' },
      })
    })

    it('distribution() calls Sentry metrics', () => {
      distribution('custom.latency', 100, { unit: 'millisecond', tags: { env: 'test' } })

      expect(mockMetrics.distribution).toHaveBeenCalledWith('custom.latency', 100, {
        unit: 'millisecond',
        tags: { env: 'test' },
      })
    })

    it('gauge() calls Sentry metrics', () => {
      gauge('custom.gauge', 42, { env: 'test' })

      expect(mockMetrics.gauge).toHaveBeenCalledWith('custom.gauge', 42, { tags: { env: 'test' } })
    })

    it('set() calls Sentry metrics', () => {
      set('unique.users', 'user-123', { env: 'test' })

      expect(mockMetrics.set).toHaveBeenCalledWith('unique.users', 'user-123', {
        tags: { env: 'test' },
      })
    })
  })

  describe('metrics namespace', () => {
    it('exports all tracking functions', () => {
      expect(metrics.trackApiRequest).toBe(trackApiRequest)
      expect(metrics.trackApiError).toBe(trackApiError)
      expect(metrics.trackDbQuery).toBe(trackDbQuery)
      expect(metrics.trackCacheOperation).toBe(trackCacheOperation)
      expect(metrics.trackJobProcessed).toBe(trackJobProcessed)
      expect(metrics.trackJobFailed).toBe(trackJobFailed)
      expect(metrics.trackQueueDepth).toBe(trackQueueDepth)
      expect(metrics.trackAuthEvent).toBe(trackAuthEvent)
      expect(metrics.trackCertificateEvent).toBe(trackCertificateEvent)
      expect(metrics.trackEmailSent).toBe(trackEmailSent)
      expect(metrics.trackNotificationSent).toBe(trackNotificationSent)
      expect(metrics.increment).toBe(increment)
      expect(metrics.distribution).toBe(distribution)
      expect(metrics.gauge).toBe(gauge)
      expect(metrics.set).toBe(set)
    })
  })
})
