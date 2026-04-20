/**
 * @hta/shared - PagerDuty Integration
 *
 * Provides PagerDuty alerting via Events API v2.
 * Used for critical alerts that require immediate attention.
 *
 * Usage:
 *   import { triggerPagerDutyAlert, resolvePagerDutyAlert } from '@hta/shared/alerting'
 *
 *   await triggerPagerDutyAlert('Database connection failed', 'critical', { service: 'api' })
 *   await resolvePagerDutyAlert('db-connection-api')
 */

import { createLogger } from '../logger/index.js'

const logger = createLogger('pagerduty')

const PAGERDUTY_EVENTS_URL = 'https://events.pagerduty.com/v2/enqueue'

export type AlertSeverity = 'critical' | 'error' | 'warning' | 'info'

export interface PagerDutyEvent {
  routing_key: string
  event_action: 'trigger' | 'acknowledge' | 'resolve'
  dedup_key?: string
  payload?: {
    summary: string
    severity: AlertSeverity
    source: string
    timestamp?: string
    component?: string
    group?: string
    class?: string
    custom_details?: Record<string, unknown>
  }
  links?: Array<{ href: string; text: string }>
  images?: Array<{ src: string; href?: string; alt?: string }>
}

export interface PagerDutyResponse {
  status: string
  message: string
  dedup_key: string
}

/**
 * Check if PagerDuty is configured
 */
export function isPagerDutyConfigured(): boolean {
  return !!process.env.PAGERDUTY_ROUTING_KEY
}

/**
 * Get the service source name for PagerDuty events
 */
function getServiceSource(): string {
  const serviceName = process.env.SERVICE_NAME || 'unknown'
  const env = process.env.NODE_ENV || 'development'
  return `hta-calibr8s-${serviceName}-${env}`
}

/**
 * Trigger a PagerDuty alert
 */
export async function triggerPagerDutyAlert(
  summary: string,
  severity: AlertSeverity,
  details?: Record<string, unknown>,
  options?: {
    dedupKey?: string
    component?: string
    group?: string
    links?: Array<{ href: string; text: string }>
  }
): Promise<PagerDutyResponse | null> {
  const routingKey = process.env.PAGERDUTY_ROUTING_KEY

  if (!routingKey) {
    logger.warn('PagerDuty routing key not configured, skipping alert')
    return null
  }

  const event: PagerDutyEvent = {
    routing_key: routingKey,
    event_action: 'trigger',
    dedup_key: options?.dedupKey,
    payload: {
      summary,
      severity,
      source: getServiceSource(),
      timestamp: new Date().toISOString(),
      component: options?.component,
      group: options?.group,
      custom_details: details,
    },
    links: options?.links,
  }

  try {
    const response = await fetch(PAGERDUTY_EVENTS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(event),
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`PagerDuty API error: ${response.status} - ${errorText}`)
    }

    const result = (await response.json()) as PagerDutyResponse
    logger.info({ summary, severity, dedupKey: result.dedup_key }, 'PagerDuty alert triggered')
    return result
  } catch (error) {
    logger.error({ err: error, summary, severity }, 'Failed to trigger PagerDuty alert')
    throw error
  }
}

/**
 * Acknowledge a PagerDuty alert
 */
export async function acknowledgePagerDutyAlert(
  dedupKey: string
): Promise<PagerDutyResponse | null> {
  const routingKey = process.env.PAGERDUTY_ROUTING_KEY

  if (!routingKey) {
    logger.warn('PagerDuty routing key not configured')
    return null
  }

  const event: PagerDutyEvent = {
    routing_key: routingKey,
    event_action: 'acknowledge',
    dedup_key: dedupKey,
  }

  try {
    const response = await fetch(PAGERDUTY_EVENTS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(event),
    })

    if (!response.ok) {
      throw new Error(`PagerDuty API error: ${response.status}`)
    }

    const result = (await response.json()) as PagerDutyResponse
    logger.info({ dedupKey }, 'PagerDuty alert acknowledged')
    return result
  } catch (error) {
    logger.error({ err: error, dedupKey }, 'Failed to acknowledge PagerDuty alert')
    throw error
  }
}

/**
 * Resolve a PagerDuty alert
 */
export async function resolvePagerDutyAlert(dedupKey: string): Promise<PagerDutyResponse | null> {
  const routingKey = process.env.PAGERDUTY_ROUTING_KEY

  if (!routingKey) {
    logger.warn('PagerDuty routing key not configured')
    return null
  }

  const event: PagerDutyEvent = {
    routing_key: routingKey,
    event_action: 'resolve',
    dedup_key: dedupKey,
  }

  try {
    const response = await fetch(PAGERDUTY_EVENTS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(event),
    })

    if (!response.ok) {
      throw new Error(`PagerDuty API error: ${response.status}`)
    }

    const result = (await response.json()) as PagerDutyResponse
    logger.info({ dedupKey }, 'PagerDuty alert resolved')
    return result
  } catch (error) {
    logger.error({ err: error, dedupKey }, 'Failed to resolve PagerDuty alert')
    throw error
  }
}

/**
 * Alert on health check failure - triggers PagerDuty for critical checks
 */
export async function alertOnHealthFailure(
  service: string,
  checks: Record<string, { status: string; error?: string }>
): Promise<void> {
  const failedChecks = Object.entries(checks)
    .filter(([, v]) => v.status === 'error')
    .map(([k, v]) => ({ name: k, error: v.error }))

  if (failedChecks.length === 0) {
    return
  }

  const checkNames = failedChecks.map((c) => c.name).join(', ')
  const dedupKey = `health-${service}-${failedChecks
    .map((c) => c.name)
    .sort()
    .join('-')}`

  await triggerPagerDutyAlert(
    `${service}: Health check failed - ${checkNames}`,
    'error',
    {
      service,
      failedChecks,
      totalChecks: Object.keys(checks).length,
    },
    {
      dedupKey,
      component: service,
      group: 'health-checks',
    }
  )
}

/**
 * Alert on high error rate
 */
export async function alertOnHighErrorRate(
  service: string,
  errorRate: number,
  threshold: number,
  window: string
): Promise<void> {
  if (errorRate <= threshold) {
    return
  }

  await triggerPagerDutyAlert(
    `${service}: High error rate ${(errorRate * 100).toFixed(1)}% (threshold: ${threshold * 100}%)`,
    errorRate > 0.1 ? 'critical' : 'error',
    {
      service,
      errorRate,
      threshold,
      window,
    },
    {
      dedupKey: `error-rate-${service}`,
      component: service,
      group: 'error-rates',
    }
  )
}

/**
 * Alert on high latency
 */
export async function alertOnHighLatency(
  service: string,
  latencyMs: number,
  thresholdMs: number,
  percentile: string
): Promise<void> {
  if (latencyMs <= thresholdMs) {
    return
  }

  await triggerPagerDutyAlert(
    `${service}: High ${percentile} latency ${latencyMs}ms (threshold: ${thresholdMs}ms)`,
    latencyMs > thresholdMs * 2 ? 'critical' : 'warning',
    {
      service,
      latencyMs,
      thresholdMs,
      percentile,
    },
    {
      dedupKey: `latency-${service}-${percentile}`,
      component: service,
      group: 'latency',
    }
  )
}

export default {
  isPagerDutyConfigured,
  triggerPagerDutyAlert,
  acknowledgePagerDutyAlert,
  resolvePagerDutyAlert,
  alertOnHealthFailure,
  alertOnHighErrorRate,
  alertOnHighLatency,
}
