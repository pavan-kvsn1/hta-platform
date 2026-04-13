/**
 * @hta/shared - Structured Logger
 *
 * Uses Pino for JSON logging that integrates with GCP Cloud Logging.
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

export type Logger = typeof logger
