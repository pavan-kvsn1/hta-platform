/**
 * @hta/shared - Sentry Integration
 *
 * Provides error tracking, performance monitoring, and distributed tracing.
 *
 * Usage:
 *   import { initSentry, Sentry } from '@hta/shared/sentry'
 *   initSentry('api')
 *
 * Features:
 *   - Error tracking with stack traces
 *   - Performance monitoring (transactions/spans)
 *   - Distributed tracing across services
 *   - Custom tags and context
 */

import * as Sentry from '@sentry/node'

// Profiling is optional (requires native build)
let nodeProfilingIntegration: (() => Sentry.Integration) | undefined
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  nodeProfilingIntegration = require('@sentry/profiling-node').nodeProfilingIntegration
} catch {
  // Profiling not available, continue without it
}

export type ServiceName = 'web' | 'api' | 'worker'

export interface SentryConfig {
  dsn?: string
  environment?: string
  release?: string
  sampleRate?: number
  tracesSampleRate?: number
  profilesSampleRate?: number
  debug?: boolean
}

const DEFAULT_CONFIG: Required<Omit<SentryConfig, 'dsn'>> = {
  environment: process.env.NODE_ENV || 'development',
  release: process.env.npm_package_version || '1.0.0',
  sampleRate: 1.0,
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
  profilesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 0.5,
  debug: process.env.NODE_ENV !== 'production',
}

let initialized = false

/**
 * Initialize Sentry for a specific service
 */
export function initSentry(serviceName: ServiceName, config: SentryConfig = {}): void {
  if (initialized) {
    console.warn('[Sentry] Already initialized, skipping')
    return
  }

  const dsn = config.dsn || process.env.SENTRY_DSN

  if (!dsn) {
    console.warn('[Sentry] No DSN configured, Sentry disabled')
    return
  }

  const finalConfig = { ...DEFAULT_CONFIG, ...config, dsn }

  Sentry.init({
    dsn: finalConfig.dsn,
    environment: finalConfig.environment,
    release: finalConfig.release,
    sampleRate: finalConfig.sampleRate,
    tracesSampleRate: finalConfig.tracesSampleRate,
    profilesSampleRate: finalConfig.profilesSampleRate,
    debug: finalConfig.debug,

    // Service identification for distributed tracing
    serverName: serviceName,

    integrations: [
      // Node.js auto-instrumentation
      Sentry.httpIntegration(),
      Sentry.expressIntegration(),
      Sentry.prismaIntegration(),
      // Profiling for performance insights (optional, requires native build)
      ...(nodeProfilingIntegration ? [nodeProfilingIntegration()] : []),
    ],

    // Filter out health check noise
    beforeSendTransaction(event) {
      const transaction = event.transaction || ''
      if (
        transaction.includes('/health') ||
        transaction.includes('/ready') ||
        transaction.includes('/live')
      ) {
        return null
      }
      return event
    },

    // Add service context to all events
    beforeSend(event) {
      event.tags = {
        ...event.tags,
        service: serviceName,
      }
      return event
    },
  })

  initialized = true
  console.log(`[Sentry] Initialized for service: ${serviceName}`)
}

/**
 * Check if Sentry is initialized
 */
export function isSentryInitialized(): boolean {
  return initialized
}

/**
 * Set user context for all subsequent events
 */
export function setUser(user: { id: string; email?: string; role?: string } | null): void {
  if (user) {
    Sentry.setUser({
      id: user.id,
      email: user.email,
      role: user.role,
    })
  } else {
    Sentry.setUser(null)
  }
}

/**
 * Add tags to current scope
 */
export function setTags(tags: Record<string, string>): void {
  Sentry.setTags(tags)
}

/**
 * Add extra context to current scope
 */
export function setContext(name: string, context: Record<string, unknown>): void {
  Sentry.setContext(name, context)
}

/**
 * Capture an exception with optional context
 */
export function captureException(
  error: Error | unknown,
  context?: { tags?: Record<string, string>; extra?: Record<string, unknown> }
): string {
  return Sentry.captureException(error, {
    tags: context?.tags,
    extra: context?.extra,
  })
}

/**
 * Capture a message with optional severity
 */
export function captureMessage(
  message: string,
  level: 'fatal' | 'error' | 'warning' | 'info' | 'debug' = 'info'
): string {
  return Sentry.captureMessage(message, level)
}

/**
 * Start a new span for performance tracking
 */
export function startSpan<T>(
  options: { name: string; op?: string; attributes?: Record<string, string | number | boolean> },
  callback: (span: Sentry.Span | undefined) => T
): T {
  return Sentry.startSpan(
    {
      name: options.name,
      op: options.op || 'function',
      attributes: options.attributes,
    },
    callback
  )
}

/**
 * Wrap an async function with Sentry error handling
 */
export function withSentry<T>(
  name: string,
  fn: () => Promise<T>,
  options?: { op?: string; captureError?: boolean }
): Promise<T> {
  return startSpan({ name, op: options?.op || 'function' }, async () => {
    try {
      return await fn()
    } catch (error) {
      if (options?.captureError !== false) {
        captureException(error, { extra: { operation: name } })
      }
      throw error
    }
  })
}

/**
 * Flush pending events (call before process exit)
 */
export async function flush(timeout = 2000): Promise<boolean> {
  return Sentry.flush(timeout)
}

// Re-export Sentry for advanced usage
export { Sentry }
