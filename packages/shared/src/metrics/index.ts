/**
 * @hta/shared - Metrics Collection
 *
 * Provides custom metrics tracking using Sentry's metrics API.
 * Falls back gracefully when Sentry is not configured.
 *
 * Usage:
 *   import { metrics } from '@hta/shared/metrics'
 *
 *   metrics.trackApiRequest('/api/certificates', 150, 200)
 *   metrics.trackDbQuery('findMany', 45)
 *   metrics.trackJobProcessed('email:send', 1200, true)
 *
 * Metric Types:
 *   - increment: Counter (e.g., request count)
 *   - distribution: Histogram (e.g., latency)
 *   - gauge: Point-in-time value (e.g., queue depth)
 *   - set: Unique values (e.g., unique users)
 */

import * as Sentry from '@sentry/node'

// Check if Sentry metrics are available
const metricsEnabled = (): boolean => {
  try {
    return typeof Sentry.metrics?.increment === 'function'
  } catch {
    return false
  }
}

/**
 * API request metrics
 */
export function trackApiRequest(
  route: string,
  durationMs: number,
  statusCode: number,
  method = 'GET'
): void {
  if (!metricsEnabled()) return

  const statusClass = `${Math.floor(statusCode / 100)}xx`

  Sentry.metrics.distribution('api.request.duration', durationMs, {
    unit: 'millisecond',
    tags: { route, method, status: String(statusCode), status_class: statusClass },
  })

  Sentry.metrics.increment('api.request.count', 1, {
    tags: { route, method, status: String(statusCode), status_class: statusClass },
  })
}

/**
 * API error metrics
 */
export function trackApiError(route: string, errorType: string, method = 'GET'): void {
  if (!metricsEnabled()) return

  Sentry.metrics.increment('api.error.count', 1, {
    tags: { route, method, error_type: errorType },
  })
}

/**
 * Database query metrics
 */
export function trackDbQuery(
  operation: string,
  durationMs: number,
  model?: string,
  success = true
): void {
  if (!metricsEnabled()) return

  Sentry.metrics.distribution('db.query.duration', durationMs, {
    unit: 'millisecond',
    tags: { operation, model: model || 'unknown', success: String(success) },
  })

  Sentry.metrics.increment('db.query.count', 1, {
    tags: { operation, model: model || 'unknown', success: String(success) },
  })
}

/**
 * Cache operation metrics
 */
export function trackCacheOperation(
  operation: 'get' | 'set' | 'delete' | 'hit' | 'miss',
  durationMs?: number,
  key?: string
): void {
  if (!metricsEnabled()) return

  const keyPrefix = key ? key.split(':')[0] : 'unknown'

  Sentry.metrics.increment('cache.operation.count', 1, {
    tags: { operation, key_prefix: keyPrefix },
  })

  if (durationMs !== undefined) {
    Sentry.metrics.distribution('cache.operation.duration', durationMs, {
      unit: 'millisecond',
      tags: { operation, key_prefix: keyPrefix },
    })
  }
}

/**
 * Worker job metrics
 */
export function trackJobProcessed(
  jobType: string,
  durationMs: number,
  success: boolean,
  attempts = 1
): void {
  if (!metricsEnabled()) return

  Sentry.metrics.distribution('worker.job.duration', durationMs, {
    unit: 'millisecond',
    tags: { job_type: jobType, success: String(success) },
  })

  Sentry.metrics.increment('worker.job.count', 1, {
    tags: { job_type: jobType, success: String(success), attempts: String(attempts) },
  })
}

/**
 * Worker job failure metrics
 */
export function trackJobFailed(jobType: string, errorType: string): void {
  if (!metricsEnabled()) return

  Sentry.metrics.increment('worker.job.failed', 1, {
    tags: { job_type: jobType, error_type: errorType },
  })
}

/**
 * Queue depth gauge (call periodically)
 */
export function trackQueueDepth(depth: number, queueName = 'default'): void {
  if (!metricsEnabled()) return

  Sentry.metrics.gauge('worker.queue.depth', depth, {
    tags: { queue: queueName },
  })
}

/**
 * Authentication metrics
 */
export function trackAuthEvent(
  event: 'login' | 'logout' | 'token_refresh' | 'login_failed',
  provider: string,
  userRole?: string
): void {
  if (!metricsEnabled()) return

  Sentry.metrics.increment('auth.event.count', 1, {
    tags: { event, provider, role: userRole || 'unknown' },
  })
}

/**
 * Certificate workflow metrics
 */
export function trackCertificateEvent(
  event: 'created' | 'submitted' | 'approved' | 'rejected' | 'revision_requested',
  status?: string
): void {
  if (!metricsEnabled()) return

  Sentry.metrics.increment('certificate.event.count', 1, {
    tags: { event, status: status || 'unknown' },
  })
}

/**
 * Email send metrics
 */
export function trackEmailSent(template: string, success: boolean, durationMs?: number): void {
  if (!metricsEnabled()) return

  Sentry.metrics.increment('email.sent.count', 1, {
    tags: { template, success: String(success) },
  })

  if (durationMs !== undefined) {
    Sentry.metrics.distribution('email.send.duration', durationMs, {
      unit: 'millisecond',
      tags: { template },
    })
  }
}

/**
 * Notification metrics
 */
export function trackNotificationSent(type: string, channel: string, success: boolean): void {
  if (!metricsEnabled()) return

  Sentry.metrics.increment('notification.sent.count', 1, {
    tags: { type, channel, success: String(success) },
  })
}

/**
 * Custom metric - increment a counter
 */
export function increment(name: string, value = 1, tags?: Record<string, string>): void {
  if (!metricsEnabled()) return

  Sentry.metrics.increment(name, value, { tags })
}

/**
 * Custom metric - record a distribution value
 */
export function distribution(
  name: string,
  value: number,
  options?: { unit?: string; tags?: Record<string, string> }
): void {
  if (!metricsEnabled()) return

  Sentry.metrics.distribution(name, value, {
    unit: options?.unit || 'none',
    tags: options?.tags,
  })
}

/**
 * Custom metric - set a gauge value
 */
export function gauge(name: string, value: number, tags?: Record<string, string>): void {
  if (!metricsEnabled()) return

  Sentry.metrics.gauge(name, value, { tags })
}

/**
 * Custom metric - track unique values
 */
export function set(name: string, value: string | number, tags?: Record<string, string>): void {
  if (!metricsEnabled()) return

  Sentry.metrics.set(name, value, { tags })
}

// Export as namespace for convenience
export const metrics = {
  // API
  trackApiRequest,
  trackApiError,

  // Database
  trackDbQuery,

  // Cache
  trackCacheOperation,

  // Worker
  trackJobProcessed,
  trackJobFailed,
  trackQueueDepth,

  // Auth
  trackAuthEvent,

  // Business
  trackCertificateEvent,
  trackEmailSent,
  trackNotificationSent,

  // Custom
  increment,
  distribution,
  gauge,
  set,
}

export default metrics
