/**
 * @hta/shared - Structured Logger
 *
 * Uses Pino for JSON logging that integrates with GCP Cloud Logging.
 * Automatically includes Sentry trace context for log correlation.
 *
 * Why structured logging?
 * - Searchable: Find all logs for a specific user or certificate
 * - Filterable: Show only errors, or only auth-related logs
 * - Correlatable: Link logs from the same request together
 *
 * Usage:
 *   import { logger } from '@hta/shared/logger'
 *   logger.info({ userId, action: 'login' }, 'User logged in')
 *   logger.error({ err, certificateId }, 'Failed to process certificate')
 */

import pino from 'pino'

// Lazy-load Sentry to avoid pulling @opentelemetry/instrumentation into Next.js bundles
// (require-in-the-middle breaks Next.js worker threads)
// Uses eval('require') to prevent webpack from statically resolving the dependency
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _Sentry: any = undefined
function getSentry(): any {
  if (_Sentry === undefined) {
    try {
      const mod = '@sentry' + '/node'
      // eslint-disable-next-line @typescript-eslint/no-require-imports, no-eval
      _Sentry = eval('require')(mod)
    } catch {
      _Sentry = null
    }
  }
  return _Sentry
}

// GCP Cloud Logging severity levels
const GCP_SEVERITY = {
  trace: 'DEBUG',
  debug: 'DEBUG',
  info: 'INFO',
  warn: 'WARNING',
  error: 'ERROR',
  fatal: 'CRITICAL',
} as const

export const logger = pino({
  level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),

  formatters: {
    level: (label) => ({
      severity: GCP_SEVERITY[label as keyof typeof GCP_SEVERITY] || 'DEFAULT',
      level: label,
    }),

    bindings: () => ({
      service: process.env.SERVICE_NAME || 'hta-platform',
      version: process.env.npm_package_version || '1.0.0',
    }),
  },

  // Include Sentry trace context for log correlation
  mixin() {
    try {
      const sentry = getSentry()
      if (sentry && typeof sentry.getActiveSpan === 'function') {
        const span = sentry.getActiveSpan() as { spanContext?: () => { traceId: string; spanId: string } } | null
        if (span?.spanContext) {
          const { traceId, spanId } = span.spanContext()
          return {
            trace_id: traceId,
            span_id: spanId,
          }
        }
      }
    } catch {
      // Sentry not initialized, skip trace context
    }
    return {}
  },

  messageKey: 'message',
  timestamp: () => `,"timestamp":"${new Date().toISOString()}"`,

  ...(process.env.NODE_ENV !== 'production' && {
    transport: {
      target: 'pino-pretty',
      options: { colorize: true },
    },
  }),
})

export const createLogger = (module: string) => {
  return logger.child({ module })
}

// Pre-configured loggers for common modules
export const authLogger = createLogger('auth')
export const apiLogger = createLogger('api')
export const certificateLogger = createLogger('certificate')
export const emailLogger = createLogger('email')
export const workerLogger = createLogger('worker')

// Request logger with correlation ID and tenant
export const createRequestLogger = (
  requestId: string,
  options?: { userId?: string; tenantId?: string }
) => {
  return logger.child({
    requestId,
    ...options,
  })
}

/**
 * Log an error to both Pino and Sentry
 */
export function logError(
  log: pino.Logger,
  error: Error,
  context?: Record<string, unknown>
): void {
  log.error({ err: error, ...context }, error.message)
  try {
    getSentry()?.captureException(error, { extra: context })
  } catch {
    // Sentry not initialized, skip
  }
}

export type Logger = typeof logger
