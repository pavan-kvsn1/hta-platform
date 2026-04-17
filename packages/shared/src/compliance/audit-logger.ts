/**
 * Compliance Audit Logger
 *
 * Extended audit logging for GDPR compliance.
 * Builds on the existing audit system with PII tracking.
 */

import { prisma, Prisma } from '@hta/database'
import { createLogger } from '../logger/index.js'
import type { ComplianceAuditEvent } from './types.js'

const logger = createLogger('compliance-audit')

/**
 * Log a compliance audit event
 *
 * Logs to both structured logging (Cloud Logging) and database.
 */
export async function logComplianceEvent(event: ComplianceAuditEvent): Promise<void> {
  const timestamp = new Date()

  // Log to structured logging for real-time monitoring
  logger.info({
    audit: true,
    compliance: true,
    ...event,
    timestamp: timestamp.toISOString(),
  })

  // Log to database for compliance queries
  try {
    await prisma.auditLog.create({
      data: {
        entityType: event.resourceType,
        entityId: event.resourceId,
        action: event.action,
        actorId: event.userId,
        actorType: event.userType === 'customer' ? 'CUSTOMER' : event.userId ? 'USER' : 'SYSTEM',
        changes: {
          service: event.service,
          tenantId: event.tenantId,
          userEmail: event.userEmail,
          userRole: event.userRole,
          ipAddress: event.ipAddress,
          userAgent: event.userAgent,
          piiAccessed: event.piiAccessed,
          piiModified: event.piiModified,
          ...event.details,
        } as Prisma.InputJsonValue,
      },
    })
  } catch (error) {
    // Don't fail the main operation if audit logging fails
    logger.error({ error, event }, 'Failed to log compliance event to database')
  }
}

/**
 * Log PII access event
 */
export async function logPiiAccess(
  resourceType: string,
  resourceId: string,
  piiFields: string[],
  context: {
    userId?: string
    userEmail?: string
    userType?: 'user' | 'customer'
    service: 'web' | 'api' | 'worker'
    tenantId?: string
    ipAddress?: string
    userAgent?: string
    reason?: string
  }
): Promise<void> {
  await logComplianceEvent({
    action: 'PII_ACCESS',
    resourceType,
    resourceId,
    userId: context.userId,
    userEmail: context.userEmail,
    userType: context.userType,
    service: context.service,
    tenantId: context.tenantId,
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
    piiAccessed: piiFields,
    details: context.reason ? { reason: context.reason } : undefined,
  })
}

/**
 * Log PII modification event
 */
export async function logPiiModification(
  resourceType: string,
  resourceId: string,
  piiFields: string[],
  context: {
    userId?: string
    userEmail?: string
    userType?: 'user' | 'customer'
    service: 'web' | 'api' | 'worker'
    tenantId?: string
    ipAddress?: string
    userAgent?: string
    reason?: string
    changes?: Array<{ field: string; action: 'create' | 'update' | 'delete' }>
  }
): Promise<void> {
  await logComplianceEvent({
    action: 'PII_MODIFICATION',
    resourceType,
    resourceId,
    userId: context.userId,
    userEmail: context.userEmail,
    userType: context.userType,
    service: context.service,
    tenantId: context.tenantId,
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
    piiModified: piiFields,
    details: {
      reason: context.reason,
      changes: context.changes,
    },
  })
}

/**
 * Log data export event (Right to Access)
 */
export async function logDataExport(
  subjectId: string,
  requestedById: string,
  context: {
    service: 'web' | 'api' | 'worker'
    tenantId?: string
    ipAddress?: string
    exportedCategories: string[]
  }
): Promise<void> {
  await logComplianceEvent({
    action: 'DATA_EXPORT',
    resourceType: 'DATA_SUBJECT',
    resourceId: subjectId,
    userId: requestedById,
    service: context.service,
    tenantId: context.tenantId,
    ipAddress: context.ipAddress,
    piiAccessed: context.exportedCategories,
    details: {
      dsr_type: 'RIGHT_TO_ACCESS',
    },
  })
}

/**
 * Log data deletion event (Right to Erasure)
 */
export async function logDataDeletion(
  subjectId: string,
  requestedById: string,
  context: {
    service: 'web' | 'api' | 'worker'
    tenantId?: string
    ipAddress?: string
    deletedCategories: string[]
    pseudonymized: boolean
    retainedData?: string[]
  }
): Promise<void> {
  await logComplianceEvent({
    action: context.pseudonymized ? 'DATA_PSEUDONYMIZE' : 'DATA_DELETE',
    resourceType: 'DATA_SUBJECT',
    resourceId: subjectId,
    userId: requestedById,
    service: context.service,
    tenantId: context.tenantId,
    ipAddress: context.ipAddress,
    piiModified: context.deletedCategories,
    details: {
      dsr_type: 'RIGHT_TO_ERASURE',
      pseudonymized: context.pseudonymized,
      retainedData: context.retainedData,
    },
  })
}

/**
 * Log data rectification event (Right to Rectification)
 */
export async function logDataRectification(
  subjectId: string,
  requestedById: string,
  context: {
    service: 'web' | 'api' | 'worker'
    tenantId?: string
    ipAddress?: string
    rectifiedFields: string[]
  }
): Promise<void> {
  await logComplianceEvent({
    action: 'DATA_RECTIFY',
    resourceType: 'DATA_SUBJECT',
    resourceId: subjectId,
    userId: requestedById,
    service: context.service,
    tenantId: context.tenantId,
    ipAddress: context.ipAddress,
    piiModified: context.rectifiedFields,
    details: {
      dsr_type: 'RIGHT_TO_RECTIFICATION',
    },
  })
}

/**
 * Log consent change event
 */
export async function logConsentChange(
  subjectId: string,
  consentType: string,
  granted: boolean,
  context: {
    service: 'web' | 'api' | 'worker'
    tenantId?: string
    ipAddress?: string
    version: string
  }
): Promise<void> {
  await logComplianceEvent({
    action: granted ? 'CONSENT_GRANTED' : 'CONSENT_REVOKED',
    resourceType: 'CONSENT',
    resourceId: `${subjectId}:${consentType}`,
    userId: subjectId,
    service: context.service,
    tenantId: context.tenantId,
    ipAddress: context.ipAddress,
    details: {
      consentType,
      granted,
      version: context.version,
    },
  })
}

/**
 * Query compliance audit logs
 */
export async function queryComplianceAuditLogs(options: {
  subjectId?: string
  action?: string
  service?: 'web' | 'api' | 'worker'
  startDate?: Date
  endDate?: Date
  limit?: number
  offset?: number
}): Promise<{ logs: unknown[]; total: number }> {
  const { subjectId, action, service, startDate, endDate, limit = 100, offset = 0 } = options

  const where: Prisma.AuditLogWhereInput = {
    ...(subjectId && { entityId: subjectId }),
    ...(action && { action }),
    ...(service && {
      changes: {
        path: ['service'],
        equals: service,
      },
    }),
    ...(startDate || endDate
      ? {
          createdAt: {
            ...(startDate && { gte: startDate }),
            ...(endDate && { lte: endDate }),
          },
        }
      : {}),
  }

  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    }),
    prisma.auditLog.count({ where }),
  ])

  return { logs, total }
}
